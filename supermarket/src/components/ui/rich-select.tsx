import type { ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronsUpDown, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// A dropdown whose options can show a picture and a second line of details,
// which a normal <select> can't do. Used for picking products (with their
// photo) and batches (with their expiry date) in Inventory.
//
//   <RichSelect
//     label="Product"
//     value={productId}
//     onValueChange={setProductId}
//     placeholder="Select product"
//     withImages
//     options={[{ value: '3', label: 'Milk 1L', description: 'SKU MLK-1 · 24 in stock', image: url }]}
//   />

export interface RichSelectOption {
  value: string;
  // Main text. Also used when typing letters to jump to an option.
  label: string;
  // Optional grey second line (or any small element, e.g. coloured text).
  description?: ReactNode;
  // Picture URL. With `withImages`, options without one get a placeholder icon.
  image?: string | null;
  disabled?: boolean;
}

interface RichSelectProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  options: RichSelectOption[];
  placeholder: string;
  // Show a small square picture at the start of every option.
  withImages?: boolean;
  disabled?: boolean;
  hint?: ReactNode;
  // Shown instead of the list when there are no options.
  emptyMessage?: string;
  // Keep the label for screen readers but don't show it (e.g. a filter whose
  // purpose is obvious from where it sits).
  hideLabel?: boolean;
  // Extra classes for the outer wrapper, e.g. a width like "sm:w-48".
  className?: string;
}

// The square picture used both in the list and in the closed box.
function Thumbnail({ src, size = 'size-8' }: { src?: string | null; size?: string }) {
  return (
    <span className={cn('flex shrink-0 items-center justify-center overflow-hidden rounded-sm border border-gray-200 bg-subtle', size)}>
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <ImageIcon className="size-4 text-ink-subtle" aria-hidden="true" />
      )}
    </span>
  );
}

export function RichSelect({
  label,
  value,
  onValueChange,
  options,
  placeholder,
  withImages = false,
  disabled = false,
  hint,
  emptyMessage = 'Nothing to choose from.',
  hideLabel = false,
  className,
}: RichSelectProps) {
  const selected = options.find((option) => option.value === value) ?? null;

  return (
    // An empty string means "nothing chosen yet" in our forms, which Base UI
    // calls null.
    <Select.Root
      value={value === '' ? null : value}
      onValueChange={(next) => onValueChange(next == null ? '' : String(next))}
      disabled={disabled}
    >
      <div className={cn('space-y-1.5', className)}>
        <Select.Label className={hideLabel ? 'sr-only' : 'block text-xs font-semibold text-ink'}>{label}</Select.Label>

        {/* The closed box. Shows the chosen option the same way as in the list. */}
        <Select.Trigger
          className={cn(
            'flex min-h-10 w-full items-center gap-2.5 rounded-full border border-gray-300 bg-white px-4 py-1.5 text-left text-sm text-ink shadow-2xs transition-colors',
            'hover:border-gray-400 focus-visible:border-brand focus-visible:ring-2 focus-visible:ring-brand/20 focus-visible:outline-none',
            'data-popup-open:border-brand data-disabled:cursor-not-allowed data-disabled:bg-subtle data-disabled:text-ink-muted'
          )}
        >
          {withImages && selected && <Thumbnail src={selected.image} size="size-7" />}
          <Select.Value className="min-w-0 flex-1 truncate">
            {() =>
              selected ? (
                <span className="block truncate font-medium">{selected.label}</span>
              ) : (
                <span className="text-ink-subtle">{placeholder}</span>
              )
            }
          </Select.Value>
          <Select.Icon className="shrink-0 text-ink-subtle">
            <ChevronsUpDown className="size-4" aria-hidden="true" />
          </Select.Icon>
        </Select.Trigger>

        {hint && <p className="text-xs text-ink-muted">{hint}</p>}
      </div>

      {/* The open list. It floats above the page, as wide as the box (or wider). */}
      <Select.Portal>
        <Select.Positioner className="z-[60] outline-none" sideOffset={4} alignItemWithTrigger={false}>
          <Select.Popup
            className={cn(
              'max-h-[min(22rem,var(--available-height))] min-w-[var(--anchor-width)] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg outline-none',
              'origin-[var(--transform-origin)] transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0'
            )}
          >
            <Select.List className="max-h-[min(22rem,var(--available-height))] overflow-y-auto p-1">
              {options.length === 0 && <div className="px-3 py-6 text-center text-sm text-ink-muted">{emptyMessage}</div>}
              {options.map((option) => (
                <Select.Item
                  key={option.value}
                  value={option.value}
                  label={option.label}
                  disabled={option.disabled}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm outline-none select-none',
                    'data-highlighted:bg-brand/10 data-selected:font-semibold data-disabled:cursor-not-allowed data-disabled:opacity-50'
                  )}
                >
                  {withImages && <Thumbnail src={option.image} />}
                  <span className="min-w-0 flex-1">
                    <Select.ItemText className="block truncate text-ink">{option.label}</Select.ItemText>
                    {option.description && <span className="block text-xs text-ink-muted">{option.description}</span>}
                  </span>
                  <Select.ItemIndicator className="shrink-0 text-brand-strong">
                    <Check className="size-4" aria-hidden="true" />
                  </Select.ItemIndicator>
                </Select.Item>
              ))}
            </Select.List>
          </Select.Popup>
        </Select.Positioner>
      </Select.Portal>
    </Select.Root>
  );
}
