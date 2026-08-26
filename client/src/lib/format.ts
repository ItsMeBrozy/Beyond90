// ---------------------------------------------------------------------------
// Date / time / number formatting helpers shared across the app.
// ---------------------------------------------------------------------------

export const pad2 = (n: number): string => String(n).padStart(2, '0');

export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + days);
  return out;
}

export function isSameDay(a: Date, b: Date): boolean {
  return toDateKey(a) === toDateKey(b);
}

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function dayLabel(d: Date, today: Date): string {
  const diff = Math.round((fromDateKey(toDateKey(d)).getTime() - fromDateKey(toDateKey(today)).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return `${WEEKDAYS_SHORT[d.getDay()]} ${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

export function weekdayShort(d: Date): string {
  return WEEKDAYS_SHORT[d.getDay()];
}

export function timeLabel(iso: string): string {
  const d = new Date(iso);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

export function dateShortLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, addDays(today, 1))) return 'Tomorrow';
  if (isSameDay(d, addDays(today, -1))) return 'Yesterday';
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${pad2(d.getDate())} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function fullDateLabel(iso: string): string {
  const d = new Date(iso);
  return `${WEEKDAYS_SHORT[d.getDay()]} ${d.getDate()} ${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

export function monthLong(year: number, month: number): string {
  return `${MONTHS_LONG[month]} ${year}`;
}

/** "3h ago", "45m ago", "2d ago" for news timestamps */
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diff = Math.max(0, now - new Date(iso).getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  return `${weeks}w ago`;
}
