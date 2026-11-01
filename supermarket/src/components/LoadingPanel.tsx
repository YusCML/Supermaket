import { LoaderCircle } from 'lucide-react';

// The white box with a spinner shown while a screen's data is loading.
// role="status" makes screen readers announce the message.
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
