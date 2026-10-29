import * as XLSX from 'xlsx';
import { latinDigits, normalizeArabic, parseDateInput } from './common';

const IGNORED = /(^|\/)(\.|__MACOSX|thumbs\.db$|desktop\.ini$|~\$)/i;

// قواعد التعرف على نوع المستند من اسم المجلد أو الملف (بالترتيب)
const CATEGORY_RULES: { test: RegExp; name: string }[] = [
  { test: /(اقامه|اقامة|iqama|residen)/i, name: 'الإقامة' },
  { test: /(جواز|passport)/i, name: 'جواز السفر' },
  { test: /(هويه|هوية|national id)/i, name: 'الهوية الوطنية' },
  { test: /(عقد|contract)/i, name: 'عقد العمل' },
  { test: /(تعيين|appointment)/i, name: 'قرار التعيين' },
  { test: /(موهل|مؤهل|دبلوم|بكالوريوس|degree)/i, name: 'المؤهل الدراسي' },
  { test: /(تشغيل|تصريح|مشغل|operator)/i, name: 'تصاريح تشغيل المعدات' },
  { test: /(كرت|كارت|كروت|card|لحام|هوائي|عدادات|مصدر|مستلم|مشارك)/i, name: 'الكروت الفنية' },
  { test: /(دوره|دورة|دورات|شهاده|شهادة|شهادات|سلامه|سلامة|تدريب|course|certificate)/i, name: 'شهادات الدورات' },
];

export function inferCategory(text: string): string {
  const t = normalizeArabic(text);
  for (const r of CATEGORY_RULES) if (r.test.test(t) || r.test.test(text)) return r.name;
  return 'ملفات إضافية';
}

export interface EmpLite { id: number; name: string; jobNumber: string; internalNumber: string; iqamaNumber: string }
export interface CatLite { id: number; name: string }
export interface ManifestRow { jobNumber?: string; fileName: string; category?: string; documentNumber?: string; issuer?: string; issueDate?: string | null; expiryDate?: string | null }
export interface PreviewItem {
  index: number; entryName: string; fileName: string; size: number;
  employeeId: number | null; employeeName: string | null; jobNumber: string | null;
  categoryId: number | null; categoryName: string | null;
  status: 'ready' | 'duplicate' | 'unmatched' | 'ignored'; reason?: string;
  documentNumber?: string; issuer?: string; issueDate?: string | null; expiryDate?: string | null;
}

function tokens(segment: string): string[] {
  const s = latinDigits(segment).trim();
  const out = new Set<string>();
  const lead = s.match(/^([A-Za-z0-9]+)\s*(?:[-–—_.،:]|$)/);
  if (lead) out.add(lead[1]);
  const whole = s.match(/^[A-Za-z0-9]+$/);
  if (whole) out.add(whole[0]);
  (s.match(/\b[A-Za-z0-9]{3,}\b/g) || []).forEach((t) => out.add(t));
  return [...out];
}

export function analyzeEntries(
  entries: { name: string; size: number }[],
  employees: EmpLite[],
  categories: CatLite[],
  manifest: ManifestRow[],
  existing: Set<string>, // "employeeId|originalName|size"
): PreviewItem[] {
  const byJob = new Map(employees.map((e) => [e.jobNumber.toLowerCase(), e]));
  const byInternal = new Map(employees.map((e) => [e.internalNumber.toLowerCase(), e]));
  const byIqama = new Map(employees.map((e) => [e.iqamaNumber.toLowerCase(), e]));
  const byId = new Map(employees.map((e) => [e.id, e]));
  const catByName = new Map(categories.map((c) => [normalizeArabic(c.name), c]));
  const manifestByFile = new Map(manifest.map((m) => [normalizeArabic(m.fileName), m]));
  const items: PreviewItem[] = [];

  entries.forEach((entry, index) => {
    const name = entry.name;
    const fileName = name.split('/').pop() || name;
    const base: PreviewItem = {
      index, entryName: name, fileName, size: entry.size, employeeId: null, employeeName: null, jobNumber: null,
      categoryId: null, categoryName: null, status: 'unmatched',
    };
    if (IGNORED.test(name)) { items.push({ ...base, status: 'ignored', reason: 'ملف نظام يتم تجاهله' }); return; }

    const m = manifestByFile.get(normalizeArabic(fileName));
    const segments = name.split('/').slice(0, -1);
    let emp: EmpLite | undefined;
    let matchedSegIdx = -1;

    if (m?.jobNumber) emp = byJob.get(latinDigits(String(m.jobNumber)).trim().toLowerCase());
    if (!emp) {
      for (let i = 0; i < segments.length && !emp; i++) {
        for (const t of tokens(segments[i])) {
          const key = t.toLowerCase();
          const found = byJob.get(key) || byInternal.get(key) || byIqama.get(key);
          if (found) { emp = found; matchedSegIdx = i; break; }
        }
      }
    }
    if (!emp) {
      items.push({ ...base, reason: segments.length ? 'لم يتم التعرف على العامل من اسم المجلد (يجب أن يبدأ باسم المجلد بالرقم الوظيفي)' : 'الملف خارج أي مجلد عامل' });
      return;
    }

    const hint = [...segments.slice(matchedSegIdx + 1), fileName].join(' ');
    const catName = m?.category || inferCategory(hint);
    const cat = catByName.get(normalizeArabic(catName)) || catByName.get(normalizeArabic('ملفات إضافية')) || categories[0];
    const dup = existing.has(`${emp.id}|${fileName}|${entry.size}`);
    items.push({
      ...base, employeeId: emp.id, employeeName: byId.get(emp.id)!.name, jobNumber: emp.jobNumber,
      categoryId: cat?.id ?? null, categoryName: cat?.name ?? null,
      status: dup ? 'duplicate' : 'ready', reason: dup ? 'مستند بنفس الاسم والحجم موجود مسبقاً لدى العامل' : undefined,
      documentNumber: m?.documentNumber, issuer: m?.issuer, issueDate: m?.issueDate ?? null, expiryDate: m?.expiryDate ?? null,
    });
  });
  return items;
}

export function parseManifest(filePath: string): ManifestRow[] {
  const wb = XLSX.readFile(filePath, { cellDates: true });
  const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
  const pick = (row: any, keys: string[]) => { for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k]; return ''; };
  const date = (v: any) => { const d = parseDateInput(v); return d ? d.toISOString().slice(0, 10) : null; };
  return rows
    .map((r) => ({
      jobNumber: String(pick(r, ['الرقم الوظيفي', 'رقم وظيفي', 'jobNumber'])).trim(),
      fileName: String(pick(r, ['اسم الملف', 'الملف', 'fileName'])).trim(),
      category: String(pick(r, ['نوع المستند', 'التصنيف', 'category'])).trim() || undefined,
      documentNumber: String(pick(r, ['رقم المستند', 'رقم الشهادة', 'documentNumber'])).trim() || undefined,
      issuer: String(pick(r, ['الجهة المصدرة', 'الجهة', 'issuer'])).trim() || undefined,
      issueDate: date(pick(r, ['تاريخ الإصدار', 'تاريخ الاصدار', 'issueDate'])),
      expiryDate: date(pick(r, ['تاريخ الانتهاء', 'expiryDate'])),
    }))
    .filter((r) => r.fileName);
}

