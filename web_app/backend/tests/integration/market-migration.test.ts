import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import { expect, inject, it } from 'vitest';

it('upgrades legacy SAR prices without relabeling history and sets EGP only for new snapshots', async () => {
  const admin = new Pool({ connectionString: inject('databaseUrl') });
  const name = `lamsa_upgrade_${randomUUID().replaceAll('-', '')}`;
  const url = new URL(inject('databaseUrl')); url.pathname = `/${name}`;
  let created = false;
  const db = new Pool({ connectionString: url.toString() });
  try {
    await admin.query(`CREATE DATABASE "${name}"`); created = true;
    const migrations = readMigrationFiles({ migrationsFolder: fileURLToPath(new URL('../../src/db/migrations/', import.meta.url)) });
    // Execute the actual historical SQL before inserting legacy rows, then the actual upgrade SQL.
    for (const migration of migrations.slice(0, 4)) for (const statement of migration.sql) await db.query(statement);
    const city = (await db.query("insert into cities(name) values('Legacy city') returning id")).rows[0].id;
    const service = (await db.query("insert into services(name,duration_min) values('Legacy service',60) returning id")).rows[0].id;
    const customer = randomUUID(); const expert = randomUUID();
    await db.query("insert into users(id,name,phone,role) values($1,'Test customer','legacy-customer','customer'),($2,'Test expert','legacy-expert','expert')", [customer, expert]);
    await db.query('insert into expert_profiles(user_id) values($1)', [expert]);
    await db.query('insert into expert_services(expert_id,service_id,price) values($1,$2,300)', [expert, service]);
    const insertBooking = () => db.query(`insert into bookings(customer_id,expert_id,service_id,city_id,address_text,starts_at,ends_at,price,commission_rate,commission_amount,expert_earning,vat_rate,vat_amount,total_amount)
      values($1,$2,$3,$4,'Synthetic address','2031-01-01T10:00:00Z','2031-01-01T11:00:00Z',300,20,60,240,0,0,300) returning id,currency`, [customer, expert, service, city]);
    const oldBooking = (await insertBooking()).rows[0];
    await db.query("insert into payments(booking_id,amount,provider) values($1,300,'fixture')", [oldBooking.id]);
    await db.query('insert into payouts(expert_id,amount) values($1,240)', [expert]);
    for (const migration of migrations.slice(4)) for (const statement of migration.sql) await db.query(statement);
    expect((await db.query('select currency from bookings where id=$1', [oldBooking.id])).rows[0].currency).toBe('SAR');
    expect((await db.query('select time_zone from bookings where id=$1', [oldBooking.id])).rows[0].time_zone).toBe('Asia/Riyadh');
    expect((await db.query('select currency from payments')).rows[0].currency).toBe('SAR');
    expect((await db.query('select currency from payouts')).rows[0].currency).toBe('SAR');
    expect((await db.query('select currency,price from expert_services')).rows[0]).toEqual({ currency: 'SAR', price: '300.00' });
    const newBooking = (await insertBooking()).rows[0];
    expect(newBooking.currency).toBe('EGP');
    expect((await db.query('select time_zone from bookings where id=$1', [newBooking.id])).rows[0].time_zone).toBe('Africa/Cairo');
    expect((await db.query("select name,is_active from cities where code='EG-CAI'")).rows[0]).toEqual({ name: 'القاهرة', is_active: true });
  } finally {
    await db.end();
    if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  }
});
