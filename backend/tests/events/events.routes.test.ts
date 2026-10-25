import request from 'supertest';
import { createApp } from '../../src/app';
import { EventsService } from '../../src/modules/events/events.service';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';
import { FakeEventRepository } from '../helpers/fakeEventRepository';

const AHORA = new Date('2026-10-20T12:00:00Z');
const nuevo = {
  name: 'Recital',
  description: 'Gran show',
  venue: 'Estadio',
  startsAt: '2026-12-01T20:00:00.000Z',
  totalCapacity: 100,
};

function setup() {
  const { service } = buildAuthService();
  const events = new EventsService(new FakeEventRepository(), () => AHORA);
  const app = createApp({ authService: service, tokens: testTokens, eventsService: events });
  const bearer = (role: 'USUARIO' | 'OPERADOR' | 'ADMIN') =>
    `Bearer ${testTokens.signAccessToken({ id: 'u1', role })}`;
  return { app, bearer };
}

describe('Rutas de eventos', () => {
  it('sin token devuelve 401', async () => {
    const { app } = setup();

    expect((await request(app).get('/api/v1/events')).status).toBe(401);
    expect((await request(app).post('/api/v1/events').send(nuevo)).status).toBe(401);
  });

  it('un USUARIO no puede crear, editar ni cancelar (403)', async () => {
    const { app, bearer } = setup();

    const crear = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('USUARIO'))
      .send(nuevo);
    const editar = await request(app)
      .put('/api/v1/events/ev-1')
      .set('Authorization', bearer('USUARIO'))
      .send({ name: 'x' });
    const borrar = await request(app)
      .delete('/api/v1/events/ev-1')
      .set('Authorization', bearer('USUARIO'));

    expect([crear.status, editar.status, borrar.status]).toEqual([403, 403, 403]);
  });

  it('un OPERADOR crea un evento y recibe 201', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('OPERADOR'))
      .send(nuevo);

    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({
      name: 'Recital',
      totalCapacity: 100,
      availableCapacity: 100,
      status: 'ACTIVO',
    });
  });

  it('un ADMIN también puede crear', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('ADMIN'))
      .send(nuevo);

    expect(res.status).toBe(201);
  });

  it('datos inválidos devuelven 400 con el campo', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('OPERADOR'))
      .send({ ...nuevo, totalCapacity: -5 });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDACION');
    expect(res.body.error.details[0].field).toBe('totalCapacity');
  });

  it('una fecha pasada devuelve 400 FECHA_PASADA', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('OPERADOR'))
      .send({ ...nuevo, startsAt: '2026-01-01T00:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FECHA_PASADA');
  });

  it('cualquier usuario autenticado lista y ve el detalle', async () => {
    const { app, bearer } = setup();
    const creado = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('OPERADOR'))
      .send(nuevo);

    const lista = await request(app).get('/api/v1/events').set('Authorization', bearer('USUARIO'));
    const detalle = await request(app)
      .get(`/api/v1/events/${creado.body.event.id}`)
      .set('Authorization', bearer('USUARIO'));

    expect(lista.status).toBe(200);
    expect(lista.body.total).toBe(1);
    expect(lista.body.items[0].name).toBe('Recital');
    expect(detalle.status).toBe(200);
  });

  it('la paginación acepta page y pageSize por query', async () => {
    const { app, bearer } = setup();
    for (let i = 0; i < 3; i++) {
      await request(app)
        .post('/api/v1/events')
        .set('Authorization', bearer('OPERADOR'))
        .send({ ...nuevo, name: `E${i}` });
    }

    const res = await request(app)
      .get('/api/v1/events?page=2&pageSize=2')
      .set('Authorization', bearer('USUARIO'));

    expect(res.body.items).toHaveLength(1);
    expect(res.body.page).toBe(2);
    expect(res.body.pageSize).toBe(2);
  });

  it('un evento inexistente devuelve 404', async () => {
    const { app, bearer } = setup();

    const res = await request(app)
      .get('/api/v1/events/no-existe')
      .set('Authorization', bearer('USUARIO'));

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('EVENTO_NO_ENCONTRADO');
  });

  it('un OPERADOR edita un evento', async () => {
    const { app, bearer } = setup();
    const creado = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('OPERADOR'))
      .send(nuevo);

    const res = await request(app)
      .put(`/api/v1/events/${creado.body.event.id}`)
      .set('Authorization', bearer('OPERADOR'))
      .send({ name: 'Otro nombre', totalCapacity: 150 });

    expect(res.status).toBe(200);
    expect(res.body.event).toMatchObject({ name: 'Otro nombre', availableCapacity: 150 });
  });

  it('DELETE responde 204 y el evento deja de aparecer en el listado', async () => {
    const { app, bearer } = setup();
    const creado = await request(app)
      .post('/api/v1/events')
      .set('Authorization', bearer('OPERADOR'))
      .send(nuevo);

    const del = await request(app)
      .delete(`/api/v1/events/${creado.body.event.id}`)
      .set('Authorization', bearer('OPERADOR'));
    const lista = await request(app).get('/api/v1/events').set('Authorization', bearer('USUARIO'));

    expect(del.status).toBe(204);
    expect(lista.body.total).toBe(0);
  });
});