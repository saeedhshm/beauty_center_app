import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import { afterAll, expect, inject, it } from 'vitest';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { createDatabase } from '../../src/db/client.js';
import { parseEnv } from '../../src/config/env.js';
import { createLogger } from '../../src/shared/logger.js';
import { AuthRepository } from '../../src/modules/auth/auth.repository.js';
import { AuthService } from '../../src/modules/auth/auth.service.js';
import { parseAuthConfig } from '../../src/modules/auth/auth.config.js';
import { DemoOtpSender } from '../../src/integrations/sms/otp-sender.js';
import { hashPassword } from '../../src/modules/auth/auth.crypto.js';
import { CatalogRepository } from '../../src/modules/catalog/catalog.repository.js';
import { CatalogService } from '../../src/modules/catalog/catalog.service.js';
import { MediaService } from '../../src/modules/catalog/media.service.js';
import { LocalStorageProvider } from '../../src/integrations/storage/local-storage.js';

const database = createDatabase(parseEnv({ DATABASE_URL: inject('databaseUrl'), NODE_ENV: 'test', DB_TIMEOUT_MS: '10000' }), () => {});
const pool = new Pool({ connectionString: inject('databaseUrl') });
const storageDir = mkdtempSync(join(tmpdir(), 'lamsa-media-'));
afterAll(async () => { await database.close(); await pool.end(); rmSync(storageDir, { recursive: true, force: true }); });
const password = 'Synthetic-password-for-tests!';
const phone = () => `+2010${randomInt(0, 100000000).toString().padStart(8, '0')}`;
// Minimal valid 1x1 PNG; content is synthetic fixture bytes, never a real photo.
const png = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6360000000020001e221bc330000000049454e44ae426082', 'hex');

function harness(maxFileBytes = 5_242_880) {
  const config = parseAuthConfig({ AUTH_SECRET: `test-only-${randomUUID()}-${randomUUID()}`, AUTH_OTP_MODE: 'demo' });
  const auth = new AuthService(new AuthRepository(database.db), new DemoOtpSender(), config);
  const repo = new CatalogRepository(database.db);
  const app = createApp({
    checkDatabase: database.check,
    logger: createLogger('silent'),
    auth,
    catalog: new CatalogService(repo),
    media: new MediaService(repo, new LocalStorageProvider(storageDir), { maxFileBytes }),
  });
  async function register(role: 'customer' | 'expert' = 'customer', number = phone()) {
    const challenge = await request(app).post('/api/v1/auth/register/otp').send({ phone: number });
    expect(challenge.status).toBe(202);
    const result = await request(app).post('/api/v1/auth/register').send({
      phone: number, challengeId: challenge.body.data.challengeId, otp: '123456',
      name: 'Synthetic user', password, role,
    });
    expect(result.status).toBe(201);
    return { phone: number, data: result.body.data };
  }
  async function admin() {
    const adminPhone = phone();
    await pool.query("insert into users (id,name,phone,role,password_hash,phone_verified_at) values ($1,'Test admin',$2,'admin',$3,now())", [randomUUID(), adminPhone, await hashPassword(password)]);
    const login = await request(app).post('/api/v1/admin/auth/login').send({ phone: adminPhone, password });
    expect(login.status).toBe(200);
    return login.body.data;
  }
  async function approvedExpert() {
    const expert = await register('expert');
    const adminToken = (await admin()).accessToken as string;
    const cityId = (await pool.query("select id from cities where code = 'EG-CAI'")).rows[0]?.id as number;
    await request(app).patch('/api/v1/experts/me').auth(expert.data.accessToken, { type: 'bearer' }).send({ cityId, bio: 'media fixture' });
    const service = (await request(app).post('/api/v1/admin/services').auth(adminToken, { type: 'bearer' }).send({ name: `Service ${randomUUID()}`, durationMin: 60 })).body.data;
    await request(app).put(`/api/v1/experts/me/services/${service.id}`).auth(expert.data.accessToken, { type: 'bearer' }).send({ price: '300.50' });
    const approval = await request(app).post(`/api/v1/admin/experts/${expert.data.user.id}/approve`).auth(adminToken, { type: 'bearer' });
    expect(approval.status).toBe(200);
    await request(app).patch('/api/v1/experts/me').auth(expert.data.accessToken, { type: 'bearer' }).send({ isAcceptingBookings: true });
    return { expert, adminToken, service };
  }
  return { app, register, admin, approvedExpert };
}

it('uploads, lists, serves and deletes portfolio images with owner-only writes', async () => {
  const h = harness();
  const { expert, service } = await h.approvedExpert();
  const other = await h.register('expert');
  const created = await request(h.app).post('/api/v1/experts/me/portfolio').auth(expert.data.accessToken, { type: 'bearer' })
    .field('serviceId', String(service.id)).attach('image', png, 'work.png');
  expect(created.status).toBe(201);
  expect(created.body.data.url).toBe(`/api/v1/portfolio/${created.body.data.id}/file`);
  const listed = await request(h.app).get(`/api/v1/experts/${expert.data.user.id}/portfolio`);
  expect(listed.status).toBe(200);
  expect(listed.body.data.map((row: { id: string }) => row.id)).toContain(created.body.data.id);
  expect(listed.text).not.toContain('storageKey');
  const file = await request(h.app).get(`/api/v1/portfolio/${created.body.data.id}/file`);
  expect(file.status).toBe(200);
  expect(file.headers['content-type']).toBe('image/png');
  expect(Buffer.compare(file.body, png)).toBe(0);
  // Another expert can neither delete nor upload into this portfolio.
  expect((await request(h.app).delete(`/api/v1/experts/me/portfolio/${created.body.data.id}`).auth(other.data.accessToken, { type: 'bearer' })).status).toBe(404);
  // A pending expert is not publicly discoverable, portfolio included.
  expect((await request(h.app).get(`/api/v1/experts/${other.data.user.id}/portfolio`)).status).toBe(404);
  const gone = await request(h.app).delete(`/api/v1/experts/me/portfolio/${created.body.data.id}`).auth(expert.data.accessToken, { type: 'bearer' });
  expect(gone.status).toBe(204);
  expect((await request(h.app).get(`/api/v1/portfolio/${created.body.data.id}/file`)).status).toBe(404);
});

it('rejects non-images, oversized files and unknown services', async () => {
  const h = harness(1024);
  const { expert } = await h.approvedExpert();
  const text = await request(h.app).post('/api/v1/experts/me/portfolio').auth(expert.data.accessToken, { type: 'bearer' })
    .attach('image', Buffer.from('not an image'), 'notes.txt');
  expect(text.status).toBe(415);
  const big = await request(h.app).post('/api/v1/experts/me/portfolio').auth(expert.data.accessToken, { type: 'bearer' })
    .attach('image', Buffer.alloc(2048, 7), 'big.png');
  expect(big.status).toBe(413);
  const missing = await request(h.app).post('/api/v1/experts/me/portfolio').auth(expert.data.accessToken, { type: 'bearer' })
    .field('serviceId', '1');
  expect(missing.status).toBe(400);
  const unknownService = await request(h.app).post('/api/v1/experts/me/portfolio').auth(expert.data.accessToken, { type: 'bearer' })
    .field('serviceId', '32767').attach('image', png, 'work.png');
  expect(unknownService.status).toBe(404);
});

it('keeps identity documents private to the owner and admins', async () => {
  const h = harness();
  const { expert, adminToken } = await h.approvedExpert();
  const customer = await h.register();
  const pdf = Buffer.from('%PDF-1.4 synthetic fixture');
  const uploaded = await request(h.app).post('/api/v1/experts/me/identity-document').auth(expert.data.accessToken, { type: 'bearer' })
    .attach('document', pdf, 'id.pdf');
  expect(uploaded.status).toBe(200);
  expect(uploaded.text).not.toContain('identity');
  // No public or third-party access, even with a valid session.
  expect((await request(h.app).get(`/api/v1/experts/${expert.data.user.id}/portfolio`)).status).toBe(200);
  const adminFile = await request(h.app).get(`/api/v1/admin/experts/${expert.data.user.id}/identity-document/file`).auth(adminToken, { type: 'bearer' });
  expect(adminFile.status).toBe(200);
  expect(adminFile.headers['content-type']).toBe('application/pdf');
  expect(Buffer.compare(adminFile.body, pdf)).toBe(0);
  const ownerFile = await request(h.app).get('/api/v1/experts/me/identity-document/file').auth(expert.data.accessToken, { type: 'bearer' });
  expect(ownerFile.status).toBe(200);
  expect((await request(h.app).get(`/api/v1/admin/experts/${expert.data.user.id}/identity-document/file`).auth(customer.data.accessToken, { type: 'bearer' })).status).toBe(401);
  // Replacing the document removes the previous object from storage.
  const stored = await pool.query('select identity_document_key from expert_profiles where user_id = $1', [expert.data.user.id]);
  const firstKey = stored.rows[0].identity_document_key as string;
  const pdf2 = Buffer.from('%PDF-1.4 second synthetic fixture');
  expect((await request(h.app).post('/api/v1/experts/me/identity-document').auth(expert.data.accessToken, { type: 'bearer' }).attach('document', pdf2, 'id2.pdf')).status).toBe(200);
  const secondKey = (await pool.query('select identity_document_key from expert_profiles where user_id = $1', [expert.data.user.id])).rows[0].identity_document_key as string;
  expect(secondKey).not.toBe(firstKey);
  const { statSync } = await import('node:fs');
  expect(() => statSync(`${storageDir}/${firstKey}`)).toThrow();
});
