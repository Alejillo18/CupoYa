import request from 'supertest';
import { createApp } from '../../src/app';
import { UsersService } from '../../src/modules/users/users.service';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';
import { FakeUsersRepository } from '../helpers/fakeUsersRepository';

const usuario = (id: string, role: 'USUARIO' | 'OPERADOR' | 'ADMIN' = 'USUARIO') => ({
  id,
  email: `${id}@mail.com`,
  role,
  lockedUntil: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
});

function setup() {
  const { service } = buildAuthService();
  const repo = new FakeUsersRepository();
  repo.users = [usuario('a', 'ADMIN'), usuario('b'), usuario('c', 'OPERADOR')];
  const app = createApp({
    authService: service,
    tokens: testTokens,
    usersService: new UsersService(repo),
  });
  const bearer = (role: 'USUARIO' | 'OPERADOR' | 'ADMIN') =>
    `Bearer ${testTokens.signAccessToken({ id: 'a', role })}`;
  return { app, bearer, repo };
}

describe('Rutas de usuarios', () => {
  it('sin token devuelve 401', async () => {
    const { app } = setup();

    expect((await request(app).get('/api/v1/users')).status).toBe(401);
    expect((await request(app).patch('/api/v1/users/b/role').send({ role: 'ADMIN' })).status).toBe(
      401,
    );
  });

  it('USUARIO y OPERADOR reciben 403', async () => {
    const { app, bearer } = setup();

    for (const rol of ['USUARIO', 'OPERADOR'] as const) {
      const lista = await request(app).get('/api/v1/users').set('Authorization', bearer(rol));
      const cambio = await request(app)
        .patch('/api/v1/users/b/role')
        .set('Authorization', bearer(rol))
        .send({ role: 'ADMIN' });
      expect([lista.status, cambio.status]).toEqual([403, 403]);
    }
  });

  it('ADMIN lista usuarios paginados y sin datos sensibles', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .get('/api/v1/users?page=1&pageSize=2')
      .set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(JSON.stringify(res.body)).not.toContain('passwordHash');
  });

  it('ADMIN cambia el rol de un usuario', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .patch('/api/v1/users/b/role')
      .set('Authorization', bearer('ADMIN'))
      .send({ role: 'OPERADOR' });

    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ id: 'b', role: 'OPERADOR' });
  });

  it('un rol inválido devuelve 400', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .patch('/api/v1/users/b/role')
      .set('Authorization', bearer('ADMIN'))
      .send({ role: 'SUPERMAN' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
    expect(res.body.error.details[0].field).toBe('role');
  });

  it('sin rol en el cuerpo devuelve 400', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .patch('/api/v1/users/b/role')
      .set('Authorization', bearer('ADMIN'))
      .send({});

    expect(res.status).toBe(400);
  });

  it('un usuario inexistente devuelve 404', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .patch('/api/v1/users/zzz/role')
      .set('Authorization', bearer('ADMIN'))
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('USUARIO_NO_ENCONTRADO');
  });

  it('degradar al último admin devuelve 409', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .patch('/api/v1/users/a/role')
      .set('Authorization', bearer('ADMIN'))
      .send({ role: 'USUARIO' });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ULTIMO_ADMIN');
  });

  it('la paginación rechaza valores no numéricos (400)', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .get('/api/v1/users?page=abc')
      .set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(400);
  });

  it('el cambio queda reflejado en el listado', async () => {
    const { app, bearer } = setup();
    await request(app)
      .patch('/api/v1/users/b/role')
      .set('Authorization', bearer('ADMIN'))
      .send({ role: 'OPERADOR' });

    const res = await request(app).get('/api/v1/users').set('Authorization', bearer('ADMIN'));

    expect(res.body.items.find((u: { id: string }) => u.id === 'b').role).toBe('OPERADOR');
  });

  it('asignar el mismo rol responde 200', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .patch('/api/v1/users/a/role')
      .set('Authorization', bearer('ADMIN'))
      .send({ role: 'ADMIN' });

    expect(res.status).toBe(200);
  });
});