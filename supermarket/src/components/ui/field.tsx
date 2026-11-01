import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

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
  className?: string;
  children: ReactNode;
}

// Label + input + hint/error, stacked. Wrap any <Input> or <Textarea> in it.
export function Field({ label, htmlFor, hint, error, className, children }: FieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={htmlFor} className="block text-xs font-semibold text-ink">
        {label}
      </label>
      {children}
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
