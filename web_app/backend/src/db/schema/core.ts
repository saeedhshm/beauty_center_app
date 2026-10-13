import { sql } from 'drizzle-orm';
import {
  boolean, check, date, foreignKey, index, integer, jsonb, numeric,
  pgTable, primaryKey, smallint, text, time, timestamp, uniqueIndex, uuid,
} from 'drizzle-orm/pg-core';

export const timestamps = () => ({
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const cities = pgTable('cities', {
  id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  code: text('code'),
  isActive: boolean('is_active').notNull().default(false),
  boundary: jsonb('boundary'),
  boundaryBounds: jsonb('boundary_bounds'),
  boundarySource: text('boundary_source'),
  boundarySourceRef: text('boundary_source_ref'),
  boundaryUpdatedAt: timestamp('boundary_updated_at', { withTimezone: true }),
  ...timestamps(),
}, (t) => [
  uniqueIndex('cities_name_unique').on(t.name),
  uniqueIndex('cities_code_unique').on(t.code),
  check('cities_boundary_complete', sql`(
    ${t.boundary} is not null and ${t.boundaryBounds} is not null and ${t.boundarySource} is not null and ${t.boundarySourceRef} is not null and ${t.boundaryUpdatedAt} is not null
  ) or (
    ${t.boundary} is null and ${t.boundaryBounds} is null and ${t.boundarySource} is null and ${t.boundarySourceRef} is null and ${t.boundaryUpdatedAt} is null
  )`),
  check('cities_active_boundary', sql`not ${t.isActive} or ${t.boundary} is not null`),
]);

export const services = pgTable('services', {
  id: smallint('id').primaryKey().generatedAlwaysAsIdentity(),
  name: text('name').notNull(),
  description: text('description'),
  durationMin: integer('duration_min').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
}, (t) => [check('services_duration_positive', sql`${t.durationMin} > 0`)]);

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  ...timestamps(),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  // Null hashes remain possible for pre-existing accounts; mobile login rejects them.
  passwordHash: text('password_hash'),
  phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
  role: text('role').notNull(),
  cityId: smallint('city_id').references(() => cities.id, { onDelete: 'restrict' }),
  isActive: boolean('is_active').notNull().default(true),
  ratingAvg: numeric('rating_avg', { precision: 3, scale: 2 }).notNull().default('0'),
  ratingCount: integer('rating_count').notNull().default(0),
  ...timestamps(),
}, (t) => [
  uniqueIndex('users_phone_unique').on(t.phone),
  check('users_role_valid', sql`${t.role} in ('customer', 'expert', 'admin')`),
  check('users_rating_valid', sql`${t.ratingAvg} between 0 and 5 and ${t.ratingCount} >= 0`),
]);

export const expertProfiles = pgTable('expert_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'restrict' }),
  bio: text('bio'),
  approvalStatus: text('approval_status').notNull().default('pending'),
  isAcceptingBookings: boolean('is_accepting_bookings').notNull().default(false),
  identityDocumentKey: text('identity_document_key'),
  ...timestamps(),
}, (t) => [check('expert_profiles_approval_valid', sql`${t.approvalStatus} in ('pending', 'approved', 'suspended')`)]);

export const customerAddresses = pgTable('customer_addresses', {
  id: uuid('id').primaryKey().defaultRandom(),
  customerId: uuid('customer_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  label: text('label').notNull(),
  addressText: text('address_text').notNull(),
  cityId: smallint('city_id').notNull().references(() => cities.id, { onDelete: 'restrict' }),
  lat: numeric('lat', { precision: 9, scale: 6 }),
  lng: numeric('lng', { precision: 9, scale: 6 }),
  isDefault: boolean('is_default').notNull().default(false),
  ...timestamps(),
}, (t) => [
  uniqueIndex('customer_addresses_one_default').on(t.customerId).where(sql`${t.isDefault}`),
  index('customer_addresses_customer_idx').on(t.customerId),
  check('customer_addresses_coordinates_valid', sql`(${t.lat} is null and ${t.lng} is null) or (${t.lat} is not null and ${t.lng} is not null and ${t.lat} between -90 and 90 and ${t.lng} between -180 and 180)`),
]);

export const expertServices = pgTable('expert_services', {
  expertId: uuid('expert_id').notNull().references(() => expertProfiles.userId, { onDelete: 'restrict' }),
  serviceId: smallint('service_id').notNull().references(() => services.id, { onDelete: 'restrict' }),
  price: numeric('price', { precision: 10, scale: 2 }).notNull(),
  currency: text('currency').notNull().default('EGP'),
  isActive: boolean('is_active').notNull().default(true),
  ...timestamps(),
}, (t) => [
  primaryKey({ columns: [t.expertId, t.serviceId] }),
  check('expert_services_price_nonnegative', sql`${t.price} between 0 and 99999999.99`),
  check('expert_services_currency_valid', sql`${t.currency} ~ '^[A-Z]{3}$'`),
]);

export const expertAvailability = pgTable('expert_availability', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => expertProfiles.userId, { onDelete: 'restrict' }),
  // ISO weekday: Monday=1, Sunday=7. Slot/overnight policy remains unimplemented.
  dayOfWeek: smallint('day_of_week').notNull(),
  startTime: time('start_time').notNull(),
  endTime: time('end_time').notNull(),
  ...timestamps(),
}, (t) => [
  check('expert_availability_day_valid', sql`${t.dayOfWeek} between 1 and 7`),
  check('expert_availability_time_order', sql`${t.endTime} > ${t.startTime}`),
  index('expert_availability_expert_day_idx').on(t.expertId, t.dayOfWeek),
]);

export const expertAvailabilityExceptions = pgTable('expert_availability_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => expertProfiles.userId, { onDelete: 'restrict' }),
  date: date('date').notNull(),
  // Both null represent a full local day. Conflict precedence is not chosen here.
  startTime: time('start_time'),
  endTime: time('end_time'),
  type: text('type').notNull(),
  reason: text('reason'),
  ...timestamps(),
}, (t) => [
  check('expert_availability_exceptions_type_valid', sql`${t.type} in ('available', 'unavailable')`),
  check('expert_availability_exceptions_times_paired', sql`(${t.startTime} is null) = (${t.endTime} is null)`),
  check('expert_availability_exceptions_time_order', sql`${t.endTime} is null or ${t.endTime} > ${t.startTime}`),
  index('expert_availability_exceptions_expert_date_idx').on(t.expertId, t.date),
]);

export const portfolioImages = pgTable('portfolio_images', {
  id: uuid('id').primaryKey().defaultRandom(),
  expertId: uuid('expert_id').notNull().references(() => expertProfiles.userId, { onDelete: 'restrict' }),
  serviceId: smallint('service_id'),
  storageKey: text('storage_key').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps(),
}, (t) => [
  foreignKey({ columns: [t.expertId, t.serviceId], foreignColumns: [expertServices.expertId, expertServices.serviceId] }).onDelete('restrict'),
  index('portfolio_images_expert_idx').on(t.expertId),
]);
