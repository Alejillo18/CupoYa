import request from 'supertest';
import { createApp } from '../../src/app';
import { MemoryRateLimiter } from '../../src/middlewares/rateLimit';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';

function setup(max: number) {
  const { service } = buildAuthService();
  return createApp({
    authService: service,
    tokens: testTokens,
    rateLimiter: new MemoryRateLimiter(max, 60),
  });
}

const body = { email: 'ana@mail.com', password: 'Mala12345' };

describe('Rate limiting en /auth', () => {
  it('login devuelve 429 al superar el máximo', async () => {
    const app = setup(3);

    const estados: number[] = [];
    for (let i = 0; i < 5; i++) {
      estados.push((await request(app).post('/api/v1/auth/login').send(body)).status);
    }

    expect(estados).toEqual([401, 401, 401, 429, 429]);
  });

  it('el límite es por IP', async () => {
    const app = setup(1);
    await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '1.1.1.1').send(body);

    const otra = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '2.2.2.2')
      .send(body);

    expect(otra.status).toBe(401);
  });

  it('también limita register, google y refresh', async () => {
    const app = setup(1);

    for (const ruta of ['register', 'google', 'refresh']) {
      await request(app).post(`/api/v1/auth/${ruta}`).send({});
      const res = await request(app).post(`/api/v1/auth/${ruta}`).send({});
      expect([ruta, res.status]).toEqual([ruta, 429]);
    }
  });

  it('no limita /auth/me ni /health', async () => {
    const app = setup(1);

    for (let i = 0; i < 3; i++) await request(app).get('/api/v1/health');
    const res = await request(app).get('/api/v1/health');

    expect(res.status).toBe(200);
  });

  it('sin limitador configurado no se limita nada', async () => {
    const { service } = buildAuthService();
    const app = createApp({ authService: service, tokens: testTokens });

    for (let i = 0; i < 30; i++) await request(app).post('/api/v1/auth/login').send(body);
    const res = await request(app).post('/api/v1/auth/login').send(body);

    expect(res.status).toBe(401);
  });
});