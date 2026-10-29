import fs from 'fs';
import path from 'path';
import { currentCompanyId } from '../prisma';

export const UPLOAD_ROOT = path.resolve('./uploads');
export const TMP_DIR = path.join(UPLOAD_ROOT, 'tmp');
export const BULK_DIR = path.join(UPLOAD_ROOT, 'bulk');

export function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// المسار المخزن في قاعدة البيانات: نسبي دائماً وبشرطات مائلة للأمام
export function toRelative(absPath: string) {
  return path.relative(process.cwd(), absPath).split(path.sep).join('/');
}

// مجلد ملفات الشركة: uploads/c<companyId>/<sub...>
export function tenantUploadDir(companyId: number | undefined, ...sub: string[]) {
  if (!companyId) throw new Error('Tenant context missing');
  return ensureDir(path.join(UPLOAD_ROOT, `c${companyId}`, ...sub));
}

// هل المسار المطلق تابع للشركة؟ الملفات القديمة (قبل تعدد الشركات) تخص الشركة رقم 1 فقط
export function pathBelongsToCompany(abs: string, companyId: number) {
  const rel = path.relative(UPLOAD_ROOT, abs).split(path.sep);
  if (rel[0] === '..' || path.isAbsolute(rel[0] || '')) return false;
  const m = /^c(\d+)$/.exec(rel[0] || '');
  return m ? Number(m[1]) === companyId : companyId === 1;
}

// يتحقق أن المسار داخل مجلد uploads وتابع للشركة الحالية فقط (حماية من قراءة ملفات شركة أخرى أو خارج المشروع)
export function resolveUpload(p: string): string | null {
  if (!p) return null;
  const abs = path.resolve(p);
  if (abs === UPLOAD_ROOT || !abs.startsWith(UPLOAD_ROOT + path.sep)) return null;
  const companyId = currentCompanyId();
  if (!companyId || !pathBelongsToCompany(abs, companyId)) return null;
  return abs;
}

export function decodeOriginalName(name: string) {
  // multer يقرأ الأسماء بترميز latin1؛ نحولها إلى UTF-8 لعرض العربي بشكل صحيح
  const converted = Buffer.from(name, 'latin1').toString('utf8');
  return converted.includes('\ufffd') ? name : converted;
}

export function safeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/\s+/g, '_');
}

const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
export function latinDigits(s: string) {
  return s.replace(/[٠-٩]/g, (d) => String(AR_DIGITS.indexOf(d)));
}

// توحيد النص العربي للمقارنة (إزالة التشكيل والتطويل وتوحيد الهمزات)
export function normalizeArabic(s: string | null | undefined) {
  return (s || '')
    .toLowerCase()
    .replace(/[\u064b-\u065f\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseDateInput(v: any): Date | null {
  if (v === undefined || v === null || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(latinDigits(String(v)));
  return isNaN(d.getTime()) ? null : d;
}

export function daysLeft(date: Date | string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export function mimeFromName(name: string) {
  const ext = path.extname(name).toLowerCase();
  const map: Record<string, string> = {
    '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.txt': 'text/plain', '.zip': 'application/zip',
  };
  return map[ext] || 'application/octet-stream';
}

export function contentDisposition(kind: 'inline' | 'attachment', name: string) {
  return `${kind}; filename*=UTF-8''${encodeURIComponent(name)}`;
}
