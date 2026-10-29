import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { prismaUnscoped, runAsTenant } from '../prisma';

export type Role = 'ADMIN' | 'HR' | 'EQUIPMENT_MANAGER' | 'VIEWER';
export interface AuthUser { id: number; username: string; role: Role; companyId: number }

const SECRET =
  process.env.AUTH_SECRET ||
  crypto.createHash('sha256').update((process.env.DATABASE_URL || '') + '|hr-system-secret').digest('hex');

export function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = (stored || '').split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const known = Buffer.from(hash, 'hex');
  return known.length === test.length && crypto.timingSafeEqual(known, test);
}

const b64 = (s: string | Buffer) => Buffer.from(s).toString('base64url');

export function signToken(user: AuthUser, hours = 12) {
  const payload = b64(JSON.stringify({ ...user, exp: Date.now() + hours * 3600 * 1000 }));
  const sig = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const [payload, sig] = token.split('.');
    if (!payload || !sig) return null;
    const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data.exp || data.exp < Date.now()) return null;
    if (typeof data.companyId !== 'number') return null; // توكنات ما قبل تعدد الشركات تُرفض لإعادة الدخول
    return { id: data.id, username: data.username, role: data.role, companyId: data.companyId };
  } catch {
    return null;
  }
}

export const currentUser = (req: Request): AuthUser | undefined => (req as any).user;

const PUBLIC = ['/health', '/auth/login', '/auth/register-company', '/auth/config'];

export function authenticate(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC.includes(req.path)) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.query.token as string | undefined);
  const user = token ? verifyToken(token) : null;
  if (!user) return res.status(401).json({ message: 'انتهت الجلسة، الرجاء تسجيل الدخول مرة أخرى' });
  (req as any).user = user;
  companyIsActive(user.companyId)
    .then((ok) => {
      if (!ok) return res.status(403).json({ message: 'اشتراك الشركة موقوف، تواصل مع الدعم' });
      runAsTenant(user.companyId, () => next());
    })
    .catch(next);
}

// حالة الشركة (مخزنة مؤقتاً دقيقة واحدة لتخفيف الاستعلامات)
const statusCache = new Map<number, { active: boolean; at: number }>();
export async function companyIsActive(companyId: number): Promise<boolean> {
  const hit = statusCache.get(companyId);
  if (hit && Date.now() - hit.at < 60000) return hit.active;
  const c = await prismaUnscoped.company.findUnique({ where: { id: companyId } });
  const active = !!c && c.status === 'active';
  statusCache.set(companyId, { active, at: Date.now() });
  return active;
}
export const clearCompanyStatusCache = () => statusCache.clear();

const EQUIPMENT_PATHS = [/^\/equipment/, /^\/inspections/];
const DRIVER_PATHS = [/^\/drivers/, /^\/driver-profiles/, /^\/employees\/\d+\/driver-profile/];
const ADMIN_ONLY = [/^\/users/, /^\/audit/, /^\/backup/, /^\/restore/];
const EXPORT_PATHS = [/^\/documents\/export/, /^\/employees\/\d+\/documents\/export/, /^\/bulk-imports/, /^\/employees\/import/];

const matches = (list: RegExp[], p: string) => list.some((r) => r.test(p));
const deny = (res: Response) => res.status(403).json({ message: 'ليست لديك صلاحية لتنفيذ هذا الإجراء' });

export function authorize(req: Request, res: Response, next: NextFunction) {
  if (PUBLIC.includes(req.path)) return next();
  const user = currentUser(req);
  if (!user) return deny(res);
  const p = req.path;
  const role = user.role;
  if (p === '/auth/me' || p === '/auth/password') return next();
  if (role === 'ADMIN') return next();
  if (matches(ADMIN_ONLY, p)) return deny(res);
  if (p.startsWith('/settings') && req.method !== 'GET') return deny(res);
  if (matches(EXPORT_PATHS, p) || (p.startsWith('/reports') && (req.query.format === 'xlsx' || p === '/reports/comprehensive'))) {
    return role === 'HR' ? next() : deny(res);
  }
  if (req.method === 'GET' || req.method === 'HEAD') return next();
  if (role === 'VIEWER') return deny(res);
  if (role === 'EQUIPMENT_MANAGER') return matches([...EQUIPMENT_PATHS, ...DRIVER_PATHS], p) ? next() : deny(res);
  if (role === 'HR') return matches(EQUIPMENT_PATHS, p) ? deny(res) : next();
  return deny(res);
}
