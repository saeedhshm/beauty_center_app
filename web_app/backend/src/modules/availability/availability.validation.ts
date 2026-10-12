import { z } from 'zod';
import { DAYTIME_END_MINUTES, DAYTIME_START_MINUTES, MAX_SLOTS_RANGE_DAYS } from '../../config/scheduling.js';
import { isValidDayTime, minutesOf } from '../../shared/cairo-time.js';

const clockTime = z.string().refine(isValidDayTime, { message: 'استخدمي صيغة HH:MM بصيغة 24 ساعة' });
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'استخدمي صيغة YYYY-MM-DD' });
export const uuidSchema = z.uuid();

const weeklyEntry = z.object({
  dayOfWeek: z.number().int().min(1).max(7),
  startTime: clockTime,
  endTime: clockTime,
}).strict().refine((v) => minutesOf(v.startTime) < minutesOf(v.endTime), {
  message: 'وقت البداية يجب أن يسبق وقت النهاية داخل اليوم نفسه',
  path: ['endTime'],
}).refine((v) => minutesOf(v.startTime) >= DAYTIME_START_MINUTES && minutesOf(v.endTime) <= DAYTIME_END_MINUTES, {
  message: 'العمل نهارًا فقط: من 09:00 إلى 22:00 بتوقيت القاهرة',
  path: ['startTime'],
});

export const weeklyScheduleSchema = z.object({
  slots: z.array(weeklyEntry).max(21),
}).strict().refine((v) => {
  const byDay = new Map<number, Array<[number, number]>>();
  for (const slot of v.slots) {
    const list = byDay.get(slot.dayOfWeek) ?? [];
    list.push([minutesOf(slot.startTime), minutesOf(slot.endTime)]);
    byDay.set(slot.dayOfWeek, list);
  }
  return [...byDay.values()].every((list) => {
    if (list.length > 3) return false;
    const sorted = list.sort((a, b) => a[0] - b[0]);
    return sorted.every(([start, end], i) => start < end && (i === 0 || sorted[i - 1]![1] <= start));
  });
}, { message: 'فترات اليوم الواحد يجب ألا تتداخل (3 فترات كحد أقصى لليوم)' });

export const exceptionSchema = z.object({
  date: localDate,
  startTime: clockTime.nullable().default(null),
  endTime: clockTime.nullable().default(null),
  type: z.enum(['available', 'unavailable']),
  reason: z.string().trim().max(500).nullable().optional(),
}).strict().refine((v) => (v.startTime === null) === (v.endTime === null), {
  message: 'أرسلي وقتي البداية والنهاية معًا أو اتركيهما فارغين ليوم كامل',
  path: ['startTime'],
}).refine((v) => v.startTime === null || minutesOf(v.startTime) < minutesOf(v.endTime!), {
  message: 'وقت البداية يجب أن يسبق وقت النهاية داخل اليوم نفسه',
  path: ['endTime'],
});

export const slotsQuerySchema = z.object({
  serviceId: z.coerce.number().int().min(1).max(32767),
  from: localDate,
  to: localDate,
}).strict().refine((v) => v.from <= v.to, { message: 'تاريخ النهاية يجب ألا يسبق تاريخ البداية', path: ['to'] })
  .refine((v) => {
    const days = Math.round((Date.parse(`${v.to}T00:00:00Z`) - Date.parse(`${v.from}T00:00:00Z`)) / 86400000);
    return days <= MAX_SLOTS_RANGE_DAYS - 1;
  }, { message: `نطاق الاستعلام 14 يومًا كحد أقصى`, path: ['to'] });

export type WeeklyScheduleInput = z.infer<typeof weeklyScheduleSchema>;
export type ExceptionInput = z.infer<typeof exceptionSchema>;
export type SlotsQuery = z.infer<typeof slotsQuerySchema>;
