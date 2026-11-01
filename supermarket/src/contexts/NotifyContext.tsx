import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, AlertTriangle, Info } from 'lucide-react';

type NoticeType = 'success' | 'error' | 'info';

interface Notice {
  id: number;
  type: NoticeType;
  message: string;
}

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface NotifyContextValue {
  notify: (message: string, type?: NoticeType) => void;
  askToConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

const NotifyContext = createContext<NotifyContextValue | undefined>(undefined);

// How long each kind of notice stays up.
const NOTICE_DURATION_MS: Record<NoticeType, number> = {
  success: 3000,
  info: 4000,
  error: 6000,
};

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const [pendingConfirm, setPendingConfirm] = useState<
    (ConfirmOptions & { answer: (ok: boolean) => void }) | null
  >(null);

  const dismiss = (id: number) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  };

  const notify = (message: string, type: NoticeType = 'info') => {
    const id = nextId.current++;
    setNotices((prev) => [
      ...prev.filter((n) => !(n.message === message && n.type === type)),
      { id, type, message },
    ]);
    setTimeout(() => dismiss(id), NOTICE_DURATION_MS[type]);
  };

  const askToConfirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setPendingConfirm((previous) => {
        previous?.answer(false);
        return { ...options, answer: resolve };
      });
    });

  const closeConfirm = (ok: boolean) => {
    pendingConfirm?.answer(ok);
    setPendingConfirm(null);
  };

  useEffect(() => {
    if (!pendingConfirm) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeConfirm(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pendingConfirm]);

  return (
    <NotifyContext.Provider value={{ notify, askToConfirm }}>
      {children}

      <div className="notice-stack" aria-live="polite">
        {notices.map((n) => (
          <div
            key={n.id}
            className={`notice notice-${n.type}`}
            role={n.type === 'error' ? 'alert' : 'status'}
          >
            <span className="notice-icon" aria-hidden="true">
              {n.type === 'success' && <Check className="size-3.5" />}
              {n.type === 'error' && <AlertTriangle className="size-3.5" />}
              {n.type === 'info' && <Info className="size-3.5" />}
            </span>
            <span className="notice-message">{n.message}</span>
            <button className="notice-close" onClick={() => dismiss(n.id)} aria-label="Close">
              ×
            </button>
          </div>
        ))}
      </div>

      {pendingConfirm && (
        <div className="confirm-overlay" onMouseDown={() => closeConfirm(false)}>
          <div
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title">{pendingConfirm.title ?? 'Please confirm'}</h3>
            <p>{pendingConfirm.message}</p>
            <div className="confirm-actions">
              <button className="btn-secondary" onClick={() => closeConfirm(false)}>
                {pendingConfirm.cancelLabel ?? 'Cancel'}
              </button>
              <button className="btn-primary" onClick={() => closeConfirm(true)} autoFocus>
                {pendingConfirm.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </NotifyContext.Provider>
  );
}

export function useNotify() {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used inside <NotifyProvider>');
  return ctx;
}