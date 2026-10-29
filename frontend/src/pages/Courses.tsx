import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';

interface Course {
  id: number;
  name: string;
  code: string;
  description: string | null;
  validityPeriod: number;
}

interface QualificationCard {
  id: number;
  code: string;
  name: string;
  description: string | null;
}

export default function Courses() {
  const { confirm, showToast } = useFeedback();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState<'courses' | 'cards'>(location.pathname === '/cards' ? 'cards' : 'courses');
  const [courses, setCourses] = useState<Course[]>([]);
  const [cards, setCards] = useState<QualificationCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [courseForm, setCourseForm] = useState<{ open: boolean; data: Course | null }>({ open: false, data: null });
  const [cardForm, setCardForm] = useState<{ open: boolean; data: QualificationCard | null }>({ open: false, data: null });

  const loadData = async () => {
    setLoading(true);
    try {
      const [coursesRes, cardsRes] = await Promise.all([api.get('/courses'), api.get('/qualification-cards')]);
      setCourses(coursesRes.data);
      setCards(cardsRes.data);
    } catch (error) {
      console.error('Error loading qualifications data', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const deleteCourse = async (course: Course) => {
    const ok = await confirm({ message: `سيتم حذف الدورة "${course.name}" نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/courses/${course.id}`);
      showToast('تم حذف الدورة بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف الدورة', 'error');
    }
  };

  const deleteCard = async (card: QualificationCard) => {
    const ok = await confirm({ message: `سيتم حذف الكرت "${card.name}" نهائياً. هل تريد المتابعة؟` });
    if (!ok) return;
    try {
      await api.delete(`/qualification-cards/${card.id}`);
      showToast('تم حذف الكرت بنجاح', 'success');
      loadData();
    } catch (error: any) {
      showToast(error?.response?.data?.message || 'تعذر حذف الكرت', 'error');
    }
  };

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">التأهيل والتدريب</span>
          <h1>إدارة الدورات وكروت التأهيل</h1>
          <p>إدارة أنواع الدورات التدريبية وكروت الفحص المهني المعتمدة في النظام.</p>
        </div>
        <button className="primary-button" onClick={() => (activeTab === 'courses' ? setCourseForm({ open: true, data: null }) : setCardForm({ open: true, data: null }))}>
          <Icon name="plus" size={18} />
          {activeTab === 'courses' ? 'إضافة دورة جديدة' : 'إضافة كرت تأهيل'}
        </button>
      </div>

      <section className="panel-card">
        <div className="pill-tabs">
          <button className={activeTab === 'courses' ? 'active' : ''} onClick={() => setActiveTab('courses')}>
            <Icon name="book" size={16} /> الدورات التدريبية <span className="pill-tab-count">{courses.length}</span>
          </button>
          <button className={activeTab === 'cards' ? 'active' : ''} onClick={() => setActiveTab('cards')}>
            <Icon name="card" size={16} /> كروت التأهيل والاختبار <span className="pill-tab-count">{cards.length}</span>
          </button>
        </div>

        <div className="table-wrap">
          {loading ? (
            <div className="empty-state">جاري تحميل البيانات...</div>
          ) : activeTab === 'courses' ? (
            <table className="data-table">
              <thead>
                <tr>
                  <th>كود الدورة</th>
                  <th>اسم الدورة</th>
                  <th>فترة الصلاحية</th>
                  <th>الوصف</th>
                  <th className="actions-head">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {courses.length > 0 ? courses.map((course) => (
                  <tr key={course.id}>
                    <td><span className="code-pill">{course.code}</span></td>
                    <td><strong>{course.name}</strong></td>
                    <td>{course.validityPeriod} يوم</td>
                    <td>{course.description || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="action-btn blue" title="تعديل" onClick={() => setCourseForm({ open: true, data: course })}><Icon name="edit" size={16} /></button>
                        <button className="action-btn danger" title="حذف" onClick={() => deleteCourse(course)}><Icon name="trash" size={16} /></button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan={5}><div className="empty-state">لا توجد دورات مسجلة بعد</div></td></tr>}
              </tbody>
            </table>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>كود الكرت</th>
                  <th>اسم الكرت</th>
                  <th>الوصف</th>
                  <th className="actions-head">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {cards.length > 0 ? cards.map((card) => (
                  <tr key={card.id}>
                    <td><span className="code-pill">{card.code}</span></td>
                    <td><strong>{card.name}</strong></td>
                    <td>{card.description || '—'}</td>
                    <td>
                      <div className="row-actions">
                        <button className="action-btn blue" title="تعديل" onClick={() => setCardForm({ open: true, data: card })}><Icon name="edit" size={16} /></button>
                        <button className="action-btn danger" title="حذف" onClick={() => deleteCard(card)}><Icon name="trash" size={16} /></button>
                      </div>
                    </td>
                  </tr>
                )) : <tr><td colSpan={4}><div className="empty-state">لا توجد كروت تأهيل مسجلة بعد</div></td></tr>}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {courseForm.open && (
        <CourseFormModal
          initialData={courseForm.data}
          onClose={() => setCourseForm({ open: false, data: null })}
          onSaved={loadData}
        />
      )}
      {cardForm.open && (
        <CardFormModal
          initialData={cardForm.data}
          onClose={() => setCardForm({ open: false, data: null })}
          onSaved={loadData}
        />
      )}
    </div>
  );
}

function CourseFormModal({ initialData, onClose, onSaved }: { initialData: Course | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);
  const [form, setForm] = useState({
    name: initialData?.name || '',
    code: initialData?.code || '',
    description: initialData?.description || '',
    validityPeriod: initialData ? String(initialData.validityPeriod) : '730',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit && initialData) await api.put(`/courses/${initialData.id}`, form);
      else await api.post('/courses', form);
      onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات الدورة بنجاح' : 'تم إضافة الدورة بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ الدورة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card">
        <div className="drawer-head">
          <div><h2>{isEdit ? 'تعديل الدورة' : 'إضافة دورة تدريبية'}</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label className="form-field"><span>اسم الدورة</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="form-field"><span>كود الدورة</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
          <label className="form-field"><span>فترة الصلاحية (بالأيام)</span><input type="number" value={form.validityPeriod} onChange={(e) => setForm({ ...form, validityPeriod: e.target.value })} required /></label>
          <label className="form-field"><span>الوصف (اختياري)</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}

function CardFormModal({ initialData, onClose, onSaved }: { initialData: QualificationCard | null; onClose: () => void; onSaved: () => void }) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);
  const [form, setForm] = useState({ name: initialData?.name || '', code: initialData?.code || '', description: initialData?.description || '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      if (isEdit && initialData) await api.put(`/qualification-cards/${initialData.id}`, form);
      else await api.post('/qualification-cards', form);
      onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات الكرت بنجاح' : 'تم إضافة الكرت بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ الكرت.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} />
      <section className="modal-card">
        <div className="drawer-head">
          <div><h2>{isEdit ? 'تعديل الكرت' : 'إضافة كرت تأهيل'}</h2></div>
          <button className="icon-button" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <form onSubmit={submit} className="form-grid" style={{ gridTemplateColumns: '1fr' }}>
          <label className="form-field"><span>اسم الكرت</span><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="form-field"><span>كود الكرت</span><input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} required /></label>
          <label className="form-field"><span>الوصف (اختياري)</span><textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} /></label>
          {error && <div className="form-error">{error}</div>}
          <div className="form-actions"><button type="button" className="ghost-button" onClick={onClose}>إلغاء</button><button className="primary-button" disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</button></div>
        </form>
      </section>
    </div>
  );
}
