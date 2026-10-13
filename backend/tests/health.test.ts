import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /api/v1/health', () => {
  it('responde 200 con status ok', async () => {
    const res = await request(createApp()).get('/api/v1/health');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});