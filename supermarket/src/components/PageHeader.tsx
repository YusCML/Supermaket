// PageHeader.tsx: the title row at the top of a screen. Used by Inventory,
// Loyalty, Analytics and UserRoles.
import type { ReactNode } from 'react';

// The props (inputs). ReactNode means "anything React can draw": text, an
// element, or several elements.
interface PageHeaderProps {
  // The big heading, e.g. "Sales Analytics".
  title: string;
  // Optional one-line explanation under the title.
  description?: ReactNode;
  // Optional buttons shown on the right (e.g. Refresh). They wrap underneath
  // the title on narrow screens.
  actions?: ReactNode;
}

// The title row at the top of each tab (Inventory, Loyalty, Analytics…), so
// every screen starts the same way.
export default function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    // flex-wrap + justify-between: title on the left, buttons on the right,
    // and the buttons drop below the title when there isn't room.
    // `x && <Y />` draws Y only when x was given.
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
        {description && <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
