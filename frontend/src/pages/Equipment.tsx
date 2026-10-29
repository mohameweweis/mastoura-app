import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';

interface EquipmentType { id: number; name: string; }
interface Branch { id: number; name: string; code: string; }
interface Inspection {
  id: number;
  inspectionType: string;
  inspectionDate: string;
  expiryDate: string;
  certificateNumber: string | null;
  result: string;
  notes: string | null;
}
interface Equipment {
  id: number;
  equipmentNumber: string;
  manufacturer: string | null;
  model: string | null;
  year: number | null;
  status: string;
  notes: string | null;
  type: EquipmentType;
  branch: Branch;
  inspections: Inspection[];
}

function daysLeft(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function EquipmentPage() {
  const { confirm, showToast } = useFeedback();
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [types, setTypes] = useState<EquipmentType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'equipment' | 'types'>('equipment');
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<{ open: boolean; data: Equipment | null }>({ open: false, data: null });
  const [inspectionsFor, setInspectionsFor] = useState<Equipment | null>(null);
  const [newTypeName, setNewTypeName] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [eqRes, typesRes, branchesRes] = await Promise.all([api.get('/equipment'), api.get('/equipment-types'), api.get('/branches')]);
      setEquipment(eqRes.data);
      setTypes(typesRes.data);
      setBranches(branchesRes.data);
    } catch (error) {
      console.error('Error loading equipment', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filtered = useMemo(
    () => equipment.filter((eq) => !search || eq.equipmentNumber.includes(search) || eq.type.name.includes(search) || (eq.model || '').includes(search)),
    [equipment, search]
  );

  const nearestInspection = (eq: Equipment) => {
    if (!eq.inspections.length) return null;
    return [...eq.inspections].sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())[0];
  };

  const deleteEquipment = async (eq: Equipment) => {
    const ok = await confirm({ message: `سيتم حذف المعدة "${eq.equipmentNumber}" وكل سجلات فحصها نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/equipment/${eq.id}`);
      showToast('تم حذف المعدة بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف المعدة', 'error');
    }
  };

  const addType = async () => {
    if (!newTypeName.trim()) return;
    try {
      await api.post('/equipment-types', { name: newTypeName.trim() });
      setNewTypeName('');
      showToast('تم إضافة النوع بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر إضافة النوع', 'error');
    }
  };

  const deleteType = async (type: EquipmentType) => {
    const ok = await confirm({ message: `سيتم حذف نوع المعدة "${type.name}" نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/equipment-types/${type.id}`);
      showToast('تم حذف النوع بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف النوع', 'error');
    }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">إدارة الأصول</span>
          <h1>المعدات وفحوصاتها</h1>
          <p>متابعة معدات الشركة، أنواعها، وسجلات الفحص الدوري الخاصة بكل معدة.</p>
        </div>
        {tab === 'equipment' && (
          <button className="primary-button" onClick={() => setForm({ open: true, data: null })}>
            <Icon name="plus" size={18} /> إضافة معدة جديدة
          </button>
        )}
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>إجمالي المعدات</span><strong>{equipment.length}</strong></div>
        <div className="summary-tile"><span>أنواع مسجلة</span><strong>{types.length}</strong></div>
        <div className="summary-tile"><span>فحوصات منتهية</span><strong>{equipment.filter((eq) => { const n = nearestInspection(eq); return n && daysLeft(n.expiryDate) < 0; }).length}</strong></div>
        <div className="summary-tile"><span>فحوصات قريبة الانتهاء</span><strong>{equipment.filter((eq) => { const n = nearestInspection(eq); if (!n) return false; const d = daysLeft(n.expiryDate); return d >= 0 && d <= 30; }).length}</strong></div>
      </div>

      <section className="panel-card">
        <div className="pill-tabs">
          <button className={tab === 'equipment' ? 'active' : ''} onClick={() => setTab('equipment')}>
            <Icon name="truck" size={16} /> المعدات <span className="pill-tab-count">{equipment.length}</span>
          </button>
          <button className={tab === 'types' ? 'active' : ''} onClick={() => setTab('types')}>
            <Icon name="wrench" size={16} /> أنواع المعدات <span className="pill-tab-count">{types.length}</span>
          </button>
        </div>

        {tab === 'equipment' ? (
          <>
            <div className="filters-inline">
              <input placeholder="بحث برقم المعدة أو النوع أو الموديل..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>رقم المعدة</th>
                    <th>النوع</th>
                    <th>الموديل</th>
                    <th>الفرع</th>
                    <th>أقرب فحص</th>
                    <th>الحالة</th>
                    <th className="actions-head">الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7}><div className="empty-state">جاري التحميل...</div></td></tr>
                  ) : filtered.length > 0 ? filtered.map((eq) => {
                    const nearest = nearestInspection(eq);
                    const days = nearest ? daysLeft(nearest.expiryDate) : null;
                    const tone = days === null ? 'gray' : days < 0 ? 'red' : days <= 30 ? 'orange' : 'green';
                    return (
                      <tr key={eq.id}>
                        <td><span className="code-pill">{eq.equipmentNumber}</span></td>
                        <td><strong>{eq.type.name}</strong></td>
                        <td>{eq.manufacturer || '—'} {eq.model || ''}</td>
                        <td>{eq.branch.name}</td>
                        <td>
                          {nearest ? (
                            <span className={`status-badge ${tone}`}><span className="status-dot" />{days! < 0 ? 'منتهي' : `${days} يوم`}</span>
                          ) : <span className="status-badge gray"><span className="status-dot" />لا يوجد</span>}
                        </td>
                        <td><span className={`status-badge ${eq.status === 'active' ? 'green' : 'gray'}`}><span className="status-dot" />{eq.status === 'active' ? 'نشطة' : 'متوقفة'}</span></td>
                        <td>
                          <div className="row-actions">
                            <button className="action-btn" title="سجل الفحوصات" onClick={() => setInspectionsFor(eq)}><Icon name="wrench" size={16} /></button>
                            <button className="action-btn blue" title="تعديل" onClick={() => setForm({ open: true, data: eq })}><Icon name="edit" size={16} /></button>
                            <button className="action-btn danger" title="حذف" onClick={() => deleteEquipment(eq)}><Icon name="trash" size={16} /></button>
                          </div>
                        </td>
                      </tr>
                    );
                  }) : <tr><td colSpan={7}><div className="empty-state">لا توجد معدات مطابقة</div></td></tr>}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <div>
            <div className="filters-inline">
              <input placeholder="اسم نوع المعدة الجديد..." value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} />
              <button className="primary-button" onClick={addType}><Icon name="plus" size={16} /> إضافة</button>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead><tr><th>اسم النوع</th><th>عدد المعدات</th><th className="actions-head">الإجراءات</th></tr></thead>
                <tbody>
                  {types.length > 0 ? types.map((type) => (
                    <tr key={type.id}>
                      <td><strong>{type.name}</strong></td>
                      <td>{equipment.filter((eq) => eq.type.id === type.id).length}</td>
                      <td><div className="row-actions"><button className="action-btn danger" title="حذف" onClick={() => deleteType(type)}><Icon name="trash" size={16} /></button></div></td>
                    </tr>
                  )) : <tr><td colSpan={3}><div className="empty-state">لا توجد أنواع مسجلة بعد</div></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {form.open && (
        <EquipmentFormModal
          initialData={form.data}
          types={types}
          branches={branches}
          onClose={() => setForm({ open: false, data: null })}
          onSaved={loadData}
        />
      )}
      {inspectionsFor && (
        <InspectionsModal
          equipment={inspectionsFor}
          onClose={() => setInspectionsFor(null)}
          onUpdated={async () => {
            await loadData();
          }}
        />
      )}
    </div>
  );
}

function EquipmentFormModal({
  initialData, types, branches, onClose, onSaved,
}: { initialData: Equipment | null; types: EquipmentType[]; branches: Branch[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);
  const [form, setForm] = useState({
    equipmentNumber: initialData?.equipmentNumber || '',
    typeId: initialData?.type.id ? String(initialData.type.id) : '',
    manufacturer: initialData?.manufacturer || '',
    model: initialData?.model || '',
    year: initialData?.year ? String(initialData.year) : '',
    branchId: initialData?.branch.id ? String(initialData.branch.id) : '',
    status: initialData?.status || 'active',
    notes: initialData?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit && initialData) await api.put(`/equipment/${initialData.id}`, form);
      else await api.post('/equipment', form);
      onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات المعدة بنجاح' : 'تم إضافة المعدة بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ بيانات المعدة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card">
        <div className="drawer-head">
          <div><h2>{isEdit ? 'تعديل بيانات المعدة' : 'إضافة معدة جديدة'}</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-grid">
          <label className="form-field"><span>رقم المعدة</span><input value={form.equipmentNumber} onChange={(e) => setForm({ ...form, equipmentNumber: e.target.value })} required /></label>
          <label className="form-field">
            <span>نوع المعدة</span>
            <select value={form.typeId} onChange={(e) => setForm({ ...form, typeId: e.target.value })} required>
              <option value="">اختر النوع</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <label className="form-field"><span>الشركة المصنعة</span><input value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></label>
          <label className="form-field"><span>الموديل</span><input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></label>
          <label className="form-field"><span>سنة الصنع</span><input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></label>
          <label className="form-field">
            <span>الفرع</span>
            <select value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })} required>
              <option value="">اختر الفرع</option>
              {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </label>
          {isEdit && (
            <label className="form-field">
              <span>الحالة</span>
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="active">نشطة</option>
                <option value="inactive">متوقفة</option>
              </select>
            </label>
          )}
          <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>ملاحظات</span><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}

function InspectionsModal({ equipment, onClose, onUpdated }: { equipment: Equipment; onClose: () => void; onUpdated: () => Promise<void> }) {
  const { confirm, showToast } = useFeedback();
  const [inspections, setInspections] = useState<Inspection[]>(equipment.inspections);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ inspectionType: '', inspectionDate: '', expiryDate: '', certificateNumber: '', result: 'pass', notes: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    const res = await api.get(`/equipment/${equipment.id}`);
    setInspections(res.data.inspections);
    await onUpdated();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/equipment/${equipment.id}/inspections`, form);
      await refresh();
      showToast('تم تسجيل الفحص بنجاح', 'success');
      setShowForm(false);
      setForm({ inspectionType: '', inspectionDate: '', expiryDate: '', certificateNumber: '', result: 'pass', notes: '' });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر تسجيل الفحص.');
    } finally {
      setSaving(false);
    }
  };

  const deleteInspection = async (inspection: Inspection) => {
    const ok = await confirm({ message: `سيتم حذف سجل فحص "${inspection.inspectionType}" نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/inspections/${inspection.id}`);
      await refresh();
      showToast('تم حذف سجل الفحص بنجاح', 'success');
    } catch {
      showToast('تعذر حذف سجل الفحص', 'error');
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card wide">
        <div className="drawer-head">
          <div><span className="section-kicker">سجل فحوصات المعدة</span><h2>{equipment.equipmentNumber} · {equipment.type.name}</h2></div>
          <div className="drawer-head-actions">
            <button className="primary-button" onClick={() => setShowForm((v) => !v)} type="button"><Icon name="plus" size={16} /> فحص جديد</button>
            <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
          </div>
        </div>

        {showForm && (
          <form onSubmit={submit} className="form-grid" style={{ marginTop: 18, background: '#f8fafc', padding: 16, borderRadius: 14 }}>
            <label className="form-field"><span>نوع الفحص</span><input value={form.inspectionType} onChange={(e) => setForm({ ...form, inspectionType: e.target.value })} placeholder="فحص دوري / فحص سلامة" required /></label>
            <label className="form-field">
              <span>النتيجة</span>
              <select value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })}>
                <option value="pass">ناجح</option>
                <option value="fail">راسب</option>
              </select>
            </label>
            <label className="form-field"><span>تاريخ الفحص</span><input type="date" value={form.inspectionDate} onChange={(e) => setForm({ ...form, inspectionDate: e.target.value })} required /></label>
            <label className="form-field"><span>تاريخ الانتهاء</span><input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} required /></label>
            <label className="form-field"><span>رقم الشهادة (اختياري)</span><input value={form.certificateNumber} onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })} /></label>
            <label className="form-field" style={{ gridColumn: '1 / -1' }}><span>ملاحظات</span><textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></label>
            {error && <div className="form-error">{error}</div>}
            <div className="form-actions"><button type="button" className="ghost-button" onClick={() => setShowForm(false)}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ الفحص'}</button></div>
          </form>
        )}

        <div className="table-wrap" style={{ marginTop: 18 }}>
          <table className="data-table">
            <thead><tr><th>نوع الفحص</th><th>تاريخ الفحص</th><th>تاريخ الانتهاء</th><th>النتيجة</th><th>رقم الشهادة</th><th className="actions-head">الإجراءات</th></tr></thead>
            <tbody>
              {inspections.length > 0 ? inspections.map((insp) => {
                const days = daysLeft(insp.expiryDate);
                const tone = days < 0 ? 'red' : days <= 30 ? 'orange' : 'green';
                return (
                  <tr key={insp.id}>
                    <td><strong>{insp.inspectionType}</strong></td>
                    <td>{new Date(insp.inspectionDate).toLocaleDateString('ar-SA')}</td>
                    <td><span className={`status-badge ${tone}`}><span className="status-dot" />{new Date(insp.expiryDate).toLocaleDateString('ar-SA')}</span></td>
                    <td><span className={`status-badge ${insp.result === 'pass' ? 'green' : 'red'}`}>{insp.result === 'pass' ? 'ناجح' : 'راسب'}</span></td>
                    <td>{insp.certificateNumber || '—'}</td>
                    <td><div className="row-actions"><button className="action-btn danger" title="حذف" onClick={() => deleteInspection(insp)}><Icon name="trash" size={16} /></button></div></td>
                  </tr>
                );
              }) : <tr><td colSpan={6}><div className="empty-state">لا توجد فحوصات مسجلة لهذه المعدة بعد</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
