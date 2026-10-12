import { z } from 'zod';

export const idSchema = z.coerce.number().int().min(1).max(32767);
export const uuidSchema = z.uuid();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const expertsQuery = pageSchema.extend({
  cityId: idSchema.optional(), serviceId: idSchema.optional(), q: z.string().trim().max(100).optional(),
}).strict();
export const adminExpertsQuery = pageSchema.extend({ approvalStatus: z.enum(['pending', 'approved', 'suspended']).optional() }).strict();
export type Page = z.infer<typeof pageSchema>;
export type ExpertQuery = z.infer<typeof expertsQuery>;

const priceSchema = z.string().regex(/^\d{1,8}(?:\.\d{1,2})?$/, 'أرسلي مبلغًا عشريًا نصيًا بمنزلتين كحد أقصى')
  .transform((v) => { const [whole, fraction = ''] = v.split('.'); return `${BigInt(whole!).toString()}.${fraction.padEnd(2, '0')}`; });
const rateSchema = z.string().regex(/^\d{1,3}(?:\.\d{1,4})?$/).refine((v) => Number(v) <= 100)
  .transform((v) => { const [whole, fraction = ''] = v.split('.'); return `${BigInt(whole!).toString()}.${fraction.padEnd(4, '0')}`; });
export const bookingPolicySchema = z.object({
  acceptanceTimeoutMinutes: z.number().int().min(1).max(1440),
  paymentTimeoutMinutes: z.number().int().min(1).max(1440),
  commissionRate: rateSchema,
}).strict();
export const policyPatchSchema = bookingPolicySchema.partial().refine((v) => Object.keys(v).length > 0);
export type BookingPolicy = z.infer<typeof bookingPolicySchema>;

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  durationMin: z.number().int().min(1).max(1440),
  isActive: z.boolean().default(true),
}).strict();
export const servicePatchSchema = serviceSchema.partial().extend({ isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0);
export const cityPatchSchema = z.object({ isActive: z.boolean() }).strict();
export const expertPatchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  cityId: idSchema.optional(),
  isAcceptingBookings: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0);
export const expertPriceSchema = z.object({ price: priceSchema, isActive: z.boolean().default(true) }).strict();

const coordinate = (bound: number) => z.string().regex(/^-?\d{1,3}(?:\.\d{1,6})?$/)
  .refine((v) => Math.abs(Number(v)) <= bound).nullable();
const addressObject = z.object({
  label: z.string().trim().min(1).max(100),
  addressText: z.string().trim().min(5).max(1000),
  cityId: idSchema,
  lat: coordinate(90).optional(),
  lng: coordinate(180).optional(),
  isDefault: z.boolean().default(false),
}).strict();
const paired = (v: { lat?: string | null | undefined; lng?: string | null | undefined }) =>
  (v.lat === undefined && v.lng === undefined) || (v.lat === null && v.lng === null) || (typeof v.lat === 'string' && typeof v.lng === 'string');
export const addressSchema = addressObject.refine(paired, { message: 'أرسلي خط العرض والطول معًا أو null لكليهما', path: ['lat'] });
export const addressPatchSchema = addressObject.partial().extend({ isDefault: z.boolean().optional() }).refine(paired, { message: 'الإحداثيات مطلوبة كزوج', path: ['lat'] })
  .refine((v) => Object.keys(v).length > 0);

export type ServiceInput = z.infer<typeof serviceSchema>;
export type ExpertPatch = z.infer<typeof expertPatchSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
