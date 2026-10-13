import { Prisma, PrismaClient } from '@prisma/client';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  role: 'USUARIO' | 'OPERADOR' | 'ADMIN';
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: { email: string; passwordHash: string }): Promise<UserRecord>;
  registerFailedLogin(id: string, maxAttempts: number, lockUntil: Date): Promise<void>;
  resetFailedLogins(id: string): Promise<void>;
}

export class EmailAlreadyExistsError extends Error {
  constructor() {
    super('El email ya existe');
    this.name = 'EmailAlreadyExistsError';
  }
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: { email: string; passwordHash: string }): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new EmailAlreadyExistsError();
      }
      throw err;
    }
  }

  async registerFailedLogin(id: string, maxAttempts: number, lockUntil: Date): Promise<void> {
    const lockUntilIso = lockUntil.toISOString();
    await this.prisma.$executeRaw`
      UPDATE users
         SET locked_until = CASE WHEN failed_attempts + 1 >= ${maxAttempts}
                                 THEN (${lockUntilIso}::timestamptz AT TIME ZONE 'UTC')
                                 ELSE locked_until END,
             failed_attempts = CASE WHEN failed_attempts + 1 >= ${maxAttempts}
                                    THEN 0 ELSE failed_attempts + 1 END
       WHERE id = ${id}::uuid`;
  }

  async resetFailedLogins(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { failedAttempts: 0, lockedUntil: null },
    });
  }
}