import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// One look for every text box, so all forms match.
// When a field has an error, set aria-invalid={true}: screen readers announce
// it AND the border turns red, so one attribute does both jobs.
// Exported so other text-box-like controls (e.g. the category box) can match.
export const controlClass =
  'w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-ink shadow-2xs outline-none transition-colors ' +
  'placeholder:text-ink-subtle ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted ' +
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/20';

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, className)} {...props} />;
}

// No plain <select> here on purpose: the browser's own dropdown looks different on
// every device. Use <RichSelect> (ui/rich-select.tsx) for every dropdown instead.

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClass, 'min-h-16 resize-y rounded-2xl', className)} {...props} />;
}
