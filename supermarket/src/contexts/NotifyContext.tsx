import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

// The app's own pop-ups, used instead of the browser's alert() / confirm()
// boxes (the grey "localhost:3000 says..." dialogs).
//
//   notify('Checkout completed successfully!', 'success')
//     -> a small card in the top-right corner that fades away on its own.
//
//   if (await askToConfirm({ message: 'Set roles?' })) { ... }
//     -> a dialog in the middle of the screen with Cancel / Confirm buttons.
//        Resolves to true if they confirmed, false if they cancelled.

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

// How long each kind of notice stays up. Errors stay longer so there's time to
// read them; every notice can also be closed with its ×.
const NOTICE_DURATION_MS: Record<NoticeType, number> = {
  success: 3000,
  info: 4000,
  error: 6000,
};

const NOTICE_ICON: Record<NoticeType, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

export function NotifyProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  // The confirmation dialog currently open (only one at a time), plus the
  // function that hands the answer back to whoever asked.
  const [pendingConfirm, setPendingConfirm] = useState<
    (ConfirmOptions & { answer: (ok: boolean) => void }) | null
  >(null);

  const dismiss = (id: number) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  };

  const notify = (message: string, type: NoticeType = 'info') => {
    const id = nextId.current++;
    // Clicking an out-of-stock item five times shouldn't stack five copies of
    // the same message, so an identical one already showing is replaced.
    setNotices((prev) => [
      ...prev.filter((n) => !(n.message === message && n.type === type)),
      { id, type, message },
    ]);
    setTimeout(() => dismiss(id), NOTICE_DURATION_MS[type]);
  };

  const askToConfirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setPendingConfirm((previous) => {
        // A new question replaces an unanswered one; the old one counts as "no".
        previous?.answer(false);
        return { ...options, answer: resolve };
      });
    });

  const closeConfirm = (ok: boolean) => {
    pendingConfirm?.answer(ok);
    setPendingConfirm(null);
  };

  // Esc cancels the dialog, like the browser's own one did.
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
            <span className="notice-icon" aria-hidden="true">{NOTICE_ICON[n.type]}</span>
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
            // Clicks inside the dialog shouldn't count as clicking the dark
            // background (which cancels).
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
