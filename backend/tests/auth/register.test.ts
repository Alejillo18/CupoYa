import request from 'supertest';
import { createApp } from '../../src/app';
import { AuthService } from '../../src/modules/auth/auth.service';
import { UserRepository, UserRecord } from '../../src/modules/auth/auth.repository';
import { TokenService } from '../../src/modules/auth/token.service';

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

function buildApp() {
  const repo = new FakeUserRepository();
  const app = createApp({
    authService: new AuthService(repo, new TokenService('secreto-de-prueba-con-largo-suficiente', 900)),
  });
  return { app, repo };
}

describe('POST /api/v1/auth/register', () => {
  it('crea la cuenta y responde 201 sin exponer el hash', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });

    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ email: 'ana@mail.com', role: 'USUARIO' });
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
    expect(JSON.stringify(res.body)).not.toContain('Clave1234');
  });

  it('responde 409 si el email ya existe', async () => {
    const { app } = buildApp();
    const body = { email: 'ana@mail.com', password: 'Clave1234' };

    await request(app).post('/api/v1/auth/register').send(body);
    const res = await request(app).post('/api/v1/auth/register').send(body);

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_YA_REGISTRADO');
  });

  it('responde 400 indicando el campo inválido', async () => {
    const { app } = buildApp();

    const res = await request(app)
      .post('/api/v1/auth/register')
      .send({ email: 'no-es-email', password: 'Clave1234' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
    expect(res.body.error.details[0].field).toBe('email');
  });

  it('responde 400 si falta el cuerpo', async () => {
    const { app } = buildApp();

    const res = await request(app).post('/api/v1/auth/register').send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
  });
});