import express from 'express';
import request from 'supertest';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { MemoryRateLimiter, rateLimit } from '../../src/middlewares/rateLimit';

function buildApp(limiter: { hit: (k: string) => Promise<any> }, timeoutMs?: number) {
  const app = express();
  app.set('trust proxy', true);
  app.post('/auth', rateLimit(limiter, 'auth', timeoutMs), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

describe('MemoryRateLimiter', () => {
  it('permite hasta el máximo y rechaza el siguiente', async () => {
    const l = new MemoryRateLimiter(3, 60, () => 0);

    const r = [await l.hit('a'), await l.hit('a'), await l.hit('a'), await l.hit('a')];

    expect(r.map((x) => x.permitido)).toEqual([true, true, true, false]);
    expect(r[0].restante).toBe(2);
  });

  it('cuenta cada clave por separado', async () => {
    const l = new MemoryRateLimiter(1, 60, () => 0);

    await l.hit('a');

    expect((await l.hit('b')).permitido).toBe(true);
  });

  it('reinicia la cuenta al terminar la ventana', async () => {
    let ahora = 0;
    const l = new MemoryRateLimiter(1, 60, () => ahora);
    await l.hit('a');
    expect((await l.hit('a')).permitido).toBe(false);

    ahora = 61_000;

    expect((await l.hit('a')).permitido).toBe(true);
  });
});

describe('rateLimit (middleware)', () => {
  it('deja pasar mientras no se supera el máximo', async () => {
    const app = buildApp(new MemoryRateLimiter(2, 60));

    const a = await request(app).post('/auth');
    const b = await request(app).post('/auth');

    expect([a.status, b.status]).toEqual([200, 200]);
  });

  it('responde 429 con formato unificado y Retry-After al superarlo', async () => {
    const app = buildApp(new MemoryRateLimiter(1, 60));
    await request(app).post('/auth');

    const res = await request(app).post('/auth');

    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('DEMASIADAS_SOLICITUDES');
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('distingue clientes por IP (X-Forwarded-For)', async () => {
    const app = buildApp(new MemoryRateLimiter(1, 60));
    await request(app).post('/auth').set('X-Forwarded-For', '1.1.1.1');

    const otro = await request(app).post('/auth').set('X-Forwarded-For', '2.2.2.2');

    expect(otro.status).toBe(200);
  });

  it('si el limitador falla, la API sigue respondiendo (falla abierto)', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = buildApp({ hit: async () => Promise.reject(new Error('redis caído')) });

    const res = await request(app).post('/auth');

    expect(res.status).toBe(200);
  });

  it('si el limitador no responde (Redis congelado), falla abierto dentro del timeout', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const colgado = { hit: () => new Promise<never>(() => undefined) };
    const app = buildApp(colgado, 50);
    const inicio = Date.now();

    const res = await request(app).post('/auth');

    expect(res.status).toBe(200);
    expect(Date.now() - inicio).toBeLessThan(1000);
  });

  it('un limitador lento pero dentro del timeout sigue aplicando el límite', async () => {
    const lento = {
      hit: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ permitido: false, restante: 0, reiniciaEnSeg: 30 }), 10),
        ),
    };
    const app = buildApp(lento, 500);

    const res = await request(app).post('/auth');

    expect(res.status).toBe(429);
  });
});