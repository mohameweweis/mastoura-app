import type { Express } from 'express';
import multer from 'multer';
import fs from 'fs';
import os from 'os';
import path from 'path';
import prisma, { currentCompanyId } from '../prisma';
import { tenantMulter } from '../lib/tenant';
import { settingKey } from '../lib/tenant-core';
import { audit } from '../lib/audit';
import { ZipWriter, readZip, closeZip } from '../lib/zip';
import { UPLOAD_ROOT, TMP_DIR, ensureDir, pathBelongsToCompany } from '../lib/common';

ensureDir(TMP_DIR);
const upload = tenantMulter(multer({ dest: TMP_DIR, limits: { fileSize: 2 * 1024 * 1024 * 1024 } }));

// ترتيب الإدخال (الجداول الأب أولاً)
const TABLES = [
  'Branch', 'Course', 'QualificationCard', 'EquipmentType', 'DocumentCategory', 'JobRole', 'Employee', 'EmployeeAttachment',
  'EmployeeCourse', 'EmployeeCard', 'DriverProfile', 'Equipment', 'EmployeeEquipment', 'EquipmentInspection', 'EmployeeDocument',
  'JobRequirement', 'BulkImportJob', 'AuditLog', 'AppSetting', 'User',
];
const delegate = (name: string) => (prisma as any)[name.charAt(0).toLowerCase() + name.slice(1)];

function listFiles(dir: string, out: string[] = []) {
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, f.name);
    if (f.isDirectory()) {
      if (['tmp', 'bulk'].includes(f.name) && dir === UPLOAD_ROOT) continue;
      listFiles(full, out);
    } else out.push(full);
  }
  return out;
}

export function registerBackup(app: Express) {
  app.get('/api/backup', async (req, res) => {
    const tmp = path.join(os.tmpdir(), `backup-${Date.now()}.zip`);
    const out = fs.createWriteStream(tmp);
    const zip = new ZipWriter(out);
    try {
      const tables: Record<string, any[]> = {};
      const companyId = currentCompanyId()!;
      const prefix = settingKey(companyId, '');
      for (const t of TABLES) tables[t] = t === 'AppSetting' ? await prisma.appSetting.findMany({ where: { key: { startsWith: prefix } } }) : await delegate(t).findMany();
      await zip.addBuffer('data.json', Buffer.from(JSON.stringify({ version: 2, companyId, exportedAt: new Date().toISOString(), tables })));
      let count = 0;
      for (const file of listFiles(UPLOAD_ROOT).filter((f) => pathBelongsToCompany(f, companyId))) {
        const rel = path.relative(process.cwd(), file).split(path.sep).join('/');
        await zip.addFile(`files/${rel}`, file);
        count++;
      }
      await zip.finish();
      await audit(req, 'نسخ احتياطي', 'النظام', null, `${count} ملف`);
    } catch (e: any) {
      try { out.destroy(); fs.unlinkSync(tmp); } catch { /* ignore */ }
      return res.status(500).json({ message: e?.message || 'تعذر إنشاء النسخة الاحتياطية' });
    }
    res.download(tmp, `backup-${new Date().toISOString().slice(0, 10)}.zip`, () => { try { fs.unlinkSync(tmp); } catch { /* ignore */ } });
  });

  app.post('/api/restore', upload.single('file'), async (req, res) => {
    const file = req.file;
    const drop = () => { try { if (file) fs.unlinkSync(file.path); } catch { /* ignore */ } };
    if (!file) return res.status(400).json({ message: 'الرجاء اختيار ملف النسخة الاحتياطية' });
    if (req.body?.confirm !== 'RESTORE') { drop(); return res.status(400).json({ message: 'يجب كتابة كلمة RESTORE للتأكيد' }); }
    let entries: ReturnType<typeof readZip> = [];
    try {
      entries = readZip(file.path);
      const dataEntry = entries.find((e) => e.name === 'data.json');
      if (!dataEntry) throw new Error('الملف ليس نسخة احتياطية صحيحة (data.json غير موجود)');
      const data = JSON.parse(dataEntry.read().toString('utf8'));
      if (!data?.tables) throw new Error('محتوى النسخة الاحتياطية غير صالح');
      const companyId = currentCompanyId()!;
      // نسخ ما قبل تعدد الشركات (بلا companyId) تخص الشركة رقم 1 فقط
      const backupCompany = typeof data.companyId === 'number' ? data.companyId : 1;
      if (backupCompany !== companyId) throw new Error('هذه النسخة الاحتياطية تخص شركة أخرى ولا يمكن استعادتها هنا');
      const prefix = settingKey(companyId, '');

      await prisma.$transaction(async (tx: any) => {
        for (const t of [...TABLES].reverse()) await tx[t.charAt(0).toLowerCase() + t.slice(1)].deleteMany(t === 'AppSetting' ? { where: { key: { startsWith: prefix } } } : undefined);
        for (const t of TABLES) {
          const rows: any[] = (data.tables[t] || []).filter((r: any) => t !== 'AppSetting' || String(r.key).startsWith(prefix));
          for (let i = 0; i < rows.length; i += 500) await tx[t.charAt(0).toLowerCase() + t.slice(1)].createMany({ data: rows.slice(i, i + 500) });
        }
      }, { timeout: 300000, maxWait: 30000 });

      for (const t of TABLES.filter((x) => x !== 'AppSetting')) {
        await prisma.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"${t}"', 'id'), COALESCE((SELECT MAX(id) FROM "${t}"), 0) + 1, false)`);
      }

      let restored = 0;
      for (const e of entries) {
        if (e.isDir || !e.name.startsWith('files/uploads/') || e.name.includes('..')) continue;
        const dest = path.resolve(process.cwd(), e.name.slice('files/'.length));
        if (!dest.startsWith(UPLOAD_ROOT + path.sep) || !pathBelongsToCompany(dest, companyId)) continue;
        ensureDir(path.dirname(dest));
        fs.writeFileSync(dest, e.read());
        restored++;
      }
      await audit(req, 'استعادة', 'النظام', null, `${restored} ملف`);
      res.json({ message: `تمت استعادة قاعدة البيانات و${restored} ملف بنجاح` });
    } catch (e: any) {
      res.status(400).json({ message: e?.message || 'فشلت الاستعادة، لم يتم تغيير أي بيانات' });
    } finally {
      closeZip(entries);
      drop();
    }
  });
}
