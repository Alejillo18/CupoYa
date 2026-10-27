import request from 'supertest';
import { createApp } from '../src/app';
import { MemoryRateLimiter } from '../src/middlewares/rateLimit';
import { AuthService } from '../src/modules/auth/auth.service';
import { TokenService } from '../src/modules/auth/token.service';

function buildApp() {
  return createApp({
    authService: {} as unknown as AuthService,
    tokens: {} as unknown as TokenService,
    rateLimiter: new MemoryRateLimiter(1, 60),
  });
}

describe('createApp: IP del cliente detras de nginx', () => {
  it('no se puede esquivar el limite falsificando el inicio de X-Forwarded-For', async () => {
    const app = buildApp();
    // nginx agrega la IP real (9.9.9.9) al final; el cliente escribe lo anterior.
    const primero = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '6.6.6.6, 9.9.9.9')
      .send({});

    const segundo = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '7.7.7.7, 9.9.9.9')
      .send({});

    expect(primero.status).not.toBe(429);
    expect(segundo.status).toBe(429);
  });

  it('clientes distintos (IP real distinta) no comparten el limite', async () => {
    const app = buildApp();
    await request(app).post('/api/v1/auth/login').set('X-Forwarded-For', '1.1.1.1').send({});

    const otro = await request(app)
      .post('/api/v1/auth/login')
      .set('X-Forwarded-For', '2.2.2.2')
      .send({});

    expect(otro.status).not.toBe(429);
  });
});