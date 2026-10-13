import express from 'express';
import request from 'supertest';
import { authenticate, authorize } from '../../src/middlewares/auth';
import { errorHandler } from '../../src/middlewares/errorHandler';
import { TokenService } from '../../src/modules/auth/token.service';

const tokens = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

function buildApp() {
  const app = express();
  app.get('/privado', authenticate(tokens), (req, res) => {
    res.json({ userId: req.auth!.userId, role: req.auth!.role });
  });
  app.get('/operadores', authenticate(tokens), authorize('OPERADOR', 'ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/solo-admin', authenticate(tokens), authorize('ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/mal-armada', authorize('ADMIN'), (_req, res) => {
    res.json({ ok: true });
  });
  app.use(errorHandler);
  return app;
}

const bearer = (role: 'USUARIO' | 'OPERADOR' | 'ADMIN') =>
  `Bearer ${tokens.signAccessToken({ id: 'u1', role })}`;

describe('authenticate', () => {
  it('sin Authorization devuelve 401', async () => {
    const res = await request(buildApp()).get('/privado');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('con un esquema distinto de Bearer devuelve 401', async () => {
    const res = await request(buildApp()).get('/privado').set('Authorization', 'Basic abc');

    expect(res.status).toBe(401);
  });

  it('con un token manipulado devuelve 401', async () => {
    const res = await request(buildApp())
      .get('/privado')
      .set('Authorization', bearer('USUARIO') + 'x');

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('NO_AUTENTICADO');
  });

  it('con un token vencido devuelve 401', async () => {
    const vencido = new TokenService('secreto-de-prueba-con-largo-suficiente', -10);
    const token = vencido.signAccessToken({ id: 'u1', role: 'USUARIO' });

    const res = await request(buildApp()).get('/privado').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
  });

  it('con un token válido deja pasar y expone userId y rol', async () => {
    const res = await request(buildApp()).get('/privado').set('Authorization', bearer('OPERADOR'));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: 'u1', role: 'OPERADOR' });
  });
});

describe('authorize', () => {
  it('permite un rol incluido en la lista', async () => {
    const res = await request(buildApp())
      .get('/operadores')
      .set('Authorization', bearer('OPERADOR'));

    expect(res.status).toBe(200);
  });

  it('permite al ADMIN en una ruta de operadores (listado explícito)', async () => {
    const res = await request(buildApp()).get('/operadores').set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(200);
  });

  it('un USUARIO en una ruta de operadores recibe 403', async () => {
    const res = await request(buildApp())
      .get('/operadores')
      .set('Authorization', bearer('USUARIO'));

    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('SIN_PERMISO');
  });

  it('un OPERADOR en una ruta solo de ADMIN recibe 403', async () => {
    const res = await request(buildApp())
      .get('/solo-admin')
      .set('Authorization', bearer('OPERADOR'));

    expect(res.status).toBe(403);
  });

  it('sin token en una ruta con rol devuelve 401 (no 403)', async () => {
    const res = await request(buildApp()).get('/solo-admin');

    expect(res.status).toBe(401);
  });

  it('usado sin authenticate falla cerrado con 401', async () => {
    const res = await request(buildApp()).get('/mal-armada');

    expect(res.status).toBe(401);
  });
});