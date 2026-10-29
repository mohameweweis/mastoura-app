import express from 'express';
import cors from 'cors';
import prisma from './prisma';
import multer from 'multer';
import * as XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { authenticate, authorize, hashPassword } from './lib/auth';
import { audit } from './lib/audit';
import { resolveUpload } from './lib/common';
import { registerDocuments } from './routes/documents';
import { registerBulk } from './routes/bulk';
import { registerAlerts } from './routes/alerts';
import { registerProjects } from './routes/projects';
import { registerCompetency } from './routes/competency';
import { registerReports } from './routes/reports';
import { registerBackup } from './routes/backup';
import { registerSystem } from './routes/system';
import { bootstrapTenants, tenantMulter } from './lib/tenant';
import { currentUser as authedUser } from './lib/auth';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '5mb' }));

// تسجيل الدخول + الصلاحيات + سجل العمليات لكل مسارات /api
app.use('/api', authenticate, authorize);
const ENTITY_LABELS: Record<string, string> = {
  employees: 'عامل', 'employee-courses': 'دورة عامل', 'employee-cards': 'كرت عامل', attachments: 'مرفق', branches: 'فرع', courses: 'دورة',
  'qualification-cards': 'كرت تأهيل', drivers: 'سائق', 'driver-profiles': 'سائق', equipment: 'معدة', 'equipment-types': 'نوع معدة',
  inspections: 'فحص', users: 'مستخدم', documents: 'مستند', 'document-categories': 'تصنيف مستند', 'job-roles': 'وظيفة',
  'job-requirements': 'متطلب وظيفة', projects: 'مشروع', company: 'شركة', permits: 'تصريح عمل', assignments: 'حركة عمال', 'bulk-imports': 'استيراد جماعي', settings: 'إعدادات', restore: 'استعادة نسخة',
};
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method) && !req.path.startsWith('/auth') && !/\/(export|preview)$/.test(req.path)) {
    res.on('finish', () => {
      if (res.statusCode >= 400) return;
      const parts = req.path.split('/').filter(Boolean);
      const id = parts.find((x) => /^\d+$/.test(x));
      const action = req.method === 'POST' ? 'إضافة' : req.method === 'PUT' ? 'تعديل' : 'حذف';
      audit(req, action, ENTITY_LABELS[parts[0]] || parts[0], id, (res.locals as any).auditDetails || req.originalUrl.split('?')[0]);
    });
  }
  next();
});

// إعداد مساحة التخزين لرفع المرفقات
const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // لكل شركة مجلد مستقل داخل uploads (مسار نسبي ليبقى الحفظ في قاعدة البيانات قابلاً للنقل)
    const companyId = authedUser(req)?.companyId;
    if (!companyId) return cb(new Error('Tenant context missing'), '');
    const dir = path.join('uploads', `c${companyId}`, 'files');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safeName = Buffer.from(file.originalname, 'latin1').toString('utf8').replace(/\s+/g, '_');
    cb(null, Date.now() + '-' + safeName);
  }
});
const uploadDisk = tenantMulter(multer({ storage: diskStorage }));

// ==========================================
// المسارات الأساسية وإحصائيات لوحة التحكم
// ==========================================
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: 'OK', database: 'Connected' });
  } catch (error) {
    res.status(500).json({ status: 'ERROR', database: 'Disconnected' });
  }
});

app.get('/api/dashboard/summary', async (req, res) => {
  try {
    const now = new Date();
    const after30Days = new Date(now);
    after30Days.setDate(after30Days.getDate() + 30);

    const [
      employees, branches, drivers, equipment, courses, cards,
      expiredCourses, expiringCourses, expiredCards, expiringCards,
      expiredLicenses, expiringLicenses,
      employeeCoursesAll, coursesExp, cardsExp, driversExp,
    ] = await Promise.all([
      prisma.employee.count(), prisma.branch.count(), prisma.driverProfile.count(), prisma.equipment.count(),
      prisma.course.count(), prisma.qualificationCard.count(),
      prisma.employeeCourse.count({ where: { expiryDate: { lt: now } } }),
      prisma.employeeCourse.count({ where: { expiryDate: { gte: now, lt: after30Days } } }),
      prisma.employeeCard.count({ where: { expiryDate: { lt: now } } }),
      prisma.employeeCard.count({ where: { expiryDate: { gte: now, lt: after30Days } } }),
      prisma.driverProfile.count({ where: { licenseExpiryDate: { lt: now } } }),
      prisma.driverProfile.count({ where: { licenseExpiryDate: { gte: now, lt: after30Days } } }),
      // بيانات لرسم حالة الدورات التدريبية حسب الكود
      prisma.employeeCourse.findMany({ include: { course: true } }),
      // أقرب العناصر انتهاءً (دورات / كروت / رخص)
      prisma.employeeCourse.findMany({ include: { employee: true, course: true }, orderBy: { expiryDate: 'asc' }, take: 20 }),
      prisma.employeeCard.findMany({ include: { employee: true, card: true }, orderBy: { expiryDate: 'asc' }, take: 20 }),
      prisma.driverProfile.findMany({ include: { employee: true }, orderBy: { licenseExpiryDate: 'asc' }, take: 20 }),
    ]);

    // تجميع حالة الدورات لكل كود دورة (سارية / تنتهي قريباً / منتهية)
    const courseMap = new Map<string, { code: string; name: string; valid: number; expiringSoon: number; expired: number }>();
    for (const ec of employeeCoursesAll) {
      const key = ec.course.code;
      if (!courseMap.has(key)) courseMap.set(key, { code: ec.course.code, name: ec.course.name, valid: 0, expiringSoon: 0, expired: 0 });
      const entry = courseMap.get(key)!;
      const exp = new Date(ec.expiryDate);
      if (exp < now) entry.expired += 1;
      else if (exp < after30Days) entry.expiringSoon += 1;
      else entry.valid += 1;
    }
    const courseBreakdown = Array.from(courseMap.values())
      .sort((a, b) => (b.valid + b.expiringSoon + b.expired) - (a.valid + a.expiringSoon + a.expired))
      .slice(0, 6);

    // أقرب 6 عناصر انتهاءً من كل المصادر مجتمعة
    const nearestExpiring = [
      ...coursesExp.map((c) => ({ employeeName: c.employee.name, type: 'دورة تدريبية', label: c.course.name, expiryDate: c.expiryDate })),
      ...cardsExp.map((c) => ({ employeeName: c.employee.name, type: 'كرت اختبار', label: c.card.name, expiryDate: c.expiryDate })),
      ...driversExp.filter((d) => d.licenseExpiryDate).map((d) => ({ employeeName: d.employee.name, type: 'رخصة قيادة', label: d.licenseType, expiryDate: d.licenseExpiryDate as Date })),
    ]
      .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
      .slice(0, 6);

    res.json({
      employees, branches, drivers, equipment, courses, cards,
      expiredCourses, expiringCourses, expiredCards, expiringCards,
      expiredLicenses, expiringLicenses,
      courseBreakdown, nearestExpiring,
    });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تحميل إحصائيات لوحة التحكم' });
  }
});

// ==========================================
// مسارات الفروع
// ==========================================
app.get('/api/branches', async (req, res) => {
  const branches = await prisma.branch.findMany({ orderBy: { name: 'asc' } });
  res.json(branches);
});

app.post('/api/branches', async (req, res) => {
  try {
    const { name, code, address, phone } = req.body;
    const branch = await prisma.branch.create({ data: { name, code, address, phone } });
    res.status(201).json({ message: 'تم إضافة الفرع بنجاح', branch });
  } catch (error) {
    res.status(500).json({ message: 'تعذر إضافة الفرع، تأكد من عدم تكرار الرمز' });
  }
});

app.put('/api/branches/:id', async (req, res) => {
  try {
    const { name, code, address, phone, status } = req.body;
    const branch = await prisma.branch.update({ where: { id: Number(req.params.id) }, data: { name, code, address, phone, status } });
    res.json({ message: 'تم تعديل بيانات الفرع بنجاح', branch });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل الفرع' });
  }
});

app.delete('/api/branches/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const linkedEmployees = await prisma.employee.count({ where: { branchId: id } });
    if (linkedEmployees > 0) return res.status(400).json({ message: `لا يمكن حذف الفرع، يوجد ${linkedEmployees} عامل مرتبط به` });
    await prisma.equipment.deleteMany({ where: { branchId: id } });
    await prisma.branch.delete({ where: { id } });
    res.json({ message: 'تم حذف الفرع بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف الفرع' });
  }
});

// ==========================================
// مسارات العاملين والاستيراد والتعديل والحذف
// ==========================================
app.post('/api/employees', async (req, res) => {
  try {
    const { internalNumber, jobNumber, name, iqamaNumber, phone, profession, branchId, hireDate } = req.body;
    const newEmployee = await prisma.employee.create({
      data: { internalNumber, jobNumber, name, iqamaNumber, phone, profession, branchId: Number(branchId), hireDate: new Date(hireDate) },
    });
    res.status(201).json({ message: 'تم إضافة العامل بنجاح', employee: newEmployee });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ في الخادم' });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { internalNumber, jobNumber, name, iqamaNumber, phone, profession, branchId, hireDate } = req.body;
    
    const updatedEmployee = await prisma.employee.update({
      where: { id: Number(id) },
      data: { internalNumber, jobNumber, name, iqamaNumber, phone, profession, branchId: Number(branchId), hireDate: new Date(hireDate) },
    });
    res.json({ message: 'تم تعديل بيانات العامل بنجاح', employee: updatedEmployee });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء تعديل بيانات العامل' });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.employeeCourse.deleteMany({ where: { employeeId: id } });
    await prisma.employeeCard.deleteMany({ where: { employeeId: id } });
    await prisma.employeeEquipment.deleteMany({ where: { employeeId: id } });
    await prisma.driverProfile.deleteMany({ where: { employeeId: id } });
    await prisma.employeeAttachment.deleteMany({ where: { employeeId: id } });
    await prisma.employee.delete({ where: { id } });
    res.json({ message: 'تم حذف العامل وكافة بياناته بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء حذف العامل' });
  }
});

// استيراد عدة عاملين دفعة واحدة من ملف إكسل
// الأعمدة المتوقعة: الاسم | الرقم الداخلي | الرقم الوظيفي | رقم الإقامة | الجوال | المهنة | رمز الفرع | تاريخ التعيين
app.post('/api/employees/import', uploadDisk.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'الرجاء اختيار ملف إكسل' });
  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    const branches = await prisma.branch.findMany();
    const branchByCode = new Map(branches.map((b) => [b.code.trim(), b]));
    const branchByName = new Map(branches.map((b) => [b.name.trim(), b]));

    const results = { created: 0, skipped: 0, errors: [] as string[] };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const name = String(row['الاسم'] || row['name'] || '').trim();
      const internalNumber = String(row['الرقم الداخلي'] || row['internalNumber'] || '').trim();
      const jobNumber = String(row['الرقم الوظيفي'] || row['jobNumber'] || '').trim();
      const iqamaNumber = String(row['رقم الإقامة'] || row['iqamaNumber'] || '').trim();
      const phone = String(row['الجوال'] || row['phone'] || '').trim();
      const profession = String(row['المهنة'] || row['profession'] || '').trim();
      const branchCode = String(row['رمز الفرع'] || row['الفرع'] || row['branch'] || '').trim();
      const hireDateRaw = row['تاريخ التعيين'] || row['hireDate'];

      if (!name || !internalNumber || !jobNumber || !iqamaNumber) {
        results.skipped += 1;
        results.errors.push(`صف ${i + 2}: بيانات أساسية ناقصة (الاسم / الرقم الداخلي / الرقم الوظيفي / رقم الإقامة)`);
        continue;
      }

      const branch = branchByCode.get(branchCode) || branchByName.get(branchCode);
      if (!branch) {
        results.skipped += 1;
        results.errors.push(`صف ${i + 2}: لم يتم العثور على الفرع "${branchCode}"`);
        continue;
      }

      let hireDate: Date;
      if (hireDateRaw instanceof Date) hireDate = hireDateRaw;
      else if (typeof hireDateRaw === 'number') hireDate = new Date(Math.round((hireDateRaw - 25569) * 86400 * 1000));
      else hireDate = hireDateRaw ? new Date(hireDateRaw) : new Date();

      try {
        await prisma.employee.create({
          data: { internalNumber, jobNumber, name, iqamaNumber, phone, profession, branchId: branch.id, hireDate },
        });
        results.created += 1;
      } catch (err: any) {
        results.skipped += 1;
        results.errors.push(`صف ${i + 2}: تعذر الحفظ (بيانات مكررة على الأرجح)`);
      }
    }

    res.json({ message: `تم استيراد ${results.created} عامل بنجاح${results.skipped ? `، وتخطي ${results.skipped}` : ''}`, ...results });
  } catch (error) {
    res.status(500).json({ message: 'تعذر قراءة ملف الإكسل، تأكد من صيغة الملف' });
  }
});

app.get('/api/employees', async (req, res) => {
  const employees = await prisma.employee.findMany({
    include: {
      branch: true, courses: { include: { course: true } }, cards: { include: { card: true } }, driverProfile: true,
      documents: { where: { status: 'active' }, select: { id: true, categoryId: true, expiryDate: true } },
    },
    orderBy: { name: 'asc' },
  });
  res.json(employees);
});

app.get('/api/employees/:id', async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: Number(req.params.id) },
    include: {
      branch: true,
      courses: { include: { course: true } },
      cards: { include: { card: true } },
      driverProfile: true,
      attachments: { orderBy: { uploadedAt: 'desc' } },
    },
  });
  if (!employee) return res.status(404).json({ message: 'العامل غير موجود' });
  res.json(employee);
});

// ==========================================
// مسارات الدورات (مع المرفقات والحذف)
// ==========================================
app.get('/api/courses', async (req, res) => {
  const courses = await prisma.course.findMany({ orderBy: { name: 'asc' } });
  res.json(courses);
});

app.post('/api/courses', async (req, res) => {
  try {
    const { name, code, description, validityPeriod } = req.body;
    const course = await prisma.course.create({ data: { name, code, description, validityPeriod: Number(validityPeriod) || 730 } });
    res.status(201).json({ message: 'تم إضافة الدورة بنجاح', course });
  } catch (error) {
    res.status(500).json({ message: 'تعذر إضافة الدورة، تأكد من عدم تكرار الرمز' });
  }
});

app.put('/api/courses/:id', async (req, res) => {
  try {
    const { name, code, description, validityPeriod } = req.body;
    const course = await prisma.course.update({ where: { id: Number(req.params.id) }, data: { name, code, description, validityPeriod: Number(validityPeriod) || 730 } });
    res.json({ message: 'تم تعديل الدورة بنجاح', course });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل الدورة' });
  }
});

app.delete('/api/courses/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const linked = await prisma.employeeCourse.count({ where: { courseId: id } });
    if (linked > 0) return res.status(400).json({ message: `لا يمكن حذف الدورة، مرتبطة بـ ${linked} سجل تأهيل` });
    await prisma.course.delete({ where: { id } });
    res.json({ message: 'تم حذف الدورة بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف الدورة' });
  }
});

app.post('/api/employees/:employeeId/courses', uploadDisk.single('file'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { courseId, courseName, courseCode, courseDate, expiryDate, certificateNumber } = req.body;
    let finalCourseId = Number(courseId);

    if (!finalCourseId && courseName && courseCode) {
      let course = await prisma.course.findFirst({ where: { code: courseCode } });
      if (!course) course = await prisma.course.create({ data: { name: courseName, code: courseCode, validityPeriod: 730 } });
      finalCourseId = course.id;
    }

    if (!finalCourseId) return res.status(400).json({ message: 'يجب تحديد الدورة بشكل صحيح' });

    const attachmentPath = req.file ? req.file.path : null;

    const employeeCourse = await prisma.employeeCourse.create({
      data: {
        employeeId: Number(employeeId), courseId: finalCourseId,
        courseDate: new Date(courseDate), expiryDate: new Date(expiryDate),
        certificateNumber, attachment: attachmentPath
      },
    });
    res.status(201).json({ message: 'تم تعيين الدورة للعامل بنجاح', employeeCourse });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ في الخادم' });
  }
});

app.delete('/api/employee-courses/:id', async (req, res) => {
  try {
    await prisma.employeeCourse.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف الدورة بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف الدورة' });
  }
});

app.put('/api/employee-courses/:id', uploadDisk.single('file'), async (req, res) => {
  try {
    const { courseId, courseDate, expiryDate, certificateNumber } = req.body;
    const data: any = { courseDate: new Date(courseDate), expiryDate: new Date(expiryDate), certificateNumber };
    if (courseId) data.courseId = Number(courseId);
    if (req.file) data.attachment = req.file.path;
    const employeeCourse = await prisma.employeeCourse.update({ where: { id: Number(req.params.id) }, data });
    res.json({ message: 'تم تعديل الدورة بنجاح', employeeCourse });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل الدورة' });
  }
});

// ==========================================
// مسارات كروت التأهيل (مع المرفقات والحذف)
// ==========================================
app.get('/api/qualification-cards', async (req, res) => {
  const cards = await prisma.qualificationCard.findMany({ orderBy: { name: 'asc' } });
  res.json(cards);
});

app.post('/api/qualification-cards', async (req, res) => {
  try {
    const { name, code, description } = req.body;
    const card = await prisma.qualificationCard.create({ data: { name, code, description } });
    res.status(201).json({ message: 'تم إضافة الكرت بنجاح', card });
  } catch (error) {
    res.status(500).json({ message: 'تعذر إضافة الكرت، تأكد من عدم تكرار الرمز' });
  }
});

app.put('/api/qualification-cards/:id', async (req, res) => {
  try {
    const { name, code, description } = req.body;
    const card = await prisma.qualificationCard.update({ where: { id: Number(req.params.id) }, data: { name, code, description } });
    res.json({ message: 'تم تعديل الكرت بنجاح', card });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل الكرت' });
  }
});

app.delete('/api/qualification-cards/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const linked = await prisma.employeeCard.count({ where: { cardId: id } });
    if (linked > 0) return res.status(400).json({ message: `لا يمكن حذف الكرت، مرتبط بـ ${linked} سجل تأهيل` });
    await prisma.qualificationCard.delete({ where: { id } });
    res.json({ message: 'تم حذف الكرت بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف الكرت' });
  }
});

app.post('/api/employees/:employeeId/cards', uploadDisk.single('file'), async (req, res) => {
  try {
    const { employeeId } = req.params;
    const { cardId, cardName, cardCode, cardNumber, issueDate, expiryDate } = req.body;
    let finalCardId = Number(cardId);

    if (!finalCardId && cardName && cardCode) {
      let card = await prisma.qualificationCard.findFirst({ where: { code: cardCode } });
      if (!card) card = await prisma.qualificationCard.create({ data: { name: cardName, code: cardCode } });
      finalCardId = card.id;
    }

    const attachmentPath = req.file ? req.file.path : null;

    const employeeCard = await prisma.employeeCard.create({
      data: {
        employeeId: Number(employeeId), cardId: finalCardId, cardNumber,
        issueDate: new Date(issueDate), expiryDate: new Date(expiryDate), attachment: attachmentPath
      },
    });
    res.status(201).json({ message: 'تم إضافة الكرت للعامل بنجاح', employeeCard });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ في الخادم' });
  }
});

app.delete('/api/employee-cards/:id', async (req, res) => {
  try {
    await prisma.employeeCard.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف الكرت بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف الكرت' });
  }
});

app.put('/api/employee-cards/:id', uploadDisk.single('file'), async (req, res) => {
  try {
    const { cardId, cardNumber, issueDate, expiryDate } = req.body;
    const data: any = { cardNumber, issueDate: new Date(issueDate), expiryDate: new Date(expiryDate) };
    if (cardId) data.cardId = Number(cardId);
    if (req.file) data.attachment = req.file.path;
    const employeeCard = await prisma.employeeCard.update({ where: { id: Number(req.params.id) }, data });
    res.json({ message: 'تم تعديل الكرت بنجاح', employeeCard });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل الكرت' });
  }
});

// ==========================================
// مسارات المرفقات العامة والتحميل
// ==========================================
app.post('/api/employees/:id/attachments', uploadDisk.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'الرجاء اختيار ملف' });
    const { documentType } = req.body; // نوع المستند (إقامة، جواز، الخ)
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const finalName = documentType ? `${documentType} - ${originalName}` : originalName;

    const attachment = await prisma.employeeAttachment.create({
      data: { employeeId: Number(req.params.id), fileName: finalName, filePath: req.file.path }
    });
    res.status(201).json({ message: 'تم رفع المرفق بنجاح', attachment });
  } catch (error) {
    res.status(500).json({ message: 'حدث خطأ أثناء رفع المرفق' });
  }
});

app.delete('/api/attachments/:id', async (req, res) => {
  try {
    await prisma.employeeAttachment.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف المرفق' });
  } catch (error) {
    res.status(500).json({ message: 'خطأ في الحذف' });
  }
});

// ==========================================
// مسارات السائقين (ملف سائق مرتبط بعامل)
// ==========================================
app.get('/api/drivers', async (req, res) => {
  const drivers = await prisma.driverProfile.findMany({
    include: { employee: { include: { branch: true } } },
    orderBy: { id: 'desc' },
  });
  res.json(drivers);
});

app.post('/api/employees/:employeeId/driver-profile', async (req, res) => {
  try {
    const { licenseNumber, licenseType, licenseIssueDate, licenseExpiryDate, driverCardNumber, driverCardExpiryDate, notes } = req.body;
    const driver = await prisma.driverProfile.create({
      data: {
        employeeId: Number(req.params.employeeId),
        licenseNumber, licenseType,
        licenseIssueDate: new Date(licenseIssueDate),
        licenseExpiryDate: new Date(licenseExpiryDate),
        driverCardNumber: driverCardNumber || null,
        driverCardExpiryDate: driverCardExpiryDate ? new Date(driverCardExpiryDate) : null,
        notes,
      },
    });
    res.status(201).json({ message: 'تم تسجيل بيانات السائق بنجاح', driver });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تسجيل بيانات السائق (قد يكون العامل مسجلاً كسائق بالفعل)' });
  }
});

app.put('/api/driver-profiles/:id', async (req, res) => {
  try {
    const { licenseNumber, licenseType, licenseIssueDate, licenseExpiryDate, driverCardNumber, driverCardExpiryDate, status, notes } = req.body;
    const driver = await prisma.driverProfile.update({
      where: { id: Number(req.params.id) },
      data: {
        licenseNumber, licenseType,
        licenseIssueDate: new Date(licenseIssueDate),
        licenseExpiryDate: new Date(licenseExpiryDate),
        driverCardNumber: driverCardNumber || null,
        driverCardExpiryDate: driverCardExpiryDate ? new Date(driverCardExpiryDate) : null,
        status, notes,
      },
    });
    res.json({ message: 'تم تعديل بيانات السائق بنجاح', driver });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل بيانات السائق' });
  }
});

app.delete('/api/driver-profiles/:id', async (req, res) => {
  try {
    await prisma.driverProfile.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف بيانات السائق بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف بيانات السائق' });
  }
});

// ==========================================
// مسارات أنواع المعدات
// ==========================================
app.get('/api/equipment-types', async (req, res) => {
  const types = await prisma.equipmentType.findMany({ orderBy: { name: 'asc' } });
  res.json(types);
});

app.post('/api/equipment-types', async (req, res) => {
  try {
    const { name } = req.body;
    const type = await prisma.equipmentType.create({ data: { name } });
    res.status(201).json({ message: 'تم إضافة نوع المعدة بنجاح', type });
  } catch (error) {
    res.status(500).json({ message: 'تعذر إضافة النوع، تأكد من عدم تكراره' });
  }
});

app.delete('/api/equipment-types/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const linked = await prisma.equipment.count({ where: { typeId: id } });
    if (linked > 0) return res.status(400).json({ message: `لا يمكن حذف النوع، مرتبط بـ ${linked} معدة` });
    await prisma.equipmentType.delete({ where: { id } });
    res.json({ message: 'تم حذف النوع بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف النوع' });
  }
});

// ==========================================
// مسارات المعدات
// ==========================================
app.get('/api/equipment', async (req, res) => {
  const equipment = await prisma.equipment.findMany({
    include: { type: true, branch: true, inspections: { orderBy: { expiryDate: 'asc' } } },
    orderBy: { id: 'desc' },
  });
  res.json(equipment);
});

app.get('/api/equipment/:id', async (req, res) => {
  const equipment = await prisma.equipment.findUnique({
    where: { id: Number(req.params.id) },
    include: { type: true, branch: true, inspections: { orderBy: { inspectionDate: 'desc' } } },
  });
  if (!equipment) return res.status(404).json({ message: 'المعدة غير موجودة' });
  res.json(equipment);
});

app.post('/api/equipment', async (req, res) => {
  try {
    const { equipmentNumber, typeId, manufacturer, model, year, branchId, notes } = req.body;
    const equipment = await prisma.equipment.create({
      data: { equipmentNumber, typeId: Number(typeId), manufacturer, model, year: year ? Number(year) : null, branchId: Number(branchId), notes },
    });
    res.status(201).json({ message: 'تم إضافة المعدة بنجاح', equipment });
  } catch (error) {
    res.status(500).json({ message: 'تعذر إضافة المعدة، تأكد من عدم تكرار الرقم' });
  }
});

app.put('/api/equipment/:id', async (req, res) => {
  try {
    const { equipmentNumber, typeId, manufacturer, model, year, branchId, status, notes } = req.body;
    const equipment = await prisma.equipment.update({
      where: { id: Number(req.params.id) },
      data: { equipmentNumber, typeId: Number(typeId), manufacturer, model, year: year ? Number(year) : null, branchId: Number(branchId), status, notes },
    });
    res.json({ message: 'تم تعديل بيانات المعدة بنجاح', equipment });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل المعدة' });
  }
});

app.delete('/api/equipment/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    await prisma.equipmentInspection.deleteMany({ where: { equipmentId: id } });
    await prisma.equipment.delete({ where: { id } });
    res.json({ message: 'تم حذف المعدة بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف المعدة' });
  }
});

// ==========================================
// مسارات فحوصات المعدات
// ==========================================
app.post('/api/equipment/:equipmentId/inspections', uploadDisk.single('file'), async (req, res) => {
  try {
    const { inspectionType, inspectionDate, expiryDate, certificateNumber, result, notes } = req.body;
    const inspection = await prisma.equipmentInspection.create({
      data: {
        equipmentId: Number(req.params.equipmentId),
        inspectionType, inspectionDate: new Date(inspectionDate), expiryDate: new Date(expiryDate),
        certificateNumber, result: result || 'pass', notes,
        attachment: req.file ? req.file.path : null,
      },
    });
    res.status(201).json({ message: 'تم تسجيل الفحص بنجاح', inspection });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تسجيل الفحص' });
  }
});

app.delete('/api/inspections/:id', async (req, res) => {
  try {
    await prisma.equipmentInspection.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف سجل الفحص بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف سجل الفحص' });
  }
});

// ==========================================
// مسارات المستخدمين والصلاحيات
// ==========================================
app.get('/api/users', async (req, res) => {
  const users = await prisma.user.findMany({ select: { id: true, username: true, role: true, createdAt: true }, orderBy: { id: 'asc' } });
  res.json(users);
});

app.post('/api/users', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const hashed = hashPassword(password);
    const user = await prisma.user.create({ data: { username, password: hashed, role: role || 'VIEWER' } });
    res.status(201).json({ message: 'تم إضافة المستخدم بنجاح', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'تعذر إضافة المستخدم، تأكد من عدم تكرار اسم المستخدم' });
  }
});

app.put('/api/users/:id', async (req, res) => {
  try {
    const { username, password, role } = req.body;
    const data: any = { username, role };
    if (password) data.password = hashPassword(password);
    const user = await prisma.user.update({ where: { id: Number(req.params.id) }, data });
    res.json({ message: 'تم تعديل بيانات المستخدم بنجاح', user: { id: user.id, username: user.username, role: user.role } });
  } catch (error) {
    res.status(500).json({ message: 'تعذر تعديل المستخدم' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    await prisma.user.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف المستخدم بنجاح' });
  } catch (error) {
    res.status(500).json({ message: 'تعذر حذف المستخدم' });
  }
});

// ==========================================
// تقرير شامل بصيغة إكسل (عاملون + دورات + كروت + سائقون)
// ==========================================
app.get('/api/reports/comprehensive', async (req, res) => {
  try {
    const employees = await prisma.employee.findMany({
      include: { branch: true, courses: { include: { course: true } }, cards: { include: { card: true } }, driverProfile: true },
      orderBy: { name: 'asc' },
    });

    const employeesSheet = employees.map((e) => ({
      'الرقم الداخلي': e.internalNumber,
      'الرقم الوظيفي': e.jobNumber,
      'الاسم': e.name,
      'رقم الإقامة': e.iqamaNumber,
      'الجوال': e.phone || '',
      'المهنة': e.profession || '',
      'الفرع': e.branch?.name || '',
      'تاريخ التعيين': e.hireDate.toISOString().slice(0, 10),
      'الحالة': e.status,
    }));

    const coursesSheet = employees.flatMap((e) =>
      e.courses.map((c) => ({
        'العامل': e.name, 'الرقم الوظيفي': e.jobNumber, 'الدورة': c.course.name, 'كود الدورة': c.course.code,
        'تاريخ الدورة': c.courseDate.toISOString().slice(0, 10), 'تاريخ الانتهاء': c.expiryDate.toISOString().slice(0, 10),
        'رقم الشهادة': c.certificateNumber || '', 'الحالة': new Date(c.expiryDate) < new Date() ? 'منتهية' : 'سارية',
      }))
    );

    const cardsSheet = employees.flatMap((e) =>
      e.cards.map((c) => ({
        'العامل': e.name, 'الرقم الوظيفي': e.jobNumber, 'الكرت': c.card.name, 'كود الكرت': c.card.code,
        'رقم الكرت': c.cardNumber, 'تاريخ الإصدار': c.issueDate.toISOString().slice(0, 10), 'تاريخ الانتهاء': c.expiryDate.toISOString().slice(0, 10),
        'الحالة': new Date(c.expiryDate) < new Date() ? 'منتهية' : 'سارية',
      }))
    );

    const driversSheet = employees.filter((e) => e.driverProfile).map((e) => ({
      'العامل': e.name, 'الرقم الوظيفي': e.jobNumber, 'رقم الرخصة': e.driverProfile!.licenseNumber,
      'نوع الرخصة': e.driverProfile!.licenseType, 'تاريخ الإصدار': e.driverProfile!.licenseIssueDate.toISOString().slice(0, 10),
      'تاريخ الانتهاء': e.driverProfile!.licenseExpiryDate.toISOString().slice(0, 10), 'الحالة': e.driverProfile!.status,
    }));

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(employeesSheet), 'العاملون');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(coursesSheet), 'الدورات');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(cardsSheet), 'كروت الاختبار');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(driversSheet), 'السائقون');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', `attachment; filename=comprehensive-report-${Date.now()}.xlsx`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ message: 'تعذر إنشاء التقرير الشامل' });
  }
});

// مسار تحميل ديناميكي وموحد لأي ملف (مرفق عام أو مرفق دورة/كرت)
app.get('/api/download', (req, res) => {
  const abs = resolveUpload(String(req.query.path || ''));
  if (!abs || !fs.existsSync(abs)) return res.status(404).json({ message: 'الملف غير موجود على الخادم' });
  res.download(abs);
});

registerDocuments(app);
registerBulk(app);
registerAlerts(app);
registerProjects(app);
registerCompetency(app);
registerReports(app);
registerBackup(app);
registerSystem(app);

app.use((err: any, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(err?.status || 500).json({ message: err?.message?.includes('File too large') ? 'حجم الملف أكبر من المسموح' : 'حدث خطأ غير متوقع في الخادم' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server is running on http://localhost:${PORT}`);
  (async () => {
    try {
      await bootstrapTenants();
    } catch (e) {
      console.error('⚠️ تعذرت تهيئة البيانات الأولية. هل نفّذت: npx prisma db push ؟', e);
    }
  })();
});