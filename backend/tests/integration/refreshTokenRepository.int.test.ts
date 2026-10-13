import { PrismaClient } from '@prisma/client';
import { PrismaRefreshTokenRepository } from '../../src/modules/auth/refreshToken.repository';

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const repo = new PrismaRefreshTokenRepository(prisma);

describe('PrismaRefreshTokenRepository (PostgreSQL real)', () => {
  let userId: string;
  const familyId = '11111111-1111-4111-8111-111111111111';

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
    const user = await prisma.user.create({ data: { email: 'ana@mail.com', passwordHash: 'h' } });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function crear(hash: string, expiresAt = new Date(Date.now() + 86_400_000)) {
    await repo.create({ userId, familyId, tokenHash: hash, expiresAt });
    return (await repo.findByHash(hash))!;
  }

  it('guarda y recupera por hash, conservando el vencimiento exacto', async () => {
    const expiresAt = new Date(Date.now() + 7 * 86_400_000);
    const rec = await crear('hash-1', expiresAt);

    expect(rec.userId).toBe(userId);
    expect(Math.abs(rec.expiresAt.getTime() - expiresAt.getTime())).toBeLessThan(1000);
  });

  it('findByHash devuelve null si no existe', async () => {
    expect(await repo.findByHash('no-existe')).toBeNull();
  });

  it('markUsed devuelve true la primera vez y false la segunda', async () => {
    const rec = await crear('hash-1');

    expect(await repo.markUsed(rec.id, new Date())).toBe(true);
    expect(await repo.markUsed(rec.id, new Date())).toBe(false);
  });

  it('20 markUsed simultáneos sobre el mismo token: exactamente uno gana', async () => {
    const rec = await crear('hash-1');

    const resultados = await Promise.all(
      Array.from({ length: 20 }, () => repo.markUsed(rec.id, new Date())),
    );

    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it('revokeFamily revoca solo los tokens de esa familia', async () => {
    const a = await crear('hash-a');
    await repo.create({
      userId,
      familyId: '22222222-2222-4222-8222-222222222222',
      tokenHash: 'hash-otra',
      expiresAt: new Date(Date.now() + 86_400_000),
    });

    await repo.revokeFamily(familyId, new Date());

    expect((await repo.findByHash('hash-a'))?.revokedAt).not.toBeNull();
    expect((await repo.findByHash('hash-otra'))?.revokedAt).toBeNull();
    expect(a.id).toBeDefined();
  });
});