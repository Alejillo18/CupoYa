import { PrismaClient } from '@prisma/client';
import { PrismaReportsRepository } from '../../src/modules/reports/reports.repository';

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const repo = new PrismaReportsRepository(prisma);

async function limpiar() {
  await prisma.report.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.event.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.user.deleteMany();
}

describe('PrismaReportsRepository (PostgreSQL real)', () => {
  let adminId: string;

  beforeEach(async () => {
    await limpiar();
    const u = await prisma.user.create({
      data: { email: 'adm@mail.com', passwordHash: 'h', role: 'ADMIN' },
    });
    adminId = u.id;
  });

  afterAll(async () => {
    await limpiar();
    await prisma.$disconnect();
  });

  it('create deja el reporte PENDIENTE sin resultado', async () => {
    const r = await repo.create(adminId);

    expect(r.status).toBe('PENDIENTE');
    expect(r.result).toBeNull();
    expect(r.finishedAt).toBeNull();
  });

  it('findById devuelve null si no existe', async () => {
    expect(await repo.findById('11111111-1111-4111-8111-111111111111')).toBeNull();
  });

  it('setStatus guarda el resultado JSON y la fecha de fin', async () => {
    const r = await repo.create(adminId);
    const fin = new Date();

    await repo.setStatus(r.id, 'LISTO', {
      result: { report: { totals: { events: 1 } }, csv: 'a,b\n1,2' },
      finishedAt: fin,
    });

    const g = await repo.findById(r.id);
    expect(g?.status).toBe('LISTO');
    expect((g?.result as { csv: string }).csv).toBe('a,b\n1,2');
    expect(Math.abs(g!.finishedAt!.getTime() - fin.getTime())).toBeLessThan(1000);
  });

  it('setStatus a ERROR guarda el mensaje', async () => {
    const r = await repo.create(adminId);

    await repo.setStatus(r.id, 'ERROR', { errorMessage: 'falló' });

    expect((await repo.findById(r.id))?.errorMessage).toBe('falló');
  });

  it('setStatus sin extras solo cambia el estado y conserva lo guardado', async () => {
    const r = await repo.create(adminId);
    await repo.setStatus(r.id, 'LISTO', { result: { csv: 'x' } });

    await repo.setStatus(r.id, 'EN_PROCESO');

    const g = await repo.findById(r.id);
    expect(g?.status).toBe('EN_PROCESO');
    expect((g?.result as { csv: string }).csv).toBe('x');
  });

  it('loadData lee eventos y reservas reales', async () => {
    const e = await prisma.event.create({
      data: {
        name: 'Recital',
        venue: 'Estadio',
        startsAt: new Date(Date.now() + 86_400_000),
        totalCapacity: 10,
        availableCapacity: 7,
      },
    });
    await prisma.reservation.create({
      data: { userId: adminId, eventId: e.id, quantity: 3 },
    });

    const d = await repo.loadData();

    expect(d.events).toHaveLength(1);
    expect(d.events[0].startsAt).toBeInstanceOf(Date);
    expect(d.reservations).toEqual([{ eventId: e.id, quantity: 3, status: 'CONFIRMADA' }]);
  });
});