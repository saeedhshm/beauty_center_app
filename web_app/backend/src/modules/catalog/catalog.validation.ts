import { z } from 'zod';

export const idSchema = z.coerce.number().int().min(1).max(32767);
export const uuidSchema = z.uuid();
export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export const expertsQuery = pageSchema.extend({
  cityId: idSchema.optional(), serviceId: idSchema.optional(), q: z.string().trim().max(100).optional(),
  sort: z.enum(['name_asc', 'name_desc', 'rating_desc', 'price_asc', 'price_desc']).default('name_asc'),
}).strict().refine((value) => !value.sort.startsWith('price_') || value.serviceId !== undefined, {
  message: 'serviceId مطلوب عند الفرز بالسعر', path: ['serviceId'],
});
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
export const marketSettingsSchema = z.object({ currency: z.enum(['EGP', 'SAR']) }).strict();
export const currencyPatchSchema = marketSettingsSchema;

export const serviceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000).nullable().optional(),
  durationMin: z.number().int().min(1).max(1440),
  isActive: z.boolean().default(true),
}).strict();
export const servicePatchSchema = serviceSchema.partial().extend({ isActive: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0);
export const cityPatchSchema = z.object({ isActive: z.boolean() }).strict();
export const citySchema = z.object({
  name: z.string().trim().min(2).max(100)
    .regex(/^[\p{Script=Arabic}\p{N}][\p{Script=Arabic}\p{N}\p{M} .'-]*$/u, 'استخدمي اسمًا عربيًا صالحًا للعرض'),
  code: z.string().regex(/^[A-Z]{2}-[A-Z0-9]{2,12}$/, 'استخدمي رمزًا ثابتًا مثل EG-ALX'),
}).strict();

const longitude = z.number().finite().min(-180).max(180);
const latitude = z.number().finite().min(-90).max(90);
const positionSchema = z.tuple([longitude, latitude]);
const ringSchema = z.array(positionSchema).min(4).refine((ring) => {
  const first = ring[0]; const last = ring.at(-1);
  return first?.[0] === last?.[0] && first?.[1] === last?.[1];
}, 'كل حلقة GeoJSON يجب أن تكون مغلقة');
const polygonCoordinatesSchema = z.array(ringSchema).min(1);
const polygonSchema = z.object({ type: z.literal('Polygon'), coordinates: polygonCoordinatesSchema }).strict();
const multiPolygonSchema = z.object({ type: z.literal('MultiPolygon'), coordinates: z.array(polygonCoordinatesSchema).min(1) }).strict();
const boundaryDecimal = (bound: number) => z.string().regex(/^-?\d{1,3}(?:\.\d{1,7})?$/)
  .refine((value) => Math.abs(Number(value)) <= bound);
export const cityBoundarySchema = z.object({
  geometry: z.discriminatedUnion('type', [polygonSchema, multiPolygonSchema]),
  bounds: z.object({
    south: boundaryDecimal(90), west: boundaryDecimal(180),
    north: boundaryDecimal(90), east: boundaryDecimal(180),
  }).strict(),
  sourceRef: z.string().trim().min(1).max(200),
}).strict().superRefine((value, context) => {
  const bounds = Object.fromEntries(Object.entries(value.bounds).map(([key, item]) => [key, Number(item)])) as Record<keyof typeof value.bounds, number>;
  if (bounds.south >= bounds.north) context.addIssue({ code: 'custom', message: 'south يجب أن يكون أقل من north', path: ['bounds'] });
  if (bounds.west >= bounds.east) context.addIssue({ code: 'custom', message: 'west يجب أن يكون أقل من east', path: ['bounds'] });
  const polygons = value.geometry.type === 'Polygon' ? [value.geometry.coordinates] : value.geometry.coordinates;
  let points = 0;
  for (const polygon of polygons) for (const ring of polygon) for (const [lng, lat] of ring) {
    points += 1;
    if (lat < bounds.south || lat > bounds.north || lng < bounds.west || lng > bounds.east) {
      context.addIssue({ code: 'custom', message: 'الهندسة يجب أن تقع بالكامل داخل bounds', path: ['geometry'] });
      return;
    }
  }
  if (points > 10_000) context.addIssue({ code: 'custom', message: 'الحد الأقصى 10000 نقطة', path: ['geometry'] });
});
export const expertPatchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  bio: z.string().trim().max(2000).nullable().optional(),
  cityId: idSchema.optional(),
  isAcceptingBookings: z.boolean().optional(),
}).strict().refine((v) => Object.keys(v).length > 0);
export const expertPriceSchema = z.object({ price: priceSchema, isActive: z.boolean().default(true) }).strict();

const coordinate = (bound: number) => z.string().regex(/^-?\d{1,3}(?:\.\d{1,6})?$/)
  .refine((v) => Math.abs(Number(v)) <= bound);
const addressObject = z.object({
  label: z.string().trim().min(1).max(100),
  addressText: z.string().trim().min(5).max(1000),
  cityId: idSchema,
  lat: coordinate(90),
  lng: coordinate(180),
  isDefault: z.boolean().default(false),
}).strict();
const paired = (v: { lat?: string | undefined; lng?: string | undefined }) =>
  (v.lat === undefined && v.lng === undefined) || (typeof v.lat === 'string' && typeof v.lng === 'string');
export const addressSchema = addressObject;
export const addressPatchSchema = addressObject.partial().extend({ isDefault: z.boolean().optional() }).refine(paired, { message: 'الإحداثيات مطلوبة كزوج', path: ['lat'] })
  .refine((v) => Object.keys(v).length > 0);

export type ServiceInput = z.infer<typeof serviceSchema>;
export type CityInput = z.infer<typeof citySchema>;
export type CityBoundaryInput = z.infer<typeof cityBoundarySchema>;
export type ExpertPatch = z.infer<typeof expertPatchSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
