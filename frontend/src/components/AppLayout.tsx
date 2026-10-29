import { NavLink, useLocation } from 'react-router-dom';
import { useEffect, useState, type ReactNode } from 'react';
import Icon, { type IconName } from './Icons';
import api from '../services/api';
import { useAuth, roleLabels } from './Auth';

const mainNav: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/', label: 'الرئيسية', icon: 'grid', end: true },
  { to: '/employees', label: 'العاملون', icon: 'users' },
  { to: '/projects', label: 'المشاريع', icon: 'briefcase' },
  { to: '/movements', label: 'حركة العمال', icon: 'branch' },
  { to: '/permits', label: 'تصاريح العمل', icon: 'id' },
  { to: '/drivers', label: 'السائقون', icon: 'steering' },
  { to: '/equipment', label: 'المعدات', icon: 'truck' },
  { to: '/inspections', label: 'فحوصات المعدات', icon: 'wrench' },
  { to: '/branches', label: 'الفروع', icon: 'branch' },
  { to: '/alerts', label: 'التنبيهات', icon: 'bell' },
  { to: '/competency', label: 'مصفوفة الكفاءة', icon: 'shield' },
];

const lowerNav: { to: string; label: string; icon: IconName }[] = [
  { to: '/bulk-import', label: 'الاستيراد الجماعي', icon: 'upload' },
  { to: '/reports', label: 'التقارير', icon: 'report' },
  { to: '/users', label: 'المستخدمون والصلاحيات', icon: 'shield' },
  { to: '/audit', label: 'سجل العمليات', icon: 'clock' },
  { to: '/settings', label: 'الإعدادات والنسخ الاحتياطي', icon: 'settings' },
];

const titles: Record<string, string> = {
  '/': 'لوحة التحكم الرئيسية',
  '/employees': 'العاملون',
  '/projects': 'المشاريع',
  '/movements': 'حركة العمال',
  '/permits': 'تصاريح العمل',
  '/drivers': 'السائقون',
  '/equipment': 'المعدات',
  '/inspections': 'فحوصات المعدات',
  '/branches': 'الفروع',
  '/reports': 'التقارير',
  '/users': 'المستخدمون والصلاحيات',
  '/settings': 'الإعدادات والنسخ الاحتياطي',
  '/alerts': 'التنبيهات',
  '/competency': 'مصفوفة الكفاءة',
  '/bulk-import': 'الاستيراد الجماعي لملفات العاملين',
  '/audit': 'سجل العمليات',
};

export default function AppLayout({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(new Date());
  const [alertCount, setAlertCount] = useState(0);
  const { user, logout, isAdmin, canExport } = useAuth();
  const location = useLocation();
  const title = titles[location.pathname] || 'نظام إدارة العاملين والمعدات';

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api
        .get('/alerts')
        .then((r) => alive && setAlertCount(r.data?.counts?.total ?? 0))
        .catch(() => undefined);
    load();
    const timer = window.setInterval(load, 120000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [location.pathname]);

  const adminOnly = ['/users', '/audit'];
  const exportOnly = ['/bulk-import'];
  const visible = <T extends { to: string }>(items: T[]) =>
    items.filter((i) =>
      adminOnly.includes(i.to)
        ? isAdmin
        : exportOnly.includes(i.to)
          ? canExport
          : true
    );

  const dateLabel = new Intl.DateTimeFormat('ar-SA', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat('ar-SA', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(now);

  return (
    <div className="app-shell" dir="rtl">
      {open && (
        <button
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-label="إغلاق القائمة"
        />
      )}

      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="brand-block">
          <div className="brand-logo-wrap">
            <img
              src="/logo.png"
              alt="شركة مستورة"
              className="brand-logo"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
          <div>
            <div className="brand-title">{user?.companyName || 'شركة مستورة'}</div>
            <div className="brand-subtitle">إدارة الموارد البشرية والمعدات</div>
          </div>
        </div>

        <nav className="sidebar-nav">
          <div className="sidebar-section-label">القائمة الرئيسية</div>
          {visible(mainNav).map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
            >
              <span className="nav-icon">
                <Icon name={item.icon} size={18} />
              </span>
              <span>{item.label}</span>
            </NavLink>
          ))}

          <div className="sidebar-section-label lower">الإدارة</div>
          <div className="sidebar-nav-lower">
            {visible(lowerNav).map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">
                  <Icon name={item.icon} size={18} />
                </span>
                <span>{item.label}</span>
              </NavLink>
            ))}
          </div>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-company-card">
            <div className="sidebar-company-icon">
              <Icon name="building" size={17} />
            </div>
            <div>
              <strong>{user?.companyName || 'شركة مستورة'}</strong>
              <span>نظام داخلي لإدارة التأهيل</span>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-panel">
        <header className="topbar">
          <div className="topbar-right">
            <button
              className="mobile-menu icon-button"
              onClick={() => setOpen(true)}
              aria-label="فتح القائمة"
            >
              <Icon name="menu" size={20} />
            </button>
            <div className="page-heading">
              <span className="eyebrow">نظام إدارة العاملين والمعدات</span>
              <strong>{title}</strong>
            </div>
          </div>

          <div className="topbar-left">
            <div className="topbar-meta">
              <Icon name="calendar" size={14} />
              {dateLabel}
            </div>
            <div className="topbar-meta time">
              <Icon name="clock" size={14} />
              {timeLabel}
            </div>
            <NavLink to="/settings" className="icon-button" aria-label="الإعدادات">
              <Icon name="settings" size={18} />
            </NavLink>
            <NavLink to="/alerts" className="notification-button" aria-label="التنبيهات">
              <Icon name="bell" size={18} />
              {alertCount > 0 && <span>{alertCount > 99 ? '99+' : alertCount}</span>}
            </NavLink>
            <div className="profile-chip">
              <div className="avatar">
                {(user?.username || '؟').charAt(0).toUpperCase()}
              </div>
              <div className="profile-text">
                <strong>{user?.username}</strong>
                <span>{user ? roleLabels[user.role] : ''}</span>
              </div>
            </div>
            <button
              className="icon-button"
              onClick={logout}
              title="تسجيل الخروج"
              aria-label="تسجيل الخروج"
            >
              <Icon name="logout" size={18} />
            </button>
          </div>
        </header>

        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}