import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../../src/app.js';
import { createLogger } from '../../src/shared/logger.js';

const logger = createLogger('silent');

describe('HTTP foundation (mock database)', () => {
  it('keeps liveness independent of database access and generates its own request ID', async () => {
    const checkDatabase = vi.fn().mockRejectedValue(new Error('offline'));
    const app = createApp({ checkDatabase, logger });
    const response = await request(app).get('/health/live').set('X-Request-ID', 'untrusted');
    expect(response.status).toBe(200);
    expect(checkDatabase).not.toHaveBeenCalled();
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
    expect(response.body.requestId).not.toBe('untrusted');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('reports readiness only after a successful database check', async () => {
    const checkDatabase = vi.fn().mockResolvedValue(undefined);
    const response = await request(createApp({ checkDatabase, logger })).get('/health/ready');
    expect(response.status).toBe(200);
    expect(checkDatabase).toHaveBeenCalledOnce();
  });

  it('returns 503 without exposing connection details', async () => {
    const app = createApp({ checkDatabase: async () => { throw new Error('postgres://secret:password@private'); }, logger });
    const response = await request(app).get('/health/ready');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.text).not.toContain('password');
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });

  it('returns consistent errors for unknown routes, invalid JSON and oversized bodies', async () => {
    const app = createApp({ checkDatabase: async () => {}, logger });
    const missing = await request(app).get('/api/v1/missing');
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe('NOT_FOUND');
    const invalid = await request(app).post('/api/v1/missing').set('Content-Type', 'application/json').send('{');
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('INVALID_JSON');
    const large = await request(app).post('/api/v1/missing').send({ text: 'x'.repeat(40000) });
    expect(large.status).toBe(413);
    expect(large.body.error.code).toBe('PAYLOAD_TOO_LARGE');
  });
});
