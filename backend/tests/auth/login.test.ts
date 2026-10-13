import request from 'supertest';
import { createApp } from '../../src/app';
import { AuthService } from '../../src/modules/auth/auth.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { UserRepository, UserRecord } from '../../src/modules/auth/auth.repository';

class FakeUserRepository implements UserRepository {
  users: UserRecord[] = [];
  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }
  async create(data: { email: string; passwordHash: string }) {
    const user: UserRecord = {
      id: `id-${this.users.length + 1}`,
      email: data.email,
      passwordHash: data.passwordHash,
      role: 'USUARIO',
    };
    this.users.push(user);
    return user;
  }
}

const tokens = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

async function buildApp() {
  const authService = new AuthService(new FakeUserRepository(), tokens);
  await authService.register('ana@mail.com', 'Clave1234');
  return createApp({ authService });
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