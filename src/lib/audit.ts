import type { Request } from 'express';
import prisma, { runAsTenant } from '../prisma';
import { currentUser } from './auth';

// companyIdOverride مطلوب عند الاستدعاء خارج الطلب (مثل تسجيل الدخول)؛ داخل الطلب يؤخذ من المستخدم الحالي
export async function audit(req: Request | null, action: string, entity: string, entityId?: string | number | null, details?: string, usernameOverride?: string, companyIdOverride?: number) {
  try {
    const user = req ? currentUser(req) : undefined;
    const companyId = companyIdOverride ?? user?.companyId;
    if (!companyId) return;
    // نضبط سياق الشركة صراحة لأن هذا الاستدعاء قد يتم بعد انتهاء الطلب (حدث finish)
    await runAsTenant(companyId, () =>
      prisma.auditLog.create({
        data: {
          username: usernameOverride || user?.username || 'النظام',
          action,
          entity,
          entityId: entityId === undefined || entityId === null ? null : String(entityId),
          details: details ? details.slice(0, 500) : null,
        },
      }),
    );
  } catch (e) {
    console.error('Audit log error', e);
  }
}
