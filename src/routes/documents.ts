import type { Express, Request, Response } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import * as XLSX from 'xlsx';
import prisma from '../prisma';
import { audit } from '../lib/audit';
import { currentUser } from '../lib/auth';
import { ZipWriter } from '../lib/zip';
import { tenantMulter } from '../lib/tenant';
import {
  TMP_DIR, ensureDir, tenantUploadDir, toRelative, resolveUpload, decodeOriginalName, safeFileName,
  parseDateInput, mimeFromName, contentDisposition,
} from '../lib/common';

ensureDir(TMP_DIR);
const upload = tenantMulter(multer({ dest: TMP_DIR, limits: { fileSize: 100 * 1024 * 1024 } }));

export const DEFAULT_CATEGORIES = [
  { name: 'الإقامة', groupName: 'الهوية والإقامة', requiresExpiry: true, isRequired: true, sortOrder: 1 },
  { name: 'جواز السفر', groupName: 'الهوية والإقامة', requiresExpiry: true, isRequired: true, sortOrder: 2 },
  { name: 'الهوية الوطنية', groupName: 'الهوية والإقامة', requiresExpiry: true, isRequired: false, sortOrder: 3 },
  { name: 'عقد العمل', groupName: 'الملف الوظيفي', requiresExpiry: false, isRequired: true, sortOrder: 4 },
  { name: 'قرار التعيين', groupName: 'الملف الوظيفي', requiresExpiry: false, isRequired: false, sortOrder: 5 },
  { name: 'المؤهل الدراسي', groupName: 'الملف الوظيفي', requiresExpiry: false, isRequired: false, sortOrder: 6 },
  { name: 'مستندات وظيفية أخرى', groupName: 'الملف الوظيفي', requiresExpiry: false, isRequired: false, sortOrder: 7 },
  { name: 'شهادات الدورات', groupName: 'الدورات', requiresExpiry: true, isRequired: false, sortOrder: 8 },
  { name: 'شهادات السلامة والتدريب', groupName: 'الدورات', requiresExpiry: true, isRequired: false, sortOrder: 9 },
  { name: 'الكروت الفنية', groupName: 'الكروت الفنية', requiresExpiry: true, isRequired: false, sortOrder: 10 },
  { name: 'تصاريح تشغيل المعدات', groupName: 'تشغيل المعدات', requiresExpiry: true, isRequired: false, sortOrder: 11 },
  { name: 'ملفات إضافية', groupName: 'ملفات إضافية', requiresExpiry: false, isRequired: false, sortOrder: 12 },
];

export async function seedCategories() {
  for (const c of DEFAULT_CATEGORIES) {
    if (!(await prisma.documentCategory.findFirst({ where: { name: c.name } }))) await prisma.documentCategory.create({ data: c });
  }
}

// تحويل المرفقات القديمة (EmployeeAttachment) إلى سجلات أرشيف جديدة مرة واحدة
export async function migrateLegacyAttachments() {
  const legacy = await prisma.employeeAttachment.findMany();
  if (!legacy.length) return;
  const existing = new Set((await prisma.employeeDocument.findMany({ select: { filePath: true } })).map((d) => d.filePath));
  const other = await prisma.documentCategory.findFirst({ where: { name: 'ملفات إضافية' } });
  if (!other) return;
  let n = 0;
  for (const a of legacy) {
    const rel = a.filePath.replace(/\\/g, '/').replace(/^\.\//, '');
    if (existing.has(rel) || existing.has(a.filePath)) continue;
    const abs = path.resolve(a.filePath);
    const size = fs.existsSync(abs) ? fs.statSync(abs).size : 0;
    await prisma.employeeDocument.create({
      data: {
        employeeId: a.employeeId, categoryId: other.id, title: a.fileName, filePath: rel,
        originalName: a.fileName, mimeType: mimeFromName(a.fileName), size, uploadedBy: 'ترحيل تلقائي', createdAt: a.uploadedAt,
      },
    });
    n++;
  }
  if (n) console.log(`📁 تم ترحيل ${n} مرفق قديم إلى أرشيف المستندات`);
}

function moveUploaded(file: Express.Multer.File, jobNumber: string, companyId: number) {
  const original = decodeOriginalName(file.originalname);
  const dir = tenantUploadDir(companyId, 'employees', safeFileName(jobNumber));
  const dest = path.join(dir, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeFileName(original)}`);
  fs.renameSync(file.path, dest);
  return { original, rel: toRelative(dest), size: fs.statSync(dest).size };
}

function cleanup(files?: Express.Multer.File[]) {
  (files || []).forEach((f) => { try { if (fs.existsSync(f.path)) fs.unlinkSync(f.path); } catch { /* ignore */ } });
}

export async function buildEmployeeDocsRows(employeeIds?: number[], branchId?: number) {
  const employees = await prisma.employee.findMany({
    where: { ...(employeeIds?.length ? { id: { in: employeeIds } } : {}), ...(branchId ? { branchId } : {}) },
    include: {
      branch: true,
      documents: { where: { status: 'active' }, include: { category: true } },
      courses: { include: { course: true } },
      cards: { include: { card: true } },
      equipmentCards: { include: { equipmentType: true } },
    },
    orderBy: { jobNumber: 'asc' },
  });
  return employees;
}

async function streamZipResponse(res: Response, downloadName: string, build: (zip: ZipWriter) => Promise<void>) {
  const tmp = path.join(os.tmpdir(), `export-${Date.now()}-${Math.round(Math.random() * 1e6)}.zip`);
  const out = fs.createWriteStream(tmp);
  const zip = new ZipWriter(out);
  try {
    await build(zip);
    await zip.finish();
  } catch (e: any) {
    try { out.destroy(); fs.unlinkSync(tmp); } catch { /* ignore */ }
    return res.status(500).json({ message: e?.message || 'تعذر تجهيز ملف التصدير' });
  }
  res.download(tmp, downloadName, () => { try { fs.unlinkSync(tmp); } catch { /* ignore */ } });
}

async function addEmployeesToZip(zip: ZipWriter, employees: Awaited<ReturnType<typeof buildEmployeeDocsRows>>) {
  const index: any[] = [];
  const summary: any[] = [];
  for (const emp of employees) {
    const folder = `${emp.jobNumber} - ${emp.name}`;
    let fileCount = 0;
    const add = async (category: string, title: string, number: string | null, issuer: string | null, issue: Date | null, expiry: Date | null, rel: string, name: string) => {
      const abs = resolveUpload(rel);
      let inZip = '';
      if (abs && fs.existsSync(abs)) {
        inZip = `${folder}/${category}/${name}`;
        await zip.addFile(inZip, abs);
        fileCount++;
      }
      index.push({
        'الرقم الوظيفي': emp.jobNumber, 'العامل': emp.name, 'الفرع': emp.branch?.name || '', 'التصنيف': category, 'المستند': title,
        'رقم المستند': number || '', 'الجهة المصدرة': issuer || '', 'تاريخ الإصدار': issue ? issue.toISOString().slice(0, 10) : '',
        'تاريخ الانتهاء': expiry ? expiry.toISOString().slice(0, 10) : '', 'المسار داخل الأرشيف': inZip || 'الملف غير موجود على الخادم',
      });
    };
    for (const d of emp.documents) await add(d.category.name, d.title, d.documentNumber, d.issuer, d.issueDate, d.expiryDate, d.filePath, d.originalName);
    for (const c of emp.courses) if (c.attachment) await add('الدورات', c.course.name, c.certificateNumber, null, c.courseDate, c.expiryDate, c.attachment, path.basename(c.attachment));
    for (const c of emp.cards) if (c.attachment) await add('الكروت', c.card.name, c.cardNumber, null, c.issueDate, c.expiryDate, c.attachment, path.basename(c.attachment));
    for (const c of emp.equipmentCards) if (c.attachment) await add('تشغيل المعدات', c.equipmentType.name, c.cardNumber, null, c.issueDate, c.expiryDate, c.attachment, path.basename(c.attachment));
    summary.push({ 'الرقم الوظيفي': emp.jobNumber, 'العامل': emp.name, 'الفرع': emp.branch?.name || '', 'عدد الملفات': fileCount });
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(index), 'فهرس المستندات');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summary), 'ملخص العاملين');
  await zip.addBuffer('فهرس-الملفات.xlsx', XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
}

export function registerDocuments(app: Express) {
  // ---------- التصنيفات ----------
  app.get('/api/document-categories', async (_req, res) => {
    res.json(await prisma.documentCategory.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }));
  });

  app.post('/api/document-categories', async (req, res) => {
    try {
      const { name, groupName, requiresExpiry, isRequired } = req.body;
      const cat = await prisma.documentCategory.create({
        data: { name, groupName: groupName || 'ملفات إضافية', requiresExpiry: !!requiresExpiry, isRequired: !!isRequired, sortOrder: 100 },
      });
      res.status(201).json(cat);
    } catch { res.status(400).json({ message: 'تعذر إضافة التصنيف، قد يكون الاسم مكرراً' }); }
  });

  app.put('/api/document-categories/:id', async (req, res) => {
    try {
      const { name, groupName, requiresExpiry, isRequired } = req.body;
      res.json(await prisma.documentCategory.update({ where: { id: Number(req.params.id) }, data: { name, groupName, requiresExpiry: !!requiresExpiry, isRequired: !!isRequired } }));
    } catch { res.status(400).json({ message: 'تعذر تعديل التصنيف' }); }
  });

  app.delete('/api/document-categories/:id', async (req, res) => {
    const id = Number(req.params.id);
    const used = await prisma.employeeDocument.count({ where: { categoryId: id } });
    if (used > 0) return res.status(400).json({ message: `لا يمكن حذف التصنيف، يحتوي على ${used} مستند` });
    await prisma.documentCategory.delete({ where: { id } });
    res.json({ message: 'تم حذف التصنيف' });
  });

  // ---------- مستندات العامل ----------
  app.get('/api/employees/:id/documents', async (req, res) => {
    const docs = await prisma.employeeDocument.findMany({
      where: { employeeId: Number(req.params.id), status: 'active' },
      include: { category: true },
      orderBy: [{ category: { sortOrder: 'asc' } }, { createdAt: 'desc' }],
    });
    res.json(docs);
  });

  app.get('/api/documents/:id/history', async (req, res) => {
    const chain: any[] = [];
    let current = await prisma.employeeDocument.findUnique({ where: { id: Number(req.params.id) }, include: { category: true } });
    while (current) {
      chain.push(current);
      current = current.previousId ? await prisma.employeeDocument.findUnique({ where: { id: current.previousId }, include: { category: true } }) : null;
    }
    res.json(chain);
  });

  app.post('/api/employees/:id/documents', upload.array('files', 50), async (req: Request, res: Response) => {
    const files = (req.files as Express.Multer.File[]) || [];
    try {
      const employee = await prisma.employee.findUnique({ where: { id: Number(req.params.id) } });
      if (!employee) { cleanup(files); return res.status(404).json({ message: 'العامل غير موجود' }); }
      if (!files.length) return res.status(400).json({ message: 'الرجاء اختيار ملف واحد على الأقل' });
      const categoryId = Number(req.body.categoryId);
      const category = await prisma.documentCategory.findUnique({ where: { id: categoryId } });
      if (!category) { cleanup(files); return res.status(400).json({ message: 'الرجاء اختيار نوع المستند' }); }
      const issueDate = parseDateInput(req.body.issueDate);
      const expiryDate = parseDateInput(req.body.expiryDate);
      if (category.requiresExpiry && !expiryDate && req.body.requireExpiry === 'true') { cleanup(files); return res.status(400).json({ message: 'تاريخ الانتهاء مطلوب لهذا النوع' }); }
      const user = currentUser(req);
      const created: any[] = [];
      for (const f of files) {
        const moved = moveUploaded(f, employee.jobNumber, currentUser(req)!.companyId);
        created.push(await prisma.employeeDocument.create({
          data: {
            employeeId: employee.id, categoryId, title: files.length === 1 && req.body.title ? req.body.title : path.parse(moved.original).name,
            documentNumber: files.length === 1 ? req.body.documentNumber || null : null,
            issuer: req.body.issuer || null, issueDate, expiryDate, notes: req.body.notes || null,
            filePath: moved.rel, originalName: moved.original, mimeType: mimeFromName(moved.original), size: moved.size, uploadedBy: user?.username || null,
          },
        }));
      }
      (res.locals as any).auditDetails = `رفع ${created.length} مستند للعامل ${employee.name}`;
      res.status(201).json({ message: `تم رفع ${created.length} مستند بنجاح`, documents: created });
    } catch (e: any) {
      cleanup(files);
      res.status(500).json({ message: 'تعذر رفع المستندات' });
    }
  });

  app.put('/api/documents/:id', async (req, res) => {
    try {
      const { categoryId, title, documentNumber, issuer, issueDate, expiryDate, notes } = req.body;
      const doc = await prisma.employeeDocument.update({
        where: { id: Number(req.params.id) },
        data: {
          ...(categoryId ? { categoryId: Number(categoryId) } : {}), title, documentNumber: documentNumber || null, issuer: issuer || null,
          issueDate: parseDateInput(issueDate), expiryDate: parseDateInput(expiryDate), notes: notes || null,
        },
      });
      res.json(doc);
    } catch { res.status(400).json({ message: 'تعذر تعديل بيانات المستند' }); }
  });

  // استبدال ملف مع الاحتفاظ بالنسخة القديمة في السجل
  app.post('/api/documents/:id/replace', upload.single('file'), async (req, res) => {
    const file = req.file;
    try {
      const old = await prisma.employeeDocument.findUnique({ where: { id: Number(req.params.id) }, include: { employee: true } });
      if (!old) { cleanup(file ? [file] : []); return res.status(404).json({ message: 'المستند غير موجود' }); }
      if (!file) return res.status(400).json({ message: 'الرجاء اختيار الملف الجديد' });
      const moved = moveUploaded(file, old.employee.jobNumber, currentUser(req)!.companyId);
      const user = currentUser(req);
      const [created] = await prisma.$transaction([
        prisma.employeeDocument.create({
          data: {
            employeeId: old.employeeId, categoryId: old.categoryId, title: req.body.title || old.title,
            documentNumber: req.body.documentNumber ?? old.documentNumber, issuer: req.body.issuer ?? old.issuer,
            issueDate: req.body.issueDate !== undefined ? parseDateInput(req.body.issueDate) : old.issueDate,
            expiryDate: req.body.expiryDate !== undefined ? parseDateInput(req.body.expiryDate) : old.expiryDate,
            notes: req.body.notes ?? old.notes, filePath: moved.rel, originalName: moved.original, mimeType: mimeFromName(moved.original),
            size: moved.size, version: old.version + 1, previousId: old.id, uploadedBy: user?.username || null,
          },
        }),
        prisma.employeeDocument.update({ where: { id: old.id }, data: { status: 'replaced' } }),
      ]);
      (res.locals as any).auditDetails = `استبدال مستند ${old.title} (نسخة ${created.version})`;
      res.json({ message: 'تم استبدال الملف وحفظ النسخة القديمة في السجل', document: created });
    } catch { cleanup(file ? [file] : []); res.status(500).json({ message: 'تعذر استبدال الملف' }); }
  });

  app.delete('/api/documents/:id', async (req, res) => {
    let current = await prisma.employeeDocument.findUnique({ where: { id: Number(req.params.id) } });
    if (!current) return res.status(404).json({ message: 'المستند غير موجود' });
    const ids: number[] = [];
    const paths: string[] = [];
    while (current) {
      ids.push(current.id); paths.push(current.filePath);
      current = current.previousId ? await prisma.employeeDocument.findUnique({ where: { id: current.previousId } }) : null;
    }
    await prisma.employeeDocument.deleteMany({ where: { id: { in: ids } } });
    for (const p of paths) {
      const abs = resolveUpload(p);
      const stillUsed = await prisma.employeeDocument.count({ where: { filePath: p } });
      if (abs && !stillUsed && fs.existsSync(abs)) { try { fs.unlinkSync(abs); } catch { /* ignore */ } }
    }
    res.json({ message: 'تم حذف المستند وسجل نسخه' });
  });

  // معاينة / تنزيل ملف مستند (يقبل ?token= لأجل فتحه في تبويب جديد)
  app.get('/api/documents/:id/file', async (req, res) => {
    const doc = await prisma.employeeDocument.findUnique({ where: { id: Number(req.params.id) }, include: { employee: true } });
    if (!doc) return res.status(404).json({ message: 'المستند غير موجود' });
    const abs = resolveUpload(doc.filePath);
    if (!abs || !fs.existsSync(abs)) return res.status(404).json({ message: 'الملف غير موجود على الخادم' });
    const inline = req.query.download !== '1';
    res.setHeader('Content-Type', doc.mimeType || mimeFromName(doc.originalName));
    res.setHeader('Content-Disposition', contentDisposition(inline ? 'inline' : 'attachment', doc.originalName));
    if (!inline) await audit(req, 'تنزيل', 'مستند', doc.id, `${doc.title} - ${doc.employee.name}`);
    fs.createReadStream(abs).pipe(res);
  });

  // ---------- التصدير ----------
  app.get('/api/employees/:id/documents/export', async (req, res) => {
    const employees = await buildEmployeeDocsRows([Number(req.params.id)]);
    if (!employees.length) return res.status(404).json({ message: 'العامل غير موجود' });
    await audit(req, 'تصدير', 'ملف عامل', employees[0].id, employees[0].name);
    await streamZipResponse(res, `ملف-${employees[0].jobNumber}.zip`, (zip) => addEmployeesToZip(zip, employees));
  });

  app.post('/api/documents/export', async (req, res) => {
    const { branchId, employeeIds } = req.body || {};
    const employees = await buildEmployeeDocsRows(Array.isArray(employeeIds) ? employeeIds.map(Number) : undefined, branchId ? Number(branchId) : undefined);
    if (!employees.length) return res.status(404).json({ message: 'لا يوجد عاملون مطابقون للتصدير' });
    await audit(req, 'تصدير', 'أرشيف العاملين', null, `${employees.length} عامل`);
    await streamZipResponse(res, `ملفات-العاملين-${new Date().toISOString().slice(0, 10)}.zip`, (zip) => addEmployeesToZip(zip, employees));
  });
}
