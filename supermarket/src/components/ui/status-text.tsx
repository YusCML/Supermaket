import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// A status or label written as plain coloured words, with an optional small
// icon in front. No box or "pill" around it.
//
//   <StatusText tone="danger" icon={<PackageX />}>Out of stock</StatusText>
//   <StatusText tone="warning" icon={<Tag />}>15% off</StatusText>
//
// The words carry the meaning; the colour and icon just make it quicker to spot.
const TONES = {
  success: 'text-brand-strong',   // good / in stock / earned
  warning: 'text-warning-strong', // low stock, expiring soon, discounts
  danger: 'text-danger-strong',   // out of stock, expired, errors
  muted: 'text-ink-muted',        // neutral information
} as const;

export type StatusTone = keyof typeof TONES;

interface StatusTextProps {
  tone?: StatusTone;
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
}

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
