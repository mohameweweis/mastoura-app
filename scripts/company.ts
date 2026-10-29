// إدارة الشركات من سطر الأوامر:
//   npm run company -- list
//   npm run company -- create <slug> "<اسم الشركة>" <adminUser> <adminPass>
//   npm run company -- suspend <slug>      /   activate <slug>
//   npm run company -- purge <slug> --yes   (حذف نهائي لكل بيانات الشركة وملفاتها)
import fs from 'fs';
import path from 'path';
import prisma, { prismaUnscoped, runAsTenant } from '../src/prisma';
import { createCompany } from '../src/lib/tenant';
import { TENANT_MODELS } from '../src/lib/tenant-core';

const [cmd, ...args] = process.argv.slice(2);

// ترتيب الحذف (الأبناء أولاً)
const DELETE_ORDER = [
  'WorkPermitWorker', 'WorkPermit', 'ProjectAssignment', 'Project', 'JobRequirement', 'JobRole', 'EmployeeDocument', 'DocumentCategory',
  'EquipmentInspection', 'EmployeeEquipment', 'Equipment', 'EquipmentType', 'DriverProfile', 'EmployeeCard', 'EmployeeCourse', 'EmployeeAttachment',
  'QualificationCard', 'Course', 'Employee', 'Branch', 'BulkImportJob', 'AuditLog', 'User',
];

async function main() {
  if (cmd === 'list') {
    const list = await prismaUnscoped.company.findMany({ orderBy: { id: 'asc' } });
    for (const c of list) {
      const [users, employees] = await runAsTenant(c.id, () => Promise.all([prisma.user.count(), prisma.employee.count()]));
      console.log(`#${c.id}  ${c.slug.padEnd(22)} ${c.status.padEnd(10)} ${c.plan.padEnd(10)} مستخدمون: ${users}  عاملون: ${employees}  — ${c.name}`);
    }
  } else if (cmd === 'create') {
    const [slug, name, adminUsername, adminPassword] = args;
    const c = await createCompany({ slug, name, adminUsername, adminPassword });
    console.log(`✅ تم إنشاء الشركة #${c.id} (${c.slug})`);
  } else if (cmd === 'suspend' || cmd === 'activate') {
    const c = await prismaUnscoped.company.update({ where: { slug: args[0] }, data: { status: cmd === 'suspend' ? 'suspended' : 'active' } });
    console.log(`✅ الشركة ${c.slug}: ${c.status} (قد يستغرق سريان الإيقاف حتى دقيقة)`);
  } else if (cmd === 'purge') {
    const c = await prismaUnscoped.company.findUnique({ where: { slug: args[0] } });
    if (!c) throw new Error('الشركة غير موجودة');
    if (c.id === 1) throw new Error('لا يمكن حذف الشركة رقم 1');
    if (!args.includes('--yes')) throw new Error('أضف --yes لتأكيد الحذف النهائي');
    for (const model of DELETE_ORDER) {
      if (!TENANT_MODELS.has(model)) continue;
      await runAsTenant(c.id, () => (prisma as any)[model.charAt(0).toLowerCase() + model.slice(1)].deleteMany({}));
    }
    await prismaUnscoped.appSetting.deleteMany({ where: { key: { startsWith: `c${c.id}:` } } });
    await prismaUnscoped.company.delete({ where: { id: c.id } });
    const dir = path.join(process.cwd(), 'uploads', `c${c.id}`);
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
    console.log(`🗑️ تم حذف الشركة ${c.slug} وكل بياناتها وملفاتها`);
  } else {
    console.log('الأوامر: list | create <slug> "<name>" <admin> <pass> | suspend <slug> | activate <slug> | purge <slug> --yes');
  }
}
main().catch((e) => { console.error('❌', e.message); process.exit(1); }).finally(() => process.exit(0));
