import { test, expect } from '../../helpers/fixtures';
import { conToken, uuidInexistente } from '../../helpers/api';

/**
 * HIPÓTESIS A VERIFICAR (@bug-probable)
 * Ningún test existente manda un id que no sea un UUID. El código lo pasa tal cual a Prisma / a SQL
 * con `::uuid`, así que PostgreSQL debería fallar al convertirlo y el errorHandler lo transformaría
 * en un 500 ERROR_INTERNO en vez de un 404 (o 400).
 *
 * Si estos tests fallan con 500, encontraste un defecto real: documentalo como bug (pasos, resultado
 * esperado vs. obtenido) y la corrección es validar el id (p. ej. z.string().uuid()) antes del servicio.
 */
const ID_INVALIDO = 'esto-no-es-un-uuid';

test.describe('Ids con formato inválido no deben producir 500 @bug-probable', () => {
  test('GET /events/:id', async ({ request, usuario }) => {
    const res = await request.get(`/api/v1/events/${ID_INVALIDO}`, { headers: conToken(usuario.token) });
    expect([400, 404]).toContain(res.status());
  });

  test('PUT /events/:id', async ({ request, operador }) => {
    const res = await request.put(`/api/v1/events/${ID_INVALIDO}`, {
      headers: conToken(operador.token),
      data: { name: 'E2E x' },
    });
    expect([400, 404]).toContain(res.status());
  });

  test('DELETE /events/:id', async ({ request, operador }) => {
    const res = await request.delete(`/api/v1/events/${ID_INVALIDO}`, { headers: conToken(operador.token) });
    expect([400, 404]).toContain(res.status());
  });

  test('POST /events/:id/reservations', async ({ request, usuario }) => {
    const res = await request.post(`/api/v1/events/${ID_INVALIDO}/reservations`, {
      headers: conToken(usuario.token),
      data: { quantity: 1 },
    });
    expect([400, 404]).toContain(res.status());
  });

  test('POST /reservations/:id/cancel', async ({ request, usuario }) => {
    const res = await request.post(`/api/v1/reservations/${ID_INVALIDO}/cancel`, {
      headers: conToken(usuario.token),
    });
    expect([400, 404]).toContain(res.status());
  });

  test('PATCH /users/:id/role', async ({ request, admin }) => {
    const res = await request.patch(`/api/v1/users/${ID_INVALIDO}/role`, {
      headers: conToken(admin.token),
      data: { role: 'OPERADOR' },
    });
    expect([400, 404]).toContain(res.status());
  });

  test('GET /reports/:id y /reports/:id/download', async ({ request, admin }) => {
    for (const ruta of [`/api/v1/reports/${ID_INVALIDO}`, `/api/v1/reports/${ID_INVALIDO}/download`]) {
      const res = await request.get(ruta, { headers: conToken(admin.token) });
      expect([400, 404], ruta).toContain(res.status());
    }
  });

  test('control: un UUID válido pero inexistente sí da 404 (el caso que ya funciona)', async ({
    request,
    operador,
  }) => {
    const res = await request.get(`/api/v1/events/${uuidInexistente()}`, { headers: conToken(operador.token) });
    expect(res.status()).toBe(404);
  });
});
