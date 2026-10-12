import { z } from 'zod';

export const uuidSchema = z.uuid();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type Page = z.infer<typeof pageSchema>;

export const createReviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).nullable().optional(),
}).strict();
export type CreateReviewInput = z.infer<typeof createReviewSchema>;

export const adminReviewQuery = pageSchema.extend({
  bookingId: uuidSchema.optional(),
  revieweeId: uuidSchema.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
}).strict();
export type AdminReviewQuery = z.infer<typeof adminReviewQuery>;
