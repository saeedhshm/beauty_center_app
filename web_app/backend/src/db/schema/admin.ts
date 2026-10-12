import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { timestamps, users } from './core.js';

export const adminAuditLogs = pgTable('admin_audit_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  actorId: uuid('actor_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id').notNull(),
  details: jsonb('details').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('admin_audit_resource_created_idx').on(t.resourceType, t.resourceId, t.createdAt)]);

// Last successful cycle of the operations worker fleet, overwritten every
// tick. A single logical row (last writer wins) proves liveness without
// accumulating one row per process restart.
export const workerHeartbeats = pgTable('worker_heartbeats', {
  key: text('key').primaryKey(),
  tickAt: timestamp('tick_at', { withTimezone: true }).notNull(),
  expired: integer('expired').notNull().default(0),
  claimed: integer('claimed').notNull().default(0),
  sent: integer('sent').notNull().default(0),
  retried: integer('retried').notNull().default(0),
  cleaned: integer('cleaned').notNull().default(0),
  ...timestamps(),
});
