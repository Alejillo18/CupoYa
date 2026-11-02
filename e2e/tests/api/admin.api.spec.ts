import { test, expect } from '../../helpers/fixtures';
import { PASSWORD, conToken, enHoras, nombreEvento, uuidInexistente } from '../../helpers/api';

test.describe('Usuarios y roles', () => {
  test('el admin lista usuarios con paginación', async ({ request, admin }) => {
    const res = await request.get('/api/v1/users?page=1&pageSize=5', { headers: conToken(admin.token) });
    expect(res.status()).toBe(200);
    const cuerpo = await res.json();
    expect(Array.isArray(cuerpo.items)).toBe(true);
    expect(cuerpo.items.length).toBeLessThanOrEqual(5);
    expect(cuerpo.total).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(cuerpo)).not.toMatch(/password|hash/i);
  });

  test('el listado de usuarios rechaza parámetros inválidos', async ({ request, admin }) => {
    const res = await request.get('/api/v1/users?page=0', { headers: conToken(admin.token) });
    expect(res.status()).toBe(400);
  });

  test('cambiar el rol: el token viejo mantiene el rol anterior hasta volver a ingresar', async ({
    request,
    admin,
    usuario,
  }) => {
    const datosEvento = { name: nombreEvento(), venue: 'X', startsAt: enHoras(), totalCapacity: 3 };

    const cambio = await request.patch(`/api/v1/users/${usuario.id}/role`, {
      headers: conToken(admin.token),
      data: { role: 'OPERADOR' },
    });
    expect(cambio.status()).toBe(200);
    expect((await cambio.json()).user.role).toBe('OPERADOR');

    // Con el token anterior (rol USUARIO) todavía no puede crear eventos.
    const viejo = await request.post('/api/v1/events', { headers: conToken(usuario.token), data: datosEvento });
    expect(viejo.status()).toBe(403);

    // Después de ingresar de nuevo, sí.
    const login = await request.post('/api/v1/auth/login', { data: { email: usuario.email, password: PASSWORD } });
    const { accessToken } = await login.json();
    const nuevo = await request.post('/api/v1/events', { headers: conToken(accessToken), data: datosEvento });
    expect(nuevo.status()).toBe(201);
  });

  test('rechaza un rol inexistente y un usuario inexistente', async ({ request, admin, usuario }) => {
    const rolMalo = await request.patch(`/api/v1/users/${usuario.id}/role`, {
      headers: conToken(admin.token),
      data: { role: 'SUPERADMIN' },
    });
    expect(rolMalo.status()).toBe(400);

    const fantasma = await request.patch(`/api/v1/users/${uuidInexistente()}/role`, {
      headers: conToken(admin.token),
      data: { role: 'OPERADOR' },
    });
    expect(fantasma.status()).toBe(404);
    expect((await fantasma.json()).error.code).toBe('USUARIO_NO_ENCONTRADO');
  });
});

test.describe('Reportes de ocupación', () => {
  test('se solicita (202), se completa en segundo plano y se descarga como CSV', async ({ request, admin }) => {
    const pedido = await request.post('/api/v1/reports', { headers: conToken(admin.token) });
    expect(pedido.status()).toBe(202);
    const { report } = await pedido.json();
    expect(report.id).toBeTruthy();
    expect(['PENDIENTE', 'EN_PROCESO', 'LISTO']).toContain(report.status);

    await expect
      .poll(
        async () => {
          const r = await request.get(`/api/v1/reports/${report.id}`, { headers: conToken(admin.token) });
          return (await r.json()).report.status;
        },
        { timeout: 30_000, message: 'el reporte debería terminar en LISTO' },
      )
      .toBe('LISTO');

    // El CSV no viaja en el JSON de estado: solo por /download.
    const estado = await (await request.get(`/api/v1/reports/${report.id}`, { headers: conToken(admin.token) })).json();
    expect(JSON.stringify(estado.report.result ?? {})).not.toContain('"csv"');

    const descarga = await request.get(`/api/v1/reports/${report.id}/download`, { headers: conToken(admin.token) });
    expect(descarga.status()).toBe(200);
    expect(descarga.headers()['content-type']).toContain('text/csv');
    expect(descarga.headers()['content-disposition']).toContain('attachment');
    expect((await descarga.text()).length).toBeGreaterThan(0);
  });

  test('un reporte inexistente devuelve 404', async ({ request, admin }) => {
    const res = await request.get(`/api/v1/reports/${uuidInexistente()}`, { headers: conToken(admin.token) });
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('REPORTE_NO_ENCONTRADO');
  });
});
