// ui/input.tsx: the app's text boxes (<Input> and <Textarea>).
//
// Part of the small design system in components/ui. Every form in the app
// (sign-in, Inventory's Add/Edit/Receive forms, the POS member, points and
// cash boxes, the POS search box…) uses these instead of a bare <input>, so
// they all share one look: pill shape, grey border, green glow when focused,
// red border when invalid.
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

// One look for every text box, so all forms match.
// When a field has an error, set aria-invalid={true}: screen readers announce
// it AND the border turns red, so one attribute does both jobs.
// Exported so other text-box-like controls (e.g. the category box) can match.
// The words after "focus:", "disabled:" and "aria-invalid:" are Tailwind
// conditions: those classes only apply while the box is focused, disabled, or
// has aria-invalid set.
export const controlClass =
  'w-full rounded-full border border-gray-300 bg-white px-4 py-2 text-sm text-ink shadow-2xs outline-none transition-colors ' +
  'placeholder:text-ink-subtle ' +
  'focus:border-brand focus:ring-2 focus:ring-brand/20 ' +
  'disabled:cursor-not-allowed disabled:bg-subtle disabled:text-ink-muted ' +
  'aria-invalid:border-danger aria-invalid:focus:ring-danger/20';

// A single-line text box. It accepts every prop a normal <input> accepts
// (ComponentProps<'input'> is TypeScript's list of them: value, onChange,
// type, placeholder…). `...props` collects all of those and passes them
// straight on. `className` is the only one we touch: cn() adds it after our
// own classes, so a caller can tweak the look (e.g. className="h-11 pl-10").
//
// autoComplete="off" by default: otherwise the browser drops its own grey
// list of things typed before under the box, which looks nothing like the
// app and covers our own suggestion lists (members, categories). A box that
// WANTS the browser's help passes its own value, e.g. the sign-in email
// (autoComplete="email") and passwords, so password managers still work.
export function Input({ className, autoComplete = 'off', ...props }: ComponentProps<'input'>) {
  return <input className={cn(controlClass, className)} autoComplete={autoComplete} {...props} />;
}

// No plain <select> here on purpose: the browser's own dropdown looks different on
// every device. Use <RichSelect> (ui/rich-select.tsx) for every dropdown instead.
// The same goes for dates: use <DatePicker> (ui/date-picker.tsx), never
// <input type="date">, whose calendar is the browser's own.

// A multi-line text box (e.g. a product description). Same look as Input,
// but with rounded corners instead of pill ends (a pill looks odd once the
// box is several lines tall), a minimum height, and a corner handle that
// lets the user drag it taller or shorter (resize-y).
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlClass, 'min-h-16 resize-y rounded-2xl', className)} {...props} />;
}
