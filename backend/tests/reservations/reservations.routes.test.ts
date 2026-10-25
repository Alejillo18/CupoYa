import request from 'supertest';
import { createApp } from '../../src/app';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';
import { FakeReservationsRepository } from '../helpers/fakeReservationsRepository';

function setup() {
  const { service } = buildAuthService();
  const repo = new FakeReservationsRepository();
  const app = createApp({
    authService: service,
    tokens: testTokens,
    reservationsService: new ReservationsService(repo),
  });
  const bearer = (id: string, role: 'USUARIO' | 'OPERADOR' | 'ADMIN' = 'USUARIO') =>
    `Bearer ${testTokens.signAccessToken({ id, role })}`;
  return { app, bearer, repo };
}

describe('Rutas de reservas', () => {
  it('sin token devuelve 401', async () => {
    const { app } = setup();

    expect((await request(app).post('/api/v1/events/e1/reservations').send({ quantity: 1 })).status).toBe(401);
    expect((await request(app).get('/api/v1/reservations/me')).status).toBe(401);
    expect((await request(app).post('/api/v1/reservations/r-1/cancel')).status).toBe(401);
  });

  it('reservar responde 201 con la reserva', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .post('/api/v1/events/e1/reservations')
      .set('Authorization', bearer('u1'))
      .send({ quantity: 2 });

    expect(res.status).toBe(201);
    expect(res.body.reservation).toMatchObject({ eventId: 'e1', userId: 'u1', quantity: 2 });
  });

  it('la misma Idempotency-Key responde 200 con la misma reserva', async () => {
    const { app, bearer } = setup();
    const pedir = () =>
      request(app)
        .post('/api/v1/events/e1/reservations')
        .set('Authorization', bearer('u1'))
        .set('Idempotency-Key', 'clave-1')
        .send({ quantity: 1 });

    const a = await pedir();
    const b = await pedir();

    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.reservation.id).toBe(a.body.reservation.id);
  });

  it('una cantidad inválida devuelve 400', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .post('/api/v1/events/e1/reservations')
      .set('Authorization', bearer('u1'))
      .send({ quantity: 9 });

    expect(res.status).toBe(400);
  });

  it('sin cantidad en el cuerpo devuelve 400', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .post('/api/v1/events/e1/reservations')
      .set('Authorization', bearer('u1'))
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
  });

  it('sin cupo devuelve 409 CUPO_INSUFICIENTE', async () => {
    const { app, bearer, repo } = setup();
    repo.falla = 'SIN_CUPO';

    const res = await request(app)
      .post('/api/v1/events/e1/reservations')
      .set('Authorization', bearer('u1'))
      .send({ quantity: 1 });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CUPO_INSUFICIENTE');
  });

  it('un evento inexistente devuelve 404', async () => {
    const { app, bearer, repo } = setup();
    repo.falla = 'EVENTO_NO_ENCONTRADO';

    const res = await request(app)
      .post('/api/v1/events/zzz/reservations')
      .set('Authorization', bearer('u1'))
      .send({ quantity: 1 });

    expect(res.status).toBe(404);
  });

  it('GET /reservations/me devuelve solo las del usuario', async () => {
    const { app, bearer } = setup();
    await request(app).post('/api/v1/events/e1/reservations').set('Authorization', bearer('u1')).send({ quantity: 1 });
    await request(app).post('/api/v1/events/e1/reservations').set('Authorization', bearer('u2')).send({ quantity: 1 });

    const res = await request(app).get('/api/v1/reservations/me').set('Authorization', bearer('u1'));

    expect(res.status).toBe(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].userId).toBe('u1');
  });

  it('el dueño cancela su reserva', async () => {
    const { app, bearer } = setup();
    const creada = await request(app)
      .post('/api/v1/events/e1/reservations')
      .set('Authorization', bearer('u1'))
      .send({ quantity: 1 });

    const res = await request(app)
      .post(`/api/v1/reservations/${creada.body.reservation.id}/cancel`)
      .set('Authorization', bearer('u1'));

    expect(res.status).toBe(200);
    expect(res.body.reservation.status).toBe('CANCELADA');
  });

  it('otro usuario recibe 403 y un ADMIN puede cancelar', async () => {
    const { app, bearer } = setup();
    const creada = await request(app)
      .post('/api/v1/events/e1/reservations')
      .set('Authorization', bearer('u1'))
      .send({ quantity: 1 });
    const id = creada.body.reservation.id;

    const ajeno = await request(app).post(`/api/v1/reservations/${id}/cancel`).set('Authorization', bearer('u2'));
    const admin = await request(app).post(`/api/v1/reservations/${id}/cancel`).set('Authorization', bearer('adm', 'ADMIN'));

    expect(ajeno.status).toBe(403);
    expect(admin.status).toBe(200);
  });

  it('cancelar una reserva inexistente devuelve 404', async () => {
    const { app, bearer } = setup();

    const res = await request(app).post('/api/v1/reservations/nada/cancel').set('Authorization', bearer('u1'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('RESERVA_NO_ENCONTRADA');
  });
});