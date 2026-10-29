import { PrismaClient } from '@prisma/client';
import { AsyncLocalStorage } from 'async_hooks';
import { TENANT_MODELS, applyTenant } from './lib/tenant-core';

// سياق الشركة الحالية لكل طلب (يُضبط في وسيط المصادقة)
export const tenantStore = new AsyncLocalStorage<{ companyId: number }>();
export const currentCompanyId = () => tenantStore.getStore()?.companyId;
export function runAsTenant<T>(companyId: number, fn: () => T): T {
  return tenantStore.run({ companyId }, fn);
}

const base = new PrismaClient();

// عميل بلا عزل — يُستخدم فقط لجدول Company وعمليات المنصة (لا تستخدمه في مسارات الشركات)
export const prismaUnscoped = base;

// العميل الافتراضي: كل استعلام على جداول الشركات يُفلتر ويُوسَم تلقائياً بـ companyId.
// إن غاب سياق الشركة يفشل الاستعلام بدل أن يعمل بلا عزل.
const prisma = base.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }: any) {
        if (!TENANT_MODELS.has(model)) return query(args);
        const ctx = tenantStore.getStore();
        if (!ctx) throw new Error(`Tenant context missing for ${model}.${operation}`);
        return query(applyTenant(model, operation, args, ctx.companyId));
      },
    },
  },
});

export default prisma;
