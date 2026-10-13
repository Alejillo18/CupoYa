import request from 'supertest';
import { createApp } from '../../src/app';
import { AuthService } from '../../src/modules/auth/auth.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { FakeUserRepository } from '../helpers/fakeUserRepository';
import { buildAuthService } from '../helpers/buildAuthService';



const tokens = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

async function buildApp() {
  const { service } = buildAuthService();
  await service.register('ana@mail.com', 'Clave1234');
  return createApp({ authService: service });
}

describe('POST /api/v1/auth/login', () => {
  it('con credenciales válidas responde 200 con usuario y access token', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: 'ana@mail.com', role: 'USUARIO' });
    expect(tokens.verifyAccessToken(res.body.accessToken).sub).toBe(res.body.user.id);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('con contraseña incorrecta responde 401', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Equivocada1' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('con email inexistente responde el mismo 401', async () => {
    const app = await buildApp();

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nadie@mail.com', password: 'Clave1234' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('CREDENCIALES_INVALIDAS');
  });

  it('con datos mal formados responde 400', async () => {
    const app = await buildApp();

    const res = await request(app).post('/api/v1/auth/login').send({ email: 'x' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
  });
});