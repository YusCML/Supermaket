import type { ReactNode } from 'react';

interface PageHeaderProps {
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
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-2xl font-bold tracking-tight text-ink">{title}</h2>
        {description && <p className="max-w-3xl text-sm leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
