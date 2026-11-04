// ui/field.tsx: one form row = label + text box + (hint or error message).
//
// Part of the design system in components/ui. The forms (e.g. Inventory's
// Add/Edit product forms) wrap each <Input>/<Textarea> in a <Field> so every
// row is laid out the same way. Error messages come from the zod checks in
// lib/validation.ts: fieldErrors() turns them into { fieldName: message },
// and each message is passed to the matching <Field error={...}>.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// The props (inputs) a <Field> accepts.
// ReactNode = "anything React can show": text, a number, or JSX.
interface FieldProps {
  // Visible label text. Every input needs one; a placeholder alone disappears
  // as soon as you start typing.
  label: string;
  // Must match the id of the input inside, so clicking the label focuses it.
  htmlFor: string;
  // Optional grey help text under the input.
  hint?: ReactNode;
  // Optional red error under the input (replaces the hint while shown).
  // Give the input aria-describedby={`${htmlFor}-error`} so it's read aloud.
  error?: string;
  // Extra classes for the outer wrapper (e.g. to change its width).
  className?: string;
  // Whatever is written between <Field> and </Field>: the box itself.
  children: ReactNode;
}

// Spread onto an <Input> or <Textarea> inside a <Field>:
//   <Input id="add-price" {...invalidProps('add-price', errors.price)} />
// When there's an error the box turns red (aria-invalid) and screen readers
// read the message under it (aria-describedby points at the message's id).
// With no error it returns an empty object, so spreading it adds nothing.
// (`true as const` tells TypeScript the value is always exactly `true`,
// not "some boolean".)
export function invalidProps(id: string, error?: string) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': `${id}-error` } : {};
}

// Label + input + hint/error, stacked. Wrap any <Input> or <Textarea> in it.
// It only handles the layout and the messages; the box inside still gets its
// own value/onChange from the form.
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
      {/* Only one message at a time: the red error wins over the grey hint.
          The ids match what invalidProps() points the box at. */}
      {error ? (
        <p id={`${htmlFor}-error`} className="text-xs font-medium text-danger-strong">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${htmlFor}-hint`} className="text-xs text-ink-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
