import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import api, { getToken, setToken } from '../services/api';

export type Role = 'ADMIN' | 'HR' | 'EQUIPMENT_MANAGER' | 'VIEWER';
export interface AuthUser { id: number; username: string; role: Role; companyId?: number; companyName?: string; companySlug?: string }

export const roleLabels: Record<Role, string> = {
  ADMIN: 'مدير النظام', HR: 'موارد بشرية', EQUIPMENT_MANAGER: 'مدير معدات', VIEWER: 'مشاهدة فقط',
};

interface AuthValue {
  user: AuthUser | null;
  login: (username: string, password: string, company?: string) => Promise<void>;
  registerCompany: (data: { companyName: string; slug: string; adminUsername: string; adminPassword: string }) => Promise<void>;
  logout: () => void;
  isAdmin: boolean;
  canWrite: boolean;
  canExport: boolean;
}

const AuthContext = createContext<AuthValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth يجب أن يُستخدم داخل AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    try { return getToken() ? JSON.parse(localStorage.getItem('hr_user') || 'null') : null; } catch { return null; }
  });

  const logout = useCallback(() => {
    setToken(null);
    localStorage.removeItem('hr_user');
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('hr-unauthorized', logout);
    return () => window.removeEventListener('hr-unauthorized', logout);
  }, [logout]);

  const registerCompany = useCallback(async (data: { companyName: string; slug: string; adminUsername: string; adminPassword: string }) => {
    const res = await api.post('/auth/register-company', data);
    setToken(res.data.token);
    localStorage.setItem('hr_user', JSON.stringify(res.data.user));
    localStorage.setItem('hr_company', res.data.user.companySlug || '');
    setUser(res.data.user);
  }, []);

  const login = useCallback(async (username: string, password: string, company?: string) => {
    const res = await api.post('/auth/login', { username, password, company });
    if (company) localStorage.setItem('hr_company', company);
    setToken(res.data.token);
    localStorage.setItem('hr_user', JSON.stringify(res.data.user));
    setUser(res.data.user);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user, login, logout, registerCompany,
    isAdmin: user?.role === 'ADMIN',
    canWrite: !!user && user.role !== 'VIEWER',
    canExport: user?.role === 'ADMIN' || user?.role === 'HR',
  }), [user, login, logout, registerCompany]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
