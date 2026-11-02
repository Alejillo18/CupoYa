import { test, expect } from '../../helpers/fixtures';
import { conToken, crearEvento, enHoras, nombreEvento, reservar, uuidInexistente } from '../../helpers/api';

test.describe('Crear eventos', () => {
  test('un operador crea un evento: cupo disponible = cupo total y nombre sin espacios sobrantes', async ({
    request,
    operador,
  }) => {
    const nombre = nombreEvento();
    const res = await request.post('/api/v1/events', {
      headers: conToken(operador.token),
      data: { name: `  ${nombre}  `, venue: 'Sala E2E', startsAt: enHoras(), totalCapacity: 25 },
    });

    expect(res.status()).toBe(201);
    const { event } = await res.json();
    expect(event).toMatchObject({
      name: nombre,
      totalCapacity: 25,
      availableCapacity: 25,
      status: 'ACTIVO',
      description: '',
    });
  });

  test('un usuario común no puede crear eventos (403) y sin token tampoco (401)', async ({ request, usuario }) => {
    const data = { name: nombreEvento(), venue: 'X', startsAt: enHoras(), totalCapacity: 5 };

    const prohibido = await request.post('/api/v1/events', { headers: conToken(usuario.token), data });
    expect(prohibido.status()).toBe(403);
    expect((await prohibido.json()).error.code).toBe('SIN_PERMISO');

    const anonimo = await request.post('/api/v1/events', { data });
    expect(anonimo.status()).toBe(401);
  });

  const base = () => ({ name: nombreEvento(), venue: 'Sala E2E', startsAt: enHoras(), totalCapacity: 10 });
  const invalidos: Array<[string, () => Record<string, unknown>, string]> = [
    ['fecha en el pasado', () => ({ ...base(), startsAt: enHoras(-2) }), 'FECHA_PASADA'],
    ['fecha que no es fecha', () => ({ ...base(), startsAt: 'mañana' }), 'VALIDACION'],
    ['cupo 0', () => ({ ...base(), totalCapacity: 0 }), 'VALIDACION'],
    ['cupo negativo', () => ({ ...base(), totalCapacity: -5 }), 'VALIDACION'],
    ['cupo decimal', () => ({ ...base(), totalCapacity: 1.5 }), 'VALIDACION'],
    ['cupo como texto', () => ({ ...base(), totalCapacity: '10' }), 'VALIDACION'],
    ['cupo mayor a 1.000.000', () => ({ ...base(), totalCapacity: 1_000_001 }), 'VALIDACION'],
    ['nombre solo con espacios', () => ({ ...base(), name: '    ' }), 'VALIDACION'],
    ['nombre de 121 caracteres', () => ({ ...base(), name: `E2E ${'x'.repeat(117)}` }), 'VALIDACION'],
    ['lugar vacío', () => ({ ...base(), venue: '' }), 'VALIDACION'],
    ['descripción de 2001 caracteres', () => ({ ...base(), description: 'd'.repeat(2001) }), 'VALIDACION'],
  ];

  for (const [caso, datos, codigo] of invalidos) {
    test(`rechaza: ${caso}`, async ({ request, operador }) => {
      const res = await request.post('/api/v1/events', { headers: conToken(operador.token), data: datos() });
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe(codigo);
    });
  }

  // Valores límite que SÍ deben funcionar.
  const limites: Array<[string, Record<string, unknown>]> = [
    ['cupo mínimo (1)', { totalCapacity: 1 }],
    ['cupo máximo (1.000.000)', { totalCapacity: 1_000_000 }],
    ['nombre de 120 caracteres', { name: `E2E ${'x'.repeat(116)}` }],
    ['descripción de 2000 caracteres', { description: 'd'.repeat(2000) }],
  ];
  for (const [caso, extra] of limites) {
    test(`acepta: ${caso}`, async ({ request, operador }) => {
      const res = await request.post('/api/v1/events', {
        headers: conToken(operador.token),
        data: { ...base(), ...extra },
      });
      expect(res.status()).toBe(201);
    });
  }
});

test.describe('Listar y consultar eventos', () => {
  test('exige sesión', async ({ request }) => {
    expect((await request.get('/api/v1/events')).status()).toBe(401);
  });

  test('un evento recién creado aparece en el listado y se puede consultar por id', async ({
    request,
    operador,
    usuario,
  }) => {
    const evento = await crearEvento(request, operador.token);

    const lista = await request.get('/api/v1/events?pageSize=100', { headers: conToken(usuario.token) });
    expect(lista.status()).toBe(200);
    const { items } = await lista.json();
    expect(items.map((e: { id: string }) => e.id)).toContain(evento.id);

    const uno = await request.get(`/api/v1/events/${evento.id}`, { headers: conToken(usuario.token) });
    expect(uno.status()).toBe(200);
    expect((await uno.json()).event.id).toBe(evento.id);
  });

  test('pagina: pageSize=1 devuelve de a un evento y las páginas no se repiten', async ({
    request,
    operador,
    usuario,
  }) => {
    await crearEvento(request, operador.token);
    await crearEvento(request, operador.token);

    const p1 = await (await request.get('/api/v1/events?page=1&pageSize=1', { headers: conToken(usuario.token) })).json();
    const p2 = await (await request.get('/api/v1/events?page=2&pageSize=1', { headers: conToken(usuario.token) })).json();

    expect(p1.items).toHaveLength(1);
    expect(p2.items).toHaveLength(1);
    expect(p1.items[0].id).not.toBe(p2.items[0].id);
    expect(p1.total).toBeGreaterThanOrEqual(2);
    expect(p1).toMatchObject({ page: 1, pageSize: 1 });
  });

  test('pageSize gigante se limita a 100', async ({ request, usuario }) => {
    const res = await request.get('/api/v1/events?pageSize=100000', { headers: conToken(usuario.token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).pageSize).toBe(100);
  });

  for (const query of ['page=0', 'page=-1', 'page=abc', 'pageSize=0', 'pageSize=1.5']) {
    test(`rechaza ?${query}`, async ({ request, usuario }) => {
      const res = await request.get(`/api/v1/events?${query}`, { headers: conToken(usuario.token) });
      expect(res.status()).toBe(400);
      expect((await res.json()).error.code).toBe('VALIDACION');
    });
  }

  test('un id inexistente devuelve 404', async ({ request, usuario }) => {
    const res = await request.get(`/api/v1/events/${uuidInexistente()}`, { headers: conToken(usuario.token) });
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('EVENTO_NO_ENCONTRADO');
  });

  test('un evento cancelado deja de aparecer en el listado', async ({ request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token);
    expect((await request.delete(`/api/v1/events/${evento.id}`, { headers: conToken(operador.token) })).status()).toBe(
      204,
    );

    const { items } = await (
      await request.get('/api/v1/events?pageSize=100', { headers: conToken(usuario.token) })
    ).json();
    expect(items.map((e: { id: string }) => e.id)).not.toContain(evento.id);

    const detalle = await (await request.get(`/api/v1/events/${evento.id}`, { headers: conToken(usuario.token) })).json();
    expect(detalle.event.status).toBe('CANCELADO');
  });
});

test.describe('Editar y cancelar eventos', () => {
  test('editar el nombre no toca el cupo', async ({ request, operador }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    const nuevo = nombreEvento();

    const res = await request.put(`/api/v1/events/${evento.id}`, {
      headers: conToken(operador.token),
      data: { name: nuevo },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).event).toMatchObject({ name: nuevo, totalCapacity: 10, availableCapacity: 10 });
  });

  test('subir el cupo total suma lugares disponibles; bajarlo por debajo de lo reservado da 409', async ({
    request,
    operador,
    usuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    expect((await reservar(request, usuario.token, evento.id, 3)).status()).toBe(201);

    const sube = await request.put(`/api/v1/events/${evento.id}`, {
      headers: conToken(operador.token),
      data: { totalCapacity: 20 },
    });
    expect(sube.status()).toBe(200);
    expect((await sube.json()).event).toMatchObject({ totalCapacity: 20, availableCapacity: 17 });

    const baja = await request.put(`/api/v1/events/${evento.id}`, {
      headers: conToken(operador.token),
      data: { totalCapacity: 2 },
    });
    expect(baja.status()).toBe(409);
    expect((await baja.json()).error.code).toBe('CUPO_MENOR_A_RESERVAS');

    // Bajarlo justo hasta lo reservado sí se puede (valor límite).
    const justo = await request.put(`/api/v1/events/${evento.id}`, {
      headers: conToken(operador.token),
      data: { totalCapacity: 3 },
    });
    expect(justo.status()).toBe(200);
    expect((await justo.json()).event.availableCapacity).toBe(0);
  });

  test('rechaza un cuerpo vacío, una fecha pasada y a un usuario común', async ({ request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token);
    const url = `/api/v1/events/${evento.id}`;

    const vacio = await request.put(url, { headers: conToken(operador.token), data: {} });
    expect(vacio.status()).toBe(400);

    const pasada = await request.put(url, { headers: conToken(operador.token), data: { startsAt: enHoras(-1) } });
    expect(pasada.status()).toBe(400);
    expect((await pasada.json()).error.code).toBe('FECHA_PASADA');

    const comun = await request.put(url, { headers: conToken(usuario.token), data: { name: 'hack' } });
    expect(comun.status()).toBe(403);
  });

  test('no se puede editar un evento cancelado', async ({ request, operador }) => {
    const evento = await crearEvento(request, operador.token);
    await request.delete(`/api/v1/events/${evento.id}`, { headers: conToken(operador.token) });

    const res = await request.put(`/api/v1/events/${evento.id}`, {
      headers: conToken(operador.token),
      data: { name: 'ya cancelado' },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('EVENTO_CANCELADO');
  });

  test('cancelar: un usuario común recibe 403 y un evento inexistente 404', async ({ request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token);

    expect((await request.delete(`/api/v1/events/${evento.id}`, { headers: conToken(usuario.token) })).status()).toBe(
      403,
    );
    const fantasma = await request.delete(`/api/v1/events/${uuidInexistente()}`, {
      headers: conToken(operador.token),
    });
    expect(fantasma.status()).toBe(404);
  });
});
