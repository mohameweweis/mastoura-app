import { useEffect, useMemo, useRef, useState } from 'react';
import api, { downloadBlob, errorMessage, fileUrl } from '../services/api';
import Icon from './Icons';
import { useFeedback } from './Feedback';
import { useAuth } from './Auth';

interface Category { id: number; name: string; groupName: string; requiresExpiry: boolean; isRequired: boolean }
interface Doc {
  id: number; categoryId: number; category: Category; title: string; documentNumber: string | null; issuer: string | null;
  issueDate: string | null; expiryDate: string | null; notes: string | null; originalName: string; mimeType: string | null;
  size: number; version: number; previousId: number | null; uploadedBy: string | null; createdAt: string;
}

const kb = (n: number) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const d10 = (v: string | null) => (v ? v.slice(0, 10) : '');
const isPreviewable = (m: string | null) => !!m && (m.startsWith('image/') || m === 'application/pdf');

function expiryBadge(expiry: string | null) {
  if (!expiry) return <span className="status-badge gray">بدون انتهاء</span>;
  const days = Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
  if (days < 0) return <span className="status-badge red"><span className="status-dot" />منتهي منذ {Math.abs(days)} يوم</span>;
  if (days <= 30) return <span className="status-badge orange"><span className="status-dot" />{days} يوم</span>;
  return <span className="status-badge green"><span className="status-dot" />{new Date(expiry).toLocaleDateString('ar-SA')}</span>;
}

export default function DocumentsPanel({ employeeId, employeeName, onChanged }: { employeeId: number; employeeName: string; onChanged?: () => void }) {
  const { showToast, confirm } = useFeedback();
  const { canWrite, canExport } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [form, setForm] = useState({ categoryId: '', title: '', documentNumber: '', issuer: '', issueDate: '', expiryDate: '', notes: '' });
  const [replaceFor, setReplaceFor] = useState<Doc | null>(null);
  const [history, setHistory] = useState<{ doc: Doc; versions: Doc[] } | null>(null);
  const [editing, setEditing] = useState<Doc | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [d, c] = await Promise.all([api.get(`/employees/${employeeId}/documents`), api.get('/document-categories')]);
      setDocs(d.data); setCategories(c.data);
      setForm((f) => (f.categoryId ? f : { ...f, categoryId: String(c.data[0]?.id || '') }));
    } catch { setDocs([]); } finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [employeeId]);

  const category = categories.find((c) => String(c.id) === form.categoryId);
  const grouped = useMemo(() => {
    const map = new Map<string, Doc[]>();
    docs.forEach((d) => map.set(d.category.groupName, [...(map.get(d.category.groupName) || []), d]));
    return [...map.entries()];
  }, [docs]);
  const missingRequired = categories.filter((c) => c.isRequired && !docs.some((d) => d.categoryId === c.id));

  const upload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files.length) { showToast('اختر ملفاً واحداً على الأقل', 'error'); return; }
    setBusy(true);
    try {
      const body = new FormData();
      files.forEach((f) => body.append('files', f));
      Object.entries(form).forEach(([k, v]) => body.append(k, v));
      const res = await api.post(`/employees/${employeeId}/documents`, body, { timeout: 0 });
      showToast(res.data.message, 'success');
      setFiles([]); setShowUpload(false);
      setForm((f) => ({ ...f, title: '', documentNumber: '', issuer: '', issueDate: '', expiryDate: '', notes: '' }));
      await load(); onChanged?.();
    } catch (err: any) { showToast(err?.response?.data?.message || 'تعذر رفع المستندات', 'error'); }
    finally { setBusy(false); }
  };

  const doReplace = async (file: File) => {
    if (!replaceFor) return;
    setBusy(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const res = await api.post(`/documents/${replaceFor.id}/replace`, body, { timeout: 0 });
      showToast(res.data.message, 'success');
      setReplaceFor(null); await load(); onChanged?.();
    } catch (err: any) { showToast(err?.response?.data?.message || 'تعذر استبدال الملف', 'error'); }
    finally { setBusy(false); }
  };

  const remove = async (d: Doc) => {
    if (!(await confirm({ message: `سيتم حذف المستند "${d.title}" مع سجل نسخه السابقة نهائياً. هل تريد المتابعة؟` }))) return;
    try { await api.delete(`/documents/${d.id}`); showToast('تم حذف المستند', 'success'); await load(); onChanged?.(); }
    catch (err: any) { showToast(err?.response?.data?.message || 'تعذر الحذف', 'error'); }
  };

  const showHistory = async (d: Doc) => {
    const res = await api.get(`/documents/${d.id}/history`);
    setHistory({ doc: d, versions: res.data });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    try {
      await api.put(`/documents/${editing.id}`, { ...editing, categoryId: editing.categoryId });
      showToast('تم حفظ بيانات المستند', 'success'); setEditing(null); load();
    } catch { showToast('تعذر الحفظ', 'error'); }
  };

  const exportEmployee = async () => {
    try { await downloadBlob(() => api.get(`/employees/${employeeId}/documents/export`, { responseType: 'blob', timeout: 0 }), `ملف-${employeeName}.zip`); showToast('تم تنزيل ملف العامل', 'success'); }
    catch (e) { showToast(await errorMessage(e, 'تعذر تنزيل الملف'), 'error'); }
  };

  return (
    <div className="drawer-section">
      <div className="section-title-row">
        <div><span className="section-kicker">الأرشيف الإلكتروني</span><h3>مستندات العامل ({docs.length})</h3></div>
        <div className="filters-inline" style={{ margin: 0 }}>
          {canExport && <button className="ghost-button" onClick={exportEmployee}><Icon name="download" size={16} /> تنزيل ملف العامل كاملاً</button>}
          {canWrite && <button className="primary-button" onClick={() => setShowUpload((v) => !v)}><Icon name="upload" size={16} /> رفع مستندات</button>}
        </div>
      </div>

      {missingRequired.length > 0 && (
        <div className="employee-notice" style={{ marginBottom: 12 }}>
          <Icon name="alert" size={16} /><span>مستندات إلزامية ناقصة: {missingRequired.map((c) => c.name).join('، ')}</span>
        </div>
      )}

      {showUpload && canWrite && (
        <form onSubmit={upload} className="doc-upload-form">
          <div className="bulk-drop" style={{ padding: 18 }} onClick={() => fileRef.current?.click()}>
            <Icon name="upload" size={24} />
            <strong>{files.length ? `${files.length} ملف محدد` : 'اضغط لاختيار ملف أو عدة ملفات'}</strong>
            <small>{files.map((f) => f.name).join(' · ').slice(0, 140) || 'PDF، صور، Word، Excel — حتى 100 ميجابايت للملف'}</small>
            <input ref={fileRef} type="file" multiple hidden onChange={(e) => setFiles(Array.from(e.target.files || []))} />
          </div>
          <div className="form-grid" style={{ marginTop: 12 }}>
            <label className="form-field"><span>نوع المستند</span>
              <select value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })} required>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.groupName} › {c.name}</option>)}
              </select></label>
            {files.length <= 1 && <label className="form-field"><span>عنوان المستند (اختياري)</span><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>}
            {files.length <= 1 && <label className="form-field"><span>رقم المستند / الشهادة</span><input value={form.documentNumber} onChange={(e) => setForm({ ...form, documentNumber: e.target.value })} /></label>}
            <label className="form-field"><span>الجهة المصدرة</span><input value={form.issuer} onChange={(e) => setForm({ ...form, issuer: e.target.value })} /></label>
            <label className="form-field"><span>تاريخ الإصدار</span><input type="date" value={form.issueDate} onChange={(e) => setForm({ ...form, issueDate: e.target.value })} /></label>
            <label className="form-field"><span>تاريخ الانتهاء {category?.requiresExpiry ? '(يُنصح بإدخاله)' : '(اختياري)'}</span><input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} /></label>
            <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>ملاحظات</span><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            <div className="form-actions"><button type="button" className="ghost-button" onClick={() => setShowUpload(false)}>إلغاء</button><button className="primary-button" disabled={busy}>{busy ? 'جارٍ الرفع...' : `رفع ${files.length || ''} ملف`}</button></div>
          </div>
        </form>
      )}

      {loading ? <div className="empty-state">جاري التحميل...</div>
        : !docs.length ? <div className="empty-state">لا توجد مستندات مرفوعة لهذا العامل بعد</div>
          : grouped.map(([group, list]) => (
            <div key={group} className="doc-group">
              <div className="doc-group-title">{group}</div>
              {list.map((d) => (
                <div className="doc-row" key={d.id}>
                  <div className="doc-icon"><Icon name="report" size={18} /></div>
                  <div className="doc-main">
                    <strong>{d.category.name}{d.title && d.title !== d.category.name ? ` — ${d.title}` : ''}</strong>
                    <small>
                      {d.originalName} · {kb(d.size)}{d.documentNumber ? ` · رقم: ${d.documentNumber}` : ''}{d.issuer ? ` · ${d.issuer}` : ''}
                      {d.version > 1 ? ` · النسخة ${d.version}` : ''}
                    </small>
                  </div>
                  <div className="doc-expiry">{expiryBadge(d.expiryDate)}</div>
                  <div className="row-actions">
                    {isPreviewable(d.mimeType) && <button className="action-btn blue" title="معاينة" onClick={() => window.open(fileUrl(`/documents/${d.id}/file`), '_blank')}><Icon name="eye" size={16} /></button>}
                    <button className="action-btn" title="تنزيل" onClick={() => window.open(fileUrl(`/documents/${d.id}/file?download=1`), '_blank')}><Icon name="download" size={16} /></button>
                    {d.version > 1 && <button className="action-btn" title="سجل النسخ" onClick={() => showHistory(d)}><Icon name="clock" size={16} /></button>}
                    {canWrite && <button className="action-btn" title="استبدال الملف" onClick={() => { setReplaceFor(d); window.setTimeout(() => replaceRef.current?.click(), 0); }}><Icon name="upload" size={16} /></button>}
                    {canWrite && <button className="action-btn blue" title="تعديل البيانات" onClick={() => setEditing({ ...d })}><Icon name="edit" size={16} /></button>}
                    {canWrite && <button className="action-btn danger" title="حذف" onClick={() => remove(d)}><Icon name="trash" size={16} /></button>}
                  </div>
                </div>
              ))}
            </div>
          ))}

      <input ref={replaceRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) doReplace(f); e.target.value = ''; }} />

      {history && (
        <div className="overlay"><button className="overlay-dismiss" onClick={() => setHistory(null)} />
          <section className="modal-card wide">
            <div className="drawer-head"><div><span className="section-kicker">سجل التعديلات</span><h2>{history.doc.title}</h2></div><button className="icon-button" onClick={() => setHistory(null)}><Icon name="close" size={20} /></button></div>
            <div className="table-wrap" style={{ marginTop: 14 }}>
              <table className="data-table"><thead><tr><th>النسخة</th><th>الملف</th><th>تاريخ الرفع</th><th>بواسطة</th><th>الانتهاء</th><th></th></tr></thead>
                <tbody>{history.versions.map((v) => (
                  <tr key={v.id}><td>{v.version}{v.id === history.doc.id ? ' (الحالية)' : ''}</td><td>{v.originalName}</td><td>{new Date(v.createdAt).toLocaleString('ar-SA')}</td><td>{v.uploadedBy || '—'}</td><td>{d10(v.expiryDate) || '—'}</td>
                    <td><button className="action-btn" title="تنزيل" onClick={() => window.open(fileUrl(`/documents/${v.id}/file?download=1`), '_blank')}><Icon name="download" size={16} /></button></td></tr>
                ))}</tbody></table>
            </div>
          </section>
        </div>
      )}

      {editing && (
        <div className="overlay"><button className="overlay-dismiss" onClick={() => setEditing(null)} />
          <section className="modal-card">
            <div className="drawer-head"><div><h2>تعديل بيانات المستند</h2></div><button className="icon-button" onClick={() => setEditing(null)}><Icon name="close" size={20} /></button></div>
            <form onSubmit={saveEdit} className="form-grid">
              <label className="form-field"><span>نوع المستند</span><select value={editing.categoryId} onChange={(e) => setEditing({ ...editing, categoryId: Number(e.target.value) })}>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="form-field"><span>العنوان</span><input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
              <label className="form-field"><span>رقم المستند</span><input value={editing.documentNumber || ''} onChange={(e) => setEditing({ ...editing, documentNumber: e.target.value })} /></label>
              <label className="form-field"><span>الجهة المصدرة</span><input value={editing.issuer || ''} onChange={(e) => setEditing({ ...editing, issuer: e.target.value })} /></label>
              <label className="form-field"><span>تاريخ الإصدار</span><input type="date" value={d10(editing.issueDate)} onChange={(e) => setEditing({ ...editing, issueDate: e.target.value })} /></label>
              <label className="form-field"><span>تاريخ الانتهاء</span><input type="date" value={d10(editing.expiryDate)} onChange={(e) => setEditing({ ...editing, expiryDate: e.target.value })} /></label>
              <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>ملاحظات</span><textarea rows={2} value={editing.notes || ''} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></label>
              <div className="form-actions"><button type="button" className="ghost-button" onClick={() => setEditing(null)}>إلغاء</button><button className="primary-button">حفظ</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
