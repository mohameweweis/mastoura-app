import type { Express } from 'express';
import prisma, { currentCompanyId } from '../prisma';
import { settingKey } from '../lib/tenant-core';
import { daysLeft } from '../lib/common';

export async function getAlertDays(): Promise<number> {
  const s = await prisma.appSetting.findUnique({ where: { key: settingKey(currentCompanyId()!, 'alertDays') } });
  const n = Number(s?.value);
  return Number.isFinite(n) && n > 0 ? n : 30;
}

export interface AlertItem {
  key: string; type: string; typeLabel: string; title: string; owner: string; ownerId: number; ownerKind: 'employee' | 'equipment';
  expiryDate: string; daysLeft: number; status: 'expired' | 'soon';
}

export async function collectAlerts(days: number): Promise<AlertItem[]> {
  const limit = new Date();
  limit.setDate(limit.getDate() + days);
  const lt = { lt: limit };
  const [courses, cards, equipCards, drivers, docs, inspections, permits] = await Promise.all([
    prisma.employeeCourse.findMany({ where: { expiryDate: lt }, include: { employee: true, course: true } }),
    prisma.employeeCard.findMany({ where: { expiryDate: lt }, include: { employee: true, card: true } }),
    prisma.employeeEquipment.findMany({ where: { expiryDate: lt }, include: { employee: true, equipmentType: true } }),
    prisma.driverProfile.findMany({ include: { employee: true } }),
    prisma.employeeDocument.findMany({ where: { status: 'active', expiryDate: lt }, include: { employee: true, category: true } }),
    prisma.equipmentInspection.findMany({ where: { expiryDate: lt }, include: { equipment: { include: { type: true } } } }),
    prisma.workPermit.findMany({ where: { status: 'active', expiryDate: lt }, include: { project: true } }),
  ]);
  const items: AlertItem[] = [];
  const push = (key: string, type: string, typeLabel: string, title: string, owner: string, ownerId: number, ownerKind: 'employee' | 'equipment', date: Date | null) => {
    if (!date) return;
    const d = daysLeft(date);
    if (d > days) return;
    items.push({ key, type, typeLabel, title, owner, ownerId, ownerKind, expiryDate: new Date(date).toISOString(), daysLeft: d, status: d < 0 ? 'expired' : 'soon' });
  };
  courses.forEach((c) => push(`course-${c.id}`, 'course', 'دورة تدريبية', c.course.name, c.employee.name, c.employeeId, 'employee', c.expiryDate));
  cards.forEach((c) => push(`card-${c.id}`, 'card', 'كرت اختبار', c.card.name, c.employee.name, c.employeeId, 'employee', c.expiryDate));
  equipCards.forEach((c) => push(`ecard-${c.id}`, 'equipmentCard', 'تصريح تشغيل معدة', c.equipmentType.name, c.employee.name, c.employeeId, 'employee', c.expiryDate));
  drivers.forEach((d) => {
    push(`lic-${d.id}`, 'license', 'رخصة قيادة', d.licenseType, d.employee.name, d.employeeId, 'employee', d.licenseExpiryDate);
    push(`dcard-${d.id}`, 'driverCard', 'كرت سائق', d.driverCardNumber || 'كرت السائق', d.employee.name, d.employeeId, 'employee', d.driverCardExpiryDate);
  });
  docs.forEach((d) => push(`doc-${d.id}`, 'document', d.category.name === 'الإقامة' ? 'إقامة' : 'مستند', `${d.category.name}${d.title && d.title !== d.category.name ? ' - ' + d.title : ''}`, d.employee.name, d.employeeId, 'employee', d.expiryDate));
  inspections.forEach((i) => push(`insp-${i.id}`, 'inspection', 'فحص معدة', i.inspectionType, `${i.equipment.equipmentNumber} · ${i.equipment.type.name}`, i.equipmentId, 'equipment', i.expiryDate));
  permits.forEach((p) => push(`permit-${p.id}`, 'permit', 'تصريح عمل', `${p.type} - ${p.permitNumber}`, p.project.name, p.projectId, 'equipment', p.expiryDate));
  return items.sort((a, b) => a.daysLeft - b.daysLeft);
}

export function registerAlerts(app: Express) {
  app.get('/api/alerts', async (req, res) => {
    const days = Number(req.query.days) > 0 ? Number(req.query.days) : await getAlertDays();
    const items = await collectAlerts(days);
    res.json({ days, counts: { expired: items.filter((i) => i.status === 'expired').length, soon: items.filter((i) => i.status === 'soon').length, total: items.length }, items });
  });

  app.get('/api/settings', async (_req, res) => {
    res.json({ alertDays: await getAlertDays() });
  });

  app.put('/api/settings', async (req, res) => {
    const alertDays = Number(req.body?.alertDays);
    if (!Number.isFinite(alertDays) || alertDays < 1 || alertDays > 365) return res.status(400).json({ message: 'مدة التنبيه يجب أن تكون بين 1 و 365 يوماً' });
    const key = settingKey(currentCompanyId()!, 'alertDays');
    await prisma.appSetting.upsert({ where: { key }, update: { value: String(alertDays) }, create: { key, value: String(alertDays) } });
    res.json({ alertDays });
  });
}
