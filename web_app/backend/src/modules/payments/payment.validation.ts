import { z } from 'zod';

export const uuidSchema = z.uuid();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type Page = z.infer<typeof pageSchema>;

const moneyString = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/, 'أرسلي مبلغًا عشريًا نصيًا بمنزلتين كحد أقصى');

export const paymentListQuery = pageSchema.extend({
  status: z.enum(['pending', 'paid', 'failed', 'refunded']).optional(),
  bookingId: uuidSchema.optional(),
}).strict();
export type PaymentListQuery = z.infer<typeof paymentListQuery>;

/**
 * Simulated provider callback. Amount and currency are echoed back so the
 * server can match them against its own records; they are never trusted.
 */
export const demoWebhookSchema = z.object({
  paymentId: uuidSchema,
  eventId: z.string().trim().min(1).max(100),
  outcome: z.enum(['paid', 'failed']),
  amount: moneyString,
  currency: z.string().regex(/^[A-Z]{3}$/),
  token: z.string().min(10).max(200),
  failureReason: z.string().trim().max(500).nullable().optional(),
}).strict();
export type DemoWebhookInput = z.infer<typeof demoWebhookSchema>;

export const refundSchema = z.object({
  reason: z.string().trim().max(500).nullable().optional(),
}).strict().default({});
