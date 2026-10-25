import { PrismaClient } from '@prisma/client';
import { PrismaEventRepository } from '../../src/modules/events/events.repository';

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const repo = new PrismaEventRepository(prisma);

const FUTURO = new Date(Date.now() + 30 * 86_400_000);
const nuevo = { name: 'Recital', venue: 'Estadio', startsAt: FUTURO, totalCapacity: 100 };

describe('PrismaEventRepository (PostgreSQL real)', () => {
  beforeEach(async () => {
    await prisma.reservation.deleteMany();
    await prisma.event.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('create deja el cupo disponible igual al total y conserva la fecha exacta', async () => {
    const e = await repo.create(nuevo);

    expect(e.availableCapacity).toBe(100);
    expect(e.status).toBe('ACTIVO');
    expect(Math.abs(e.startsAt.getTime() - FUTURO.getTime())).toBeLessThan(1000);
  });

  it('la base rechaza un cupo disponible negativo (CHECK)', async () => {
    const e = await repo.create(nuevo);

    await expect(
      prisma.$executeRaw`UPDATE events SET available_capacity = -1 WHERE id = ${e.id}::uuid`,
    ).rejects.toThrow();
  });

  it('la base rechaza un cupo disponible mayor al total (CHECK)', async () => {
    const e = await repo.create(nuevo);

    await expect(
      prisma.$executeRaw`UPDATE events SET available_capacity = 101 WHERE id = ${e.id}::uuid`,
    ).rejects.toThrow();
  });

  it('update sube el cupo total y ajusta el disponible', async () => {
    const e = await repo.create(nuevo);

    const r = await repo.update(e.id, { totalCapacity: 150 });

    expect(r?.totalCapacity).toBe(150);
    expect(r?.availableCapacity).toBe(150);
  });

  it('update respeta lo ya reservado al cambiar el cupo', async () => {
    const e = await repo.create(nuevo);
    await prisma.$executeRaw`UPDATE events SET available_capacity = 30 WHERE id = ${e.id}::uuid`;

    const r = await repo.update(e.id, { totalCapacity: 80 });

    expect(r?.totalCapacity).toBe(80);
    expect(r?.availableCapacity).toBe(10); // 70 reservados siguen reservados
  });

  it('update devuelve null si el nuevo cupo queda por debajo de lo reservado', async () => {
    const e = await repo.create(nuevo);
    await prisma.$executeRaw`UPDATE events SET available_capacity = 30 WHERE id = ${e.id}::uuid`;

    expect(await repo.update(e.id, { totalCapacity: 50 })).toBeNull();
    expect((await repo.findById(e.id))?.totalCapacity).toBe(100);
  });

  it('update devuelve null si el evento no existe', async () => {
    expect(
      await repo.update('11111111-1111-4111-8111-111111111111', { totalCapacity: 10 }),
    ).toBeNull();
  });

  it('update sin cupo modifica solo los demás campos', async () => {
    const e = await repo.create(nuevo);

    const r = await repo.update(e.id, { name: 'Otro', venue: 'Teatro' });

    expect(r).toMatchObject({ name: 'Otro', venue: 'Teatro', totalCapacity: 100 });
  });

  it('cancel deja el evento CANCELADO y devuelve null si no existe', async () => {
    const e = await repo.create(nuevo);

    expect((await repo.cancel(e.id))?.status).toBe('CANCELADO');
    expect(await repo.cancel('11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  it('list pagina, ordena por fecha y excluye cancelados y pasados', async () => {
    const dia = 86_400_000;
    await repo.create({ ...nuevo, name: 'C', startsAt: new Date(Date.now() + 30 * dia) });
    await repo.create({ ...nuevo, name: 'A', startsAt: new Date(Date.now() + 10 * dia) });
    const b = await repo.create({ ...nuevo, name: 'B', startsAt: new Date(Date.now() + 20 * dia) });
    await repo.create({ ...nuevo, name: 'Pasado', startsAt: new Date(Date.now() - dia) });
    await repo.cancel(b.id);

    const r = await repo.list({ page: 1, pageSize: 10, from: new Date(), includeCancelled: false });

    expect(r.items.map((e) => e.name)).toEqual(['A', 'C']);
    expect(r.total).toBe(2);

    const p2 = await repo.list({ page: 2, pageSize: 1, from: new Date(), includeCancelled: false });
    expect(p2.items.map((e) => e.name)).toEqual(['C']);
  });
});