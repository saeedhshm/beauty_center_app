import { MARKET_TIME_ZONE } from '../config/scheduling.js';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MARKET_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const weekdayFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: MARKET_TIME_ZONE,
  weekday: 'short',
});

const ISO_WEEKDAY: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

function wallParts(instant: Date) {
  const values: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') values[part.type] = Number(part.value);
  }
  return values as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}

/** Offset of the Cairo wall clock ahead of UTC, in milliseconds, at the given instant. */
export function cairoOffsetMs(instant: Date): number {
  const wall = wallParts(instant);
  return Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) - instant.getTime();
}

/** Convert a Cairo wall-clock time to the equivalent UTC instant. Handles DST without a fixed offset. */
export function cairoWallToUtc(year: number, month: number, day: number, hour: number, minute: number): Date {
  let instant = Date.UTC(year, month - 1, day, hour, minute);
  for (let i = 0; i < 3; i++) instant = Date.UTC(year, month - 1, day, hour, minute) - cairoOffsetMs(new Date(instant));
  return new Date(instant);
}

export function cairoDateString(instant: Date): string {
  const wall = wallParts(instant);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

/** ISO weekday (Monday=1, Sunday=7) of a Cairo local date. */
export function cairoWeekday(year: number, month: number, day: number): number {
  const label = weekdayFormatter.format(cairoWallToUtc(year, month, day, 12, 0));
  return ISO_WEEKDAY[label] ?? 7;
}

export function parseLocalDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const probe = new Date(Date.UTC(year, month - 1, day));
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month - 1 || probe.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function addLocalDays(date: { year: number; month: number; day: number }, delta: number) {
  const utc = new Date(Date.UTC(date.year, date.month - 1, date.day + delta));
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() };
}

export function formatLocalDate(date: { year: number; month: number; day: number }): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.year}-${pad(date.month)}-${pad(date.day)}`;
}

export function minutesOf(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h! * 60 + m!;
}

export function isValidDayTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
