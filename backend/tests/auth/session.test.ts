import request from 'supertest';
import { createApp } from '../../src/app';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';

async function setup() {
  const { service } = buildAuthService();
  await service.register('ana@mail.com', 'Clave1234');
  const app = createApp({ authService: service, tokens: testTokens });
  return { app, service };
}

function cookieDe(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[];
  return raw.find((c) => c.startsWith('refresh_token='))!;
}

describe('Sesión: login, refresh y logout por HTTP', () => {
  it('login setea el refresh token en cookie httpOnly y no lo expone en el cuerpo', async () => {
    const { app } = await setup();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });

    const cookie = cookieDe(res);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Path=/api/v1/auth');
    expect(res.body.refreshToken).toBeUndefined();
    expect(res.body.accessToken).toBeDefined();
  });

  it('refresh con la cookie devuelve nuevo access token y rota la cookie', async () => {
    const { app } = await setup();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });
    const cookie1 = cookieDe(login);

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(cookieDe(res)).not.toBe(cookie1);
  });

  it('refresh sin cookie devuelve 401', async () => {
    const { app } = await setup();

    const res = await request(app).post('/api/v1/auth/refresh');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_INVALIDO');
  });

  it('reutilizar la cookie anterior devuelve 401', async () => {
    const { app } = await setup();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });
    const cookie1 = cookieDe(login);
    await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);

    expect(res.status).toBe(401);
  });

  it('logout responde 204, borra la cookie e invalida el token', async () => {
    const { app } = await setup();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });
    const cookie1 = cookieDe(login);

    const res = await request(app).post('/api/v1/auth/logout').set('Cookie', cookie1);

    expect(res.status).toBe(204);
    expect(cookieDe(res)).toMatch(/refresh_token=;/);
    const despues = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie1);
    expect(despues.status).toBe(401);
  });

  it('logout sin cookie también responde 204', async () => {
    const { app } = await setup();

    const res = await request(app).post('/api/v1/auth/logout');

    expect(res.status).toBe(204);
  });

  it('ante un error interno en refresh NO borra la cookie', async () => {
    const { app, service } = await setup();
    const login = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });
    const cookie = cookieDe(login);

    jest.spyOn(service, 'refresh').mockRejectedValueOnce(new Error('base caída'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(500);
    const setCookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(setCookies.some((c) => c.startsWith('refresh_token=;'))).toBe(false);
  });
});