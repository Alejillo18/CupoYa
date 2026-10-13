import { PrismaClient } from '@prisma/client';
import { PrismaUserRepository } from '../../src/modules/auth/auth.repository';

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const repo = new PrismaUserRepository(prisma);

describe('PrismaUserRepository (PostgreSQL real)', () => {
  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('registerFailedLogin guarda lockedUntil en el instante exacto (sin corrimiento de zona horaria)', async () => {
    const user = await repo.create({ email: 'ana@mail.com', passwordHash: 'hash' });
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000);

    await repo.registerFailedLogin(user.id, 1, lockUntil);

    const saved = await repo.findByEmail('ana@mail.com');
    expect(saved?.lockedUntil).not.toBeNull();
    const diffMs = Math.abs(saved!.lockedUntil!.getTime() - lockUntil.getTime());
    expect(diffMs).toBeLessThan(1000);
  });

  it('el contador sube con cada fallo y se reinicia al bloquear', async () => {
    const user = await repo.create({ email: 'ana@mail.com', passwordHash: 'hash' });
    const lockUntil = new Date(Date.now() + 15 * 60 * 1000);

    await repo.registerFailedLogin(user.id, 3, lockUntil);
    await repo.registerFailedLogin(user.id, 3, lockUntil);
    expect((await repo.findByEmail('ana@mail.com'))?.failedAttempts).toBe(2);

    await repo.registerFailedLogin(user.id, 3, lockUntil);
    const locked = await repo.findByEmail('ana@mail.com');
    expect(locked?.failedAttempts).toBe(0);
    expect(locked?.lockedUntil).not.toBeNull();
  });

  it('resetFailedLogins limpia el contador y el bloqueo', async () => {
    const user = await repo.create({ email: 'ana@mail.com', passwordHash: 'hash' });
    await repo.registerFailedLogin(user.id, 1, new Date(Date.now() + 60_000));

    await repo.resetFailedLogins(user.id);

    const saved = await repo.findByEmail('ana@mail.com');
    expect(saved?.failedAttempts).toBe(0);
    expect(saved?.lockedUntil).toBeNull();
  });
});