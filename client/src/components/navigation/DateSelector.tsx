import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, fromDateKey, isSameDay, monthLong, toDateKey } from '../../lib/format';

// ---------------------------------------------------------------------------
// FotMob-style date navigation header:
//
//   ┌────────────────────────────────────────────┐
//   │  [ ‹ ]             Today ▼           [ › ] │
//   └────────────────────────────────────────────┘
//
// Circular arrows jump one day at a time; the centered label opens a calendar
// dropdown for picking a specific date.
// ---------------------------------------------------------------------------

const WEEKDAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface DateSelectorProps {
  value: string; // YYYY-MM-DD
  onChange: (key: string) => void;
}

export const DateSelector: React.FC<DateSelectorProps> = ({ value, onChange }) => {
  const today = new Date();
  const selected = fromDateKey(value);

  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // month being browsed inside the dropdown (starts on the selected month)
  const [view, setView] = useState(() => ({ year: selected.getFullYear(), month: selected.getMonth() }));

  useEffect(() => {
    setView({ year: selected.getFullYear(), month: selected.getMonth() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const move = (days: number) => onChange(toDateKey(addDays(selected, days)));

  const diffDays = Math.round(
    (fromDateKey(value).getTime() - fromDateKey(toDateKey(today)).getTime()) / 86400000
  );
  const centerLabel =
    diffDays === 0
      ? 'Today'
      : diffDays === 1
        ? 'Tomorrow'
        : diffDays === -1
          ? 'Yesterday'
          : `${WEEKDAYS_LONG[selected.getDay()]}, ${MONTHS_SHORT[selected.getMonth()]} ${selected.getDate()}`;

  // Monday-first 6x7 grid for the browsed month
  const cells = useMemo(() => {
    const firstOfMonth = new Date(view.year, view.month, 1);
    const gridStart = addDays(firstOfMonth, -((firstOfMonth.getDay() + 6) % 7));
    return Array.from({ length: 42 }, (_, i) => addDays(gridStart, i));
  }, [view.year, view.month]);

  const shiftMonth = (delta: number) =>
    setView(v => {
      const m = v.month + delta;
      const year = v.year + Math.floor(m / 12);
      return { year, month: ((m % 12) + 12) % 12 };
    });

  const pickDate = (d: Date) => {
    onChange(toDateKey(d));
    setOpen(false);
  };

  const arrowCls =
    'press focus-ring flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface3 text-muted transition-colors duration-150 hover:bg-line hover:text-txt';

  return (
    <div ref={rootRef} className="relative w-full">
      {/* Navigation bar */}
      <div className="relative flex h-14 items-center justify-between rounded-t-xl border-b border-line bg-surface px-2 sm:px-3">
        <button type="button" onClick={() => move(-1)} className={arrowCls} aria-label="Previous day">
          <ChevronLeft size={19} strokeWidth={2.4} />
        </button>

        <button
          type="button"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-haspopup="dialog"
          className="press focus-ring flex max-w-[60%] items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-bold text-txt transition-colors duration-150 hover:bg-surface2 sm:text-[15px]"
        >
          <span className="truncate">{centerLabel}</span>
          <ChevronDown size={15} strokeWidth={2.4} className={`shrink-0 text-faint transition-transform duration-150 ${open ? 'rotate-180' : ''}`} />
        </button>

        <button type="button" onClick={() => move(1)} className={arrowCls} aria-label="Next day">
          <ChevronRight size={19} strokeWidth={2.4} />
        </button>
      </div>

      {/* Calendar dropdown */}
      {open && (
        <div
          role="dialog"
          aria-label="Pick a date"
          className="card absolute left-1/2 top-full z-50 mt-1.5 w-[286px] -translate-x-1/2 p-3 shadow-pop animate-slideDown"
        >
          <div className="mb-1 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="press focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface2 hover:text-txt"
              aria-label="Previous month"
            >
              <ChevronLeft size={15} />
            </button>
            <p className="text-xs font-bold uppercase tracking-wider text-muted">
              {monthLong(view.year, view.month)}
            </p>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="press focus-ring flex h-7 w-7 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface2 hover:text-txt"
              aria-label="Next month"
            >
              <ChevronRight size={15} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-y-0.5 text-center text-2xs font-bold text-faint">
            {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(w => (
              <span key={w} className="py-1">
                {w}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map(d => {
              const key = toDateKey(d);
              const inMonth = d.getMonth() === view.month;
              const isSelected = key === value;
              const isTodayCell = isSameDay(d, today);
              return (
                <button
                  key={key}
                  onClick={() => pickDate(d)}
                  aria-selected={isSelected}
                  className={`press focus-ring tnum flex h-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                    isSelected
                      ? 'bg-accent font-extrabold text-accent-ink'
                      : inMonth
                        ? `text-txt hover:bg-surface2 ${isTodayCell ? 'font-extrabold text-accent' : ''}`
                        : 'text-faint/60 hover:bg-surface2'
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>

          {!isSameDay(selected, today) && (
            <button
              type="button"
              onClick={() => pickDate(today)}
              className="press focus-ring mt-2 w-full rounded-lg border border-line py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-accent/10"
            >
              Jump to today
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default DateSelector;
