import { randomUUID } from 'node:crypto';
import { afterAll, expect, inject, it } from 'vitest';
import { Pool, type PoolClient } from 'pg';

const pool = new Pool({ connectionString: inject('databaseUrl'), max: 6 });
afterAll(() => pool.end());

async function fixture() {
  const city = await pool.query<{ id: number }>('insert into cities (name) values ($1) returning id', [`test-${randomUUID()}`]);
  const service = await pool.query<{ id: number }>('insert into services (name, duration_min) values ($1, 60) returning id', ['Test service']);
  const cityId = city.rows[0]!.id;
  const serviceId = service.rows[0]!.id;
  const customerId = randomUUID();
  const expertId = randomUUID();
  const secondExpertId = randomUUID();
  for (const [id, role] of [[customerId, 'customer'], [expertId, 'expert'], [secondExpertId, 'expert']]) {
    await pool.query('insert into users (id, name, phone, role, city_id) values ($1, $2, $3, $4, $5)', [id, 'Synthetic test user', `test-${id}`, role, cityId]);
  }
  for (const id of [expertId, secondExpertId]) {
    await pool.query('insert into expert_profiles (user_id) values ($1)', [id]);
    await pool.query('insert into expert_services (expert_id, service_id, price) values ($1, $2, 300)', [id, serviceId]);
  }
  async function booking(status = 'pending', start = '2030-01-01T10:00:00+03:00', end = '2030-01-01T11:00:00+03:00', expert = expertId) {
    // Financial values below are explicit fixtures, not an approved pricing/tax policy.
    const result = await pool.query<{ id: string }>(`
      insert into bookings (customer_id, expert_id, service_id, city_id, address_text,
        starts_at, ends_at, status, price, commission_rate, commission_amount, expert_earning,
        vat_rate, vat_amount, total_amount)
      values ($1,$2,$3,$4,'Original snapshot',$5,$6,$7,300,20,60,240,0,0,300) returning id
    `, [customerId, expert, serviceId, cityId, start, end, status]);
    return result.rows[0]!.id;
  }
  return { cityId, serviceId, customerId, expertId, secondExpertId, booking };
}

it('applies the migration chain to an empty database with 17 business tables and GiST exclusion', async () => {
  const tables = await pool.query("select tablename from pg_tables where schemaname = 'public' and tablename not like 'auth_%' and tablename not in ('admin_audit_logs', 'payment_provider_events', 'notification_outbox', 'idempotency_keys', 'worker_heartbeats')");
  expect(tables.rowCount).toBe(17);
  const constraints = await pool.query("select contype from pg_constraint where conname = 'bookings_expert_period_exclusion'");
  expect(constraints.rows).toEqual([{ contype: 'x' }]);
});

it('allows overlapping pending requests, adjacent accepted slots, and another expert at the same time', async () => {
  const f = await fixture();
  const first = await f.booking();
  await f.booking();
  await pool.query("update bookings set status = 'accepted' where id = $1", [first]);
  await f.booking('accepted', '2030-01-01T11:00:00+03:00', '2030-01-01T12:00:00+03:00');
  await f.booking('accepted', undefined, undefined, f.secondExpertId);
  // Exact same period with a different timezone offset still conflicts.
  await expect(f.booking('accepted', '2030-01-01T07:00:00Z', '2030-01-01T08:00:00Z')).rejects.toMatchObject({ code: '23P01' });
});

it.each(['accepted', 'confirmed', 'completed'])('prevents overlap with %s bookings', async (status) => {
  const f = await fixture();
  await f.booking(status);
  await expect(f.booking('accepted')).rejects.toMatchObject({ code: '23P01' });
});

it.each(['cancelled', 'expired', 'rejected'])('allows the slot after an explicit transition to %s', async (status) => {
  const f = await fixture();
  const first = await f.booking('accepted');
  await pool.query('update bookings set status = $1 where id = $2', [status, first]);
  await f.booking('accepted');
});

it('does not free an accepted slot just because expires_at has passed', async () => {
  const f = await fixture();
  const first = await f.booking('accepted');
  await pool.query("update bookings set expires_at = now() - interval '1 minute' where id = $1", [first]);
  await expect(f.booking('accepted')).rejects.toMatchObject({ code: '23P01' });
});

async function accept(client: PoolClient, bookingId: string, expertId: string) {
  await client.query("update bookings set status = 'accepted' where id = $1 and status = 'pending'", [bookingId]);
  await client.query("insert into booking_status_history (booking_id, status, changed_by) values ($1, 'accepted', $2)", [bookingId, expertId]);
}

it('serializes competing accepts: one commits and the rejected transaction leaves no accepted history', async () => {
  const f = await fixture();
  const firstId = await f.booking();
  const secondId = await f.booking();
  const first = await pool.connect();
  const second = await pool.connect();
  try {
    await first.query('begin');
    await second.query('begin');
    await second.query("set local lock_timeout = '5s'");
    const pid = (await second.query<{ pid: number }>('select pg_backend_pid() as pid')).rows[0]!.pid;
    await accept(first, firstId, f.expertId);
    // Attach rejection handler immediately; keep transaction 1 uncommitted until transaction 2 waits on it.
    const competing = accept(second, secondId, f.expertId).then(() => null, (error: unknown) => error);
    let waiting = false;
    for (let i = 0; i < 100; i++) {
      const state = await pool.query('select wait_event_type from pg_stat_activity where pid = $1', [pid]);
      if (state.rows[0]?.wait_event_type === 'Lock') { waiting = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    await first.query('commit');
    const rejected = await competing;
    await second.query('rollback');
    expect(waiting).toBe(true);
    expect(rejected).toMatchObject({ code: '23P01', constraint: 'bookings_expert_period_exclusion' });
    const rows = await pool.query('select id, status from bookings where id = any($1::uuid[])', [[firstId, secondId]]);
    expect(rows.rows).toEqual(expect.arrayContaining([{ id: firstId, status: 'accepted' }, { id: secondId, status: 'pending' }]));
    const history = await pool.query('select booking_id from booking_status_history where booking_id = any($1::uuid[])', [[firstId, secondId]]);
    expect(history.rows).toEqual([{ booking_id: firstId }]);
  } finally {
    await first.query('rollback');
    await second.query('rollback');
    first.release();
    second.release();
  }
});

it('rolls back an accepted status and releases its range if writing the history fails', async () => {
  const f = await fixture();
  const id = await f.booking();
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query("update bookings set status = 'accepted' where id = $1", [id]);
    await expect(client.query("insert into booking_status_history (booking_id, status, changed_by) values ($1, 'accepted', $2)", [id, randomUUID()])).rejects.toMatchObject({ code: '23503' });
    await client.query('rollback');
    expect((await pool.query('select status from bookings where id = $1', [id])).rows[0].status).toBe('pending');
    await f.booking('accepted');
  } finally {
    await client.query('rollback');
    client.release();
  }
});

it('rejects invalid periods, booking states, negative amounts and PostgreSQL numeric NaN', async () => {
  const f = await fixture();
  await expect(f.booking('pending', '2030-01-01T10:00:00Z', '2030-01-01T10:00:00Z')).rejects.toMatchObject({ code: '23514' });
  await expect(f.booking('paid')).rejects.toMatchObject({ code: '23514' });
  const id = await f.booking();
  await expect(pool.query('update bookings set total_amount = -1 where id = $1', [id])).rejects.toMatchObject({ code: '23514' });
  await expect(pool.query("update bookings set total_amount = 'NaN' where id = $1", [id])).rejects.toMatchObject({ code: '23514' });
  await expect(pool.query("update expert_services set price = 'NaN' where expert_id = $1", [f.expertId])).rejects.toMatchObject({ code: '23514' });
});

it('preserves booking snapshots when reference data changes or a saved address is deleted', async () => {
  const f = await fixture();
  const id = await f.booking();
  const address = await pool.query('insert into customer_addresses (customer_id, city_id, label, address_text) values ($1,$2,$3,$4) returning id', [f.customerId, f.cityId, 'Test address', 'Original snapshot']);
  await pool.query('update customer_addresses set address_text = $1 where id = $2', ['New address', address.rows[0].id]);
  await pool.query('delete from customer_addresses where id = $1', [address.rows[0].id]);
  await pool.query('update services set duration_min = 90 where id = $1', [f.serviceId]);
  await pool.query('update expert_services set price = 500 where expert_id = $1', [f.expertId]);
  await pool.query('insert into settings (key, value) values ($1, $2)', [`test-commission-${randomUUID()}`, '30']);
  const snapshot = (await pool.query('select address_text, price, commission_rate, total_amount, ends_at - starts_at as duration from bookings where id = $1', [id])).rows[0];
  expect(snapshot).toMatchObject({ address_text: 'Original snapshot', price: '300.00', commission_rate: '20.0000', total_amount: '300.00' });
  expect(snapshot.duration.hours).toBe(1);
});

it('enforces default-address uniqueness, review constraints and foreign-key history retention', async () => {
  const f = await fixture();
  const insertAddress = () => pool.query("insert into customer_addresses (customer_id, city_id, label, address_text, is_default) values ($1,$2,'Test','Test',true)", [f.customerId, f.cityId]);
  await insertAddress();
  await expect(insertAddress()).rejects.toMatchObject({ code: '23505' });
  const id = await f.booking('completed');
  const insertReview = (rating: number, reviewer = f.customerId, reviewee = f.expertId) => pool.query('insert into reviews (booking_id, reviewer_id, reviewee_id, rating) values ($1,$2,$3,$4)', [id, reviewer, reviewee, rating]);
  await expect(insertReview(6)).rejects.toMatchObject({ code: '23514' });
  await expect(insertReview(5, f.customerId, f.customerId)).rejects.toMatchObject({ code: '23514' });
  await insertReview(5);
  await expect(insertReview(4)).rejects.toMatchObject({ code: '23505' });
  await insertReview(4, f.expertId, f.customerId);
  await expect(pool.query('delete from bookings where id = $1', [id])).rejects.toMatchObject({ code: '23503' });
  await expect(pool.query('delete from users where id = $1', [f.customerId])).rejects.toMatchObject({ code: '23503' });
});

it('prevents linking a booking to another expert payout or reusing a provider transaction reference', async () => {
  const f = await fixture();
  const id = await f.booking();
  const payout = await pool.query('insert into payouts (expert_id, amount) values ($1,240) returning id', [f.secondExpertId]);
  await expect(pool.query('update bookings set payout_id = $1 where id = $2', [payout.rows[0].id, id])).rejects.toMatchObject({ code: '23503' });
  const insertPayment = () => pool.query("insert into payments (booking_id, amount, provider, provider_ref) values ($1,300,'test-only',$2)", [id, id]);
  await insertPayment();
  await expect(insertPayment()).rejects.toMatchObject({ code: '23505' });
});
