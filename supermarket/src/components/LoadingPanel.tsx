import { LoaderCircle } from 'lucide-react';

// The white box with a spinner shown while a screen's data is loading.
// role="status" makes screen readers announce the message.
//
// Used by the three role pages while useStoreData loads, by RolePickerPage
// while roles are checked, by AdminPage while the Analytics code downloads,
// and inside the Analytics and UserRoles screens.
// Prop: `message` is the text next to the spinner, e.g. "Loading store data…".
// (animate-spin is Tailwind's built-in endless rotation; the spinning icon
// is aria-hidden because the message already says what's happening.)
export default function LoadingPanel({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white p-12 text-sm font-medium text-ink-muted shadow-xs"
    >
      <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      {message}
    </div>
  );
}
