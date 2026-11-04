// NotifyContext.tsx: the app's own pop-up messages, used instead of the
// browser's alert() and confirm() boxes.
//
// It offers two functions through useNotify():
//   notify('Saved!', 'success')  -> a small notice in the top-right corner
//                                   that disappears by itself
//   await askToConfirm({...})    -> an "Are you sure?" window; gives back
//                                   true (confirmed) or false (cancelled)
//
// A React "Context" shares these functions with every component without
// passing them down as props. src/main.tsx wraps the app in <NotifyProvider>;
// the notices and the confirm window are drawn by the provider itself, on top
// of everything else. Used by Inventory, POS, UserRoles and AdminPage.
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

// The three kinds of notice.
type NoticeType = 'success' | 'error' | 'info';

// One notice on screen. `id` tells notices apart (for closing the right one
// and as React's `key` when drawing the list).
interface Notice {
  id: number;
  type: NoticeType;
  message: string;
}

// What a component passes to askToConfirm(). Only `message` is required;
// the rest have defaults ('Please confirm', 'Confirm', 'Cancel').
interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // true for actions that remove or destroy something: the confirm button
  // turns red so it's obvious this one matters.
  danger?: boolean;
}

// Everything useNotify() gives you.
interface NotifyContextValue {
  notify: (message: string, type?: NoticeType) => void;
  askToConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

// Starts as undefined = "no provider above"; useNotify() reports that clearly.
const NotifyContext = createContext<NotifyContextValue | undefined>(undefined);

// How long each kind of notice stays up, in milliseconds (3000 = 3 seconds).
// Errors stay longest, because they usually need reading properly.
const NOTICE_DURATION_MS: Record<NoticeType, number> = {
  success: 3000,
  info: 4000,
  error: 6000,
};

// Colour and icon for each kind of notice. The coloured strip on the left and
// the icon both say what kind it is, so colour isn't the only clue.
// `icon` is the colour of the little circle and the symbol inside it: white
// symbols on the green and red circles, a dark (brand-ink) symbol on the
// yellow one, because white wouldn't be readable on yellow.
// `Icon` (capital I) is the icon component itself, so it can be drawn as <Icon />.
// `typeof Check` = "the same type as the Check icon", i.e. any lucide icon.
const NOTICE_STYLE: Record<NoticeType, { strip: string; icon: string; Icon: typeof Check }> = {
  success: { strip: 'border-l-brand', icon: 'bg-brand text-white', Icon: Check },
  error: { strip: 'border-l-danger', icon: 'bg-danger text-white', Icon: AlertTriangle },
  info: { strip: 'border-l-sun', icon: 'bg-sun text-brand-ink', Icon: Info },
};

// The provider component: holds the notices and the open confirm window, and
// draws them. `children` is the rest of the app, drawn as normal.
export function NotifyProvider({ children }: { children: ReactNode }) {
  // The notices currently on screen, oldest first.
  const [notices, setNotices] = useState<Notice[]>([]);
  // A counter for notice ids. useRef keeps a value between redraws WITHOUT
  // causing a redraw when it changes, which is all a counter needs.
  const nextId = useRef(1);

  // The confirm window that is open right now (null = none). Besides the
  // options it keeps `answer`: the function that settles the Promise the
  // caller is waiting on. `A & B` means "has everything from A and from B".
  const [pendingConfirm, setPendingConfirm] = useState<
    (ConfirmOptions & { answer: (ok: boolean) => void }) | null
  >(null);

  // Remove one notice (the × button, or its timer running out).
  // `prev` is the current list; passing a function to the setter makes sure
  // we change the latest list, even if several updates happen close together.
  const dismiss = (id: number) => {
    setNotices((prev) => prev.filter((n) => n.id !== id));
  };

  // Show a notice. `type` defaults to 'info' when it isn't given.
  const notify = (message: string, type: NoticeType = 'info') => {
    // Take the next id (`++` after the name: use the value, then add 1).
    const id = nextId.current++;
    // Add the new notice at the end, first removing any identical one already
    // showing, so pressing a button twice doesn't stack the same message.
    setNotices((prev) => [
      ...prev.filter((n) => !(n.message === message && n.type === type)),
      { id, type, message },
    ]);
    // Close it by itself after its time is up.
    setTimeout(() => dismiss(id), NOTICE_DURATION_MS[type]);
  };

  // Open the "Are you sure?" window and return a Promise that settles with
  // the person's answer, so callers can write:
  //   if (await askToConfirm({ message: 'Delete this?' })) { ... }
  // `resolve` is the function that settles the Promise; we keep it as
  // `answer` until a button is pressed.
  const askToConfirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setPendingConfirm((previous) => {
        // If another question was still open, it counts as "Cancel", so the
        // code waiting on it doesn't wait forever.
        previous?.answer(false);
        return { ...options, answer: resolve };
      });
    });

  // Close the window with the person's answer (true = confirm, false = cancel).
  const closeConfirm = (ok: boolean) => {
    pendingConfirm?.answer(ok);
    setPendingConfirm(null);
  };

  // While the window is open, the Escape key counts as Cancel.
  // The effect adds a keyboard listener to the whole page; the function it
  // returns (the "clean-up") removes it again when the window closes, so the
  // listener doesn't linger. It re-runs whenever pendingConfirm changes.
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
        {/* One box per notice. `key` lets React keep track of which box is
            which as notices come and go. role="alert" makes screen readers
            announce errors straight away; role="status" is the polite kind. */}
        {notices.map((n) => {
          // Look up this kind's colours and icon.
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
              {/* The round icon. aria-hidden hides it from screen readers,
                  because the message text already says everything. */}
              <span
                className={cn('inline-flex size-5 flex-none items-center justify-center rounded-full', icon)}
                aria-hidden="true"
              >
                <Icon className="size-3.5" />
              </span>
              <span className="flex-1 leading-snug">{n.message}</span>
              {/* The × button closes the notice early. aria-label gives the
                  icon-only button a name screen readers can say. */}
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
      {/* `pendingConfirm && (...)` draws the window only while a question is
          open (when pendingConfirm is null, nothing is drawn). */}
      {pendingConfirm && (
        <div
          className="fixed inset-0 z-[1001] flex items-center justify-center bg-black/45 p-4"
          onMouseDown={() => closeConfirm(false)}
        >
          {/* The window itself. Its onMouseDown calls stopPropagation(), which
              stops the click from also reaching the backdrop behind it, so
              clicking inside the window doesn't cancel it.
              role="alertdialog" + aria-modal tell screen readers this is a
              question that needs an answer; aria-labelledby / aria-describedby
              point at the title and message (by their ids) to read out. */}
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
              {/* (Otherwise Confirm gets the focus. A `danger` question also
                  turns the Confirm button red: the 'destructive' variant.) */}
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

// The hook components use: `const { notify, askToConfirm } = useNotify();`.
// Throws a clear error if <NotifyProvider> is missing above the component.
export function useNotify() {
  const ctx = useContext(NotifyContext);
  if (!ctx) throw new Error('useNotify must be used inside <NotifyProvider>');
  return ctx;
}
