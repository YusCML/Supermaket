// ui/rich-select.tsx: the app's one dropdown, <RichSelect>.
//
// Part of the design system in components/ui. The house rule (STUDY_GUIDE.md,
// section 8) is "never the browser's own <select>", because that one looks
// different on every device and can't show pictures. Built on Base UI's
// Select (Base UI = unstyled, accessible building blocks): it already handles
// the keyboard (arrows, Enter, typing a letter to jump), screen readers and
// placing the list on screen. This file only adds the look.
import type { ReactNode } from 'react';
import { Select } from '@base-ui/react/select';
import { Check, ChevronsUpDown, ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

// A dropdown whose options can show a picture and a second line of details,
// which a normal <select> can't do. Used for picking products (with their
// photo) and batches (with their expiry date) in Inventory, and also in
// UserRoles.
//
//   <RichSelect
//     label="Product"
//     value={productId}
//     onValueChange={setProductId}
//     placeholder="Select product"
//     withImages
//     options={[{ value: '3', label: 'Milk 1L', description: 'SKU MLK-1 · 24 in stock', image: url }]}
//   />

// One choice in the list.
export interface RichSelectOption {
  // What onValueChange hands back when this option is picked. Always a
  // string (e.g. a product id written as '3').
  value: string;
  // Main text. Also used when typing letters to jump to an option.
  label: string;
  // Optional grey second line (or any small element, e.g. coloured text).
  description?: ReactNode;
  // Picture URL. With `withImages`, options without one get a placeholder icon.
  image?: string | null;
  // Shown greyed out and can't be picked.
  disabled?: boolean;
}

// It's a "controlled component": the parent keeps the chosen value in its
// own state and passes it in as `value`; when the user picks something,
// onValueChange tells the parent, which updates its state.
interface RichSelectProps {
  // Text above the box (also what screen readers announce).
  label: string;
  // The chosen option's value, or '' for "nothing chosen yet".
  value: string;
  // Called with the newly picked option's value.
  onValueChange: (value: string) => void;
  options: RichSelectOption[];
  // Grey text in the box while nothing is chosen.
  placeholder: string;
  // Show a small square picture at the start of every option.
  withImages?: boolean;
  // Greys out the whole dropdown so it can't be opened.
  disabled?: boolean;
  // Optional grey help text under the box.
  hint?: ReactNode;
  // Red message under the box (replaces the hint while shown).
  error?: string;
  // Shown instead of the list when there are no options.
  emptyMessage?: string;
  // Keep the label for screen readers but don't show it (e.g. a filter whose
  // purpose is obvious from where it sits).
  hideLabel?: boolean;
  // Extra classes for the outer wrapper, e.g. a width like "sm:w-48".
  className?: string;
}

// The square picture used both in the list and in the closed box.
// No picture -> a grey square with an image icon, so every row lines up.
// `size` is a Tailwind size class: size-8 (32px) in the list, size-7 in the box.
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

// The dropdown itself. Base UI's Select is made of named parts:
//   Select.Root        holds the chosen value and whether the list is open
//   Select.Label       the label text
//   Select.Trigger     the closed box you click (it's a button)
//   Select.Value       what the closed box shows
//   Select.Portal      draws the list at the end of <body>, above everything
//   Select.Positioner  places the list just under the box
//   Select.Popup / List / Item   the open list and each option in it
// Base UI also adds data-… attributes while things change (data-highlighted,
// data-selected, data-disabled, data-popup-open), and our classes use those
// to style each state, e.g. data-highlighted:bg-brand/10.
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
  error,
  className,
}: RichSelectProps) {
  // The full option object for the current value (or null), so the closed
  // box can show its label and picture.
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
            error && 'border-danger',
            'data-popup-open:border-brand data-disabled:cursor-not-allowed data-disabled:bg-subtle data-disabled:text-ink-muted'
          )}
        >
          {withImages && selected && <Thumbnail src={selected.image} size="size-7" />}
          {/* The child here is a function: Base UI calls it to get what the
              closed box should show (the chosen label, or the placeholder). */}
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

        {/* Error or hint under the box. role="alert" makes screen readers
            read the error out as soon as it appears. */}
        {error ? (
          <p className="text-xs font-medium text-danger-strong" role="alert">
            {error}
          </p>
        ) : (
          hint && <p className="text-xs text-ink-muted">{hint}</p>
        )}
      </div>

      {/* The open list. It floats above the page, as wide as the box (or wider). */}
      {/* z-[60] puts it above pop-up windows (z-50), so a dropdown inside a
          dialog still shows on top. sideOffset = a 4px gap under the box.
          alignItemWithTrigger={false}: open BELOW the box, instead of
          placing the chosen option over the box like a Mac menu does.
          The var(--…) values (available height, the box's width, where to
          grow from) are measured and filled in by Base UI. */}
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
                  {/* The ✓ tick. Base UI only shows it on the chosen option. */}
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
