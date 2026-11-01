import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

// The red bar shown at the top of a page when some of its data couldn't be
// loaded (see `loadError` in hooks/useStoreData.ts). Without it, a failed
// request would just look like an empty store.
//
// Shown by SelfServePage, CashierPage and AdminPage above their content.
// Props:
//   message  what failed, e.g. "Couldn't load members." (from useStoreData)
//   onRetry  called by the "Try again" button; the pages pass a function
//            that runs loadData() again
// role="alert" makes screen readers read it out as soon as it appears.
export default function LoadErrorNotice({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger-strong"
    >
      <p className="flex items-center gap-2 font-medium">
        <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
        {message} Check the internet connection, then try again.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        <RefreshCw aria-hidden="true" />
        Try again
      </Button>
    </div>
  );
}
