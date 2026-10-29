import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import Icon from './Icons';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; message: string }

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface FeedbackContextValue {
  showToast: (message: string, tone?: ToastTone) => void;
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function useFeedback() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback يجب أن يُستخدم داخل FeedbackProvider');
  return ctx;
}

let toastSeq = 1;

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);

  const showToast = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = toastSeq++;
    setToasts((current) => [...current, { id, tone, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((t) => t.id !== id)), 3800);
  }, []);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ ...options, resolve });
    });
  }, []);

  const resolveConfirm = (value: boolean) => {
    confirmState?.resolve(value);
    setConfirmState(null);
  };

  const value = useMemo(() => ({ showToast, confirm }), [showToast, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast-item ${t.tone}`}>
            <span className="toast-icon"><Icon name={t.tone === 'success' ? 'check' : t.tone === 'error' ? 'x-circle' : 'bell'} size={16} /></span>
            <span>{t.message}</span>
          </div>
        ))}
      </div>

      {confirmState && (
        <div className="overlay confirm-overlay">
          <button className="overlay-dismiss" onClick={() => resolveConfirm(false)} aria-label="إغلاق" />
          <section className="confirm-modal">
            <div className={`confirm-icon ${confirmState.danger === false ? 'info' : 'danger'}`}><Icon name="alert" size={22} /></div>
            <h3>{confirmState.title || 'تأكيد الحذف'}</h3>
            <p>{confirmState.message}</p>
            <div className="confirm-actions">
              <button className="ghost-button" onClick={() => resolveConfirm(false)}>{confirmState.cancelLabel || 'إلغاء'}</button>
              <button className={confirmState.danger === false ? 'primary-button' : 'danger-button'} onClick={() => resolveConfirm(true)}>
                {confirmState.confirmLabel || 'حذف'}
              </button>
            </div>
          </section>
        </div>
      )}
    </FeedbackContext.Provider>
  );
}
