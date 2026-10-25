import { PrismaClient } from '@prisma/client';
import {
  EmailAlreadyExistsError,
  PrismaUserRepository,
} from '../../src/modules/auth/auth.repository';

const prisma = new PrismaClient({ datasourceUrl: process.env.TEST_DATABASE_URL });
const repo = new PrismaUserRepository(prisma);

describe('PrismaUserRepository: Google (PostgreSQL real)', () => {
  beforeEach(async () => {
    await prisma.reservation.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('createFromGoogle crea el usuario sin contraseña y con rol USUARIO', async () => {
    const user = await repo.createFromGoogle({ email: 'ana@mail.com', googleSub: 'g-1' });

    expect(user.passwordHash).toBeNull();
    expect(user.role).toBe('USUARIO');
    expect(user.googleSub).toBe('g-1');
  });

  it('findByGoogleSub encuentra al usuario y devuelve null si no existe', async () => {
    await repo.createFromGoogle({ email: 'ana@mail.com', googleSub: 'g-1' });

    expect((await repo.findByGoogleSub('g-1'))?.email).toBe('ana@mail.com');
    expect(await repo.findByGoogleSub('otro')).toBeNull();
  });

  it('linkGoogle agrega el googleSub a una cuenta existente con contraseña', async () => {
    const user = await repo.create({ email: 'ana@mail.com', passwordHash: 'h' });

    const linked = await repo.linkGoogle(user.id, 'g-1');

    expect(linked.googleSub).toBe('g-1');
    expect(linked.passwordHash).toBe('h');
  });

  it('createFromGoogle con un email ya existente lanza EmailAlreadyExistsError', async () => {
    await repo.create({ email: 'ana@mail.com', passwordHash: 'h' });

    await expect(
      repo.createFromGoogle({ email: 'ana@mail.com', googleSub: 'g-1' }),
    ).rejects.toBeInstanceOf(EmailAlreadyExistsError);
  });

  it('dos altas simultáneas con el mismo email: una gana y la otra recibe EmailAlreadyExistsError', async () => {
    const resultados = await Promise.allSettled([
      repo.createFromGoogle({ email: 'ana@mail.com', googleSub: 'g-1' }),
      repo.createFromGoogle({ email: 'ana@mail.com', googleSub: 'g-1' }),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const rechazo = resultados.find((r) => r.status === 'rejected') as PromiseRejectedResult;
    expect(rechazo.reason).toBeInstanceOf(EmailAlreadyExistsError);
  });
});