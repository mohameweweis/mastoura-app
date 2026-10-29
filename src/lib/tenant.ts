import type { Request, Response, NextFunction, RequestHandler } from 'express';
import prisma, { prismaUnscoped, runAsTenant } from '../prisma';
import { hashPassword } from './auth';
import { SLUG_RE, normalizeSlug } from './tenant-core';
import { seedCategories, migrateLegacyAttachments } from '../routes/documents';

// multer يستدعي الخطوة التالية من حدث خارج سياق الطلب؛ هذا الغلاف يعيد ضبط سياق الشركة بعد الرفع
export function tenantMulter<T extends object>(m: T): T {
  const wrapFn = (fn: (...a: any[]) => RequestHandler) => (...args: any[]) => {
    const mw = fn.apply(m, args);
    return (req: Request, res: Response, next: NextFunction) => {
      const companyId = (req as any).user?.companyId;
      mw(req, res, (err?: any) => (companyId ? runAsTenant(companyId, () => next(err)) : next(err)));
    };
  };
  return new Proxy(m, {
    get(target: any, prop: string) {
      return ['single', 'array', 'fields', 'none', 'any'].includes(prop) ? wrapFn(target[prop].bind(target)) : target[prop];
    },
  });
}

// تهيئة كل شركة: التصنيفات الافتراضية + ترحيل المرفقات القديمة
export async function initCompany(companyId: number) {
  await runAsTenant(companyId, async () => {
    await seedCategories();
    await migrateLegacyAttachments();
  });
}

// إنشاء شركة جديدة مع مدير نظام لها
export async function createCompany(opts: { name: string; slug: string; adminUsername: string; adminPassword: string; plan?: string; id?: number }) {
  const slug = normalizeSlug(opts.slug);
  if (!SLUG_RE.test(slug)) throw new Error('رمز الشركة: 3-30 حرفاً إنجليزياً صغيراً أو أرقاماً أو شرطة');
  if (!opts.name?.trim()) throw new Error('اسم الشركة مطلوب');
  if (!opts.adminUsername?.trim() || (opts.adminPassword || '').length < 6) throw new Error('اسم المستخدم مطلوب وكلمة المرور 6 أحرف على الأقل');
  if (await prismaUnscoped.company.findUnique({ where: { slug } })) throw new Error('رمز الشركة مستخدم مسبقاً');

  const company = await prismaUnscoped.company.create({ data: { ...(opts.id ? { id: opts.id } : {}), name: opts.name.trim(), slug, plan: opts.plan || 'trial' } });
  await initCompany(company.id);
  await runAsTenant(company.id, () =>
    prisma.user.create({ data: { username: opts.adminUsername.trim(), password: hashPassword(opts.adminPassword), role: 'ADMIN' } }),
  );
  return company;
}

// عند أول تشغيل: الشركة رقم 1 تضم كل البيانات الحالية (قبل تعدد الشركات)
export async function bootstrapTenants() {
  if ((await prismaUnscoped.company.count()) === 0) {
    await prismaUnscoped.company.create({ data: { id: 1, name: 'شركة مستورة', slug: 'mustoura', plan: 'enterprise' } });
    await prismaUnscoped.$executeRawUnsafe(`SELECT setval(pg_get_serial_sequence('"Company"', 'id'), GREATEST((SELECT MAX(id) FROM "Company"), 1))`);
    console.log('🏢 تم إنشاء الشركة الافتراضية (mustoura) وربط كل البيانات الحالية بها');
  }
  const companies = await prismaUnscoped.company.findMany();
  for (const c of companies) {
    await initCompany(c.id);
    const users = await runAsTenant(c.id, () => prisma.user.count());
    if (users === 0 && c.id === 1) {
      await runAsTenant(c.id, () => prisma.user.create({ data: { username: 'admin', password: hashPassword('admin123'), role: 'ADMIN' } }));
      console.log('🔐 تم إنشاء المستخدم الافتراضي: admin / admin123 (شركة mustoura) — غيّر كلمة المرور بعد أول دخول');
    }
  }
}
