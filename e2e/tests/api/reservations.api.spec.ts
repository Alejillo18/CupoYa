import { test, expect } from '../../helpers/fixtures';
import { Sesion, conToken, crearEvento, crearSesion, reservar, uuidInexistente } from '../../helpers/api';
import { cupoEnBase, moverEventoAlPasado } from '../../helpers/db';

const codigoDe = async (res: { json(): Promise<any> }) => (await res.json()).error.code as string;

test.describe('Reservar', () => {
  test('confirma la reserva y descuenta el cupo (en la API y en la base)', async ({ request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });

    const res = await reservar(request, usuario.token, evento.id, 2);
    expect(res.status()).toBe(201);
    expect((await res.json()).reservation).toMatchObject({
      eventId: evento.id,
      userId: usuario.id,
      quantity: 2,
      status: 'CONFIRMADA',
    });

    const detalle = await (await request.get(`/api/v1/events/${evento.id}`, { headers: conToken(usuario.token) })).json();
    expect(detalle.event.availableCapacity).toBe(8);
    expect(await cupoEnBase(evento.id)).toBe(8);
  });

  test('exige sesión y un evento existente', async ({ request, usuario }) => {
    const sinToken = await request.post(`/api/v1/events/${uuidInexistente()}/reservations`, { data: { quantity: 1 } });
    expect(sinToken.status()).toBe(401);

    const res = await reservar(request, usuario.token, uuidInexistente(), 1);
    expect(res.status()).toBe(404);
    expect(await codigoDe(res)).toBe('EVENTO_NO_ENCONTRADO');
  });

  for (const cantidad of [0, 5, -1, 2.5]) {
    test(`rechaza una cantidad de ${cantidad}`, async ({ request, operador, usuario }) => {
      const evento = await crearEvento(request, operador.token);
      const res = await reservar(request, usuario.token, evento.id, cantidad);
      expect(res.status()).toBe(400);
      expect(await codigoDe(res)).toBe('CANTIDAD_INVALIDA');
    });
  }

  test('rechaza una cantidad que no es número o que falta', async ({ request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token);
    const url = `/api/v1/events/${evento.id}/reservations`;
    const headers = conToken(usuario.token);

    expect((await request.post(url, { headers, data: { quantity: '2' } })).status()).toBe(400);
    expect((await request.post(url, { headers, data: {} })).status()).toBe(400);
  });

  test('el límite es de 4 lugares por usuario y por evento (valor límite incluido)', async ({
    request,
    operador,
    usuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 20 });

    expect((await reservar(request, usuario.token, evento.id, 3)).status()).toBe(201);

    const pasado = await reservar(request, usuario.token, evento.id, 2); // 3 + 2 = 5
    expect(pasado.status()).toBe(409);
    expect(await codigoDe(pasado)).toBe('LIMITE_SUPERADO');

    expect((await reservar(request, usuario.token, evento.id, 1)).status()).toBe(201); // 3 + 1 = 4

    const otra = await reservar(request, usuario.token, evento.id, 1);
    expect(otra.status()).toBe(409);
    expect(await codigoDe(otra)).toBe('LIMITE_SUPERADO');
  });

  test('sin cupo suficiente devuelve 409 CUPO_INSUFICIENTE y no descuenta nada', async ({
    request,
    operador,
    usuario,
    otroUsuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 2 });
    expect((await reservar(request, usuario.token, evento.id, 2)).status()).toBe(201);

    const res = await reservar(request, otroUsuario.token, evento.id, 1);
    expect(res.status()).toBe(409);
    expect(await codigoDe(res)).toBe('CUPO_INSUFICIENTE');
    expect(await cupoEnBase(evento.id)).toBe(0);
  });

  test('no se puede reservar en un evento cancelado ni en uno que ya empezó', async ({
    request,
    operador,
    usuario,
  }) => {
    const cancelado = await crearEvento(request, operador.token);
    await request.delete(`/api/v1/events/${cancelado.id}`, { headers: conToken(operador.token) });
    const r1 = await reservar(request, usuario.token, cancelado.id, 1);
    expect(r1.status()).toBe(409);
    expect(await codigoDe(r1)).toBe('EVENTO_NO_DISPONIBLE');

    const empezado = await crearEvento(request, operador.token);
    await moverEventoAlPasado(empezado.id);
    const r2 = await reservar(request, usuario.token, empezado.id, 1);
    expect(r2.status()).toBe(409);
    expect(await codigoDe(r2)).toBe('EVENTO_NO_DISPONIBLE');
  });
});

test.describe('Idempotencia', () => {
  test('repetir el pedido con la misma Idempotency-Key no duplica la reserva ni el descuento', async ({
    request,
    operador,
    usuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    const clave = `e2e-${Date.now()}`;

    const primera = await reservar(request, usuario.token, evento.id, 2, clave);
    const segunda = await reservar(request, usuario.token, evento.id, 2, clave);

    expect(primera.status()).toBe(201);
    expect(segunda.status()).toBe(200); // repetición reconocida
    expect((await segunda.json()).reservation.id).toBe((await primera.json()).reservation.id);
    expect(await cupoEnBase(evento.id)).toBe(8);
  });

  test('con claves distintas se crean reservas distintas', async ({ request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    const a = await reservar(request, usuario.token, evento.id, 1, `e2e-a-${Date.now()}`);
    const b = await reservar(request, usuario.token, evento.id, 1, `e2e-b-${Date.now()}`);
    expect((await a.json()).reservation.id).not.toBe((await b.json()).reservation.id);
    expect(await cupoEnBase(evento.id)).toBe(8);
  });
});

test.describe('Mis reservas y cancelación', () => {
  test('GET /reservations/me devuelve solo las reservas propias y exige sesión', async ({
    request,
    operador,
    usuario,
    otroUsuario,
  }) => {
    const evento = await crearEvento(request, operador.token);
    const mia = (await (await reservar(request, usuario.token, evento.id, 1)).json()).reservation;
    const ajena = (await (await reservar(request, otroUsuario.token, evento.id, 1)).json()).reservation;

    const lista = await request.get('/api/v1/reservations/me', { headers: conToken(usuario.token) });
    expect(lista.status()).toBe(200);
    const ids = (await lista.json()).items.map((r: { id: string }) => r.id);
    expect(ids).toContain(mia.id);
    expect(ids).not.toContain(ajena.id);

    expect((await request.get('/api/v1/reservations/me')).status()).toBe(401);
  });

  test('cancelar libera el cupo, es idempotente y libera el límite del usuario', async ({
    request,
    operador,
    usuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    const reserva = (await (await reservar(request, usuario.token, evento.id, 4)).json()).reservation;
    expect(await cupoEnBase(evento.id)).toBe(6);

    const cancela = await request.post(`/api/v1/reservations/${reserva.id}/cancel`, {
      headers: conToken(usuario.token),
    });
    expect(cancela.status()).toBe(200);
    expect((await cancela.json()).reservation.status).toBe('CANCELADA');
    expect(await cupoEnBase(evento.id)).toBe(10);

    // Cancelar de nuevo no devuelve los lugares dos veces.
    const otraVez = await request.post(`/api/v1/reservations/${reserva.id}/cancel`, {
      headers: conToken(usuario.token),
    });
    expect(otraVez.status()).toBe(200);
    expect(await cupoEnBase(evento.id)).toBe(10);

    // Como canceló, puede volver a reservar los 4.
    expect((await reservar(request, usuario.token, evento.id, 4)).status()).toBe(201);
  });

  test('nadie puede cancelar la reserva de otro (403), pero un ADMIN sí', async ({
    request,
    operador,
    usuario,
    otroUsuario,
    admin,
  }) => {
    const evento = await crearEvento(request, operador.token);
    const reserva = (await (await reservar(request, usuario.token, evento.id, 1)).json()).reservation;
    const url = `/api/v1/reservations/${reserva.id}/cancel`;

    const intruso = await request.post(url, { headers: conToken(otroUsuario.token) });
    expect(intruso.status()).toBe(403);
    expect(await codigoDe(intruso)).toBe('SIN_PERMISO');
    expect(await cupoEnBase(evento.id)).toBe(9); // no se tocó nada

    const adminRes = await request.post(url, { headers: conToken(admin.token) });
    expect(adminRes.status()).toBe(200);
    expect(await cupoEnBase(evento.id)).toBe(10);
  });

  test('cancelar una reserva inexistente devuelve 404', async ({ request, usuario }) => {
    const res = await request.post(`/api/v1/reservations/${uuidInexistente()}/cancel`, {
      headers: conToken(usuario.token),
    });
    expect(res.status()).toBe(404);
    expect(await codigoDe(res)).toBe('RESERVA_NO_ENCONTRADA');
  });
});

test.describe('Concurrencia (no se vende de más)', () => {
  test('8 usuarios compiten por 5 lugares: exactamente 5 ganan y el cupo queda en 0', async ({
    request,
    operador,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 5 });
    const usuarios: Sesion[] = [];
    for (let i = 0; i < 8; i++) usuarios.push(await crearSesion(request, 'USUARIO'));

    const respuestas = await Promise.all(usuarios.map((u) => reservar(request, u.token, evento.id, 1)));
    const estados = respuestas.map((r) => r.status());

    expect(estados.filter((s) => s === 201)).toHaveLength(5);
    expect(estados.filter((s) => s === 409)).toHaveLength(3);
    expect(await cupoEnBase(evento.id)).toBe(0);
  });

  test('un mismo usuario que dispara 6 pedidos en paralelo no pasa de 4 lugares', async ({
    request,
    operador,
    usuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 50 });

    const respuestas = await Promise.all(
      Array.from({ length: 6 }, () => reservar(request, usuario.token, evento.id, 1)),
    );
    const estados = respuestas.map((r) => r.status());

    expect(estados.filter((s) => s === 201)).toHaveLength(4);
    expect(estados.filter((s) => s === 409)).toHaveLength(2);
    expect(await cupoEnBase(evento.id)).toBe(46);
  });
});
