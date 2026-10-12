import { z } from 'zod';

export const uuidSchema = z.uuid();

// Optional `Idempotency-Key` request header for safe booking retries after a
// timeout. Keys are UUIDs scoped to the calling customer.
export const idempotencyKeySchema = z.union([z.uuid(), z.array(z.uuid()).min(1).max(1).transform((values) => values[0]!)]);
export type IdempotencyKey = string;
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type Page = z.infer<typeof pageSchema>;

const dateTime = z.string().refine((v) => !Number.isNaN(Date.parse(v)), { message: 'أرسلي تاريخًا ووقتًا بصيغة ISO صحيحة' });

export const bookingCreateSchema = z.object({
  expertId: uuidSchema,
  serviceId: z.coerce.number().int().min(1).max(32767),
  addressId: uuidSchema,
  startsAt: dateTime,
  notes: z.string().trim().max(1000).nullable().optional(),
}).strict();

export const bookingListQuery = pageSchema.extend({
  status: z.enum(['pending', 'accepted', 'confirmed', 'completed', 'rejected', 'cancelled', 'expired']).optional(),
  expertId: uuidSchema.optional(),
  customerId: uuidSchema.optional(),
}).strict();
export type BookingListQuery = z.infer<typeof bookingListQuery>;

export const transitionSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
}).strict().default({});

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
