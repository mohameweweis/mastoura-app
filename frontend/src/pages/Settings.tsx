import { useEffect, useRef, useState } from 'react';
import api, { downloadBlob, errorMessage } from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';
import { useAuth } from '../components/Auth';

interface Category { id: number; name: string; groupName: string; requiresExpiry: boolean; isRequired: boolean }

export default function Settings() {
  const { showToast, confirm } = useFeedback();
  const { isAdmin, canWrite } = useAuth();
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [alertDays, setAlertDays] = useState('30');
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [categories, setCategories] = useState<Category[]>([]);
  const [newCat, setNewCat] = useState({ name: '', groupName: 'ملفات إضافية', requiresExpiry: false, isRequired: false });
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const restoreRef = useRef<HTMLInputElement>(null);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);

  const checkHealth = async () => {
    setStatus('checking');
    try { const res = await api.get('/health'); setStatus(res.data?.status === 'OK' ? 'online' : 'offline'); }
    catch { setStatus('offline'); } finally { setCheckedAt(new Date()); }
  };
  const loadCategories = () => api.get('/document-categories').then((r) => setCategories(r.data)).catch(() => undefined);

  useEffect(() => {
    checkHealth();
    loadCategories();
    api.get('/settings').then((r) => setAlertDays(String(r.data.alertDays))).catch(() => undefined);
  }, []);

  const saveAlertDays = async () => {
    try { await api.put('/settings', { alertDays: Number(alertDays) }); showToast('تم حفظ مدة التنبيه', 'success'); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الحفظ', 'error'); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    try { await api.put('/auth/password', pw); setPw({ currentPassword: '', newPassword: '' }); showToast('تم تغيير كلمة المرور بنجاح', 'success'); }
    catch (err: any) { showToast(err?.response?.data?.message || 'تعذر تغيير كلمة المرور', 'error'); }
  };

  const addCategory = async () => {
    if (!newCat.name.trim()) return;
    try { await api.post('/document-categories', newCat); setNewCat({ name: '', groupName: 'ملفات إضافية', requiresExpiry: false, isRequired: false }); showToast('تمت إضافة التصنيف', 'success'); loadCategories(); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر إضافة التصنيف', 'error'); }
  };

  const toggleCategory = async (c: Category, field: 'requiresExpiry' | 'isRequired') => {
    try { await api.put(`/document-categories/${c.id}`, { ...c, [field]: !c[field] }); loadCategories(); }
    catch { showToast('تعذر التعديل', 'error'); }
  };

  const deleteCategory = async (c: Category) => {
    if (!(await confirm({ message: `سيتم حذف التصنيف "${c.name}". هل تريد المتابعة؟` }))) return;
    try { await api.delete(`/document-categories/${c.id}`); showToast('تم حذف التصنيف', 'success'); loadCategories(); }
    catch (e: any) { showToast(e?.response?.data?.message || 'تعذر الحذف', 'error'); }
  };

  const backup = async () => {
    setBackupBusy(true);
    try { await downloadBlob(() => api.get('/backup', { responseType: 'blob', timeout: 0 }), 'backup.zip'); showToast('تم تنزيل النسخة الاحتياطية', 'success'); }
    catch (e) { showToast(await errorMessage(e, 'تعذر إنشاء النسخة الاحتياطية'), 'error'); }
    finally { setBackupBusy(false); }
  };

  const restore = async () => {
    if (!restoreFile) return;
    if (!(await confirm({ title: 'تأكيد الاستعادة', message: 'سيتم استبدال كل بيانات النظام الحالية بمحتوى النسخة الاحتياطية. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟', confirmLabel: 'استعادة' }))) return;
    setRestoreBusy(true);
    try {
      const form = new FormData();
      form.append('file', restoreFile);
      form.append('confirm', restoreConfirm);
      const res = await api.post('/restore', form, { timeout: 0 });
      showToast(res.data.message, 'success');
      setRestoreFile(null); setRestoreConfirm('');
    } catch (e: any) { showToast(e?.response?.data?.message || 'فشلت الاستعادة', 'error'); }
    finally { setRestoreBusy(false); }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">إعدادات النظام</span>
          <h1>الإعدادات والنسخ الاحتياطي</h1>
          <p>حالة النظام، مدة التنبيه، تصنيفات المستندات، حسابك، والنسخ الاحتياطي والاستعادة.</p>
        </div>
      </div>

      <section className="panel-card">
        <div className="panel-head">
          <div><span className="section-kicker">حالة الاتصال</span><h2><Icon name="grid" size={19} /> حالة النظام</h2></div>
          <button className="ghost-button" onClick={checkHealth}><Icon name="clock" size={16} /> إعادة الفحص</button>
        </div>
        <div style={{ padding: '0 20px 20px' }}>
          <div className="status-strip" style={{ margin: 0 }}>
            <span className={`connection-dot ${status}`} />
            <strong>{status === 'online' ? 'الخادم وقاعدة البيانات متصلة بنجاح' : status === 'offline' ? 'تعذر الاتصال بالخادم أو قاعدة البيانات' : 'جارٍ فحص الاتصال...'}</strong>
            {checkedAt && <span className="status-strip-note">آخر فحص: {checkedAt.toLocaleTimeString('ar-SA')}</span>}
          </div>
        </div>
      </section>

      <div className="charts-grid" style={{ marginTop: 18 }}>
        <section className="panel-card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px' }}>مدة التنبيه قبل الانتهاء</h3>
          <p style={{ color: '#7b899a', fontSize: 12, margin: '0 0 12px' }}>تظهر في التنبيهات كل العناصر التي تنتهي خلال هذه المدة.</p>
          <div className="filters-inline" style={{ margin: 0 }}>
            <input type="number" min={1} max={365} value={alertDays} onChange={(e) => setAlertDays(e.target.value)} disabled={!isAdmin} style={{ minWidth: 100 }} /> يوم
            {isAdmin && <button className="primary-button" onClick={saveAlertDays}>حفظ</button>}
          </div>
        </section>
        <section className="panel-card" style={{ padding: 20 }}>
          <h3 style={{ margin: '0 0 12px' }}>تغيير كلمة المرور</h3>
          <form onSubmit={changePassword} className="form-grid single" style={{ gap: 10 }}>
            <label className="form-field"><span>كلمة المرور الحالية</span><input type="password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} required /></label>
            <label className="form-field"><span>كلمة المرور الجديدة (6 أحرف على الأقل)</span><input type="password" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} required minLength={6} /></label>
            <button className="primary-button">تغيير كلمة المرور</button>
          </form>
        </section>
      </div>

      <section className="panel-card" style={{ marginTop: 18 }}>
        <div className="panel-head"><div><span className="section-kicker">الأرشيف الإلكتروني</span><h2><Icon name="id" size={19} /> تصنيفات مستندات العاملين</h2></div></div>
        {canWrite && (
          <div className="filters-inline" style={{ padding: '0 20px' }}>
            <input placeholder="اسم تصنيف جديد..." value={newCat.name} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} />
            <input placeholder="المجموعة" value={newCat.groupName} onChange={(e) => setNewCat({ ...newCat, groupName: e.target.value })} />
            <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={newCat.requiresExpiry} onChange={(e) => setNewCat({ ...newCat, requiresExpiry: e.target.checked })} /> له تاريخ انتهاء</label>
            <label style={{ fontSize: 12, display: 'flex', gap: 5, alignItems: 'center' }}><input type="checkbox" checked={newCat.isRequired} onChange={(e) => setNewCat({ ...newCat, isRequired: e.target.checked })} /> إلزامي لكل عامل</label>
            <button className="primary-button" onClick={addCategory}><Icon name="plus" size={16} /> إضافة</button>
          </div>
        )}
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>التصنيف</th><th>المجموعة</th><th>له تاريخ انتهاء</th><th>إلزامي (للتقارير)</th><th className="actions-head">حذف</th></tr></thead>
            <tbody>
              {categories.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong></td><td>{c.groupName}</td>
                  <td><input type="checkbox" checked={c.requiresExpiry} disabled={!canWrite} onChange={() => toggleCategory(c, 'requiresExpiry')} /></td>
                  <td><input type="checkbox" checked={c.isRequired} disabled={!canWrite} onChange={() => toggleCategory(c, 'isRequired')} /></td>
                  <td>{canWrite && <div className="row-actions"><button className="action-btn danger" onClick={() => deleteCategory(c)}><Icon name="trash" size={16} /></button></div>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {isAdmin && (
        <section className="panel-card" style={{ marginTop: 18, padding: 20 }}>
          <h3 style={{ margin: '0 0 6px' }}>النسخ الاحتياطي والاستعادة</h3>
          <p style={{ color: '#7b899a', fontSize: 12, margin: '0 0 14px', lineHeight: 1.9 }}>
            النسخة تشمل <b>قاعدة البيانات كاملة + كل ملفات العاملين</b> في ملف ZIP واحد. احتفظ بها خارج جهاز الخادم بشكل دوري.
          </p>
          <button className="primary-button" onClick={backup} disabled={backupBusy}>
            {backupBusy ? <><Icon name="spinner" size={16} className="spin" /> جارٍ التجهيز...</> : <><Icon name="download" size={16} /> تنزيل نسخة احتياطية الآن</>}
          </button>
          <hr style={{ border: 0, borderTop: '1px solid #eef2f6', margin: '20px 0' }} />
          <h4 style={{ margin: '0 0 8px', color: '#d3394c' }}>استعادة نسخة احتياطية</h4>
          <p style={{ color: '#7b899a', fontSize: 12, margin: '0 0 10px' }}>⚠️ تستبدل كل البيانات الحالية. اكتب RESTORE للتأكيد.</p>
          <div className="filters-inline">
            <button className="ghost-button" onClick={() => restoreRef.current?.click()}><Icon name="upload" size={16} /> {restoreFile ? restoreFile.name : 'اختيار ملف النسخة'}</button>
            <input ref={restoreRef} type="file" accept=".zip" hidden onChange={(e) => setRestoreFile(e.target.files?.[0] || null)} />
            <input placeholder="RESTORE" value={restoreConfirm} onChange={(e) => setRestoreConfirm(e.target.value)} style={{ minWidth: 120 }} />
            <button className="danger-button" disabled={!restoreFile || restoreConfirm !== 'RESTORE' || restoreBusy} onClick={restore}>{restoreBusy ? 'جارٍ الاستعادة...' : 'استعادة'}</button>
          </div>
        </section>
      )}
    </div>
  );
}
