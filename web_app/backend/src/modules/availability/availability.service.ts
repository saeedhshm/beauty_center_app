import { DAYTIME_END_MINUTES, DAYTIME_START_MINUTES, MARKET_TIME_ZONE, MAX_SLOTS_RANGE_DAYS, SLOT_STEP_MINUTES } from '../../config/scheduling.js';
import { AppError } from '../../shared/app-error.js';
import {
  addLocalDays, cairoDateString, cairoWallToUtc, cairoWeekday, formatLocalDate, minutesOf, parseLocalDate,
} from '../../shared/cairo-time.js';
import type { AuthenticatedUser } from '../auth/auth.service.js';
import { marketSettingsSchema } from '../catalog/catalog.validation.js';
import { AvailabilityRepository } from './availability.repository.js';
import type { ExceptionInput, SlotsQuery, WeeklyScheduleInput } from './availability.validation.js';

type Interval = [number, number];
type LocalDate = { year: number; month: number; day: number };

const requireExpert = (user: AuthenticatedUser) => {
  if (user.role !== 'expert') throw new AppError(403, 'FORBIDDEN', 'ليس لديك صلاحية لهذه العملية');
};
const notFound = () => new AppError(404, 'NOT_FOUND', 'البيانات المطلوبة غير موجودة');

const scheduleDto = (row: { id: string; dayOfWeek: number; startTime: string; endTime: string }) => ({
  id: row.id, dayOfWeek: row.dayOfWeek, startTime: row.startTime.slice(0, 5), endTime: row.endTime.slice(0, 5),
});
const exceptionDto = (row: { id: string; date: string; startTime: string | null; endTime: string | null; type: string; reason: string | null }) => ({
  id: row.id, date: row.date, startTime: row.startTime?.slice(0, 5) ?? null, endTime: row.endTime?.slice(0, 5) ?? null,
  type: row.type, reason: row.reason,
});

function subtract(intervals: Interval[], cut: Interval): Interval[] {
  const result: Interval[] = [];
  for (const [start, end] of intervals) {
    if (cut[1] <= start || cut[0] >= end) { result.push([start, end]); continue; }
    if (cut[0] > start) result.push([start, cut[0]]);
    if (cut[1] < end) result.push([cut[1], end]);
  }
  return result;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Working intervals for one local date, in minutes.
 * Weekly schedule first, then every unavailable exception is subtracted
 * (a full-day block clears the day). Available extras are added only outside
 * blocked time: unavailable always wins, including partial-against-partial
 * overlaps and extras on a fully blocked day. Everything is clipped to the
 * daytime window.
 */
export function workingIntervals(
  weekday: number,
  weekly: Array<{ dayOfWeek: number; startTime: string; endTime: string }>,
  dayExceptions: Array<{ startTime: string | null; endTime: string | null; type: string }>,
): Interval[] {
  let intervals: Interval[] = weekly
    .filter((slot) => slot.dayOfWeek === weekday)
    .map((slot) => [minutesOf(slot.startTime.slice(0, 5)), minutesOf(slot.endTime.slice(0, 5))]);
  const blocked: Interval[] = [];
  const fullDayBlocked = dayExceptions.some((e) => e.type === 'unavailable' && e.startTime === null);
  if (fullDayBlocked) {
    intervals = [];
    blocked.push([0, 24 * 60]);
  }
  for (const e of dayExceptions) {
    if (e.type !== 'unavailable' || e.startTime === null || e.endTime === null) continue;
    const cut: Interval = [minutesOf(e.startTime.slice(0, 5)), minutesOf(e.endTime.slice(0, 5))];
    blocked.push(cut);
    intervals = subtract(intervals, cut);
  }
  for (const e of dayExceptions) {
    if (e.type !== 'available' || e.startTime === null || e.endTime === null) continue;
    let extra: Interval[] = [[minutesOf(e.startTime.slice(0, 5)), minutesOf(e.endTime.slice(0, 5))]];
    for (const cut of blocked) extra = extra.flatMap((slot) => subtract([slot], cut));
    intervals.push(...extra);
  }
  const clipped = intervals
    .map(([s, e]): Interval => [Math.max(s, DAYTIME_START_MINUTES), Math.min(e, DAYTIME_END_MINUTES)])
    .filter(([s, e]) => s < e)
    .sort((a, b) => a[0] - b[0]);
  const merged: Interval[] = [];
  for (const current of clipped) {
    const last = merged[merged.length - 1];
    if (last && current[0] <= last[1]) last[1] = Math.max(last[1], current[1]);
    else merged.push([...current] as Interval);
  }
  return merged;
}

export class AvailabilityService {
  constructor(private readonly repo: AvailabilityRepository) {}

  async ownSchedule(actor: AuthenticatedUser) {
    requireExpert(actor);
    return (await this.repo.weekly(actor.id)).map(scheduleDto);
  }

  async replaceOwnSchedule(actor: AuthenticatedUser, input: WeeklyScheduleInput) {
    requireExpert(actor);
    return this.repo.transaction(async (repo) => {
      const expert = await repo.lockExpert(actor.id);
      if (!expert || expert.role !== 'expert' || !expert.isActive) throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
      return (await repo.replaceWeekly(actor.id, input.slots)).map(scheduleDto);
    });
  }

  async ownExceptions(actor: AuthenticatedUser) {
    requireExpert(actor);
    return (await this.repo.exceptions(actor.id)).map(exceptionDto);
  }

  async addOwnException(actor: AuthenticatedUser, input: ExceptionInput) {
    requireExpert(actor);
    const parsed = parseLocalDate(input.date);
    if (!parsed) throw new AppError(422, 'VALIDATION_ERROR', 'تحققي من البيانات المدخلة');
    return this.repo.transaction(async (repo) => {
      const expert = await repo.lockExpert(actor.id);
      if (!expert || expert.role !== 'expert' || !expert.isActive) throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
      if (input.date < cairoDateString(new Date())) throw new AppError(422, 'VALIDATION_ERROR', 'الاستثناء يجب أن يكون لتاريخ اليوم أو مستقبل');
      return exceptionDto(await repo.addException({
        expertId: actor.id, date: input.date,
        startTime: input.startTime, endTime: input.endTime, type: input.type, reason: input.reason ?? null,
      }));
    });
  }

  async deleteOwnException(actor: AuthenticatedUser, id: string) {
    requireExpert(actor);
    return this.repo.transaction(async (repo) => {
      const expert = await repo.lockExpert(actor.id);
      if (!expert || expert.role !== 'expert' || !expert.isActive) throw new AppError(403, 'FORBIDDEN', 'الحساب غير مؤهل لهذه العملية');
      if (!await repo.deleteException(actor.id, id)) throw notFound();
    });
  }

  async slots(expertId: string, query: SlotsQuery, now = new Date()) {
    return this.repo.transaction((repo) => this.slotsWithRepository(repo, expertId, query, now));
  }

  private async slotsWithRepository(repo: AvailabilityRepository, expertId: string, query: SlotsQuery, now: Date) {
    const market = await repo.market('share');
    if (!market) throw new AppError(503, 'CONFIGURATION_UNAVAILABLE', 'إعدادات التشغيل غير مكتملة');
    const currency = marketSettingsSchema.parse(market.value).currency;
    const service = await repo.service(query.serviceId);
    if (!service?.isActive) throw notFound();
    const offered = await repo.expertPrice(expertId, query.serviceId);
    if (!offered?.isActive || offered.currency !== currency) throw notFound();
    if (!await repo.isPublished(expertId)) throw notFound();
    const durationMin = service.durationMin;

    const from = parseLocalDate(query.from);
    const to = parseLocalDate(query.to);
    if (!from || !to) throw notFound();
    const today = cairoDateString(now);
    let cursor = formatLocalDate(from) < today ? parseLocalDate(today)! : from;
    const days: Array<{ date: string; slots: Array<{ startsAt: string; endsAt: string }> }> = [];
    const rangeStart = cairoWallToUtc(cursor.year, cursor.month, cursor.day, 0, 0);
    const endCursor = addLocalDays(to, 1);
    const rangeEnd = cairoWallToUtc(endCursor.year, endCursor.month, endCursor.day, 0, 0);
    const [weekly, dayExceptions, blocking] = await Promise.all([
      repo.weekly(expertId),
      repo.exceptions(expertId, formatLocalDate(cursor), query.to),
      repo.blockingBookings(expertId, rangeStart, rangeEnd),
    ]);
    const blocked = blocking.map((b) => [b.startsAt.getTime(), b.endsAt.getTime()] as [number, number]);

    for (let step = 0; step < MAX_SLOTS_RANGE_DAYS; step++) {
      const dateLabel = formatLocalDate(cursor);
      if (dateLabel > query.to) break;
      const weekday = cairoWeekday(cursor.year, cursor.month, cursor.day);
      const intervals = workingIntervals(weekday, weekly, dayExceptions.filter((e) => e.date === dateLabel));
      const daySlots: Array<{ startsAt: string; endsAt: string }> = [];
      for (const [start, end] of intervals) {
        const first = Math.ceil(start / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
        for (let minute = first; minute + durationMin <= end; minute += SLOT_STEP_MINUTES) {
          const startsAt = cairoWallToUtc(cursor.year, cursor.month, cursor.day, Math.floor(minute / 60), minute % 60);
          if (startsAt.getTime() <= now.getTime()) continue;
          const endsAt = new Date(startsAt.getTime() + durationMin * 60000);
          if (!blocked.some(([bStart, bEnd]) => overlaps(startsAt.getTime(), endsAt.getTime(), bStart, bEnd))) {
            daySlots.push({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
          }
        }
      }
      days.push({ date: dateLabel, slots: daySlots });
      cursor = addLocalDays(cursor, 1);
    }
    return { expertId, service: { id: service.id, durationMin }, timeZone: MARKET_TIME_ZONE, days };
  }

  /** Advisory coverage check reused by booking creation/acceptance; the exclusion constraint decides. */
  async covers(
    expertId: string, startsAt: Date, endsAt: Date,
    preloaded?: { weekly: Array<{ dayOfWeek: number; startTime: string; endTime: string }>; exceptions: Array<{ date: string; startTime: string | null; endTime: string | null; type: string }> },
  ): Promise<boolean> {
    const wall = cairoDateString(startsAt);
    if (cairoDateString(endsAt) !== wall) return false;
    const parsed = parseLocalDate(wall)!;
    const startMinutes = Number.isNaN(startsAt.getTime()) ? -1 : this.wallMinutes(startsAt);
    const endMinutes = this.wallMinutes(endsAt);
    if (startMinutes < DAYTIME_START_MINUTES || endMinutes > DAYTIME_END_MINUTES || startMinutes >= endMinutes) return false;
    const weekly = preloaded?.weekly ?? await this.repo.weekly(expertId);
    const exceptions = preloaded?.exceptions ?? await this.repo.exceptions(expertId, wall, wall);
    const intervals = workingIntervals(cairoWeekday(parsed.year, parsed.month, parsed.day), weekly, exceptions);
    return intervals.some(([s, e]) => s <= startMinutes && endMinutes <= e);
  }

  private wallMinutes(instant: Date): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: MARKET_TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(instant);
    const [h, m] = parts.split(':').map(Number);
    return h! * 60 + m!;
  }
}

export type { LocalDate };
