import { cn } from '@/lib/utils';

// The store logo (public/logo.svg), optionally with the name beside it:
//   [logo] SuperMarket Express        ("Express" in green)
// Use this instead of writing the <img> and name out on every screen.
const SIZES = {
  sm: { icon: 'size-7', text: 'text-sm' },
  md: { icon: 'size-9', text: 'text-base' },
  lg: { icon: 'size-14', text: 'text-2xl' },
} as const;

interface BrandLogoProps {
  size?: keyof typeof SIZES;
  // false = just the picture (e.g. in the narrow phone top bar).
  showName?: boolean;
  className?: string;
}

export default function BrandLogo({ size = 'md', showName = true, className }: BrandLogoProps) {
  const { icon, text } = SIZES[size];
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      {/* When the name is written next to it, the picture adds nothing for
          screen readers, so it gets an empty alt. */}
      <img src="/logo.svg" alt={showName ? '' : 'SuperMarket Express'} className={cn('shrink-0', icon)} />
      {showName && (
        <span className={cn('font-bold tracking-tight text-ink', text)}>
          SuperMarket <span className="text-brand-strong">Express</span>
        </span>
      )}
    </span>
  );
}
