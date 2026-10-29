import type { Express } from 'express';
import prisma, { prismaUnscoped, runAsTenant } from '../prisma';
import { audit } from '../lib/audit';
import { currentUser, hashPassword, signToken, verifyPassword } from '../lib/auth';
import { createCompany } from '../lib/tenant';
import { normalizeSlug } from '../lib/tenant-core';

const allowSignup = () => process.env.ALLOW_SIGNUP === 'true';

export function registerSystem(app: Express) {
  // إعدادات عامة لصفحة الدخول (بدون مصادقة)
  app.get('/api/auth/config', async (_req, res) => {
    const companies = await prismaUnscoped.company.findMany({ where: { status: 'active' }, select: { name: true, slug: true }, take: 2 });
    res.json({ allowSignup: allowSignup(), single: companies.length === 1 ? companies[0] : null });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    const slug = normalizeSlug(req.body?.company);
    let company: any = null;
    if (slug) company = await prismaUnscoped.company.findUnique({ where: { slug } });
    else {
      const all = await prismaUnscoped.company.findMany({ take: 2 });
      company = all.length === 1 ? all[0] : null;
    }
    const fail = () => res.status(401).json({ message: 'بيانات الدخول غير صحيحة (تأكد من رمز الشركة واسم المستخدم وكلمة المرور)' });
    if (!company || !username) return fail();
    if (company.status !== 'active') return res.status(403).json({ message: 'اشتراك الشركة موقوف، تواصل مع الدعم' });

    const user = await runAsTenant(company.id, () => prisma.user.findFirst({ where: { username: String(username) } }));
    if (!user || !verifyPassword(String(password || ''), user.password)) {
      await audit(null, 'محاولة دخول فاشلة', 'مستخدم', null, String(username), String(username), company.id);
      return fail();
    }
    const auth = { id: user.id, username: user.username, role: user.role as any, companyId: company.id };
    await audit(null, 'تسجيل دخول', 'مستخدم', user.id, undefined, user.username, company.id);
    res.json({ token: signToken(auth), user: { ...auth, companyName: company.name, companySlug: company.slug } });
  });

  // تسجيل شركة جديدة (يُفعَّل فقط بالمتغير ALLOW_SIGNUP=true)
  app.post('/api/auth/register-company', async (req, res) => {
    if (!allowSignup()) return res.status(403).json({ message: 'تسجيل الشركات الجديدة غير مفعّل' });
    try {
      const { companyName, slug, adminUsername, adminPassword } = req.body || {};
      const company = await createCompany({ name: companyName, slug, adminUsername, adminPassword });
      const user = await runAsTenant(company.id, () => prisma.user.findFirst({ where: { username: String(adminUsername).trim() } }));
      const auth = { id: user!.id, username: user!.username, role: 'ADMIN' as const, companyId: company.id };
      await audit(null, 'إنشاء شركة', 'شركة', company.id, company.name, user!.username, company.id);
      res.status(201).json({ token: signToken(auth), user: { ...auth, companyName: company.name, companySlug: company.slug } });
    } catch (e: any) {
      res.status(400).json({ message: e?.message || 'تعذر إنشاء الشركة' });
    }
  });

  app.get('/api/auth/me', async (req, res) => {
    const me = currentUser(req);
    const company = me ? await prismaUnscoped.company.findUnique({ where: { id: me.companyId } }) : null;
    res.json({ user: me, company: company ? { id: company.id, name: company.name, slug: company.slug, plan: company.plan } : null });
  });

  app.put('/api/auth/password', async (req, res) => {
    const me = currentUser(req);
    const { currentPassword, newPassword } = req.body || {};
    if (!me || !newPassword || String(newPassword).length < 6) return res.status(400).json({ message: 'كلمة المرور الجديدة يجب ألا تقل عن 6 أحرف' });
    const user = await prisma.user.findFirst({ where: { id: me.id } });
    if (!user || !verifyPassword(String(currentPassword || ''), user.password)) return res.status(400).json({ message: 'كلمة المرور الحالية غير صحيحة' });
    await prisma.user.update({ where: { id: user.id }, data: { password: hashPassword(String(newPassword)) } });
    res.json({ message: 'تم تغيير كلمة المرور بنجاح' });
  });

  app.get('/api/audit', async (req, res) => {
    const q = String(req.query.q || '').trim();
    const logs = await prisma.auditLog.findMany({
      where: q ? { OR: [{ username: { contains: q } }, { entity: { contains: q } }, { action: { contains: q } }, { details: { contains: q } }] } : {},
      orderBy: { id: 'desc' }, take: Math.min(Number(req.query.limit) || 300, 1000),
    });
    res.json(logs);
  });
}
