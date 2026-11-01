import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Check, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../components/ui/button';

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
  // true for actions that remove or destroy something: the confirm button
  // turns red so it's obvious this one matters.
  danger?: boolean;
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

// Colour and icon for each kind of notice. The coloured strip on the left and
// the icon both say what kind it is, so colour isn't the only clue.
// `icon` is the colour of the little circle and the symbol inside it: dark
// symbols on the bright green and yellow, white on red.
const NOTICE_STYLE: Record<NoticeType, { strip: string; icon: string; Icon: typeof Check }> = {
  success: { strip: 'border-l-brand', icon: 'bg-brand text-white', Icon: Check },
  error: { strip: 'border-l-danger', icon: 'bg-danger text-white', Icon: AlertTriangle },
  info: { strip: 'border-l-sun', icon: 'bg-sun text-brand-ink', Icon: Info },
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

      {/* Pop-up notices, top-right. aria-live makes screen readers read them
          out without moving the keyboard focus. */}
      <div
        className="fixed top-4 right-4 z-[1000] flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
        aria-live="polite"
      >
        {notices.map((n) => {
          const { strip, icon, Icon } = NOTICE_STYLE[n.type];
          return (
            <div
              key={n.id}
              className={cn(
                'flex items-start gap-3 rounded-md border border-l-4 border-gray-200 bg-white p-3 pl-3.5 text-sm text-ink shadow-lg',
                'animate-notice-in',
                strip
              )}
              role={n.type === 'error' ? 'alert' : 'status'}
            >
              <span
                className={cn('inline-flex size-5 flex-none items-center justify-center rounded-full', icon)}
                aria-hidden="true"
              >
                <Icon className="size-3.5" />
              </span>
              <span className="flex-1 leading-snug">{n.message}</span>
              <button
                type="button"
                className="-m-1 flex-none rounded-sm p-1 text-ink-subtle transition-colors hover:bg-subtle hover:text-ink"
                onClick={() => dismiss(n.id)}
                aria-label="Dismiss notification"
              >
                <X className="size-4" />
              </button>
            </div>
          );
        })}
      </div>

      {/* "Are you sure?" window. Clicking the dark backdrop counts as Cancel. */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/45 p-4"
          onMouseDown={() => closeConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-lg bg-white p-6 text-ink shadow-xl"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
            aria-describedby="confirm-message"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-title" className="text-lg font-bold">
              {pendingConfirm.title ?? 'Please confirm'}
            </h3>
            <p id="confirm-message" className="mt-2 text-sm leading-relaxed text-ink-muted">
              {pendingConfirm.message}
            </p>
            <div className="mt-6 flex justify-end gap-2">
              {/* For risky actions, Cancel gets the focus so pressing Enter is the safe choice. */}
              <Button variant="outline" onClick={() => closeConfirm(false)} autoFocus={pendingConfirm.danger}>
                {pendingConfirm.cancelLabel ?? 'Cancel'}
              </Button>
              <Button
                variant={pendingConfirm.danger ? 'destructive' : 'default'}
                onClick={() => closeConfirm(true)}
                autoFocus={!pendingConfirm.danger}
              >
                {pendingConfirm.confirmLabel ?? 'Confirm'}
              </Button>
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
