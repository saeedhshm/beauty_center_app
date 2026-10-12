import { z } from 'zod';

// Cairo launch: Egyptian mobile numbers, normalized to E.164.
export const phoneSchema = z.string().trim().max(20)
  .regex(/^(?:01[0125]\d{8}|\+201[0125]\d{8})$/, 'استخدمي رقم محمول مصري بصيغة 01xxxxxxxxx أو +201xxxxxxxxx')
  .transform((phone) => phone.startsWith('01') ? `+20${phone.slice(1)}` : phone);

// Existing Saudi demo accounts keep their identity; new registration is Egyptian only.
const legacyPhoneSchema = z.string().trim().max(20).regex(/^(?:05\d{8}|\+9665\d{8})$/)
  .transform((phone) => phone.startsWith('05') ? `+966${phone.slice(1)}` : phone);

export const otpRequestSchema = z.object({ phone: phoneSchema }).strict();
export const registrationSchema = z.object({
  phone: phoneSchema,
  challengeId: z.uuid(),
  otp: z.string().regex(/^\d{6}$/, 'رمز التحقق مكون من 6 أرقام'),
  name: z.string().trim().min(2).max(100),
  password: z.string().min(12, 'كلمة المرور يجب أن تحتوي على 12 حرفًا على الأقل').max(128),
  role: z.enum(['customer', 'expert']),
}).strict();
export const loginSchema = z.object({ phone: z.union([phoneSchema, legacyPhoneSchema]), password: z.string().min(1).max(128) }).strict();
export const refreshSchema = z.object({ refreshToken: z.string().regex(/^lr_[A-Za-z0-9_-]{43}$/) }).strict();
export type RegistrationInput = z.infer<typeof registrationSchema>;

const newPasswordSchema = z.string().min(12, 'كلمة المرور يجب أن تحتوي على 12 حرفًا على الأقل').max(128);
const otpVerifySchema = z.object({
  challengeId: z.uuid(),
  otp: z.string().regex(/^\d{6}$/, 'رمز التحقق مكون من 6 أرقام'),
});

// Password recovery: same OTP challenge machinery as registration, then the
// hash is rotated and every session is revoked. No session is issued here;
// the client logs in again explicitly.
export const passwordResetSchema = z.object({
  phone: phoneSchema,
  challengeId: z.uuid(),
  otp: z.string().regex(/^\d{6}$/, 'رمز التحقق مكون من 6 أرقام'),
  newPassword: newPasswordSchema,
}).strict();

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: newPasswordSchema,
}).strict().refine((v) => v.currentPassword !== v.newPassword, {
  message: 'كلمة المرور الجديدة يجب أن تختلف عن الحالية',
  path: ['newPassword'],
});

// Phone change verifies ownership of the NEW number before it replaces the old one.
export const phoneChangeSchema = otpVerifySchema.extend({ phone: phoneSchema }).strict();

export const profilePatchSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  cityId: z.coerce.number().int().min(1).max(32767).optional(),
}).strict().refine((v) => v.name !== undefined || v.cityId !== undefined, {
  message: 'أرسلي name أو cityId على الأقل',
});

export const uuidSchema = z.uuid();
export const auditQuerySchema = z.object({
  action: z.string().trim().min(1).max(100).optional(),
  resourceType: z.string().trim().min(1).max(100).optional(),
  actorId: z.uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
}).strict();

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(1000).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type Page = z.infer<typeof pageSchema>;

export const adminUsersQuerySchema = pageSchema.extend({
  role: z.enum(['customer', 'expert', 'admin']).optional(),
  isActive: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
  q: z.string().trim().min(1).max(100).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
}).strict();
export type AdminUsersQuery = z.infer<typeof adminUsersQuerySchema>;
