import request from 'supertest';
import { createApp } from '../../src/app';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';

async function setup() {
  const { service } = buildAuthService();
  await service.register('ana@mail.com', 'Clave1234');
  const app = createApp({ authService: service, tokens: testTokens });
  const login = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ana@mail.com', password: 'Clave1234' });
  return { app, accessToken: login.body.accessToken as string };
}

describe('GET /api/v1/auth/me', () => {
  it('sin token devuelve 401', async () => {
    const { app } = await setup();

    const res = await request(app).get('/api/v1/auth/me');

    expect(res.status).toBe(401);
  });

  it('con token válido devuelve el usuario actual', async () => {
    const { app, accessToken } = await setup();

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ana@mail.com', role: 'USUARIO' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('con un token de un usuario inexistente devuelve 401', async () => {
    const { app } = await setup();
    const fantasma = testTokens.signAccessToken({ id: 'fantasma', role: 'ADMIN' });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${fantasma}`);

    expect(res.status).toBe(401);
  });
});