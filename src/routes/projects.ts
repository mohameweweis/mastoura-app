import type { Express, Request } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import prisma from '../prisma';
import { currentUser } from '../lib/auth';
import { getAlertDays } from './alerts';
import { tenantMulter } from '../lib/tenant';
import {
  TMP_DIR, ensureDir, tenantUploadDir, toRelative, resolveUpload, decodeOriginalName, safeFileName, parseDateInput, mimeFromName, contentDisposition,
} from '../lib/common';

ensureDir(TMP_DIR);
const upload = tenantMulter(multer({ dest: TMP_DIR, limits: { fileSize: 50 * 1024 * 1024 } }));

export const PROJECT_STATUSES = ['planned', 'active', 'on_hold', 'completed', 'cancelled'];
const num = (v: any) => (v === undefined || v === null || v === '' ? null : Number(v));

function permitState(expiry: Date, status: string, days: number) {
  if (status === 'cancelled') return 'cancelled';
  const left = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (left < 0) return 'expired';
  if (left <= days) return 'soon';
  return 'valid';
}

export function registerProjects(app: Express) {
  // ---------- ملخص لوحة التحكم ----------
  app.get('/api/projects/summary', async (_req, res) => {
    const days = await getAlertDays();
    const soon = new Date(); soon.setDate(soon.getDate() + days);
    const now = new Date();
    const [totalProjects, activeProjects, activeAssignments, workers, assignedIds, permitsActive, permitsExpiring, permitsExpired] = await Promise.all([
      prisma.project.count(),
      prisma.project.count({ where: { status: 'active' } }),
      prisma.projectAssignment.count({ where: { status: 'active' } }),
      prisma.employee.count({ where: { status: 'active', NOT: { attendanceStatus: 'final_exit' } } }),
      prisma.projectAssignment.findMany({ where: { status: 'active' }, select: { employeeId: true }, distinct: ['employeeId'] }),
      prisma.workPermit.count({ where: { status: 'active', expiryDate: { gte: now } } }),
      prisma.workPermit.count({ where: { status: 'active', expiryDate: { gte: now, lt: soon } } }),
      prisma.workPermit.count({ where: { status: 'active', expiryDate: { lt: now } } }),
    ]);
    res.json({ totalProjects, activeProjects, activeAssignments, unassignedWorkers: Math.max(workers - assignedIds.length, 0), permitsActive, permitsExpiring, permitsExpired, alertDays: days });
  });

  // ---------- المشاريع ----------
  app.get('/api/projects', async (_req, res) => {
    const days = await getAlertDays();
    const projects = await prisma.project.findMany({
      include: {
        branch: true, manager: { select: { id: true, name: true } },
        assignments: { where: { status: 'active' }, select: { id: true } },
        permits: { select: { id: true, expiryDate: true, status: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(projects.map((p) => {
      const states = p.permits.map((x) => permitState(x.expiryDate, x.status, days));
      const { assignments, permits, ...rest } = p;
      return { ...rest, workersCount: assignments.length, permitsCount: permits.length, permitsExpired: states.filter((s) => s === 'expired').length, permitsSoon: states.filter((s) => s === 'soon').length };
    }));
  });

  app.get('/api/projects/:id', async (req, res) => {
    const id = Number(req.params.id);
    const days = await getAlertDays();
    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        branch: true, manager: { select: { id: true, name: true } },
        assignments: { include: { employee: { select: { id: true, name: true, jobNumber: true, profession: true, iqamaNumber: true, attendanceStatus: true } } }, orderBy: [{ status: 'asc' }, { startDate: 'desc' }] },
        permits: { include: { _count: { select: { workers: true } } }, orderBy: { expiryDate: 'asc' } },
      },
    });
    if (!project) return res.status(404).json({ message: 'المشروع غير موجود' });
    res.json({ ...project, permits: project.permits.map((p) => ({ ...p, state: permitState(p.expiryDate, p.status, days), workersCount: p._count.workers })) });
  });

  const projectData = (b: any) => ({
    code: String(b.code || '').trim(), name: String(b.name || '').trim(), client: b.client || null, contractNumber: b.contractNumber || null,
    location: b.location || null, branchId: num(b.branchId), managerId: num(b.managerId), startDate: parseDateInput(b.startDate), endDate: parseDateInput(b.endDate),
    status: PROJECT_STATUSES.includes(b.status) ? b.status : 'active', budget: num(b.budget), notes: b.notes || null,
  });

  app.post('/api/projects', async (req, res) => {
    try {
      const data = projectData(req.body);
      if (!data.name) return res.status(400).json({ message: 'اسم المشروع مطلوب' });
      if (!data.code) data.code = `PRJ-${Date.now().toString(36).toUpperCase()}`;
      res.status(201).json(await prisma.project.create({ data }));
    } catch (e: any) {
      res.status(400).json({ message: e?.code === 'P2002' ? 'رمز المشروع مستخدم مسبقاً' : 'تعذر حفظ المشروع' });
    }
  });

  app.put('/api/projects/:id', async (req, res) => {
    try { res.json(await prisma.project.update({ where: { id: Number(req.params.id) }, data: projectData(req.body) })); }
    catch (e: any) { res.status(400).json({ message: e?.code === 'P2002' ? 'رمز المشروع مستخدم مسبقاً' : 'تعذر تعديل المشروع' }); }
  });

  app.delete('/api/projects/:id', async (req, res) => {
    const id = Number(req.params.id);
    const active = await prisma.projectAssignment.count({ where: { projectId: id, status: 'active' } });
    if (active > 0) return res.status(400).json({ message: `لا يمكن حذف المشروع، يوجد ${active} عامل مسند إليه حالياً. أنهِ إسنادهم أو انقلهم أولاً` });
    const permits = await prisma.workPermit.findMany({ where: { projectId: id }, select: { attachment: true } });
    await prisma.project.delete({ where: { id } });
    permits.forEach((p) => { const abs = p.attachment ? resolveUpload(p.attachment) : null; if (abs && fs.existsSync(abs)) try { fs.unlinkSync(abs); } catch { /* ignore */ } });
    res.json({ message: 'تم حذف المشروع' });
  });

  // ---------- حركة العمال (إسناد / نقل / إنهاء) ----------
  // إسناد عمال لمشروع: إن كان العامل مسنداً لمشروع آخر يُنقل تلقائياً ويُسجَّل ذلك في الحركة
  app.post('/api/projects/:id/assignments', async (req, res) => {
    const projectId = Number(req.params.id);
    const { employeeIds, role, notes } = req.body || {};
    const startDate = parseDateInput(req.body?.startDate) || new Date();
    if (!Array.isArray(employeeIds) || !employeeIds.length) return res.status(400).json({ message: 'اختر عاملاً واحداً على الأقل' });
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) return res.status(404).json({ message: 'المشروع غير موجود' });
    if (project.status === 'completed' || project.status === 'cancelled') return res.status(400).json({ message: 'لا يمكن الإسناد إلى مشروع منتهٍ أو ملغى' });

    const user = currentUser(req as Request);
    const ids = [...new Set<number>(employeeIds.map(Number))];
    const current = await prisma.projectAssignment.findMany({ where: { employeeId: { in: ids }, status: 'active' } });
    const result = { assigned: 0, transferred: 0, skipped: 0, blocked: [] as string[] };
    const employees = await prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, attendanceStatus: true } });

    for (const emp of employees) {
      if (emp.attendanceStatus === 'final_exit') { result.blocked.push(`${emp.name} (خروج نهائي)`); continue; }
      const active = current.filter((c) => c.employeeId === emp.id);
      if (active.some((c) => c.projectId === projectId)) { result.skipped++; continue; }
      if (active.length) {
        await prisma.projectAssignment.updateMany({ where: { id: { in: active.map((a) => a.id) } }, data: { status: 'ended', endDate: startDate } });
        result.transferred++;
      }
      await prisma.projectAssignment.create({
        data: { employeeId: emp.id, projectId, role: role || null, startDate, notes: notes || (active.length ? 'نقل من مشروع آخر' : null), createdBy: user?.username || null },
      });
      result.assigned++;
    }
    (res.locals as any).auditDetails = `إسناد ${result.assigned} عامل إلى ${project.name}`;
    res.status(201).json({ message: `تم إسناد ${result.assigned} عامل${result.transferred ? ` (منهم ${result.transferred} منقولون من مشاريع أخرى)` : ''}`, ...result });
  });

  app.post('/api/assignments/:id/end', async (req, res) => {
    const a = await prisma.projectAssignment.findUnique({ where: { id: Number(req.params.id) } });
    if (!a) return res.status(404).json({ message: 'السجل غير موجود' });
    if (a.status === 'ended') return res.status(400).json({ message: 'الإسناد منتهٍ مسبقاً' });
    const updated = await prisma.projectAssignment.update({ where: { id: a.id }, data: { status: 'ended', endDate: parseDateInput(req.body?.endDate) || new Date() } });
    res.json({ message: 'تم إنهاء إسناد العامل', assignment: updated });
  });

  app.delete('/api/assignments/:id', async (req, res) => {
    await prisma.projectAssignment.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف السجل' });
  });

  // سجل حركة العمال (كل الإسنادات والنقل) مع فلاتر
  app.get('/api/movements', async (req, res) => {
    const where: any = {};
    if (req.query.projectId) where.projectId = Number(req.query.projectId);
    if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);
    if (req.query.status) where.status = String(req.query.status);
    const rows = await prisma.projectAssignment.findMany({
      where, orderBy: { startDate: 'desc' }, take: Math.min(Number(req.query.limit) || 500, 2000),
      include: { employee: { select: { id: true, name: true, jobNumber: true, profession: true } }, project: { select: { id: true, name: true, code: true } } },
    });
    res.json(rows);
  });

  // عمال على رأس العمل ولا يتبعون أي مشروع حالياً
  app.get('/api/movements/unassigned', async (_req, res) => {
    const assigned = await prisma.projectAssignment.findMany({ where: { status: 'active' }, select: { employeeId: true }, distinct: ['employeeId'] });
    const employees = await prisma.employee.findMany({
      where: { status: 'active', NOT: [{ attendanceStatus: 'final_exit' }, { id: { in: assigned.map((a) => a.employeeId) } }] },
      select: { id: true, name: true, jobNumber: true, profession: true, nationality: true, attendanceStatus: true, branch: { select: { name: true } } },
      orderBy: { name: 'asc' },
    });
    res.json(employees);
  });

  // ---------- تصاريح العمل ----------
  app.get('/api/permits', async (req, res) => {
    const days = await getAlertDays();
    const where: any = {};
    if (req.query.projectId) where.projectId = Number(req.query.projectId);
    const permits = await prisma.workPermit.findMany({
      where, orderBy: { expiryDate: 'asc' },
      include: { project: { select: { id: true, name: true, code: true } }, _count: { select: { workers: true } } },
    });
    res.json(permits.map((p) => ({ ...p, state: permitState(p.expiryDate, p.status, days), workersCount: p._count.workers })));
  });

  app.get('/api/permits/:id', async (req, res) => {
    const days = await getAlertDays();
    const permit = await prisma.workPermit.findUnique({
      where: { id: Number(req.params.id) },
      include: { project: true, workers: { include: { employee: { select: { id: true, name: true, jobNumber: true, profession: true } } } } },
    });
    if (!permit) return res.status(404).json({ message: 'التصريح غير موجود' });
    res.json({ ...permit, state: permitState(permit.expiryDate, permit.status, days) });
  });

  const permitData = (b: any) => ({
    permitNumber: String(b.permitNumber || '').trim(), projectId: Number(b.projectId), type: String(b.type || '').trim(), issuer: b.issuer || null,
    location: b.location || null, issueDate: parseDateInput(b.issueDate) as Date, expiryDate: parseDateInput(b.expiryDate) as Date,
    status: b.status === 'cancelled' ? 'cancelled' : 'active', notes: b.notes || null,
  });

  const moveAttachment = (file: Express.Multer.File, companyId: number) => {
    const dir = tenantUploadDir(companyId, 'permits');
    const dest = path.join(dir, `${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeFileName(decodeOriginalName(file.originalname))}`);
    fs.renameSync(file.path, dest);
    return toRelative(dest);
  };

  app.post('/api/permits', upload.single('file'), async (req, res) => {
    try {
      const data = permitData(req.body);
      if (!data.permitNumber || !data.type || !data.projectId || !data.issueDate || !data.expiryDate) { if (req.file) fs.unlinkSync(req.file.path); return res.status(400).json({ message: 'رقم التصريح والنوع والمشروع وتاريخ الإصدار والانتهاء مطلوبة' }); }
      const permit = await prisma.workPermit.create({ data: { ...data, attachment: req.file ? moveAttachment(req.file, currentUser(req)!.companyId) : null } });
      res.status(201).json(permit);
    } catch (e: any) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ message: e?.code === 'P2002' ? 'رقم التصريح مسجل مسبقاً' : 'تعذر حفظ التصريح' });
    }
  });

  app.put('/api/permits/:id', upload.single('file'), async (req, res) => {
    try {
      const id = Number(req.params.id);
      const old = await prisma.workPermit.findUnique({ where: { id } });
      if (!old) { if (req.file) fs.unlinkSync(req.file.path); return res.status(404).json({ message: 'التصريح غير موجود' }); }
      const data: any = permitData(req.body);
      if (req.file) {
        data.attachment = moveAttachment(req.file, currentUser(req)!.companyId);
        const abs = old.attachment ? resolveUpload(old.attachment) : null;
        if (abs && fs.existsSync(abs)) try { fs.unlinkSync(abs); } catch { /* ignore */ }
      }
      res.json(await prisma.workPermit.update({ where: { id }, data }));
    } catch (e: any) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ message: e?.code === 'P2002' ? 'رقم التصريح مسجل مسبقاً' : 'تعذر تعديل التصريح' });
    }
  });

  app.delete('/api/permits/:id', async (req, res) => {
    const permit = await prisma.workPermit.findUnique({ where: { id: Number(req.params.id) } });
    if (!permit) return res.status(404).json({ message: 'التصريح غير موجود' });
    await prisma.workPermit.delete({ where: { id: permit.id } });
    const abs = permit.attachment ? resolveUpload(permit.attachment) : null;
    if (abs && fs.existsSync(abs)) try { fs.unlinkSync(abs); } catch { /* ignore */ }
    res.json({ message: 'تم حذف التصريح' });
  });

  // تحديد العمال المشمولين بالتصريح (استبدال القائمة) مع تحذيرات الأهلية
  app.put('/api/permits/:id/workers', async (req, res) => {
    const permitId = Number(req.params.id);
    const ids: number[] = [...new Set<number>((req.body?.employeeIds || []).map(Number))];
    const permit = await prisma.workPermit.findUnique({ where: { id: permitId } });
    if (!permit) return res.status(404).json({ message: 'التصريح غير موجود' });

    await prisma.workPermitWorker.deleteMany({ where: { permitId } });
    if (ids.length) await prisma.workPermitWorker.createMany({ data: ids.map((employeeId) => ({ permitId, employeeId })) });

    // تحذيرات: كروت أو مستندات (إقامة...) منتهية، أو العامل غير حاضر
    const now = new Date();
    const [employees, expiredCards, expiredDocs] = await Promise.all([
      prisma.employee.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, attendanceStatus: true } }),
      prisma.employeeCard.findMany({ where: { employeeId: { in: ids }, expiryDate: { lt: now } }, select: { employeeId: true } }),
      prisma.employeeDocument.findMany({ where: { employeeId: { in: ids }, status: 'active', expiryDate: { lt: now } }, select: { employeeId: true } }),
    ]);
    const warnings = employees.flatMap((e) => {
      const w: string[] = [];
      if (e.attendanceStatus === 'final_exit') w.push('خروج نهائي');
      else if (e.attendanceStatus === 'absent') w.push('متغيب');
      const c = expiredCards.filter((x) => x.employeeId === e.id).length;
      const d = expiredDocs.filter((x) => x.employeeId === e.id).length;
      if (c) w.push(`${c} كرت منتهي`);
      if (d) w.push(`${d} مستند منتهي`);
      return w.length ? [`${e.name}: ${w.join('، ')}`] : [];
    });
    res.json({ message: `تم تحديث عمال التصريح (${ids.length})`, warnings });
  });

  app.get('/api/permits/:id/file', async (req, res) => {
    const permit = await prisma.workPermit.findUnique({ where: { id: Number(req.params.id) } });
    const abs = permit?.attachment ? resolveUpload(permit.attachment) : null;
    if (!permit || !abs || !fs.existsSync(abs)) return res.status(404).json({ message: 'لا يوجد مرفق لهذا التصريح' });
    const name = path.basename(abs).replace(/^\d+-\d+-/, '');
    res.setHeader('Content-Type', mimeFromName(name));
    res.setHeader('Content-Disposition', contentDisposition(req.query.download === '1' ? 'attachment' : 'inline', name));
    fs.createReadStream(abs).pipe(res);
  });
}
