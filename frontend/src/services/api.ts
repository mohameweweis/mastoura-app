import axios from 'axios';

const TOKEN_KEY = 'hr_token';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'const API_URL = 'https://mastoura-app.onrender.com/api';',
  timeout: 30000,
});

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401 && getToken()) {
      setToken(null);
      window.dispatchEvent(new Event('hr-unauthorized'));
    }
    return Promise.reject(error);
  },
);

// رابط مباشر لملف (معاينة / تنزيل) يعمل في تبويب جديد عبر توكن في الرابط
export const fileUrl = (path: string) => `${api.defaults.baseURL}${path}${path.includes('?') ? '&' : '?'}token=${getToken() || ''}`;

// تنزيل ملف ناتج عن طلب (ZIP / Excel) مع إظهار الأخطاء بالعربية
export async function downloadBlob(request: () => Promise<{ data: Blob; headers: any }>, fallbackName: string) {
  const res = await request();
  const disposition: string = res.headers['content-disposition'] || '';
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = window.URL.createObjectURL(res.data);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

// عند طلب blob تأتي رسالة الخطأ كـ Blob؛ هذه الدالة تقرأها كنص عربي
export async function errorMessage(error: any, fallback: string): Promise<string> {
  const data = error?.response?.data;
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text())?.message || fallback; } catch { return fallback; }
  }
  return data?.message || fallback;
}

export default api;
