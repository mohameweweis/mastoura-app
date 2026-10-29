import type { Express } from 'express';
import * as XLSX from 'xlsx';
import prisma from '../prisma';
import { audit } from '../lib/audit';
import { collectAlerts, getAlertDays } from './alerts';
import { computeCompetency } from './competency';

interface Report { title: string; columns: { key: string; label: string }[]; rows: Record<string, any>[] }
const fmt = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const statusLabel = (s: string) => (s === 'expired' ? 'منتهي' : s === 'soon' ? 'ينتهي قريباً' : s);

export const REPORT_LIST = [
  { key: 'employees', title: 'قائمة العاملين', description: 'كل العاملين مع الفرع والمهنة وأرقام الهوية' },
  { key: 'expiring', title: 'العناصر المنتهية والقريبة من الانتهاء', description: 'الدورات والكروت والرخص والإقامات والمستندات والفحوصات' },
  { key: 'missing-documents', title: 'المستندات الناقصة', description: 'العاملون الذين تنقصهم مستندات إلزامية أو لديهم مستندات منتهية' },
  { key: 'competency', title: 'مصفوفة الكفاءة', description: 'مدى استيفاء كل عامل لمتطلبات وظيفته' },
  { key: 'operators', title: 'مشغلو المعدات', description: 'تصاريح تشغيل المعدات الحالية لكل عامل' },
  { key: 'drivers', title: 'السائقون', description: 'رخص القيادة وكروت السائقين' },
  { key: 'projects', title: 'المشاريع وعمالها', description: 'كل مشروع وعدد العاملين والتصاريح الحالية' },
  { key: 'permits', title: 'تصاريح العمل', description: 'التصاريح وتواريخ انتهائها وعدد العاملين المشمولين' },
  { key: 'movements', title: 'حركة العمال', description: 'سجل الإسناد والنقل بين المشاريع' },
];

export async function buildReport(key: string, q: { branchId?: number; days?: number }): Promise<Report | null> {
  switch (key) {
    case 'employees': {
      const list = await prisma.employee.findMany({ where: q.branchId ? { branchId: q.branchId } : {}, include: { branch: true }, orderBy: { name: 'asc' } });
      return {
        title: 'قائمة العاملين',
        columns: [['jobNumber', 'الرقم الوظيفي'], ['name', 'الاسم'], ['iqama', 'رقم الإقامة'], ['profession', 'المهنة'], ['branch', 'الفرع'], ['phone', 'الجوال'], ['hireDate', 'تاريخ التعيين']].map(([key, label]) => ({ key, label })),
        rows: list.map((e) => ({ jobNumber: e.jobNumber, name: e.name, iqama: e.iqamaNumber, profession: e.profession || '', branch: e.branch?.name || '', phone: e.phone || '', hireDate: fmt(e.hireDate) })),
      };
    }
    case 'expiring': {
      const days = q.days || (await getAlertDays());
      const items = await collectAlerts(days);
      return {
        title: `العناصر المنتهية والتي تنتهي خلال ${days} يوماً`,
        columns: [['typeLabel', 'النوع'], ['title', 'البند'], ['owner', 'صاحب البند'], ['expiry', 'تاريخ الانتهاء'], ['daysLeft', 'الأيام المتبقية'], ['status', 'الحالة']].map(([key, label]) => ({ key, label })),
        rows: items.map((i) => ({ typeLabel: i.typeLabel, title: i.title, owner: i.owner, expiry: fmt(i.expiryDate), daysLeft: i.daysLeft, status: statusLabel(i.status) })),
      };
    }
    case 'missing-documents': {
      const required = await prisma.documentCategory.findMany({ where: { isRequired: true } });
      const employees = await prisma.employee.findMany({
        where: q.branchId ? { branchId: q.branchId } : {}, include: { branch: true, documents: { where: { status: 'active' } } }, orderBy: { name: 'asc' },
      });
      const rows: Record<string, any>[] = [];
      for (const e of employees) {
        for (const cat of required) {
          const docs = e.documents.filter((d) => d.categoryId === cat.id);
          if (!docs.length) rows.push({ jobNumber: e.jobNumber, name: e.name, branch: e.branch?.name || '', category: cat.name, problem: 'مستند ناقص' });
          else if (docs.every((d) => d.expiryDate && new Date(d.expiryDate) < new Date())) rows.push({ jobNumber: e.jobNumber, name: e.name, branch: e.branch?.name || '', category: cat.name, problem: 'مستند منتهي' });
        }
      }
      return {
        title: 'المستندات الناقصة أو المنتهية',
        columns: [['jobNumber', 'الرقم الوظيفي'], ['name', 'العامل'], ['branch', 'الفرع'], ['category', 'المستند المطلوب'], ['problem', 'المشكلة']].map(([key, label]) => ({ key, label })),
        rows,
      };
    }
    case 'competency': {
      const data = await computeCompetency({ branchId: q.branchId });
      const label: Record<string, string> = { ok: 'مستوفى', expiring: 'ينتهي قريباً', expired: 'منتهي', missing: 'ناقص' };
      const rows: Record<string, any>[] = [];
      for (const role of data.roles) {
        for (const emp of role.employees) {
          emp.cells.forEach((cell, i) => rows.push({
            role: role.name, jobNumber: emp.jobNumber, name: emp.name, branch: emp.branch, requirement: role.requirements[i].label, status: label[cell],
          }));
        }
      }
      return {
        title: 'مصفوفة الكفاءة حسب الوظيفة',
        columns: [['role', 'الوظيفة'], ['jobNumber', 'الرقم الوظيفي'], ['name', 'العامل'], ['branch', 'الفرع'], ['requirement', 'المتطلب'], ['status', 'الحالة']].map(([key, label]) => ({ key, label })),
        rows,
      };
    }
    case 'operators': {
      const list = await prisma.employeeEquipment.findMany({
        where: q.branchId ? { employee: { branchId: q.branchId } } : {}, include: { employee: { include: { branch: true } }, equipmentType: true }, orderBy: { expiryDate: 'asc' },
      });
      return {
        title: 'مشغلو المعدات',
        columns: [['jobNumber', 'الرقم الوظيفي'], ['name', 'المشغل'], ['branch', 'الفرع'], ['equipment', 'نوع المعدة'], ['cardNumber', 'رقم التصريح'], ['expiry', 'تاريخ الانتهاء']].map(([key, label]) => ({ key, label })),
        rows: list.map((c) => ({ jobNumber: c.employee.jobNumber, name: c.employee.name, branch: c.employee.branch?.name || '', equipment: c.equipmentType.name, cardNumber: c.cardNumber, expiry: fmt(c.expiryDate) })),
      };
    }
    case 'drivers': {
      const list = await prisma.driverProfile.findMany({ where: q.branchId ? { employee: { branchId: q.branchId } } : {}, include: { employee: { include: { branch: true } } }, orderBy: { licenseExpiryDate: 'asc' } });
      return {
        title: 'السائقون ورخص القيادة',
        columns: [['jobNumber', 'الرقم الوظيفي'], ['name', 'السائق'], ['branch', 'الفرع'], ['license', 'رقم الرخصة'], ['type', 'النوع'], ['expiry', 'انتهاء الرخصة'], ['driverCard', 'انتهاء كرت السائق']].map(([key, label]) => ({ key, label })),
        rows: list.map((d) => ({ jobNumber: d.employee.jobNumber, name: d.employee.name, branch: d.employee.branch?.name || '', license: d.licenseNumber, type: d.licenseType, expiry: fmt(d.licenseExpiryDate), driverCard: fmt(d.driverCardExpiryDate) })),
      };
    }
    case 'projects': {
      const list = await prisma.project.findMany({ include: { branch: true, manager: { select: { name: true } }, assignments: { where: { status: 'active' }, select: { id: true } }, permits: true }, orderBy: { name: 'asc' } });
      const st: Record<string, string> = { planned: 'مخطط', active: 'نشط', on_hold: 'متوقف', completed: 'منتهٍ', cancelled: 'ملغى' };
      return {
        title: 'المشاريع وعمالها',
        columns: [['code', 'الرمز'], ['name', 'المشروع'], ['client', 'الجهة المالكة'], ['contract', 'رقم العقد'], ['location', 'الموقع'], ['manager', 'مدير المشروع'], ['status', 'الحالة'], ['workers', 'العمال'], ['permits', 'التصاريح'], ['end', 'تاريخ الانتهاء']].map(([key, label]) => ({ key, label })),
        rows: list.map((p) => ({ code: p.code, name: p.name, client: p.client || '', contract: p.contractNumber || '', location: p.location || '', manager: p.manager?.name || '', status: st[p.status] || p.status, workers: p.assignments.length, permits: p.permits.length, end: fmt(p.endDate) })),
      };
    }
    case 'permits': {
      const days = q.days || (await getAlertDays());
      const list = await prisma.workPermit.findMany({ include: { project: true, _count: { select: { workers: true } } }, orderBy: { expiryDate: 'asc' } });
      return {
        title: 'تصاريح العمل',
        columns: [['number', 'رقم التصريح'], ['project', 'المشروع'], ['type', 'النوع'], ['issuer', 'الجهة المصدرة'], ['issue', 'تاريخ الإصدار'], ['expiry', 'تاريخ الانتهاء'], ['daysLeft', 'الأيام المتبقية'], ['workers', 'العمال'], ['state', 'الحالة']].map(([key, label]) => ({ key, label })),
        rows: list.map((p) => {
          const left = Math.ceil((new Date(p.expiryDate).getTime() - Date.now()) / 86400000);
          return { number: p.permitNumber, project: p.project.name, type: p.type, issuer: p.issuer || '', issue: fmt(p.issueDate), expiry: fmt(p.expiryDate), daysLeft: left, workers: p._count.workers, state: p.status === 'cancelled' ? 'ملغى' : left < 0 ? 'منتهٍ' : left <= days ? 'ينتهي قريباً' : 'ساري' };
        }),
      };
    }
    case 'movements': {
      const list = await prisma.projectAssignment.findMany({ include: { employee: { select: { name: true, jobNumber: true } }, project: { select: { name: true } } }, orderBy: { startDate: 'desc' }, take: 5000 });
      return {
        title: 'حركة العمال',
        columns: [['jobNumber', 'الرقم الوظيفي'], ['name', 'العامل'], ['project', 'المشروع'], ['role', 'الدور'], ['start', 'من'], ['end', 'إلى'], ['status', 'الحالة'], ['notes', 'ملاحظات']].map(([key, label]) => ({ key, label })),
        rows: list.map((a) => ({ jobNumber: a.employee.jobNumber, name: a.employee.name, project: a.project.name, role: a.role || '', start: fmt(a.startDate), end: fmt(a.endDate), status: a.status === 'active' ? 'على رأس العمل' : 'منتهٍ', notes: a.notes || '' })),
      };
    }
    default:
      return null;
  }
}

export function registerReports(app: Express) {
  app.get('/api/reports', (_req, res) => res.json(REPORT_LIST));

  app.get('/api/reports/:key', async (req, res) => {
    const report = await buildReport(req.params.key, {
      branchId: req.query.branchId ? Number(req.query.branchId) : undefined,
      days: req.query.days ? Number(req.query.days) : undefined,
    });
    if (!report) return res.status(404).json({ message: 'التقرير غير موجود' });
    if (req.query.format === 'xlsx') {
      const sheetRows = report.rows.map((r) => Object.fromEntries(report.columns.map((c) => [c.label, r[c.key]])));
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.json_to_sheet(sheetRows.length ? sheetRows : [Object.fromEntries(report.columns.map((c) => [c.label, '']))]);
      ws['!cols'] = report.columns.map(() => ({ wch: 22 }));
      if (!wb.Workbook) wb.Workbook = {};
      wb.Workbook.Views = [{ RTL: true }];
      XLSX.utils.book_append_sheet(wb, ws, report.title.slice(0, 28).replace(/[\\/?*[\]:]/g, ' '));
      await audit(req, 'تصدير', 'تقرير', req.params.key, report.title);
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(report.title)}.xlsx`);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.send(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }));
    }
    res.json(report);
  });
}
