import { Autocomplete } from '@base-ui/react/autocomplete';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { isNewCategory } from '../../lib/categories';
import { controlClass } from './input';

interface CategoryInputProps {
  id: string;
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  // Categories to suggest (see categorySuggestions() in lib/categories).
  suggestions: string[];
  required?: boolean;
}

// A text box with a dropdown of suggested categories underneath.
// Pick a suggestion, or just type a new name: when the product is saved, that
// new name becomes a category and is suggested from then on.
export function CategoryInput({ id, label, value, onValueChange, suggestions, required }: CategoryInputProps) {
  const willCreate = isNewCategory(value, suggestions);

  return (
    <Autocomplete.Root items={suggestions} value={value} onValueChange={(next) => onValueChange(next)} openOnInputClick>
      <div className="space-y-1.5">
        <label htmlFor={id} className="block text-xs font-semibold text-ink">
          {label}
        </label>
        <div className="relative">
          <Autocomplete.Input
            id={id}
            className={cn(controlClass, 'pr-9')}
            placeholder="Pick or type a category"
            required={required}
            autoComplete="off"
          />
          <ChevronsUpDown
            className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-ink-subtle"
            aria-hidden="true"
          />
        </div>
        {/* Tell the admin when they're about to create a new category. */}
        {willCreate && (
          <p className="flex items-center gap-1 text-xs font-medium text-brand-strong">
            <Plus className="size-3.5" aria-hidden="true" />
            “{value.trim()}” will be added as a new category.
          </p>
        )}
      </div>

      <Autocomplete.Portal>
        <Autocomplete.Positioner className="z-[60] outline-none" sideOffset={4}>
          <Autocomplete.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg outline-none">
            {/* Shown when what's typed matches no suggestion. */}
            <Autocomplete.Empty>
              <div className="px-3 py-2.5 text-sm text-ink-muted">
                {value.trim() ? 'No match. Save the product to add this new category.' : 'No categories yet.'}
              </div>
            </Autocomplete.Empty>
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
