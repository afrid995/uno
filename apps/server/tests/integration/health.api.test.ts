import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app';

describe('GET /api/health Integration Test', () => {
  const app = createApp();

  it('returns HTTP 200 with healthy database status and system metrics', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.database.status).toBe('connected');
    expect(res.body.data.database.latencyMs).toBeGreaterThanOrEqual(0);
    expect(res.body.data.version).toBe('0.1.0');
    expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
  });
});
