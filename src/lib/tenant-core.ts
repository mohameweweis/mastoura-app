// منطق عزل الشركات (دوال نقية بدون Prisma لسهولة الاختبار)

// كل النماذج التي تحمل companyId (AppSetting يعزل بمفتاح مسبوق برقم الشركة)
export const TENANT_MODELS = new Set([
  'User', 'Branch', 'Employee', 'EmployeeAttachment', 'Course', 'EmployeeCourse', 'QualificationCard', 'EmployeeCard', 'DriverProfile',
  'EquipmentType', 'Equipment', 'EmployeeEquipment', 'EquipmentInspection', 'DocumentCategory', 'EmployeeDocument', 'JobRole',
  'JobRequirement', 'BulkImportJob', 'AuditLog', 'Project', 'ProjectAssignment', 'WorkPermit', 'WorkPermitWorker',
]);

const FILTER_OPS = new Set(['findMany', 'findFirst', 'findFirstOrThrow', 'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany']);
const UNIQUE_OPS = new Set(['findUnique', 'findUniqueOrThrow', 'update', 'delete']);

const withoutCompany = (data: any) => {
  if (!data || typeof data !== 'object') return data;
  const { companyId: _ignored, ...rest } = data;
  return rest;
};

// يعيد وسائط الاستعلام بعد إضافة شرط الشركة (أو حقنها عند الإنشاء). أي عملية غير معروفة تُرفض (فشل مغلق).
export function applyTenant(model: string, operation: string, args: any, companyId: number): any {
  if (!TENANT_MODELS.has(model)) return args;
  const a: any = args ? { ...args } : {};

  if (FILTER_OPS.has(operation)) {
    a.where = { ...(a.where || {}), companyId };
    if (operation === 'updateMany') a.data = withoutCompany(a.data);
    return a;
  }
  if (UNIQUE_OPS.has(operation)) {
    a.where = { ...(a.where || {}), companyId };
    if (operation === 'update') a.data = withoutCompany(a.data);
    return a;
  }
  if (operation === 'create') {
    a.data = { ...(a.data || {}), companyId };
    return a;
  }
  if (operation === 'createMany' || operation === 'createManyAndReturn') {
    a.data = Array.isArray(a.data) ? a.data.map((d: any) => ({ ...d, companyId })) : { ...(a.data || {}), companyId };
    return a;
  }
  if (operation === 'upsert') {
    a.where = { ...(a.where || {}), companyId };
    a.create = { ...(a.create || {}), companyId };
    a.update = withoutCompany(a.update);
    return a;
  }
  throw new Error(`عملية Prisma غير مدعومة في وضع تعدد الشركات: ${model}.${operation}`);
}

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
export const normalizeSlug = (v: any) => String(v ?? '').trim().toLowerCase();

// مفتاح إعدادات خاص بالشركة
export const settingKey = (companyId: number, key: string) => `c${companyId}:${key}`;
