import { useEffect, useMemo, useState } from 'react';
import api, { downloadBlob, errorMessage, fileUrl } from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';
import { useAuth } from '../components/Auth';
import DocumentsPanel from '../components/DocumentsPanel';
import { Link } from 'react-router-dom';

interface Branch {
  id: number;
  name: string;
  code?: string;
}

interface Course {
  id: number;
  name: string;
  code: string;
  description?: string | null;
  validityPeriod?: number;
}

interface QualificationCard {
  id: number;
  code: string;
  name: string;
  description?: string | null;
}

interface Attachment {
  id: number;
  fileName: string;
  filePath: string;
  uploadedAt?: string;
}

interface EmployeeCourse {
  id: number;
  courseId: number;
  courseDate: string;
  expiryDate: string;
  certificateNumber?: string | null;
  attachment?: string | null;
  course: Course;
}

interface EmployeeCard {
  id: number;
  cardId: number;
  cardNumber: string;
  issueDate: string;
  expiryDate: string;
  attachment?: string | null;
  card: QualificationCard;
}

interface Employee {
  id: number;
  internalNumber?: string;
  jobNumber: string;
  name: string;
  iqamaNumber?: string;
  nationality?: string;
  attendanceStatus?: 'present' | 'absent' | 'final_exit';
  phone?: string;
  profession: string;
  hireDate?: string;
  branch?: Branch | null;
  branchId?: number;
  courses?: EmployeeCourse[];
  cards?: EmployeeCard[];
  documents?: {
    id: number;
    title?: string;
    filePath?: string;
    categoryId: number;
    expiryDate?: string | null;
  }[];
  attachments?: Attachment[];
  driverProfile?: any;
  equipmentCards?: any[];
}

type Status = 'valid' | 'soon' | 'expired';

const APPROVED_COURSES = [
  { code: 'CSCC00', name: 'OHS General Induction' },
  { code: 'CSCC01', name: 'Hazard Identification & Risk Assessment' },
  { code: 'CSCC02', name: 'Safe working Procedures for Electrical' },
  { code: 'CSCC03', name: 'Safe working Procedures for Mechanical' },
  { code: 'CSCC04', name: 'Distribution Safety Rules & Safe Isolation & Switching Procedure' },
  { code: 'CSCC05', name: 'National Grid Safety Rules, Qualification & Authorization' },
  { code: 'CSCC08', name: 'NG Electrical Safe working Procedures' },
  { code: 'CSCC09', name: 'OHS General Induction including Office Safety' },
  { code: 'CSCC10', name: 'Construction Safety' },
  { code: 'CSCC11', name: 'Work at Heights (Fall Protection Program)' },
  { code: 'CSCC17', name: 'Lifting Operations (As per scope of work)' },
  { code: 'CSCC19', name: 'Confined Space Entry Program' },
  { code: 'CSCC21', name: 'Use of Diggers' },
  { code: 'CSCC22', name: 'First Aid' },
  { code: 'CSCC23', name: 'Defensive Driving (as per scope of work)' },
  { code: 'CSCC24', name: 'Basic Fire Fighting' },
  { code: 'CSCC25', name: 'ARC Flash Awareness' },
  { code: 'CSCC28', name: 'Fire Suppression System Operation Basic Training' },
  { code: 'CSCC29', name: 'Excavation Safety' },
];

const TECHNICAL_CARDS = [
  { code: 'CTCT01', name: 'Electrical Equipment: Installation & Maintenance' },
  { code: 'CTCT02', name: 'Heavy Vehicles Safe Operation' },
  { code: 'CTCT14', name: 'Digger Safe Operation' },
  { code: 'CTCT15', name: 'Jack Hammer Safe Operation' },
  { code: 'CTCT03', name: 'Overhead line: Installation & Maintenance' },
  { code: 'CTCT04', name: 'Energy Meter: Installation' },
  { code: 'CTCT05', name: 'Energy Meter: Inspection & Maintenance' },
  { code: 'CTCT06', name: 'Installation of Power cable Joint and Termination - 1KV' },
  { code: 'CTCT08', name: 'Installation of Power cable Joint and Termination- 13.8KV' },
  { code: 'CTCT10', name: 'Installation of Power cable Joint and Termination - 33KV' },
  { code: 'CTCT12', name: 'Installation of Power cable Joint and Termination- 69KV' },
  { code: 'CRD001', name: 'electrical meter inspection & maintenance' },
  { code: 'CRD002', name: 'Electrical Meter Installation' },
  { code: 'CRD003', name: 'Issuer LV+Receiver LV' },
  { code: 'CRD004', name: 'Issuer LV+Receiver MV' },
  { code: 'CRD005', name: 'Overhead line operator' },
  { code: 'CRD006', name: 'Receiver LV' },
  { code: 'CRD007', name: 'Receiver MV &LV' },
  { code: 'CRD008', name: '1KV J&T densons' },
  { code: 'CRD009', name: '1KV J&T Raychem' },
  { code: 'CRD010', name: '1KV Joint & Termination' },
  { code: 'CRD011', name: '13.8KV J&T ceepower' },
  { code: 'CRD012', name: '13.8KV J&T Cellpack' },
  { code: 'CRD013', name: '13.8KV J&T Denson' },
  { code: 'CRD014', name: '13.8KV J&T Nexans' },
  { code: 'CRD015', name: '13.8KV Joint & Termination' },
  { code: 'CRD016', name: '33KV J&T cellpack' },
  { code: 'CRD017', name: '33KV J&T Denson' },
  { code: 'CRD018', name: '33KV J&T DENSONS' },
  { code: 'CRD019', name: '33KV J&T Elastimold' },
  { code: 'CRD020', name: '33KV J&T Raychem' },
  { code: 'CRD021', name: '33KV Joint & Termination' },
];

const attendanceMap: Record<string, { label: string; badge: string }> = {
  present: { label: 'حاضر', badge: 'green' },
  absent: { label: 'متغيب', badge: 'red' },
  final_exit: { label: 'خروج نهائي', badge: 'gray' },
};

const dateFormatter = new Intl.DateTimeFormat('ar-SA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function getStatus(date?: string): Status {
  if (!date) return 'valid';
  const expiry = new Date(date).getTime();
  const now = Date.now();
  const diff = expiry - now;
  if (diff < 0) return 'expired';
  if (diff <= 30 * 24 * 60 * 60 * 1000) return 'soon';
  return 'valid';
}

function statusMeta(status: Status) {
  if (status === 'expired') {
    return { label: 'منتهي', badge: 'red', icon: 'alert' as const };
  }
  if (status === 'soon') {
    return { label: 'ينتهي قريباً', badge: 'orange', icon: 'clock' as const };
  }
  return { label: 'ساري', badge: 'green', icon: 'check' as const };
}

function formatDate(value?: string | null) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : dateFormatter.format(parsed);
}

function initials(name?: string) {
  return (name || 'ع').trim().slice(0, 2);
}

export default function Employees() {
  const { confirm, showToast } = useFeedback();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cards, setCards] = useState<QualificationCard[]>([]);
  const [search, setSearch] = useState('');
  const [branchId, setBranchId] = useState('all');
  const [selected, setSelected] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [employeeToEdit, setEmployeeToEdit] = useState<Employee | null>(null);
  const [notice, setNotice] = useState('');
  const { canExport, canWrite } = useAuth();
  const [profession, setProfession] = useState('all');
  const [courseFilter, setCourseFilter] = useState('all');
  const [cardFilter, setCardFilter] = useState('all');
  const [validOnly, setValidOnly] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [migrating, setMigrating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [empRes, brRes, crsRes, cardRes] = await Promise.all([
        api.get('/employees'),
        api.get('/branches'),
        api.get('/courses').catch(() => ({ data: [] })),
        api.get('/qualification-cards').catch(() => ({ data: [] })),
      ]);
      setEmployees(empRes.data);
      setBranches(brRes.data);
      setCourses(crsRes.data);
      setCards(cardRes.data);
    } catch (error) {
      console.error('Employees load error', error);
      setNotice('تعذر تحميل بيانات العاملين. تأكد من تشغيل الخادم.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const handleDeleteEmployee = async (employee: Employee) => {
    const confirmed = await confirm({
      title: 'تأكيد الحذف',
      message: `سيتم حذف العامل "${employee.name}" مع جميع الدورات والكروت والمرفقات الخاصة به. هل تريد المتابعة؟`,
      confirmLabel: 'حذف',
    });

    if (!confirmed) return;

    try {
      await api.delete(`/employees/${employee.id}`);
      setSelected(null);
      setNotice(`تم حذف ملف ${employee.name} بالكامل.`);
      showToast(`تم حذف ملف ${employee.name} بنجاح`, 'success');
      await load();
    } catch (error) {
      console.error('Delete employee error', error);
      setNotice('تعذر حذف ملف العامل.');
      showToast('تعذر حذف ملف العامل', 'error');
    }
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    return employees.filter((employee) => {
      const matchesTerm =
        !term ||
        [
          employee.name,
          employee.jobNumber,
          employee.iqamaNumber,
          employee.nationality,
          employee.profession,
          employee.branch?.name,
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term));

      const matchesBranch =
        branchId === 'all' || String(employee.branch?.id) === branchId;

      const matchesProfession =
        profession === 'all' || (employee.profession || '') === profession;
      const now = Date.now();
      const holds = (list: any[] | undefined, idKey: string, id: string) =>
        id === 'all' ||
        (list || []).some(
          (x) =>
            String(x[idKey]) === id &&
            (!validOnly || !x.expiryDate || new Date(x.expiryDate).getTime() >= now),
        );
      return (
        matchesTerm &&
        matchesBranch &&
        matchesProfession &&
        holds(employee.courses, 'courseId', courseFilter) &&
        holds(employee.cards, 'cardId', cardFilter)
      );
    });
  }, [employees, search, branchId, profession, courseFilter, cardFilter, validOnly]);

  const professions = useMemo(
    () => [...new Set(employees.map((e) => e.profession).filter(Boolean))].sort(),
    [employees],
  );

  return (
    <div className="module-page">
      <div className="page-toolbar">
        <div>
          <span className="section-kicker">إدارة الموارد البشرية</span>
          <h1>ملفات العاملين</h1>
          <p>بيانات العاملين، الدورات، الكروت، والمرفقات في ملف واحد.</p>
        </div>

        <div className="filters-inline" style={{ margin: 0 }}>
          {canWrite && (
            <button
              className="primary-button"
              style={{ backgroundColor: '#eab308', color: '#000', border: 'none' }}
              disabled={migrating}
              onClick={async () => {
                setMigrating(true);
                try {
                  const res = await api.post('/bulk-imports/migrate-legacy-cards');
                  showToast(res.data.message, 'success');
                  await load();
                } catch (e: any) {
                  showToast('حدث خطأ أثناء ترحيل الكروت', 'error');
                } finally {
                  setMigrating(false);
                }
              }}
            >
              {migrating ? 'جاري الترحيل...' : 'ترحيل الكروت من الدورات'}
            </button>
          )}
          {canExport && (
            <button className="ghost-button" onClick={() => setShowExport(true)}>
              <Icon name="download" size={17} /> تصدير
            </button>
          )}
          {canExport && (
            <Link className="ghost-button" to="/bulk-import">
              <Icon name="upload" size={17} /> استيراد جماعي
            </Link>
          )}
          {canWrite && (
            <button
              className="primary-button"
              onClick={() => {
                setEmployeeToEdit(null);
                setShowForm(true);
              }}
            >
              <Icon name="plus" size={18} />
              إضافة عامل جديد
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="employee-notice">
          <Icon name="alert" size={16} />
          <span>{notice}</span>
          <button onClick={() => setNotice('')} aria-label="إغلاق">
            ×
          </button>
        </div>
      )}

      <section className="panel-card employee-list-card">
        <div className="filters-bar employee-filters">
          <div className="search-box">
            <Icon name="search" size={19} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم الوظيفي أو الإقامة..."
            />
          </div>

          <label className="select-box">
            <Icon name="branch" size={18} />
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)}>
              <option value="all">كل الفروع</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={15} />
          </label>

          <button
            className={`ghost-button ${showAdvanced ? 'active' : ''}`}
            onClick={() => setShowAdvanced((v) => !v)}
            type="button"
          >
            <Icon name="filter" size={16} /> فلاتر متقدمة
          </button>

          <div className="employee-results-badge">
            <strong>{filtered.length}</strong>
            <span>نتيجة</span>
          </div>
        </div>

        {showAdvanced && (
          <div className="filters-inline advanced-filters">
            <select value={profession} onChange={(e) => setProfession(e.target.value)}>
              <option value="all">كل المهن</option>
              {professions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
            <select value={courseFilter} onChange={(e) => setCourseFilter(e.target.value)}>
              <option value="all">أي دورة</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  يمتلك: {c.name}
                </option>
              ))}
            </select>
            <select value={cardFilter} onChange={(e) => setCardFilter(e.target.value)}>
              <option value="all">أي كرت</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  يمتلك: {c.name}
                </option>
              ))}
            </select>
            <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={validOnly}
                onChange={(e) => setValidOnly(e.target.checked)}
              />{' '}
              السارية فقط
            </label>
            <button
              className="ghost-button"
              type="button"
              onClick={() => {
                setProfession('all');
                setCourseFilter('all');
                setCardFilter('all');
                setBranchId('all');
                setSearch('');
              }}
            >
              مسح الفلاتر
            </button>
          </div>
        )}

        <div className="result-line">
          <span>
            عرض <strong>{filtered.length}</strong> من <strong>{employees.length}</strong> عامل
          </span>
          <span>{loading ? 'جاري التحميل...' : 'آخر تحديث: الآن'}</span>
        </div>

        <div className="table-wrap">
          <table className="data-table employees-table">
            <thead>
              <tr>
                <th>العامل</th>
                <th>رقم الإقامة</th>
                <th>الرقم الوظيفي</th>
                <th>الجنسية</th>
                <th>المهنة</th>
                <th>الفرع</th>
                <th>الوثائق</th>
                <th>الحالة</th>
                <th className="actions-head">الإجراءات</th>
              </tr>
            </thead>

            <tbody>
              {filtered.map((employee) => {
                const att = attendanceMap[employee.attendanceStatus || 'present'] || attendanceMap.present;
                return (
                  <tr key={employee.id}>
                    <td>
                      <div className="person-cell">
                        <div className="person-mini-avatar">{initials(employee.name)}</div>
                        <div>
                          <strong>{employee.name}</strong>
                        </div>
                      </div>
                    </td>

                    <td>
                      <span className="iqama-cell">{employee.iqamaNumber || '—'}</span>
                    </td>
                    <td>{employee.jobNumber || '—'}</td>
                    <td>{employee.nationality || '—'}</td>
                    <td>{employee.profession || '—'}</td>
                    <td>{employee.branch?.name || '—'}</td>
                    <td>
                      <span className="document-count-pill">
                        <Icon name="card" size={14} />
                        {(employee.documents?.length ?? 0) +
                          (employee.courses?.length ?? 0) +
                          (employee.cards?.length ?? 0)}
                      </span>
                    </td>

                    <td>
                      <span className={`status-badge ${att.badge}`}>
                        <span className="status-dot" />
                        {att.label}
                      </span>
                    </td>

                    <td>
                      <div className="row-actions">
                        <button
                          onClick={() => setSelected(employee)}
                          className="action-btn blue"
                          title="فتح ملف العامل"
                        >
                          <Icon name="eye" size={16} />
                        </button>

                        <button
                          onClick={() => {
                            setEmployeeToEdit(employee);
                            setShowForm(true);
                          }}
                          className="action-btn green"
                          title="تعديل البيانات"
                        >
                          <Icon name="edit" size={16} />
                        </button>

                        <button
                          onClick={() => void handleDeleteEmployee(employee)}
                          className="action-btn red"
                          title="حذف العامل"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {loading && <div className="loading-state">جاري تحميل بيانات العاملين...</div>}

          {!loading && filtered.length === 0 && (
            <div className="empty-state large">لا توجد نتائج مطابقة لخيارات البحث الحالية.</div>
          )}
        </div>
      </section>

      {selected && (
        <EmployeeDrawer
          employee={selected}
          courses={courses}
          cards={cards}
          onClose={() => setSelected(null)}
          onEdit={() => {
            setEmployeeToEdit(selected);
            setSelected(null);
            setShowForm(true);
          }}
          onDelete={() => void handleDeleteEmployee(selected)}
          onUpdated={async () => {
            await load();
          }}
        />
      )}

      {showForm && (
        <EmployeeForm
          branches={branches}
          courses={courses}
          cards={cards}
          initialData={employeeToEdit}
          onClose={() => setShowForm(false)}
          onSaved={load}
        />
      )}

      {showExport && (
        <ExportModal
          branches={branches}
          visibleIds={filtered.map((e) => e.id)}
          currentBranch={branchId}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

function EmployeeDrawer({
  employee,
  courses,
  cards,
  onClose,
  onEdit,
  onDelete,
  onUpdated,
}: {
  employee: Employee;
  courses: Course[];
  cards: QualificationCard[];
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onUpdated: () => Promise<void>;
}) {
  const { confirm, showToast } = useFeedback();
  const [details, setDetails] = useState<Employee | null>(null);
  const [showCourse, setShowCourse] = useState(false);
  const [showCard, setShowCard] = useState(false);
  const [editingCourse, setEditingCourse] = useState<EmployeeCourse | null>(null);
  const [editingCard, setEditingCard] = useState<EmployeeCard | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'documents'>('overview');

  const loadDetails = async () => {
    try {
      const response = await api.get(`/employees/${employee.id}`);
      setDetails(response.data);
    } catch (error) {
      console.error('Employee details load error', error);
      setDetails(employee);
    }
  };

  useEffect(() => {
    void loadDetails();
  }, [employee]);

  const data = details || employee;
  const att = attendanceMap[data.attendanceStatus || 'present'] || attendanceMap.present;

  const deleteCourse = async (course: EmployeeCourse) => {
    const ok = await confirm({
      message: `سيتم حذف سجل الدورة "${course.course?.name || ''}" نهائياً. هل تريد المتابعة؟`,
    });
    if (!ok) return;

    try {
      await api.delete(`/employee-courses/${course.id}`);
      showToast('تم حذف الدورة بنجاح', 'success');
      await loadDetails();
      await onUpdated();
    } catch (error) {
      showToast('تعذر حذف الدورة', 'error');
    }
  };

  const deleteCard = async (card: EmployeeCard) => {
    const ok = await confirm({
      message: `سيتم حذف الكرت "${card.card?.name || ''}" نهائياً. هل تريد المتابعة؟`,
    });
    if (!ok) return;

    try {
      await api.delete(`/employee-cards/${card.id}`);
      showToast('تم حذف الكرت بنجاح', 'success');
      await loadDetails();
      await onUpdated();
    } catch (error) {
      showToast('تعذر حذف الكرت', 'error');
    }
  };

  const courseAndCardAttachments = [
    ...(data.courses || [])
      .filter((c) => c.attachment)
      .map((c) => ({
        id: `course-${c.id}`,
        title: `شهادة دورة: ${c.course?.name || 'دورة تدريبية'}`,
        expiryDate: c.expiryDate,
        path: c.attachment!,
      })),
    ...(data.cards || [])
      .filter((c) => c.attachment)
      .map((c) => ({
        id: `card-${c.id}`,
        title: `مرفق كرت: ${c.card?.name || 'كرت تأهيل'}`,
        expiryDate: c.expiryDate,
        path: c.attachment!,
      })),
  ];

  return (
    <div className="overlay overlay-center">
      <button className="overlay-dismiss" onClick={onClose} aria-label="إغلاق" />

      <aside
        className="drawer employee-drawer full-screen"
        style={{ overflowY: 'auto', maxHeight: '92vh', paddingBottom: 32 }}
      >
        <div className="drawer-head" style={{ borderBottom: 'none', paddingBottom: '0' }}>
          <div>
            <span className="section-kicker">الملف الإلكتروني للعامل</span>
            <h2>{data.name}</h2>
          </div>

          <div className="drawer-head-actions">
            <button className="icon-button" onClick={onEdit} title="تعديل بيانات العامل">
              <Icon name="edit" size={18} />
            </button>
            <button className="icon-button danger-icon" onClick={onDelete} title="حذف العامل">
              <Icon name="trash" size={18} />
            </button>
            <button className="icon-button" onClick={onClose} title="إغلاق">
              <Icon name="close" size={20} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: '20px', borderBottom: '1px solid #e2e8f0', padding: '0 24px', marginBottom: '24px' }}>
          <button
            onClick={() => setActiveTab('overview')}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 4px',
              fontSize: '15px',
              fontWeight: activeTab === 'overview' ? '600' : '400',
              color: activeTab === 'overview' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'overview' ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            المعلومات العامة والدورات
          </button>
          <button
            onClick={() => setActiveTab('documents')}
            style={{
              background: 'none',
              border: 'none',
              padding: '12px 4px',
              fontSize: '15px',
              fontWeight: activeTab === 'documents' ? '600' : '400',
              color: activeTab === 'documents' ? '#2563eb' : '#64748b',
              borderBottom: activeTab === 'documents' ? '2px solid #2563eb' : '2px solid transparent',
              cursor: 'pointer',
            }}
          >
            المرفقات والأرشيف
          </button>
        </div>

        <div style={{ padding: '0 24px' }}>
          
          {/* Tab 1: Overview */}
          {activeTab === 'overview' && (
            <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
              <div className="section-title-row" style={{ marginBottom: 14 }}>
                <h3 style={{ margin: 0, fontSize: '18px', color: '#1e293b' }}>المعلومات العامة</h3>
                <span className={`status-badge ${att.badge}`}>
                  <span className="status-dot" />
                  {att.label}
                </span>
              </div>

              <div className="detail-grid employee-detail-grid">
                <Detail label="اسم العامل" value={data.name} icon="users" />
                <Detail label="الرقم الوظيفي" value={data.jobNumber || '—'} icon="id" />
                <Detail label="رقم الإقامة" value={data.iqamaNumber || '—'} icon="card" />
                <Detail label="الجنسية" value={data.nationality || '—'} icon="id" />
                <Detail label="مهنة العامل" value={data.profession || '—'} icon="briefcase" />
                <Detail label="الفرع التابع له" value={data.branch?.name || '—'} icon="branch" />
                <Detail label="حالة العامل" value={att.label} icon="check" />
                <Detail label="رقم الجوال" value={data.phone || '—'} icon="briefcase" />
                <Detail label="تاريخ التعيين" value={formatDate(data.hireDate)} icon="calendar" />
              </div>

              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginTop: 32,
                  marginBottom: 20,
                  background: '#f8fafc',
                  padding: '16px',
                  borderRadius: '12px',
                  border: '1px solid #e2e8f0'
                }}
              >
                <h3 style={{ margin: 0, fontSize: '16px', color: '#1e293b' }}>إدارة الدورات والكروت</h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="secondary-button"
                    onClick={() => { setEditingCourse(null); setShowCourse(true); }}
                  >
                    <Icon name="plus" size={16} /> إضافة دورة
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => { setEditingCard(null); setShowCard(true); }}
                  >
                    <Icon name="plus" size={16} /> إضافة كرت
                  </button>
                </div>
              </div>

              <h4 style={{ margin: '16px 0 12px', color: '#334155', fontSize: '15px' }}>
                الدورات التدريبية ({(data.courses || []).length})
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '24px' }}>
                {(data.courses || []).length === 0 ? (
                  <div className="empty-inline">لا توجد دورات مسجلة لهذا العامل.</div>
                ) : (
                  (data.courses || []).map((item) => {
                    const status = getStatus(item.expiryDate);
                    const meta = statusMeta(status);
                    return (
                      <div key={item.id} style={{ display: 'flex', gap: '16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{ flexShrink: 0, width: '48px', height: '48px', borderRadius: '10px', background: '#f0f9ff', color: '#0ea5e9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="book" size={24} />
                        </div>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ display: 'block', fontSize: '15px', color: '#0f172a', marginBottom: '4px' }}>{item.course?.name || 'دورة تدريبية'}</strong>
                              <span style={{ fontSize: '13px', color: '#64748b' }}>{item.course?.code || '—'}</span>
                            </div>
                            <span className={`status-badge ${meta.badge}`} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px' }}>{meta.label}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '13px', color: '#475569', flexWrap: 'wrap' }}>
                            <span>تاريخ الدورة: {formatDate(item.courseDate)}</span>
                            <span style={{ fontWeight: '600' }}>تاريخ الانتهاء: {formatDate(item.expiryDate)}</span>
                            {item.certificateNumber && <span>رقم الشهادة: {item.certificateNumber}</span>}
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                            {item.attachment && (
                              <button className="ghost-button" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => window.open(fileUrl(`/download?path=${encodeURIComponent(item.attachment || '')}`), '_blank')}>
                                المرفق
                              </button>
                            )}
                            <button className="ghost-button" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => { setEditingCourse(item); setShowCourse(true); }}>تعديل</button>
                            <button className="ghost-button" style={{ padding: '6px 12px', fontSize: '13px', color: '#ef4444' }} onClick={() => void deleteCourse(item)}>حذف</button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              <h4 style={{ margin: '16px 0 12px', color: '#334155', fontSize: '15px' }}>
                الكروت ({(data.cards || []).length})
              </h4>
              
              <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                {(data.cards || []).length === 0 ? (
                  <div className="empty-inline">لا توجد كروت مسجلة لهذا العامل.</div>
                ) : (
                  (data.cards || []).map((item) => {
                    const status = getStatus(item.expiryDate);
                    const meta = statusMeta(status);
                    return (
                      <div key={item.id} style={{ display: 'flex', gap: '16px', background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)' }}>
                        <div style={{ flexShrink: 0, width: '48px', height: '48px', borderRadius: '10px', background: '#f5f3ff', color: '#8b5cf6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Icon name="card" size={24} />
                        </div>
                        <div style={{ flexGrow: 1 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div>
                              <strong style={{ display: 'block', fontSize: '15px', color: '#0f172a', marginBottom: '4px' }}>{item.card?.name || 'كرت تأهيل'}</strong>
                              <span style={{ fontSize: '13px', color: '#64748b' }}>{item.card?.code || '—'}</span>
                            </div>
                            <span className={`status-badge ${meta.badge}`} style={{ padding: '4px 10px', borderRadius: '6px', fontSize: '12px' }}>{meta.label}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '20px', marginTop: '12px', fontSize: '13px', color: '#475569', flexWrap: 'wrap' }}>
                            <span>رقم الكرت: {item.cardNumber || '—'}</span>
                            <span>تاريخ الإصدار: {formatDate(item.issueDate)}</span>
                            <span style={{ fontWeight: '600' }}>تاريخ الانتهاء: {formatDate(item.expiryDate)}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                            {item.attachment && (
                              <button className="ghost-button" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => window.open(fileUrl(`/download?path=${encodeURIComponent(item.attachment || '')}`), '_blank')}>
                                المرفق
                              </button>
                            )}
                            <button className="ghost-button" style={{ padding: '6px 12px', fontSize: '13px' }} onClick={() => { setEditingCard(item); setShowCard(true); }}>تعديل</button>
                            <button className="ghost-button" style={{ padding: '6px 12px', fontSize: '13px', color: '#ef4444' }} onClick={() => void deleteCard(item)}>حذف</button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* Tab 3: Documents */}
          {activeTab === 'documents' && (
            <div style={{ animation: 'fadeIn 0.3s ease-in-out' }}>
              <DocumentsPanel
                employeeId={employee.id}
                employeeName={data.name}
                onChanged={async () => {
                  await loadDetails();
                  await onUpdated();
                }}
              />

              {courseAndCardAttachments.length > 0 && (
                <div style={{ marginTop: 32 }}>
                  <h4 style={{ margin: '0 0 16px', color: '#334155', fontSize: '15px' }}>
                    مرفقات الدورات والكروت ({courseAndCardAttachments.length})
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px' }}>
                    {courseAndCardAttachments.map((attItem) => (
                      <div key={attItem.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px' }}>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                           <div style={{ color: '#0ea5e9' }}><Icon name="card" size={20} /></div>
                           <div>
                              <strong style={{ display: 'block', fontSize: '14px', color: '#0f172a' }}>{attItem.title}</strong>
                              <span style={{ fontSize: '12px', color: '#64748b' }}>تاريخ الانتهاء: {formatDate(attItem.expiryDate)}</span>
                           </div>
                        </div>
                        <button
                          className="secondary-button"
                          style={{ padding: '6px 12px', fontSize: '13px' }}
                          onClick={() => window.open(fileUrl(`/download?path=${encodeURIComponent(attItem.path)}`), '_blank')}
                        >
                          عرض الملف
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Modals */}
        {showCourse && (
          <CourseAssignmentModal
            employeeId={employee.id}
            staticCourses={APPROVED_COURSES}
            initialData={editingCourse}
            onClose={() => {
              setShowCourse(false);
              setEditingCourse(null);
            }}
            onSaved={async () => {
              await loadDetails();
              await onUpdated();
            }}
          />
        )}

        {showCard && (
          <CardAssignmentModal
            employeeId={employee.id}
            staticCards={TECHNICAL_CARDS}
            initialData={editingCard}
            onClose={() => {
              setShowCard(false);
              setEditingCard(null);
            }}
            onSaved={async () => {
              await loadDetails();
              await onUpdated();
            }}
          />
        )}
      </aside>
    </div>
  );
}

function Detail({ label, value, icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="detail-item">
      <span className="detail-icon">
        <Icon name={icon} size={17} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  required = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}

function EmployeeForm({
  branches,
  courses,
  cards,
  initialData,
  onClose,
  onSaved,
}: {
  branches: Branch[];
  courses: Course[];
  cards: QualificationCard[];
  initialData: Employee | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);

  const [form, setForm] = useState({
    internalNumber: initialData?.internalNumber || '',
    jobNumber: initialData?.jobNumber || '',
    name: initialData?.name || '',
    iqamaNumber: initialData?.iqamaNumber || '',
    nationality: initialData?.nationality || '',
    attendanceStatus: initialData?.attendanceStatus || 'present',
    phone: initialData?.phone || '',
    profession: initialData?.profession || '',
    branchId:
      initialData?.branch?.id?.toString() || initialData?.branchId?.toString() || '',
    hireDate: initialData?.hireDate
      ? new Date(initialData.hireDate).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
  });

  const [courseCode, setCourseCode] = useState('');
  const [courseDate, setCourseDate] = useState('');
  const [courseExpiry, setCourseExpiry] = useState('');
  const [courseFile, setCourseFile] = useState<File | null>(null);

  const [cardCode, setCardCode] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [cardIssueDate, setCardIssueDate] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardFile, setCardFile] = useState<File | null>(null);

  const [generalFiles, setGeneralFiles] = useState<FileList | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const update = (key: keyof typeof form, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const payload = {
        ...form,
        internalNumber: form.internalNumber || form.jobNumber,
        branchId: Number(form.branchId),
      };

      let empId = initialData?.id;

      if (isEdit && initialData) {
        await api.put(`/employees/${initialData.id}`, payload);
      } else {
        const res = await api.post('/employees', payload);
        empId = res.data.id;
      }

      if (empId && courseCode && courseExpiry) {
        const cData = new FormData();
        const foundStatic = APPROVED_COURSES.find((c) => c.code === courseCode);
        cData.append('courseCode', courseCode);
        cData.append('courseName', foundStatic?.name || courseCode);
        cData.append('courseDate', courseDate || new Date().toISOString().split('T')[0]);
        cData.append('expiryDate', courseExpiry);
        if (courseFile) cData.append('file', courseFile);
        await api.post(`/employees/${empId}/courses`, cData).catch((e) => console.error(e));
      }

      if (empId && cardCode && cardExpiry) {
        const kData = new FormData();
        const foundStaticCard = TECHNICAL_CARDS.find((c) => c.code === cardCode);
        kData.append('cardCode', cardCode);
        kData.append('cardName', foundStaticCard?.name || cardCode);
        kData.append('cardNumber', cardNumber || '—');
        kData.append('issueDate', cardIssueDate || new Date().toISOString().split('T')[0]);
        kData.append('expiryDate', cardExpiry);
        if (cardFile) kData.append('file', cardFile);
        await api.post(`/employees/${empId}/cards`, kData).catch((e) => console.error(e));
      }

      if (empId && generalFiles && generalFiles.length > 0) {
        const catRes = await api.get('/document-categories').catch(() => ({ data: [] }));
        const defaultCatId = catRes.data?.[0]?.id || 1;
        for (const f of Array.from(generalFiles)) {
          const dData = new FormData();
          dData.append('file', f);
          dData.append('categoryId', String(defaultCatId));
          dData.append('title', f.name);
          await api.post(`/employees/${empId}/documents`, dData).catch((e) => console.error(e));
        }
      }

      await onSaved();
      showToast(isEdit ? 'تم حفظ التعديلات بنجاح' : 'تم إضافة العامل وجميع بياناته بنجاح', 'success');
      onClose();
    } catch (err: any) {
      console.error('Save employee error', err);
      setError(
        err?.response?.data?.message || 'تعذر حفظ بيانات العامل. راجع البيانات وحاول مرة أخرى.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay">
      <button className="overlay-dismiss" onClick={onClose} aria-label="إغلاق" />

      <section
        className="modal-card large-modal employee-form-modal"
        style={{ maxHeight: '90vh', overflowY: 'auto' }}
      >
        <div className="drawer-head">
          <div>
            <span className="section-kicker">{isEdit ? 'تحديث الملف' : 'سجل جديد'}</span>
            <h2>{isEdit ? 'تعديل بيانات العامل' : 'إضافة عامل جديد بجميع بياناته'}</h2>
          </div>

          <button className="icon-button" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="form-grid">
          <h4 style={{ gridColumn: '1 / -1', margin: '4px 0', color: '#1e293b' }}>
            1. المعلومات العامة
          </h4>

          <Field
            label="اسم العامل"
            value={form.name}
            onChange={(v) => update('name', v)}
            required
          />
          <Field
            label="الرقم الوظيفي"
            value={form.jobNumber}
            onChange={(v) => update('jobNumber', v)}
            required
          />
          <Field
            label="رقم الإقامة"
            value={form.iqamaNumber}
            onChange={(v) => update('iqamaNumber', v)}
            required
          />
          <Field
            label="الجنسية"
            value={form.nationality}
            onChange={(v) => update('nationality', v)}
          />
          <Field
            label="مهنة العامل"
            value={form.profession}
            onChange={(v) => update('profession', v)}
            required
          />

          <label className="form-field">
            <span>الفرع التابع له</span>
            <select
              value={form.branchId}
              onChange={(e) => update('branchId', e.target.value)}
              required
            >
              <option value="">اختر الفرع</option>
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </label>

          <label className="form-field">
            <span>حالة العامل</span>
            <select
              value={form.attendanceStatus}
              onChange={(e) => update('attendanceStatus', e.target.value)}
            >
              <option value="present">حاضر</option>
              <option value="absent">متغيب</option>
              <option value="final_exit">خروج نهائي</option>
            </select>
          </label>

          <Field
            label="رقم الجوال"
            value={form.phone}
            onChange={(v) => update('phone', v)}
          />
          <Field
            label="تاريخ التعيين"
            type="date"
            value={form.hireDate}
            onChange={(v) => update('hireDate', v)}
            required
          />

          <h4 style={{ gridColumn: '1 / -1', margin: '12px 0 4px', color: '#1e293b' }}>
            2. إضافة دورة تدريبية (اختياري)
          </h4>

          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>اسم الدورة</span>
            <select value={courseCode} onChange={(e) => setCourseCode(e.target.value)}>
              <option value="">— اختر دورة —</option>
              {APPROVED_COURSES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>

          <Field
            label="تاريخ الدورة"
            type="date"
            value={courseDate}
            onChange={setCourseDate}
            disabled={!courseCode}
          />
          <Field
            label="تاريخ انتهاء الدورة"
            type="date"
            value={courseExpiry}
            onChange={setCourseExpiry}
            disabled={!courseCode}
          />
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>مرفق شهادة الدورة</span>
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={!courseCode}
              onChange={(e) => setCourseFile(e.target.files?.[0] || null)}
            />
          </label>

          <h4 style={{ gridColumn: '1 / -1', margin: '12px 0 4px', color: '#1e293b' }}>
            3. إضافة كرت (اختياري)
          </h4>

          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>اسم الكرت</span>
            <select value={cardCode} onChange={(e) => setCardCode(e.target.value)}>
              <option value="">— اختر كرت —</option>
              {TECHNICAL_CARDS.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} — {c.name}
                </option>
              ))}
            </select>
          </label>

          <Field label="رقم الكرت (اختياري)" value={cardNumber} onChange={setCardNumber} disabled={!cardCode} />
          <Field
            label="تاريخ إصدار الكرت"
            type="date"
            value={cardIssueDate}
            onChange={setCardIssueDate}
            disabled={!cardCode}
          />
          <Field
            label="تاريخ انتهاء الكرت"
            type="date"
            value={cardExpiry}
            onChange={setCardExpiry}
            disabled={!cardCode}
          />
          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>مرفق الكرت</span>
            <input
              type="file"
              accept="image/*,.pdf"
              disabled={!cardCode}
              onChange={(e) => setCardFile(e.target.files?.[0] || null)}
            />
          </label>

          <h4 style={{ gridColumn: '1 / -1', margin: '12px 0 4px', color: '#1e293b' }}>
            4. المرفقات العامة (الإقامة، الجواز، المؤهل)
          </h4>

          <label className="form-field" style={{ gridColumn: '1 / -1' }}>
            <span>اختر ملفاً أو أكثر لرفعه مع ملف العامل</span>
            <input
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => setGeneralFiles(e.target.files)}
            />
          </label>

          {error && (
            <div className="form-error" style={{ gridColumn: '1 / -1' }}>
              {error}
            </div>
          )}

          <div className="form-actions" style={{ gridColumn: '1 / -1' }}>
            <button type="button" className="ghost-button" onClick={onClose}>
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديلات' : 'حفظ العامل وجميع البيانات'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CourseAssignmentModal({
  employeeId,
  staticCourses,
  initialData,
  onClose,
  onSaved,
}: {
  employeeId: number;
  staticCourses: { code: string; name: string }[];
  initialData: EmployeeCourse | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);

  const [form, setForm] = useState({
    courseId: initialData?.courseId?.toString() || '',
    courseCode: initialData?.course?.code || '',
    courseDate: initialData?.courseDate
      ? new Date(initialData.courseDate).toISOString().split('T')[0]
      : '',
    expiryDate: initialData?.expiryDate
      ? new Date(initialData.expiryDate).toISOString().split('T')[0]
      : '',
    certificateNumber: initialData?.certificateNumber || '',
  });

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('courseDate', form.courseDate);
      formData.append('expiryDate', form.expiryDate);
      formData.append('certificateNumber', form.certificateNumber);

      if (file) {
        formData.append('file', file);
      }

      const selectedCourse = staticCourses.find((course) => course.code === form.courseCode);
      if (selectedCourse) {
        formData.append('courseCode', selectedCourse.code);
        formData.append('courseName', selectedCourse.name);
      } else {
        formData.append('courseId', form.courseId || String(initialData?.courseId || ''));
      }

      if (isEdit && initialData) {
        await api.put(`/employee-courses/${initialData.id}`, formData);
      } else {
        await api.post(`/employees/${employeeId}/courses`, formData);
      }

      await onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات الدورة بنجاح' : 'تم إضافة الدورة بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ الدورة.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay nested-overlay">
      <button className="overlay-dismiss" onClick={onClose} aria-label="إغلاق" />

      <section className="modal-card">
        <div className="drawer-head">
          <div>
            <span className="section-kicker">التأهيل والتدريب</span>
            <h2>{isEdit ? 'تعديل سجل الدورة' : 'إضافة دورة للعامل'}</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="form-grid single-column-form">
          <label className="form-field">
            <span>نوع الدورة</span>
            <select
              value={form.courseCode || form.courseId}
              onChange={(e) => setForm((prev) => ({ ...prev, courseCode: e.target.value, courseId: e.target.value }))}
              required
            >
              <option value="">اختر الدورة</option>
              {staticCourses.map((course) => (
                <option key={course.code} value={course.code}>
                  {course.code} — {course.name}
                </option>
              ))}
              {isEdit && initialData && !staticCourses.some(s => s.code === initialData?.course?.code) && (
                 <option value={initialData.courseId}>{initialData.course?.code} — {initialData.course?.name}</option>
              )}
            </select>
          </label>

          <div className="form-row-two">
            <Field
              label="تاريخ الدورة"
              type="date"
              value={form.courseDate}
              onChange={(value) => setForm((prev) => ({ ...prev, courseDate: value }))}
              required
            />
            <Field
              label="تاريخ الانتهاء"
              type="date"
              value={form.expiryDate}
              onChange={(value) => setForm((prev) => ({ ...prev, expiryDate: value }))}
              required
            />
          </div>

          <Field
            label="رقم شهادة الدورة (اختياري)"
            value={form.certificateNumber}
            onChange={(value) => setForm((prev) => ({ ...prev, certificateNumber: value }))}
          />

          <label className="file-dropzone">
            <div>
              <Icon name="card" size={22} />
              <strong>{file ? file.name : 'أرفق شهادة الدورة هنا'}</strong>
            </div>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              hidden
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديل' : 'إضافة الدورة'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function CardAssignmentModal({
  employeeId,
  staticCards,
  initialData,
  onClose,
  onSaved,
}: {
  employeeId: number;
  staticCards: { code: string; name: string }[];
  initialData: EmployeeCard | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useFeedback();
  const isEdit = Boolean(initialData);

  const [form, setForm] = useState({
    cardId: initialData?.cardId?.toString() || '',
    cardCode: initialData?.card?.code || '',
    cardNumber: initialData?.cardNumber || '',
    issueDate: initialData?.issueDate
      ? new Date(initialData.issueDate).toISOString().split('T')[0]
      : '',
    expiryDate: initialData?.expiryDate
      ? new Date(initialData.expiryDate).toISOString().split('T')[0]
      : '',
  });

  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('cardNumber', form.cardNumber || '—');
      formData.append('issueDate', form.issueDate);
      formData.append('expiryDate', form.expiryDate);

      if (file) {
        formData.append('file', file);
      }

      const selectedCard = staticCards.find((card) => card.code === form.cardCode);
      if (selectedCard) {
        formData.append('cardCode', selectedCard.code);
        formData.append('cardName', selectedCard.name);
      } else {
        formData.append('cardId', form.cardId || String(initialData?.cardId || ''));
      }

      if (isEdit && initialData) {
        await api.put(`/employee-cards/${initialData.id}`, formData);
      } else {
        await api.post(`/employees/${employeeId}/cards`, formData);
      }

      await onSaved();
      showToast(isEdit ? 'تم حفظ تعديلات الكرت بنجاح' : 'تم إضافة الكرت بنجاح', 'success');
      onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'تعذر حفظ الكرت.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay nested-overlay">
      <button className="overlay-dismiss" onClick={onClose} aria-label="إغلاق" />

      <section className="modal-card">
        <div className="drawer-head">
          <div>
            <span className="section-kicker">الاختبارات والتأهيل</span>
            <h2>{isEdit ? 'تعديل كرت الاختبار' : 'إضافة كرت للعامل'}</h2>
          </div>

          <button className="icon-button" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>

        <form onSubmit={submit} className="form-grid single-column-form">
          <label className="form-field">
            <span>نوع الكرت</span>
            <select
              value={form.cardCode || form.cardId}
              onChange={(e) => setForm((prev) => ({ ...prev, cardCode: e.target.value, cardId: e.target.value }))}
              required
            >
              <option value="">اختر الكرت</option>
              {staticCards.map((card) => (
                <option key={card.code} value={card.code}>
                  {card.code} — {card.name}
                </option>
              ))}
              {isEdit && initialData && !staticCards.some(s => s.code === initialData?.card?.code) && (
                 <option value={initialData.cardId}>{initialData.card?.code} — {initialData.card?.name}</option>
              )}
            </select>
          </label>

          <Field
            label="رقم الكرت (اختياري)"
            value={form.cardNumber}
            onChange={(value) => setForm((prev) => ({ ...prev, cardNumber: value }))}
          />

          <div className="form-row-two">
            <Field
              label="تاريخ الإصدار"
              type="date"
              value={form.issueDate}
              onChange={(value) => setForm((prev) => ({ ...prev, issueDate: value }))}
              required
            />
            <Field
              label="تاريخ الانتهاء"
              type="date"
              value={form.expiryDate}
              onChange={(value) => setForm((prev) => ({ ...prev, expiryDate: value }))}
              required
            />
          </div>

          <label className="file-dropzone">
            <div>
              <Icon name="card" size={22} />
              <strong>{file ? file.name : 'أرفق صورة أو ملف الكرت'}</strong>
            </div>
            <input
              type="file"
              accept="image/*,.pdf,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              hidden
            />
          </label>

          {error && <div className="form-error">{error}</div>}

          <div className="form-actions">
            <button type="button" className="ghost-button" onClick={onClose}>
              إلغاء
            </button>
            <button className="primary-button" disabled={saving}>
              {saving ? 'جاري الحفظ...' : isEdit ? 'حفظ التعديل' : 'إضافة الكرت'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function ExportModal({
  branches,
  visibleIds,
  currentBranch,
  onClose,
}: {
  branches: Branch[];
  visibleIds: number[];
  currentBranch: string;
  onClose: () => void;
}) {
  const { showToast } = useFeedback();
  const [scope, setScope] = useState<'all' | 'branch' | 'visible'>(
    currentBranch !== 'all' ? 'branch' : 'all',
  );
  const [branch, setBranch] = useState(
    currentBranch !== 'all' ? currentBranch : branches[0] ? String(branches[0].id) : '',
  );
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const body =
        scope === 'branch'
          ? { branchId: Number(branch) }
          : scope === 'visible'
            ? { employeeIds: visibleIds }
            : {};
      await downloadBlob(
        () => api.post('/documents/export', body, { responseType: 'blob', timeout: 0 }),
        'ملفات-العاملين.zip',
      );
      showToast('تم تجهيز الأرشيف وتنزيله بنجاح', 'success');
      onClose();
    } catch (e) {
      showToast(await errorMessage(e, 'تعذر تجهيز الأرشيف'), 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="overlay overlay-center">
      <button className="overlay-dismiss" onClick={onClose} aria-label="إغلاق" />
      <section className="modal-card">
        <div className="drawer-head">
          <div>
            <span className="section-kicker">ملف ZIP + فهرس Excel</span>
            <h2>تصدير ملفات العاملين</h2>
          </div>
          <button className="icon-button" onClick={onClose}>
            <Icon name="close" size={20} />
          </button>
        </div>
        <div className="form-grid single" style={{ gap: 12, marginTop: 14 }}>
          <label className="export-option">
            <input type="radio" checked={scope === 'all'} onChange={() => setScope('all')} /> كل
            العاملين
          </label>
          <label className="export-option">
            <input
              type="radio"
              checked={scope === 'branch'}
              onChange={() => setScope('branch')}
            />{' '}
            فرع محدد
            <select
              disabled={scope !== 'branch'}
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label className="export-option">
            <input
              type="radio"
              checked={scope === 'visible'}
              onChange={() => setScope('visible')}
            />{' '}
            العاملون الظاهرون حالياً في القائمة ({visibleIds.length})
          </label>
          <div className="form-actions">
            <button className="ghost-button" onClick={onClose} disabled={busy}>
              إلغاء
            </button>
            <button className="primary-button" onClick={run} disabled={busy}>
              {busy ? 'جارٍ تجهيز الأرشيف...' : 'تجهيز وتنزيل'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}