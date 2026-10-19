import request from 'supertest';
import { createApp } from '../../src/app';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';
import { FakeGoogleVerifier } from '../helpers/fakeGoogleVerifier';

function setup() {
  const google = new FakeGoogleVerifier();
  google.profiles.set('tok-ana', { sub: 'g-111', email: 'ana@mail.com', emailVerified: true });
  const { service } = buildAuthService({ google });
  return createApp({ authService: service, tokens: testTokens });
}

describe('POST /api/v1/auth/google', () => {
  it('con un token válido responde 200, usuario, access token y cookie httpOnly', async () => {
    const res = await request(setup()).post('/api/v1/auth/google').send({ idToken: 'tok-ana' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ana@mail.com', role: 'USUARIO' });
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('refresh_token='),
    )!;
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
  });

  it('con un token inválido responde 401 GOOGLE_INVALIDO', async () => {
    const res = await request(setup()).post('/api/v1/auth/google').send({ idToken: 'falso' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('GOOGLE_INVALIDO');
  });

  it('sin idToken responde 400', async () => {
    const res = await request(setup()).post('/api/v1/auth/google').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
  });

  it('la sesión creada con Google permite refrescar', async () => {
    const app = setup();
    const login = await request(app).post('/api/v1/auth/google').send({ idToken: 'tok-ana' });
    const cookie = (login.headers['set-cookie'] as unknown as string[])[0];

    const res = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookie);

    expect(res.status).toBe(200);
  });
});