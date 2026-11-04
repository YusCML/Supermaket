// ui/status-text.tsx: coloured status words ("Out of stock", "15% off").
//
// Part of the design system in components/ui. The look-and-feel rule (see
// STUDY_GUIDE.md, section 8) is that statuses are plain coloured text, never
// boxed badges, and this component is how that rule is kept. Used by the POS
// product menu, the product details pop-up, Inventory and others.
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// A status or label written as plain coloured words, with an optional small
// icon in front. No box or "pill" around it.
//
//   <StatusText tone="danger" icon={<PackageX />}>Out of stock</StatusText>
//   <StatusText tone="warning" icon={<Tag />}>15% off</StatusText>
//
// The words carry the meaning; the colour and icon just make it quicker to spot.
//
// TONES maps each tone name to its text-colour class (colours are named in
// index.css). `as const` makes TypeScript treat the keys and values as fixed,
// so the type below can list exactly these four names.
const TONES = {
  success: 'text-brand-strong',   // good / in stock / earned
  warning: 'text-warning-strong', // low stock, expiring soon, discounts
  danger: 'text-danger-strong',   // out of stock, expired, errors
  muted: 'text-ink-muted',        // neutral information
} as const;

// 'success' | 'warning' | 'danger' | 'muted', read straight from TONES, so
// adding a tone there automatically makes it a valid `tone` prop.
export type StatusTone = keyof typeof TONES;

interface StatusTextProps {
  // Which colour to use. Defaults to 'muted' (grey).
  tone?: StatusTone;
  // Optional small icon (e.g. a lucide-react icon) shown before the words.
  icon?: ReactNode;
  className?: string;
  // The words themselves (whatever goes between the tags).
  children: ReactNode;
}

// The icon is wrapped in a span that shrinks any svg inside to 14px
// ([&_svg]:size-3.5) and hides it from screen readers (aria-hidden), because
// the words already say everything.
export function StatusText({ tone = 'muted', icon, className, children }: StatusTextProps) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-semibold', TONES[tone], className)}>
      {icon && (
        <span className="inline-flex shrink-0 [&_svg]:size-3.5" aria-hidden="true">
          {icon}
        </span>
      )}
      <span>{children}</span>
    </span>
  );
}
