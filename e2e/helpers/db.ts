import { Client } from 'pg';

const url =
  process.env.E2E_DATABASE_URL ??
  `postgresql://${process.env.DB_USER ?? 'cupoya'}:${encodeURIComponent(
    process.env.DB_PASSWORD ?? 'Contraseña',
  )}@localhost:${process.env.DB_PORT ?? '5433'}/cupoya`;

async function conBase<T>(fn: (c: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

/** El primer ADMIN/OPERADOR no se puede crear por API: se asigna en la base (como indica el README). */
export function asignarRol(email: string, rol: 'USUARIO' | 'OPERADOR' | 'ADMIN') {
  return conBase((c) => c.query('UPDATE users SET role = $1::"Role" WHERE email = $2', [rol, email]));
}

/** Borra todo lo que crearon las pruebas (usuarios @e2e.cupoya.test y eventos "E2E ..."). */
export function limpiarDatosDePrueba() {
  return conBase(async (c) => {
    const usuarios = `(SELECT id FROM users WHERE email LIKE '%@e2e.cupoya.test')`;
    const eventos = `(SELECT id FROM events WHERE name LIKE 'E2E %')`;
    await c.query(`DELETE FROM reservations WHERE user_id IN ${usuarios} OR event_id IN ${eventos}`);
    await c.query(`DELETE FROM reports WHERE requested_by IN ${usuarios}`);
    await c.query(`DELETE FROM events WHERE name LIKE 'E2E %'`);
    await c.query(`DELETE FROM users WHERE email LIKE '%@e2e.cupoya.test'`);
  });
}

/** Cupo disponible real según la base (para chequear consistencia, no solo lo que dice la API). */
export function cupoEnBase(eventId: string) {
  return conBase(async (c) => {
    const r = await c.query<{ available_capacity: number }>(
      'SELECT available_capacity FROM events WHERE id = $1::uuid',
      [eventId],
    );
    return r.rows[0]?.available_capacity;
  });
}

/** Simula un evento que ya empezó (la API no deja crearlo en el pasado). */
export function moverEventoAlPasado(eventId: string) {
  return conBase((c) =>
    c.query(`UPDATE events SET starts_at = now() - interval '1 hour' WHERE id = $1::uuid`, [eventId]),
  );
}
