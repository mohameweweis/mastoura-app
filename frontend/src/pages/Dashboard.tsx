import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import api from '../services/api';
import Icon from '../components/Icons';
import { useFeedback } from '../components/Feedback';

interface Employee {
  id: number;
  name: string;
  jobNumber: string;
  profession: string;
  branch?: { id: number; name: string } | null;
}

interface Branch {
  id: number;
  name: string;
  code: string;
}

interface CourseBreakdown {
  code: string;
  name: string;
  valid: number;
  expiringSoon: number;
  expired: number;
}

interface NearestExpiring {
  employeeName: string;
  type: string;
  label: string;
  expiryDate: string;
}

interface Summary {
  employees: number;
  branches: number;
  drivers: number;
  equipment: number;
  courses: number;
  cards: number;
  expiredCourses: number;
  expiringCourses: number;
  expiredCards: number;
  expiringCards: number;
  expiredLicenses: number;
  expiringLicenses: number;
  courseBreakdown: CourseBreakdown[];
  nearestExpiring: NearestExpiring[];
}

const emptySummary: Summary = {
  employees: 0, branches: 0, drivers: 0, equipment: 0, courses: 0, cards: 0,
  expiredCourses: 0, expiringCourses: 0, expiredCards: 0, expiringCards: 0,
  expiredLicenses: 0, expiringLicenses: 0, courseBreakdown: [], nearestExpiring: [],
};

const DONUT_COLORS = ['#2b6fd8', '#22a06b', '#e99a22', '#7951c7', '#e04d5f', '#0ea5b0'];

export default function Dashboard() {
  const { showToast, confirm } = useFeedback();
  const importInputRef = useRef<HTMLInputElement>(null);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [apiConnected, setApiConnected] = useState<boolean | null>(null);
  const [importing, setImporting] = useState(false);
  const [ops, setOps] = useState<{ activeProjects: number; totalProjects: number; activeAssignments: number; unassignedWorkers: number; permitsActive: number; permitsExpiring: number; permitsExpired: number } | null>(null);
  const [exporting, setExporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [healthRes, empRes, branchRes] = await Promise.all([
        api.get('/health'),
        api.get('/employees'),
        api.get('/branches'),
      ]);

      setApiConnected(healthRes.data?.status === 'OK');
      setEmployees(empRes.data);
      setBranches(branchRes.data);

      try {
        const summaryRes = await api.get('/dashboard/summary');
        setSummary({ ...emptySummary, ...summaryRes.data });
      } catch {
        setSummary((current) => ({ ...current, employees: empRes.data.length, branches: branchRes.data.length }));
      }
    } catch (error) {
      console.error('Dashboard load error', error);
      setApiConnected(false);
      setEmployees([]);
      setBranches([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    api.get('/projects/summary').then((r) => setOps(r.data)).catch(() => setOps(null));
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latestEmployees = useMemo(() => employees.slice(0, 5), [employees]);

  const branchStats = useMemo(() => {
    return branches
      .map((branch) => ({ ...branch, employeeCount: employees.filter((employee) => employee.branch?.id === branch.id).length }))
      .sort((a, b) => b.employeeCount - a.employeeCount);
  }, [branches, employees]);

  const donutData = useMemo(
    () => branchStats.filter((b) => b.employeeCount > 0).map((b) => ({ name: b.name, value: b.employeeCount })),
    [branchStats]
  );

  const alertItems = [
    { label: 'دورات منتهية الصلاحية', value: summary.expiredCourses, tone: 'danger', icon: 'book' as const, href: '/courses' },
    { label: 'كروت تنتهي قريباً', value: summary.expiringCards, tone: 'warning', icon: 'card' as const, href: '/cards' },
    { label: 'كروت منتهية الصلاحية', value: summary.expiredCards, tone: 'danger', icon: 'card' as const, href: '/cards' },
    { label: 'رخص قيادة تنتهي قريباً', value: summary.expiringLicenses, tone: 'warning', icon: 'steering' as const, href: '/drivers' },
  ];

  const kpiItems = [
    { label: 'الفروع', value: summary.branches, tone: 'violet', icon: 'branch' as const, hint: 'إجمالي العدد', to: '/branches' },
    { label: 'المعدات', value: summary.equipment, tone: 'orange', icon: 'truck' as const, hint: 'إجمالي العدد', to: '/equipment' },
    { label: 'السائقون', value: summary.drivers, tone: 'blue', icon: 'steering' as const, hint: 'إجمالي العدد', to: '/drivers' },
    { label: 'إجمالي العاملين', value: summary.employees, tone: 'indigo', icon: 'users' as const, hint: 'إجمالي العدد', to: '/employees' },
  ];

  const handleImportClick = () => importInputRef.current?.click();

  const handleImportFile = async (file: File) => {
    const ok = await confirm({
      title: 'استيراد من إكسل',
      message: `سيتم إضافة العاملين الموجودين في الملف "${file.name}" إلى النظام. هل تريد المتابعة؟`,
      confirmLabel: 'استيراد',
      danger: false,
    });
    if (!ok) return;

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/employees/import', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      showToast(res.data?.message || 'تم الاستيراد بنجاح', 'success');
      if (res.data?.errors?.length) showToast(`تنبيه: ${res.data.errors[0]}${res.data.errors.length > 1 ? ` (+${res.data.errors.length - 1} أخرى)` : ''}`, 'info');
      load();
    } catch (error) {
      showToast('تعذر استيراد الملف، تأكد من صيغة الأعمدة', 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await api.get('/reports/comprehensive', { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `تقرير-شامل-${new Date().toISOString().slice(0, 10)}.xlsx`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      showToast('تم تجهيز التقرير الشامل وتحميله بنجاح', 'success');
    } catch (error) {
      showToast('تعذر إنشاء التقرير الشامل', 'error');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="dashboard-page">
      <section className="hero-card">
        <div className="hero-copy">
          <span className="hero-kicker">مركز المتابعة والتشغيل</span>
          <h1>مرحباً بك في نظام إدارة العاملين والمعدات</h1>
          <p>لوحة موحدة لمتابعة العاملين، التأهيل، كروت الاختبار والتشغيل، السائقين، المعدات والفحوصات.</p>
          <div className="hero-actions">
            <Link className="primary-button" to="/employees"><Icon name="users" size={17} /> إدارة العاملين</Link>
            <Link className="ghost-button hero-ghost" to="/reports"><Icon name="report" size={17} /> عرض التقارير</Link>
          </div>
        </div>
        <div className="hero-illustration" aria-hidden="true">
          <div className="hero-grid-lines" />
          <div className="hero-orbit hero-orbit-one" />
          <div className="hero-orbit hero-orbit-two" />
          <div className="hero-building"><Icon name="building" size={42} /></div>
          <div className="hero-badge badge-one"><Icon name="users" size={15} /><strong>{summary.employees}</strong></div>
          <div className="hero-badge badge-two"><Icon name="truck" size={15} /><strong>{summary.equipment}</strong></div>
        </div>
      </section>

      <div className="status-strip">
        <span className={`connection-dot ${apiConnected ? 'online' : apiConnected === false ? 'offline' : 'checking'}`} />
        <strong>{apiConnected === true ? 'النظام متصل بقاعدة البيانات' : apiConnected === false ? 'تعذر الاتصال بالخادم' : 'جارٍ التحقق من الاتصال...'}</strong>
        <span className="status-strip-note">التحديث تلقائي عند فتح الصفحة</span>
      </div>

      <div className="stats-grid">
        {kpiItems.map((item) => (
          <StatCard key={item.label} label={item.label} value={loading ? '—' : item.value} tone={item.tone} icon={item.icon} hint={item.hint} to={item.to} />
        ))}
      </div>

      <div className="alert-stats-grid">
        {alertItems.map((alert) => (
          <Link key={alert.label} to={alert.href} className={`alert-stat-card ${alert.tone}`}>
            <div>
              <strong>{loading ? '—' : alert.value}</strong>
              <span>{alert.label}</span>
              <small>عرض التفاصيل ←</small>
            </div>
            <div className="astat-icon"><Icon name={alert.icon} size={20} /></div>
          </Link>
        ))}
      </div>

      {ops && (
        <section className="panel-card" style={{ marginBottom: 18, padding: '18px 20px' }}>
          <div className="panel-head" style={{ padding: 0, marginBottom: 12 }}>
            <div><span className="section-kicker">العمليات الميدانية</span><h2><Icon name="building" size={19} /> المشاريع وتصاريح العمل</h2></div>
            <Link to="/projects" className="secondary-link">إدارة المشاريع <Icon name="arrowLeft" size={16} /></Link>
          </div>
          <div className="summary-tiles" style={{ marginBottom: 0 }}>
            <Link to="/projects" className="summary-tile"><span>مشاريع نشطة</span><strong>{ops.activeProjects} <small style={{ fontSize: 11, color: '#8a99ab' }}>من {ops.totalProjects}</small></strong></Link>
            <Link to="/movements" className="summary-tile"><span>عمال على المشاريع</span><strong style={{ color: '#1f8b5f' }}>{ops.activeAssignments}</strong></Link>
            <Link to="/movements" className="summary-tile"><span>عمال بلا مشروع</span><strong style={{ color: '#b3740c' }}>{ops.unassignedWorkers}</strong></Link>
            <Link to="/permits" className="summary-tile"><span>تصاريح سارية</span><strong>{ops.permitsActive}</strong></Link>
            <Link to="/permits" className="summary-tile"><span>تصاريح تنتهي قريباً</span><strong style={{ color: '#b3740c' }}>{ops.permitsExpiring}</strong></Link>
            <Link to="/permits" className="summary-tile"><span>تصاريح منتهية</span><strong style={{ color: '#d3394c' }}>{ops.permitsExpired}</strong></Link>
          </div>
        </section>
      )}

      <div className="charts-grid">
        <section className="chart-panel">
          <div className="panel-head">
            <div><span className="section-kicker">توزيع العاملين</span><h2><Icon name="branch" size={19} /> حسب الفروع</h2></div>
          </div>
          {donutData.length > 0 ? (
            <div className="donut-wrap">
              <div style={{ width: 150, height: 150, flex: 'none', position: 'relative' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={2} strokeWidth={0}>
                      {donutData.map((_, index) => <Cell key={index} fill={DONUT_COLORS[index % DONUT_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(value) => [`${value} عامل`, '']} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center-label" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                  <strong>{summary.employees}</strong>
                  <span>عامل</span>
                </div>
              </div>
              <div className="donut-legend">
                {donutData.slice(0, 6).map((d, index) => (
                  <div className="donut-legend-row" key={d.name}>
                    <span className="donut-legend-dot" style={{ background: DONUT_COLORS[index % DONUT_COLORS.length] }} />
                    {d.name}
                    <strong>{d.value}</strong>
                  </div>
                ))}
              </div>
            </div>
          ) : <EmptyState text="لا توجد بيانات كافية لعرض الرسم البياني." />}
        </section>

        <section className="chart-panel">
          <div className="panel-head">
            <div><span className="section-kicker">حالة التأهيل</span><h2><Icon name="book" size={19} /> حالة الدورات التدريبية</h2></div>
          </div>
          {summary.courseBreakdown.length > 0 ? (
            <>
              <div className="chart-legend-row">
                <span><span className="chart-legend-dot" style={{ background: '#22a06b' }} /> سارية</span>
                <span><span className="chart-legend-dot" style={{ background: '#e99a22' }} /> تنتهي قريباً</span>
                <span><span className="chart-legend-dot" style={{ background: '#e04d5f' }} /> منتهية</span>
              </div>
              <div style={{ width: '100%', height: 220 }}>
                <ResponsiveContainer>
                  <BarChart data={summary.courseBreakdown} barGap={3}>
                    <CartesianGrid vertical={false} stroke="#eef2f6" />
                    <XAxis dataKey="code" tick={{ fontSize: 11, fill: '#8a99ab' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: '#8a99ab' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip />
                    <Bar dataKey="valid" name="سارية" fill="#22a06b" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expiringSoon" name="تنتهي قريباً" fill="#e99a22" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="expired" name="منتهية" fill="#e04d5f" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </>
          ) : <EmptyState text="لا توجد دورات مسجلة بعد لعرضها." />}
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel-card employees-card">
          <div className="panel-head">
            <div>
              <span className="section-kicker">بيانات حديثة</span>
              <h2><Icon name="users" size={20} /> أحدث العاملين</h2>
            </div>
            <Link to="/employees" className="secondary-link">عرض الكل <Icon name="arrowLeft" size={16} /></Link>
          </div>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>العامل</th>
                  <th>الرقم الوظيفي</th>
                  <th>المهنة</th>
                  <th>الفرع</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {latestEmployees.map((employee) => (
                  <tr key={employee.id}>
                    <td><div className="person-cell"><div className="person-mini-avatar">{employee.name?.charAt(0) || 'ع'}</div><strong>{employee.name}</strong></div></td>
                    <td>{employee.jobNumber || '—'}</td>
                    <td>{employee.profession || '—'}</td>
                    <td>{employee.branch?.name || '—'}</td>
                    <td><StatusBadge label="فعال" tone="green" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!loading && latestEmployees.length === 0 && <EmptyState text="لا توجد بيانات عاملين حالياً." />}
          </div>
        </section>

        <aside className="side-stack">
          <section className="panel-card alert-card">
            <div className="panel-head compact">
              <div><span className="section-kicker">أقرب المواعيد</span><h2><Icon name="clock" size={19} /> أقرب الانتهاء</h2></div>
            </div>
            <div className="expiry-list">
              {summary.nearestExpiring.map((item, index) => {
                const days = Math.ceil((new Date(item.expiryDate).getTime() - Date.now()) / 86400000);
                const tone = days < 0 ? 'danger' : days <= 15 ? 'warning' : 'ok';
                const dayLabel = days < 0 ? `منتهي منذ ${Math.abs(days)} يوم` : `${days} يوم`;
                return (
                  <div className="expiry-row" key={index}>
                    <div><strong>{item.employeeName}</strong><span>{item.type} · {item.label}</span></div>
                    <span className={`expiry-days ${tone}`}>{dayLabel}</span>
                  </div>
                );
              })}
              {!loading && summary.nearestExpiring.length === 0 && <EmptyState text="لا توجد مواعيد انتهاء قريبة." />}
            </div>
          </section>

          <section className="panel-card branch-card">
            <div className="panel-head compact">
              <div><span className="section-kicker">توزيع العاملين</span><h2><Icon name="branch" size={19} /> الفروع</h2></div>
              <span className="mini-number">{summary.branches}</span>
            </div>
            <div className="branch-list">
              {branchStats.slice(0, 5).map((branch) => {
                const share = summary.employees ? Math.round((branch.employeeCount / summary.employees) * 100) : 0;
                return (
                  <div className="branch-row" key={branch.id}>
                    <div className="branch-main"><strong>{branch.name}</strong><span>{branch.code} · {branch.employeeCount} عامل</span></div>
                    <div className="branch-share"><div className="progress-track"><span style={{ width: `${share}%` }} /></div><b>{share}%</b></div>
                  </div>
                );
              })}
              {!loading && branchStats.length === 0 && <EmptyState text="لا توجد فروع مسجلة حالياً." />}
            </div>
          </section>
        </aside>
      </div>

      <section className="quick-grid">
        <QuickAction to="/courses" icon="book" title="إضافة دورة" text="تسجيل دورة تدريبية جديدة" />
        <QuickAction to="/employees" icon="plus" title="إضافة موظف" text="إنشاء سجل عامل جديد" />
        <QuickAction to="/cards" icon="card" title="إضافة كرت تأهيل" text="تعيين كرت اختبار وتشغيل" />
        <QuickAction to="/equipment" icon="truck" title="إضافة معدة" text="تسجيل معدة جديدة" />
        <button type="button" className="quick-action" onClick={handleImportClick} disabled={importing}>
          <span className="quick-icon">{importing ? <Icon name="spinner" size={19} className="spin" /> : <Icon name="upload" size={19} />}</span>
          <span><strong>{importing ? 'جارٍ الاستيراد...' : 'استيراد من إكسل'}</strong><small>إضافة عاملين دفعة واحدة</small></span>
        </button>
        <button type="button" className="quick-action" onClick={handleExport} disabled={exporting}>
          <span className="quick-icon">{exporting ? <Icon name="spinner" size={19} className="spin" /> : <Icon name="download" size={19} />}</span>
          <span><strong>{exporting ? 'جارٍ التجهيز...' : 'تقرير شامل'}</strong><small>تصدير كل البيانات إلى إكسل</small></span>
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImportFile(file);
            e.target.value = '';
          }}
        />
      </section>
    </div>
  );
}

function StatCard({ label, value, hint, tone, icon, to }: { label: string; value: string | number; hint: string; tone: string; icon: any; to: string }) {
  return (
    <Link to={to} className={`stat-card ${tone}`}>
      <div className="stat-icon"><Icon name={icon} size={22} /></div>
      <div className="stat-body"><span>{label}</span><strong>{value}</strong><small>{hint}</small></div>
      <Icon name="arrowLeft" size={16} className="stat-arrow" />
      <div className="stat-glow" />
    </Link>
  );
}

function QuickAction({ to, icon, title, text }: { to: string; icon: any; title: string; text: string }) {
  return <Link className="quick-action" to={to}><span className="quick-icon"><Icon name={icon} size={19} /></span><span><strong>{title}</strong><small>{text}</small></span><Icon name="arrowLeft" size={16} className="muted-icon" /></Link>;
}

function StatusBadge({ label, tone }: { label: string; tone: string }) {
  return <span className={`status-badge ${tone}`}><span className="status-dot" />{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}
