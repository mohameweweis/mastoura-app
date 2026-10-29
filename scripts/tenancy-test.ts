// اختبار عزل الشركات عبر الـ API (شغّله على قاعدة بيانات تجريبية فقط!)
//   1) شغّل الخادم:   ALLOW_SIGNUP=true npm run dev
//   2) في نافذة ثانية: npm run test:tenancy
// ينشئ شركتين تجريبيتين ويتأكد أن إحداهما لا ترى بيانات الأخرى ولا تعدلها ولا تحمّل ملفاتها.
const BASE = process.env.API || 'http://localhost:3000/api';
const suffix = Math.random().toString(36).slice(2, 8);
let failed = 0;

function check(name: string, ok: boolean, extra = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${ok ? '' : '  ← ' + extra}`);
  if (!ok) failed++;
}

async function call(token: string | null, method: string, path: string, body?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload: any;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  const res = await fetch(BASE + path, { method, headers, body: payload });
  let data: any = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

async function register(tag: string) {
  const r = await call(null, 'POST', '/auth/register-company', {
    companyName: `شركة اختبار ${tag}`, slug: `t-${tag}-${suffix}`, adminUsername: 'admin', adminPassword: 'secret123',
  });
  if (r.status !== 201) throw new Error(`تعذر إنشاء الشركة ${tag}: ${JSON.stringify(r.data)} (هل شغّلت الخادم بـ ALLOW_SIGNUP=true؟)`);
  return { token: r.data.token as string, slug: `t-${tag}-${suffix}` };
}

async function seed(token: string, tag: string) {
  const b = await call(token, 'POST', '/branches', { name: `فرع ${tag}`, code: 'B1' });
  const e = await call(token, 'POST', '/employees', {
    name: `عامل ${tag}`, jobNumber: '1001', iqamaNumber: '2000000001', profession: 'فني', branchId: b.data.branch?.id, internalNumber: '1001',
  });
  return { branchId: b.data.branch?.id as number, empStatus: e.status, empId: e.data.employee?.id as number };
}

(async () => {
  console.log(`API: ${BASE}\n`);
  const A = await register('a');
  const B = await register('b');

  const a = await seed(A.token, 'A');
  const b = await seed(B.token, 'B');
  check('الشركة A أنشأت عاملاً', a.empStatus === 201, String(a.empStatus));
  check('الشركة B أنشأت عاملاً بنفس الرقم الوظيفي ورقم الإقامة (التفرد لكل شركة)', b.empStatus === 201, String(b.empStatus));

  const listA = await call(A.token, 'GET', '/employees');
  const listB = await call(B.token, 'GET', '/employees');
  check('A ترى عاملها فقط', Array.isArray(listA.data) && listA.data.length === 1 && listA.data[0].id === a.empId, JSON.stringify(listA.data).slice(0, 120));
  check('B ترى عاملها فقط', Array.isArray(listB.data) && listB.data.length === 1 && listB.data[0].id === b.empId);

  const brB = await call(B.token, 'GET', '/branches');
  check('B لا ترى فروع A', brB.data.length === 1 && brB.data[0].id === b.branchId);

  // ---- محاولات B الوصول لبيانات A
  const g = await call(B.token, 'GET', `/employees/${a.empId}`);
  check('B لا تستطيع قراءة عامل A', g.status === 404 || g.status === 403, String(g.status));
  const p = await call(B.token, 'PUT', `/employees/${a.empId}`, { name: 'اختراق', jobNumber: '1', iqamaNumber: '9', branchId: b.branchId });
  check('B لا تستطيع تعديل عامل A', p.status >= 400, String(p.status));
  const d = await call(B.token, 'DELETE', `/employees/${a.empId}`);
  check('B لا تستطيع حذف عامل A', d.status >= 400, String(d.status));
  const still = await call(A.token, 'GET', `/employees/${a.empId}`);
  check('عامل A سليم بعد المحاولات', still.status === 200 && still.data.name === 'عامل A', JSON.stringify(still.data).slice(0, 100));

  // ---- الملفات
  const cats = await call(A.token, 'GET', '/document-categories');
  const catsB = await call(B.token, 'GET', '/document-categories');
  check('لكل شركة تصنيفاتها الخاصة', cats.data.length > 0 && catsB.data.length === cats.data.length && cats.data[0].id !== catsB.data[0].id);

  const form = new FormData();
  form.append('files', new Blob(['%PDF-1.4 سري خاص بالشركة A'], { type: 'application/pdf' }), 'iqama-A.pdf');
  form.append('categoryId', String(cats.data[0].id));
  const up = await call(A.token, 'POST', `/employees/${a.empId}/documents`, form);
  check('A ترفع مستنداً لعاملها', up.status === 201, JSON.stringify(up.data).slice(0, 120));
  const docs = await call(A.token, 'GET', `/employees/${a.empId}/documents`);
  const doc = docs.data[0];
  check('المستند ظاهر لـ A', !!doc);

  const form2 = new FormData();
  form2.append('files', new Blob(['x'], { type: 'application/pdf' }), 'x.pdf');
  form2.append('categoryId', String(catsB.data[0].id));
  const upB = await call(B.token, 'POST', `/employees/${a.empId}/documents`, form2);
  check('B لا ترفع مستنداً على عامل A', upB.status === 404 || upB.status >= 400, String(upB.status));
  const fileB = await call(B.token, 'GET', `/documents/${doc?.id}/file`);
  check('B لا تحمّل مستند A', fileB.status === 404, String(fileB.status));
  const dl = await call(B.token, 'GET', `/download?path=${encodeURIComponent(doc?.filePath || '')}`);
  check('B لا تحمّل ملف A عبر /download', dl.status === 404, String(dl.status));
  const fileA = await call(A.token, 'GET', `/documents/${doc?.id}/file`);
  check('A تحمّل مستندها', fileA.status === 200 && String(fileA.data).includes('سري'), String(fileA.status));

  // ---- مستخدمون وإعدادات وسجل عمليات
  const usersB = await call(B.token, 'GET', '/users');
  check('B ترى مستخدميها فقط', Array.isArray(usersB.data) && usersB.data.length === 1);
  const setA = await call(A.token, 'PUT', '/settings', { alertDays: 10 });
  const setB = await call(B.token, 'GET', '/settings');
  check('إعدادات A لا تؤثر على B', setA.status === 200 && setB.data.alertDays === 30, JSON.stringify(setB.data));
  const auditA = await call(A.token, 'GET', '/audit');
  check('سجل عمليات A لا يحوي عمليات B', Array.isArray(auditA.data) && !auditA.data.some((l: any) => String(l.details || '').includes('B')), '');

  // ---- المصادقة
  const none = await call(null, 'GET', '/employees');
  check('بدون توكن → 401', none.status === 401);
  const bad = await call(A.token.slice(0, -3) + 'abc', 'GET', '/employees');
  check('توكن معدّل → 401', bad.status === 401);
  const loginWrong = await call(null, 'POST', '/auth/login', { company: A.slug, username: 'admin', password: 'wrong' });
  check('كلمة مرور خاطئة → 401', loginWrong.status === 401);
  const loginOther = await call(null, 'POST', '/auth/login', { company: B.slug, username: 'admin', password: 'secret123' });
  check('الدخول لشركة B بمستخدمها يعمل', loginOther.status === 200 && loginOther.data.user.companyId !== undefined);

  console.log(`\nالشركتان التجريبيتان: t-a-${suffix} و t-b-${suffix} (احذفهما بـ: npm run company -- purge <slug> --yes)`);
  console.log(failed ? `\n❌ فشل ${failed} اختبار` : '\n✅ كل اختبارات العزل نجحت');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('خطأ في الاختبار:', e.message); process.exit(1); });
