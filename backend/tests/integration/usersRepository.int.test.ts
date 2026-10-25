import { PrismaClient } from '@prisma/client';
import { PrismaUsersRepository } from '../../src/modules/users/users.repository';

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const repo = new PrismaUsersRepository(prisma);

async function crear(email: string, role: 'USUARIO' | 'OPERADOR' | 'ADMIN' = 'USUARIO') {
  return prisma.user.create({ data: { email, passwordHash: 'h', role } });
}

describe('PrismaUsersRepository (PostgreSQL real)', () => {
  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('list no expone el hash y pagina', async () => {
    await crear('a@mail.com');
    await crear('b@mail.com');

    const r = await repo.list(1, 1);

    expect(r.items).toHaveLength(1);
    expect(r.total).toBe(2);
    expect(JSON.stringify(r.items)).not.toContain('passwordHash');
  });

  it('updateRole cambia el rol', async () => {
    const u = await crear('a@mail.com');

    expect(await repo.updateRole(u.id, 'OPERADOR')).toBe('OK');
    expect((await repo.findById(u.id))?.role).toBe('OPERADOR');
  });

  it('devuelve NO_EXISTE para un id desconocido', async () => {
    expect(await repo.updateRole('11111111-1111-4111-8111-111111111111', 'ADMIN')).toBe(
      'NO_EXISTE',
    );
  });

  it('no degrada al último ADMIN', async () => {
    const a = await crear('a@mail.com', 'ADMIN');

    expect(await repo.updateRole(a.id, 'USUARIO')).toBe('ULTIMO_ADMIN');
    expect((await repo.findById(a.id))?.role).toBe('ADMIN');
  });

  it('con dos admins que se degradan a la vez, uno siempre queda', async () => {
    const a = await crear('a@mail.com', 'ADMIN');
    const b = await crear('b@mail.com', 'ADMIN');

    await Promise.all([repo.updateRole(a.id, 'USUARIO'), repo.updateRole(b.id, 'USUARIO')]);

    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBeGreaterThanOrEqual(1);
  });
});