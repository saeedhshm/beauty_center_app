import { z } from 'zod';

export const uuidSchema = z.uuid();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type Page = z.infer<typeof pageSchema>;

export const payoutCreateSchema = z.object({
  expertId: uuidSchema,
  bookingIds: z.array(uuidSchema).min(1).max(200),
}).strict().refine((v) => new Set(v.bookingIds).size === v.bookingIds.length, {
  message: 'bookingIds يجب أن تكون فريدة',
  path: ['bookingIds'],
});

export const payoutListQuery = pageSchema.extend({
  expertId: uuidSchema.optional(),
  transferred: z.coerce.boolean().optional(),
}).strict();
export type PayoutListQuery = z.infer<typeof payoutListQuery>;

export const eligibleQuerySchema = z.object({ expertId: uuidSchema }).strict();

export const transferSchema = z.object({
  transferRef: z.string().trim().min(1).max(200),
}).strict();
