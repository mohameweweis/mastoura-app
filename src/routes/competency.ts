import type { Express } from 'express';
import prisma from '../prisma';
import { normalizeArabic, daysLeft } from '../lib/common';
import { getAlertDays } from './alerts';

export type CellStatus = 'ok' | 'expiring' | 'expired' | 'missing';

export async function computeCompetency(opts: { jobRoleId?: number; branchId?: number } = {}) {
  const days = await getAlertDays();
  const roles = await prisma.jobRole.findMany({
    where: opts.jobRoleId ? { id: opts.jobRoleId } : {},
    include: { requirements: { include: { course: true, card: true, category: true } } },
    orderBy: { name: 'asc' },
  });
  const employees = await prisma.employee.findMany({
    where: opts.branchId ? { branchId: opts.branchId } : {},
    include: {
      branch: true, courses: true, cards: true,
      documents: { where: { status: 'active' }, select: { categoryId: true, expiryDate: true } },
    },
    orderBy: { name: 'asc' },
  });
  const roleNames = new Map(roles.map((r) => [normalizeArabic(r.name), r.id]));
  const allRoles = opts.jobRoleId ? await prisma.jobRole.findMany({ select: { id: true, name: true } }) : roles;
  const allNames = new Map(allRoles.map((r) => [normalizeArabic(r.name), r.id]));
  const unmapped = employees.filter((e) => !allNames.has(normalizeArabic(e.profession))).length;

  const classify = (dates: (Date | null)[]): CellStatus => {
    if (!dates.length) return 'missing';
    const valid = dates.filter((d) => d === null || daysLeft(d) >= 0);
    if (!valid.length) return 'expired';
    const best = valid.some((d) => d === null) ? null : valid.reduce((a, b) => (a! > b! ? a : b));
    if (best && daysLeft(best) <= days) return 'expiring';
    return 'ok';
  };

  const result = roles.map((role) => {
    const requirements = role.requirements.map((r) => ({
      id: r.id,
      type: r.courseId ? 'course' : r.cardId ? 'card' : 'document',
      label: r.course?.name || r.card?.name || r.category?.name || '—',
    }));
    const members = employees.filter((e) => roleNames.get(normalizeArabic(e.profession)) === role.id).map((e) => {
      const cells = role.requirements.map((r): CellStatus => {
        if (r.courseId) return classify(e.courses.filter((c) => c.courseId === r.courseId).map((c) => c.expiryDate));
        if (r.cardId) return classify(e.cards.filter((c) => c.cardId === r.cardId).map((c) => c.expiryDate));
        return classify(e.documents.filter((d) => d.categoryId === r.categoryId).map((d) => d.expiryDate));
      });
      const satisfied = cells.filter((c) => c === 'ok' || c === 'expiring').length;
      return {
        id: e.id, name: e.name, jobNumber: e.jobNumber, branch: e.branch?.name || '', cells,
        satisfied, total: cells.length, qualified: cells.length > 0 && cells.every((c) => c === 'ok' || c === 'expiring'),
      };
    });
    return { id: role.id, name: role.name, requirements, employees: members };
  });
  return { alertDays: days, unmappedEmployees: unmapped, roles: result };
}

export function registerCompetency(app: Express) {
  app.get('/api/job-roles', async (_req, res) => {
    const roles = await prisma.jobRole.findMany({ include: { requirements: { include: { course: true, card: true, category: true } } }, orderBy: { name: 'asc' } });
    res.json(roles);
  });

  app.post('/api/job-roles', async (req, res) => {
    try { res.status(201).json(await prisma.jobRole.create({ data: { name: String(req.body.name).trim(), description: req.body.description || null } })); }
    catch { res.status(400).json({ message: 'تعذر إضافة الوظيفة، قد يكون الاسم مكرراً' }); }
  });

  app.put('/api/job-roles/:id', async (req, res) => {
    try { res.json(await prisma.jobRole.update({ where: { id: Number(req.params.id) }, data: { name: String(req.body.name).trim(), description: req.body.description || null } })); }
    catch { res.status(400).json({ message: 'تعذر تعديل الوظيفة' }); }
  });

  app.delete('/api/job-roles/:id', async (req, res) => {
    await prisma.jobRole.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف الوظيفة' });
  });

  app.post('/api/job-roles/:id/requirements', async (req, res) => {
    const { courseId, cardId, categoryId } = req.body;
    const set = [courseId, cardId, categoryId].filter(Boolean);
    if (set.length !== 1) return res.status(400).json({ message: 'اختر متطلباً واحداً: دورة أو كرت أو نوع مستند' });
    const jobRoleId = Number(req.params.id);
    const dup = await prisma.jobRequirement.findFirst({ where: { jobRoleId, courseId: courseId ? Number(courseId) : null, cardId: cardId ? Number(cardId) : null, categoryId: categoryId ? Number(categoryId) : null } });
    if (dup) return res.status(400).json({ message: 'المتطلب مضاف مسبقاً لهذه الوظيفة' });
    res.status(201).json(await prisma.jobRequirement.create({
      data: { jobRoleId, courseId: courseId ? Number(courseId) : null, cardId: cardId ? Number(cardId) : null, categoryId: categoryId ? Number(categoryId) : null },
    }));
  });

  app.delete('/api/job-requirements/:id', async (req, res) => {
    await prisma.jobRequirement.delete({ where: { id: Number(req.params.id) } });
    res.json({ message: 'تم حذف المتطلب' });
  });

  // إنشاء وظائف تلقائياً من المهن الموجودة لدى العاملين
  app.post('/api/job-roles/sync-from-employees', async (_req, res) => {
    const employees = await prisma.employee.findMany({ select: { profession: true } });
    const existing = new Set((await prisma.jobRole.findMany()).map((r) => normalizeArabic(r.name)));
    const names = [...new Set(employees.map((e) => (e.profession || '').trim()).filter(Boolean))];
    let created = 0;
    for (const n of names) {
      if (existing.has(normalizeArabic(n))) continue;
      await prisma.jobRole.create({ data: { name: n } });
      existing.add(normalizeArabic(n));
      created++;
    }
    res.json({ message: `تمت إضافة ${created} وظيفة من مهن العاملين`, created });
  });

  app.get('/api/competency', async (req, res) => {
    res.json(await computeCompetency({
      jobRoleId: req.query.jobRoleId ? Number(req.query.jobRoleId) : undefined,
      branchId: req.query.branchId ? Number(req.query.branchId) : undefined,
    }));
  });
}
