// ui/category-input.tsx: the "Category" box in Inventory's product forms.
//
// Part of the design system in components/ui. It's a free-text box with a
// suggestion list (an "autocomplete"), not a fixed dropdown, because there's
// no categories table: a category is just text saved on the product, and
// typing a new name is how a new category is born (see lib/categories.ts).
// Built on Base UI's Autocomplete (Base UI = unstyled, accessible building
// blocks), which handles opening the list, arrow keys, Enter and filtering
// the suggestions as you type.
import { Autocomplete } from '@base-ui/react/autocomplete';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNewCategory } from '../../lib/categories';
import { controlClass } from './input';

// A "controlled component": the form keeps the text in its own state
// (`value`), and onValueChange reports every change, whether typed or picked
// from the list.
interface CategoryInputProps {
  // Used for the box's id and the label's htmlFor (so clicking the label
  // focuses the box), and for the error message's id.
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  // Categories to suggest (see categorySuggestions() in lib/categories).
  suggestions: string[];
  required?: boolean;
  // Red message under the box.
  error?: string;
}

// A text box with a dropdown of suggested categories underneath.
// Pick a suggestion, or just type a new name: when the product is saved, that
// new name becomes a category and is suggested from then on.
export function CategoryInput({ id, label, value, onValueChange, suggestions, required, error }: CategoryInputProps) {
  // True when the typed text isn't one of the suggestions (ignoring capitals
  // and extra spaces), i.e. saving will start a new category.
  const willCreate = isNewCategory(value, suggestions);

  return (
    // items = the whole suggestion list; Base UI shows only the ones that
    // match what's typed. openOnInputClick opens the list when the box is
    // clicked, not only when typing starts.
    <Autocomplete.Root items={suggestions} value={value} onValueChange={(next) => onValueChange(next)} openOnInputClick>
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-xs font-semibold text-ink">
          {label}
        </label>
        {/* The text box, styled exactly like <Input> (controlClass), with
            extra right padding to make room for the ⇅ icon on top of it. */}
        <div className="relative">
          <Autocomplete.Input
            id={id}
            className={cn(controlClass, 'pr-9')}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-error` : undefined}
            placeholder="Pick or type a category"
            maxLength={50}
            required={required}
            autoComplete="off"
          />
          <ChevronsUpDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
        </div>
        {/* Under the box: the red error if there is one. Otherwise, tell the
            admin when they're about to create a new category. */}
        {error && (
          <p id={`${id}-error`} className="text-xs font-medium text-danger-strong">
            {error}
          </p>
        )}
        {!error && willCreate && (
          <p className="flex items-center gap-1 text-xs font-medium text-brand-strong">
            <Plus className="size-3.5" aria-hidden="true" />
            “{value.trim()}” will be added as a new category.
          </p>
        )}
      </div>

      {/* The suggestion list. Drawn at the end of <body> (a "portal") and
          placed 4px under the box. z-[60] keeps it above pop-up windows
          (z-50); --anchor-width (the box's width) is filled in by Base UI. */}
      <Autocomplete.Portal>
        <Autocomplete.Positioner className="z-[60] outline-none" sideOffset={4}>
          <Autocomplete.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg outline-none">
            {/* Shown when what's typed matches no suggestion. */}
            <Autocomplete.Empty>
              <div className="px-3 py-2.5 text-sm text-ink-muted">
                {value.trim() ? 'No match. Save the product to add this new category.' : 'No categories yet.'}
              </div>
            </Autocomplete.Empty>
            {/* The child is a function: Base UI calls it once for each
                suggestion still matching what's typed. data-empty:p-0 drops
                the padding when nothing matches. */}
            <Autocomplete.List className="max-h-[min(18rem,var(--available-height))] overflow-y-auto p-1 data-empty:p-0">
              {(category: string) => (
                <Autocomplete.Item
                  key={category}
                  value={category}
                  className="flex cursor-pointer items-center rounded-sm px-2.5 py-2 text-sm text-ink outline-none select-none data-highlighted:bg-brand/10"
                >
                  {category}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  );
}
