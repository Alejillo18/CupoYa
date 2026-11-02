import { test, expect } from '../../helpers/fixtures';
import { Rol, conToken, uuidInexistente } from '../../helpers/api';

/**
 * Matriz de permisos: cada endpoint contra cada rol.
 * - Rol NO permitido  → tiene que ser 403 (o 401 si no hay sesión).
 * - Rol permitido     → no puede ser ni 401 ni 403 (el resultado exacto lo cubren otros specs;
 *                       acá mandamos datos vacíos a propósito para no crear nada).
 */
interface Endpoint {
  metodo: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  ruta: () => string;
  permitidos: Rol[];
  cuerpo?: object;
}

const TODOS: Rol[] = ['USUARIO', 'OPERADOR', 'ADMIN'];
const GESTION: Rol[] = ['OPERADOR', 'ADMIN'];
const SOLO_ADMIN: Rol[] = ['ADMIN'];

const endpoints: Endpoint[] = [
  { metodo: 'GET', ruta: () => '/api/v1/auth/me', permitidos: TODOS },
  { metodo: 'GET', ruta: () => '/api/v1/events', permitidos: TODOS },
  { metodo: 'GET', ruta: () => `/api/v1/events/${uuidInexistente()}`, permitidos: TODOS },
  { metodo: 'POST', ruta: () => '/api/v1/events', permitidos: GESTION, cuerpo: {} },
  { metodo: 'PUT', ruta: () => `/api/v1/events/${uuidInexistente()}`, permitidos: GESTION, cuerpo: {} },
  { metodo: 'DELETE', ruta: () => `/api/v1/events/${uuidInexistente()}`, permitidos: GESTION },
  { metodo: 'POST', ruta: () => `/api/v1/events/${uuidInexistente()}/reservations`, permitidos: TODOS, cuerpo: { quantity: 1 } },
  { metodo: 'GET', ruta: () => '/api/v1/reservations/me', permitidos: TODOS },
  { metodo: 'POST', ruta: () => `/api/v1/reservations/${uuidInexistente()}/cancel`, permitidos: TODOS },
  { metodo: 'GET', ruta: () => '/api/v1/users', permitidos: SOLO_ADMIN },
  { metodo: 'PATCH', ruta: () => `/api/v1/users/${uuidInexistente()}/role`, permitidos: SOLO_ADMIN, cuerpo: {} },
  { metodo: 'POST', ruta: () => '/api/v1/reports', permitidos: SOLO_ADMIN },
  { metodo: 'GET', ruta: () => `/api/v1/reports/${uuidInexistente()}`, permitidos: SOLO_ADMIN },
  { metodo: 'GET', ruta: () => `/api/v1/reports/${uuidInexistente()}/download`, permitidos: SOLO_ADMIN },
];

test.describe('Matriz de permisos por rol', () => {
  for (const e of endpoints) {
    const etiqueta = `${e.metodo} ${e.ruta().replace(/[0-9a-f-]{36}/g, ':id')}`;

    test(`${etiqueta} sin sesión → 401`, async ({ request }) => {
      const res = await request.fetch(e.ruta(), { method: e.metodo, data: e.cuerpo });
      expect(res.status()).toBe(401);
    });

    for (const rol of TODOS) {
      const permitido = e.permitidos.includes(rol);

      test(`${etiqueta} como ${rol} → ${permitido ? 'tiene acceso' : '403'}`, async ({
        request,
        usuario,
        operador,
        admin,
      }) => {
        const sesion = { USUARIO: usuario, OPERADOR: operador, ADMIN: admin }[rol];
        const res = await request.fetch(e.ruta(), {
          method: e.metodo,
          headers: conToken(sesion.token),
          data: e.cuerpo,
        });

        if (permitido) {
          expect([401, 403], 'un rol permitido no debería recibir 401/403').not.toContain(res.status());
        } else {
          expect(res.status()).toBe(403);
          expect((await res.json()).error.code).toBe('SIN_PERMISO');
        }
      });
    }
  }
});
