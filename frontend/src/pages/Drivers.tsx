import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';

interface Employee {
  id: number;
  name: string;
  jobNumber: string;
  branch?: { id: number; name: string } | null;
  driverProfile?: { id: number } | null;
}

interface Driver {
  id: number;
  licenseNumber: string;
  licenseType: string;
  licenseIssueDate: string;
  licenseExpiryDate: string;
  driverCardNumber: string | null;
  driverCardExpiryDate: string | null;
  status: string;
  employee: Employee;
}

function daysLeft(date: string) {
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

export default function Drivers() {
  const { confirm, showToast } = useFeedback();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<{ open: boolean; data: Driver | null }>({ open: false, data: null });
  const [search, setSearch] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [driversRes, employeesRes] = await Promise.all([api.get('/drivers'), api.get('/employees')]);
      setDrivers(driversRes.data);
      setEmployees(employeesRes.data);
    } catch (error) {
      console.error('Error loading drivers', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const availableEmployees = useMemo(() => employees.filter((e) => !e.driverProfile), [employees]);

  const filtered = useMemo(
    () => drivers.filter((d) => !search || d.employee.name.includes(search) || d.licenseNumber.includes(search)),
    [drivers, search]
  );

  const deleteDriver = async (driver: Driver) => {
    const ok = await confirm({ message: `سيتم حذف بيانات السائق "${driver.employee.name}" نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/driver-profiles/${driver.id}`);
      showToast('تم حذف بيانات السائق بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف بيانات السائق', 'error');
    }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">إدارة الأسطول</span>
          <h1>السائقون</h1>
          <p>متابعة رخص القيادة وكروت التشغيل الخاصة بالعاملين المسجلين كسائقين.</p>
        </div>
        <button className="primary-button" onClick={() => setForm({ open: true, data: null })}>
          <Icon name="plus" size={18} /> تسجيل سائق جديد
        </button>
      </div>

      <div className="summary-tiles">
        <div className="summary-tile"><span>إجمالي السائقين</span><strong>{drivers.length}</strong></div>
        <div className="summary-tile"><span>رخص منتهية</span><strong>{drivers.filter((d) => daysLeft(d.licenseExpiryDate) < 0).length}</strong></div>
        <div className="summary-tile"><span>رخص تنتهي قريباً</span><strong>{drivers.filter((d) => { const days = daysLeft(d.licenseExpiryDate); return days >= 0 && days <= 30; }).length}</strong></div>
      </div>

      <section className="panel-card">
        <div className="filters-inline">
          <input placeholder="بحث بالاسم أو رقم الرخصة..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>السائق</th>
                <th>الفرع</th>
                <th>رقم الرخصة</th>
                <th>نوع الرخصة</th>
                <th>تاريخ انتهاء الرخصة</th>
                <th>الحالة</th>
                <th className="actions-head">الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7}><div className="empty-state">جاري التحميل...</div></td></tr>
              ) : filtered.length > 0 ? filtered.map((driver) => {
                const days = daysLeft(driver.licenseExpiryDate);
                const tone = days < 0 ? 'red' : days <= 30 ? 'orange' : 'green';
                return (
                  <tr key={driver.id}>
                    <td>
                      <div className="person-cell">
                        <div className="person-mini-avatar">{driver.employee.name.charAt(0)}</div>
                        <strong>{driver.employee.name}</strong>
                      </div>
                    </td>
                    <td>{driver.employee.branch?.name || '—'}</td>
                    <td><span className="code-pill">{driver.licenseNumber}</span></td>
                    <td>{driver.licenseType}</td>
                    <td>{new Date(driver.licenseExpiryDate).toLocaleDateString('ar-SA')}</td>
                    <td><span className={`status-badge ${tone}`}><span className="status-dot" />{days < 0 ? 'منتهية' : days <= 30 ? 'تنتهي قريباً' : 'سارية'}</span></td>
                    <td>
                      <div className="row-actions">
                        <button className="action-btn blue" title="تعديل" onClick={() => setForm({ open: true, data: driver })}><Icon name="edit" size={16} /></button>
                        <button className="action-btn danger" title="حذف" onClick={() => deleteDriver(driver)}><Icon name="trash" size={16} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }) : <tr><td colSpan={7}><div className="empty-state">لا يوجد سائقون مطابقون</div></td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      {form.open && (
        <DriverFormModal
          initialData={form.data}
          availableEmployees={availableEmployees}
          onClose={() => setForm({ open: false, data: null })}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

function DriverFormModal({
  initialData, availableEmployees, onClose, onSaved,
}: { initialData: Driver | null; availableEmployees: Employee[]; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);
  const [employeeId, setEmployeeId] = useState<number | null>(initialData?.employee.id || null);
  const [employeeSearch, setEmployeeSearch] = useState(initialData?.employee.name || '');
  const [showResults, setShowResults] = useState(false);

  const [form, setForm] = useState({
    licenseNumber: initialData?.licenseNumber || '',
    licenseType: initialData?.licenseType || '',
    licenseIssueDate: initialData?.licenseIssueDate?.slice(0, 10) || '',
    licenseExpiryDate: initialData?.licenseExpiryDate?.slice(0, 10) || '',
    driverCardNumber: initialData?.driverCardNumber || '',
    driverCardExpiryDate: initialData?.driverCardExpiryDate?.slice(0, 10) || '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const matches = useMemo(
    () => (employeeSearch ? availableEmployees.filter((e) => e.name.includes(employeeSearch) || e.jobNumber.includes(employeeSearch)).slice(0, 8) : []),
    [employeeSearch, availableEmployees]
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEdit && !employeeId) { setError('الرجاء اختيار العامل أولاً'); return; }
    setSaving(true);
    setError('');
    try {
      if (isEdit && initialData) await api.put(`/driver-profiles/${initialData.id}`, form);
      else await api.post(`/employees/${employeeId}/driver-profile`, form);
      onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات السائق بنجاح' : 'تم تسجيل السائق بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ بيانات السائق.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card">
        <div className="drawer-head">
          <div><h2>{isEdit ? 'تعديل بيانات السائق' : 'تسجيل سائق جديد'}</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-grid">
          {!isEdit && (
            <div className="form-field search-select-field" style={{ gridColumn: '1 / -1' }}>
              <span>العامل</span>
              <input
                value={employeeSearch}
                onChange={(e) => { setEmployeeSearch(e.target.value); setEmployeeId(null); setShowResults(true); }}
                onFocus={() => setShowResults(true)}
                placeholder="ابحث بالاسم أو الرقم الوظيفي..."
                autoComplete="off"
              />
              {showResults && matches.length > 0 && (
                <div className="search-select-results">
                  {matches.map((emp) => (
                    <button type="button" key={emp.id} onClick={() => { setEmployeeId(emp.id); setEmployeeSearch(emp.name); setShowResults(false); }}>
                      {emp.name} · {emp.jobNumber} · {emp.branch?.name || '—'}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <label className="form-field"><span>رقم رخصة القيادة</span><input value={form.licenseNumber} onChange={(e) => setForm({ ...form, licenseNumber: e.target.value })} required /></label>
          <label className="form-field"><span>نوع الرخصة</span><input value={form.licenseType} onChange={(e) => setForm({ ...form, licenseType: e.target.value })} placeholder="خاصة / عامة / ثقيلة" required /></label>
          <label className="form-field"><span>تاريخ إصدار الرخصة</span><input type="date" value={form.licenseIssueDate} onChange={(e) => setForm({ ...form, licenseIssueDate: e.target.value })} required /></label>
          <label className="form-field"><span>تاريخ انتهاء الرخصة</span><input type="date" value={form.licenseExpiryDate} onChange={(e) => setForm({ ...form, licenseExpiryDate: e.target.value })} required /></label>
          <label className="form-field"><span>رقم كرت السائق (اختياري)</span><input value={form.driverCardNumber} onChange={(e) => setForm({ ...form, driverCardNumber: e.target.value })} /></label>
          <label className="form-field"><span>تاريخ انتهاء كرت السائق (اختياري)</span><input type="date" value={form.driverCardExpiryDate} onChange={(e) => setForm({ ...form, driverCardExpiryDate: e.target.value })} /></label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}
