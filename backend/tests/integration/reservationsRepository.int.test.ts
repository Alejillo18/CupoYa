import { PrismaClient } from '@prisma/client';
import { PrismaReservationsRepository } from '../../src/modules/reservations/reservations.prisma';

const prisma = new PrismaClient({
  datasourceUrl: process.env.TEST_DATABASE_URL,
});
const repo = new PrismaReservationsRepository(prisma);

const dia = 86_400_000;

async function crearEvento(totalCapacity: number, extra: Record<string, unknown> = {}) {
  return prisma.event.create({
    data: {
      name: 'Recital',
      venue: 'Estadio',
      startsAt: new Date(Date.now() + 30 * dia),
      totalCapacity,
      availableCapacity: totalCapacity,
      ...extra,
    },
  });
}

async function crearUsuarios(n: number) {
  const data = Array.from({ length: n }, (_, i) => ({
    email: `u${i}@mail.com`,
    passwordHash: 'h',
  }));
  await prisma.user.createMany({ data });
  return prisma.user.findMany({ orderBy: { email: 'asc' } });
}

// Invariante: disponible = total - suma de lo CONFIRMADO
async function invariante(eventId: string) {
  const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const agg = await prisma.reservation.aggregate({
    where: { eventId, status: 'CONFIRMADA' },
    _sum: { quantity: true },
  });
  const confirmadas = agg._sum.quantity ?? 0;
  return { disponible: e.availableCapacity, total: e.totalCapacity, confirmadas };
}

describe('PrismaReservationsRepository (PostgreSQL real)', () => {
  beforeEach(async () => {
    await prisma.reservation.deleteMany();
    await prisma.event.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('reserva y descuenta el cupo', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(10);

    const r = await repo.reserve({ userId: u.id, eventId: e.id, quantity: 2 });

    expect(r.ok).toBe(true);
    expect(await invariante(e.id)).toEqual({ disponible: 8, total: 10, confirmadas: 2 });
  });

  it('sin cupo suficiente devuelve SIN_CUPO y no reserva nada', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(1);

    const r = await repo.reserve({ userId: u.id, eventId: e.id, quantity: 2 });

    expect(r).toEqual({ ok: false, reason: 'SIN_CUPO' });
    expect(await invariante(e.id)).toEqual({ disponible: 1, total: 1, confirmadas: 0 });
  });

  it('evento inexistente, cancelado o pasado se distinguen', async () => {
    const [u] = await crearUsuarios(1);
    const cancelado = await crearEvento(10, { status: 'CANCELADO' });
    const pasado = await crearEvento(10, { startsAt: new Date(Date.now() - dia) });

    expect(
      await repo.reserve({
        userId: u.id,
        eventId: '11111111-1111-4111-8111-111111111111',
        quantity: 1,
      }),
    ).toEqual({ ok: false, reason: 'EVENTO_NO_ENCONTRADO' });
    expect(await repo.reserve({ userId: u.id, eventId: cancelado.id, quantity: 1 })).toEqual({
      ok: false,
      reason: 'EVENTO_NO_DISPONIBLE',
    });
    expect(await repo.reserve({ userId: u.id, eventId: pasado.id, quantity: 1 })).toEqual({
      ok: false,
      reason: 'EVENTO_NO_DISPONIBLE',
    });
  });

  it('un usuario no supera 4 lugares por evento sumando reservas', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(100);

    await repo.reserve({ userId: u.id, eventId: e.id, quantity: 3 });
    const r = await repo.reserve({ userId: u.id, eventId: e.id, quantity: 2 });

    expect(r).toEqual({ ok: false, reason: 'LIMITE_SUPERADO' });
    expect((await invariante(e.id)).confirmadas).toBe(3);
  });

  it('la misma Idempotency-Key devuelve la misma reserva sin duplicar', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(10);
    const input = { userId: u.id, eventId: e.id, quantity: 1, idempotencyKey: 'k-1' };

    const a = await repo.reserve(input);
    const b = await repo.reserve(input);

    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(b.reservation.id).toBe(a.reservation.id);
      expect(a.replayed).toBe(false);
      expect(b.replayed).toBe(true);
    }
    expect(await invariante(e.id)).toEqual({ disponible: 9, total: 10, confirmadas: 1 });
  });

  it('cancelar libera el cupo y cancelar dos veces no lo libera dos veces', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(10);
    const r = await repo.reserve({ userId: u.id, eventId: e.id, quantity: 3 });
    if (!r.ok) throw new Error('no reservó');

    const c1 = await repo.cancel(r.reservation.id);
    const c2 = await repo.cancel(r.reservation.id);

    expect(c1.ok).toBe(true);
    expect(c2).toEqual({ ok: false, reason: 'YA_CANCELADA' });
    expect(await invariante(e.id)).toEqual({ disponible: 10, total: 10, confirmadas: 0 });
    expect(await repo.cancel('11111111-1111-4111-8111-111111111111')).toEqual({
      ok: false,
      reason: 'NO_EXISTE',
    });
  });

  it('tras cancelar, el usuario puede volver a reservar hasta su límite', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(100);
    const r = await repo.reserve({ userId: u.id, eventId: e.id, quantity: 4 });
    if (!r.ok) throw new Error('no reservó');
    await repo.cancel(r.reservation.id);

    const otra = await repo.reserve({ userId: u.id, eventId: e.id, quantity: 4 });

    expect(otra.ok).toBe(true);
  });

  it('CONCURRENCIA: 300 usuarios compiten por 10 lugares: exactamente 10 confirmadas', async () => {
    const usuarios = await crearUsuarios(300);
    const e = await crearEvento(10);

    const resultados = await Promise.all(
      usuarios.map((u) => repo.reserve({ userId: u.id, eventId: e.id, quantity: 1 })),
    );

    const ok = resultados.filter((r) => r.ok).length;
    const sinCupo = resultados.filter((r) => !r.ok && r.reason === 'SIN_CUPO').length;
    expect(ok).toBe(10);
    expect(sinCupo).toBe(290);
    expect(await invariante(e.id)).toEqual({ disponible: 0, total: 10, confirmadas: 10 });
  }, 60_000);

  it('CONCURRENCIA: demanda mayor al cupo con cantidades mixtas nunca sobrevende', async () => {
    const usuarios = await crearUsuarios(100);
    const e = await crearEvento(50);

    await Promise.all(
      usuarios.map((u, i) =>
        repo.reserve({ userId: u.id, eventId: e.id, quantity: (i % 4) + 1 }),
      ),
    );

    const inv = await invariante(e.id);
    expect(inv.disponible).toBeGreaterThanOrEqual(0);
    expect(inv.disponible + inv.confirmadas).toBe(inv.total);
  }, 60_000);

  it('CONCURRENCIA: un mismo usuario con 10 pedidos en paralelo obtiene como máximo 4', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(100);

    await Promise.all(
      Array.from({ length: 10 }, () => repo.reserve({ userId: u.id, eventId: e.id, quantity: 1 })),
    );

    expect((await invariante(e.id)).confirmadas).toBe(4);
  }, 60_000);

  it('CONCURRENCIA: la misma Idempotency-Key repetida 8 veces crea una sola reserva', async () => {
    const [u] = await crearUsuarios(1);
    const e = await crearEvento(10);

    const resultados = await Promise.all(
      Array.from({ length: 8 }, () =>
        repo.reserve({ userId: u.id, eventId: e.id, quantity: 1, idempotencyKey: 'k-x' }),
      ),
    );

    expect(resultados.every((r) => r.ok)).toBe(true);
    expect(await prisma.reservation.count()).toBe(1);
    expect(await invariante(e.id)).toEqual({ disponible: 9, total: 10, confirmadas: 1 });
  }, 60_000);

  it('CONCURRENCIA: reservas y cancelaciones mezcladas conservan el invariante', async () => {
    const usuarios = await crearUsuarios(40);
    const e = await crearEvento(20);
    const primeras = await Promise.all(
      usuarios.slice(0, 20).map((u) => repo.reserve({ userId: u.id, eventId: e.id, quantity: 1 })),
    );

    await Promise.all([
      ...primeras.map((r) => (r.ok ? repo.cancel(r.reservation.id) : Promise.resolve())),
      ...usuarios.slice(20).map((u) => repo.reserve({ userId: u.id, eventId: e.id, quantity: 1 })),
    ]);

    const inv = await invariante(e.id);
    expect(inv.disponible).toBeGreaterThanOrEqual(0);
    expect(inv.disponible + inv.confirmadas).toBe(inv.total);
  }, 60_000);
});