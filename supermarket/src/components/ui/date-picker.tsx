// ui/date-picker.tsx: the app's date box and its pop-up calendar.
//
// Used instead of <input type="date">, whose calendar is the browser's own:
// it looks different in every browser and nothing like the rest of the app.
// This one matches the other boxes and dropdowns: a pill-shaped box (the same
// look as <Input>) that opens a calendar card floating under it, like
// <RichSelect>'s list.
//
// Used by Inventory for expiry dates ("Receive stock" and the starting stock
// of "Add product").
//
//   <DatePicker id="receive-expiry" value={date} onChange={setDate}
//               today={todayInManila()} min={tomorrow}
//               presets={[{ label: 'In 1 month', months: 1 }]} />
//
// How it works:
//   - Dates are 'YYYY-MM-DD' text everywhere (the same as the database and
//     the old date box), handled as midnight UTC so the computer's own time
//     zone can never shift a day.
//   - The calendar shows one month as a grid of 6 weeks (Sunday first). The
//     ‹ › buttons change month. The chosen day is filled green; today has a
//     green ring; days before `min` can't be picked.
//   - Keyboard: arrow keys move a day / a week, Page Up / Page Down a month,
//     Home / End to the start / end of the week, Enter or Space picks the
//     day, Escape closes. Only the day "in focus" is reachable with Tab
//     (a "roving tabindex"), so Tab leaves the grid in one step.
//   - `presets` adds quick-pick buttons under the calendar, counted from
//     `today` (e.g. "In 1 month").
//
// Built on Base UI's Popover, which handles opening and closing, clicks
// outside, Escape, and putting the keyboard focus back on the box.
import { useEffect, useRef, useState, type ComponentProps, type KeyboardEvent } from 'react';
import { Popover } from '@base-ui/react/popover';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { controlClass } from './input';

// ── Date maths on 'YYYY-MM-DD' text ────────────────────────────────────────
const DAY_MS = 86_400_000; // milliseconds in one day
// 'YYYY-MM-DD' <-> a Date at midnight UTC of that day.
const toKey = (date: Date) => date.toISOString().slice(0, 10);
const fromKey = (key: string) => new Date(`${key}T00:00:00Z`);
// Move a date by whole days (negative = back).
const addDays = (key: string, days: number) => toKey(new Date(fromKey(key).getTime() + days * DAY_MS));
// Move a date by whole months, keeping the day of the month when it exists
// (Jan 31 + 1 month = Feb 28/29, the last day of February).
const addMonths = (key: string, months: number) => {
  const date = fromKey(key);
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  // Day 0 of the NEXT month = the last day of the target month.
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return toKey(target);
};
// The first day of the month a date is in: '2026-11-17' -> '2026-11-01'.
const monthOf = (key: string) => `${key.slice(0, 7)}-01`;

// How dates are written. timeZone 'UTC' because the Dates are midnight UTC.
const boxFormat = new Intl.DateTimeFormat('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const monthFormat = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat('en-PH', { dateStyle: 'full', timeZone: 'UTC' });
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// A quick-pick button, counted from today: { label: 'In 1 month', months: 1 }.
export interface DatePreset {
  label: string;
  days?: number;
  months?: number;
}

interface DatePickerProps {
  // Ties the box to its <label htmlFor="…">, like any form box.
  id?: string;
  // The chosen date ('YYYY-MM-DD'), or '' for none yet.
  value: string;
  // Called with the new date ('YYYY-MM-DD') when a day or preset is picked.
  onChange: (value: string) => void;
  // Today's date ('YYYY-MM-DD'): marked in the calendar and the starting point
  // for presets. Pass the shop's date (todayInManila() in lib/expiry.ts).
  today: string;
  // The earliest day that can be picked; earlier days are greyed out.
  min?: string;
  // Text shown in the box while nothing is picked.
  placeholder?: string;
  presets?: DatePreset[];
  disabled?: boolean;
  // Error wiring from invalidProps() (ui/field.tsx): a red border and the
  // error message read out by screen readers.
  'aria-invalid'?: ComponentProps<'button'>['aria-invalid'];
  'aria-describedby'?: string;
}

export function DatePicker({
  id,
  value,
  onChange,
  today,
  min,
  placeholder = 'Pick a date',
  presets = [],
  disabled = false,
  ...aria
}: DatePickerProps) {
  // Whether the calendar is open.
  const [open, setOpen] = useState(false);
  // The month on show (its first day, 'YYYY-MM-01').
  const [shownMonth, setShownMonth] = useState(monthOf(value || today));
  // The day the keyboard is on (Tab lands here; arrow keys move it).
  const [focusDay, setFocusDay] = useState(value || today);
  // The grid of days, to find the day button to focus.
  const gridRef = useRef<HTMLDivElement>(null);

  // Can this day be picked? (ISO dates compare correctly as text.)
  const allowed = (key: string) => !min || key >= min;

  // Opening: start on the chosen date, or else today (or `min`, if today
  // can't be picked), so the calendar never opens somewhere unhelpful.
  const handleOpenChange = (next: boolean) => {
    if (next) {
      const start = value || (min && min > today ? min : today);
      setShownMonth(monthOf(start));
      setFocusDay(start);
    }
    setOpen(next);
  };

  // Pick a day (or a preset): save it and close.
  const pick = (key: string) => {
    if (!allowed(key)) return;
    onChange(key);
    setOpen(false);
  };

  // Move the keyboard to another day, turning the page if it's in another month.
  const moveFocus = (key: string) => {
    setFocusDay(key);
    if (monthOf(key) !== shownMonth) setShownMonth(monthOf(key));
  };

  // After the focused day changes (or the calendar opens), put the real
  // keyboard focus on its button. requestAnimationFrame waits one frame, so
  // the button exists on screen by then.
  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focusDay}"]`)?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open, focusDay, shownMonth]);

  // The keys that move around the grid (see the note at the top).
  const handleGridKey = (event: KeyboardEvent) => {
    const weekday = fromKey(focusDay).getUTCDay(); // 0 = Sunday
    const moves: Record<string, string> = {
      ArrowLeft: addDays(focusDay, -1),
      ArrowRight: addDays(focusDay, 1),
      ArrowUp: addDays(focusDay, -7),
      ArrowDown: addDays(focusDay, 7),
      PageUp: addMonths(focusDay, -1),
      PageDown: addMonths(focusDay, 1),
      Home: addDays(focusDay, -weekday),
      End: addDays(focusDay, 6 - weekday),
    };
    const next = moves[event.key];
    if (next) {
      event.preventDefault();
      moveFocus(next);
    }
  };

  // The 42 days on show: from the Sunday on or before the 1st, six weeks long.
  const gridStart = addDays(shownMonth, -fromKey(shownMonth).getUTCDay());
  const days = Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  // No going back to a month that's entirely before `min`.
  const canGoBack = !min || monthOf(min) < shownMonth;

  return (
    <Popover.Root open={open} onOpenChange={handleOpenChange}>
      {/* The box. It's a button (it opens the calendar), styled like a text
          box. A red border comes from aria-invalid, as on <Input>. */}
      {/* type="button": inside a form, a plain button would submit it. */}
      <Popover.Trigger
        type="button"
        id={id}
        disabled={disabled}
        {...aria}
        className={cn(
          controlClass,
          'flex items-center gap-2.5 text-left',
          'data-popup-open:border-brand data-popup-open:ring-2 data-popup-open:ring-brand/20'
        )}
      >
        <CalendarDays className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
        <span className={cn('min-w-0 flex-1 truncate', value ? 'font-medium text-ink' : 'text-ink-subtle')}>
          {value ? boxFormat.format(fromKey(value)) : placeholder}
        </span>
        <ChevronDown className="size-4 shrink-0 text-ink-subtle" aria-hidden="true" />
      </Popover.Trigger>

      {/* The calendar card, floating under the box (z-[60] keeps it above
          pop-up windows). initialFocus={false}: the effect above puts the
          focus on the right day instead of the card's first button. */}
      <Popover.Portal>
        <Popover.Positioner side="bottom" align="start" sideOffset={6} className="z-[60] outline-none">
          <Popover.Popup
            initialFocus={false}
            aria-label="Choose a date"
            className={cn(
              'w-[19rem] rounded-lg border border-gray-200 bg-white p-3 text-ink shadow-lg outline-none',
              'origin-[var(--transform-origin)] transition-[opacity,scale] duration-100 data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0'
            )}
          >
            {/* Month name with ‹ › to change month. aria-live reads the new
                month out when it changes. */}
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setShownMonth(addMonths(shownMonth, -1))}
                disabled={!canGoBack}
                aria-label="Previous month"
                className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink disabled:pointer-events-none disabled:opacity-30"
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
              </button>
              <span className="text-sm font-semibold" aria-live="polite">
                {monthFormat.format(fromKey(shownMonth))}
              </span>
              <button
                type="button"
                onClick={() => setShownMonth(addMonths(shownMonth, 1))}
                aria-label="Next month"
                className="flex size-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-subtle hover:text-ink"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>

            {/* Weekday names */}
            <div className="grid grid-cols-7 text-center text-[11px] font-semibold text-ink-subtle" aria-hidden="true">
              {WEEKDAYS.map((name) => (
                <span key={name} className="py-1">
                  {name}
                </span>
              ))}
            </div>

            {/* The days. Each is a button labelled with the full date for
                screen readers, e.g. "Thursday, November 5, 2026". */}
            <div ref={gridRef} className="grid grid-cols-7 gap-y-0.5" onKeyDown={handleGridKey}>
              {days.map((key) => {
                const inMonth = monthOf(key) === shownMonth;
                const isSelected = key === value;
                const isToday = key === today;
                const canPick = allowed(key);
                return (
                  <button
                    key={key}
                    type="button"
                    data-date={key}
                    tabIndex={key === focusDay ? 0 : -1}
                    disabled={!canPick}
                    onClick={() => pick(key)}
                    aria-label={fullFormat.format(fromKey(key))}
                    aria-pressed={isSelected}
                    aria-current={isToday ? 'date' : undefined}
                    className={cn(
                      'mx-auto flex size-9 items-center justify-center rounded-full text-sm tabular-nums outline-none transition-colors',
                      'focus-visible:ring-2 focus-visible:ring-brand/50',
                      isSelected
                        ? 'bg-brand font-semibold text-white hover:bg-brand-hover'
                        : cn(
                            inMonth ? 'text-ink' : 'text-ink-subtle',
                            isToday && 'font-semibold text-brand-strong ring-1 ring-brand/40 ring-inset',
                            canPick && 'hover:bg-brand/10'
                          ),
                      !canPick && 'cursor-not-allowed opacity-30'
                    )}
                  >
                    {Number(key.slice(8))}
                  </button>
                );
              })}
            </div>

            {/* Quick picks, counted from today (only those that can be picked). */}
            {presets.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5 border-t border-gray-100 pt-3">
                {presets.map((preset) => {
                  const key = addMonths(addDays(today, preset.days ?? 0), preset.months ?? 0);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => pick(key)}
                      disabled={!allowed(key)}
                      className={cn(
                        'rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium transition-colors',
                        'hover:border-brand/50 hover:bg-brand/5 hover:text-brand-strong disabled:opacity-40',
                        key === value && 'border-brand bg-brand/10 text-brand-strong'
                      )}
                      title={boxFormat.format(fromKey(key))}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
