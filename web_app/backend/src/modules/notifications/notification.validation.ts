import { z } from 'zod';

export const uuidSchema = z.uuid();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type Page = z.infer<typeof pageSchema>;

/** Provider device tokens are opaque and long; only printable characters are accepted. */
export const deviceTokenSchema = z.string().trim().min(8).max(500)
  .regex(/^[A-Za-z0-9:_\-.]+$/, 'رمز الجهاز غير صالح');

export const registerDeviceSchema = z.object({
  token: deviceTokenSchema,
}).strict();
export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;

export const notificationListQuery = pageSchema.extend({
  unreadOnly: z.enum(['true', 'false']).default('false'),
}).strict();
export type NotificationListQuery = z.infer<typeof notificationListQuery>;

export const adminOutboxQuery = pageSchema.extend({
  status: z.enum(['pending', 'sent', 'failed']).optional(),
}).strict();
export type AdminOutboxQuery = z.infer<typeof adminOutboxQuery>;
