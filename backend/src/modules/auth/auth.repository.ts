import { Prisma, PrismaClient } from '@prisma/client';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  googleSub?: string | null;
  role: 'USUARIO' | 'OPERADOR' | 'ADMIN';
  failedAttempts: number;
  lockedUntil: Date | null;
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findByGoogleSub(googleSub: string): Promise<UserRecord | null>;
  create(data: { email: string; passwordHash: string }): Promise<UserRecord>;
  createFromGoogle(data: { email: string; googleSub: string }): Promise<UserRecord>;
  linkGoogle(id: string, googleSub: string): Promise<UserRecord>;
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

  async findById(id: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async findByGoogleSub(googleSub: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { googleSub } });
  }

  async create(data: { email: string; passwordHash: string }): Promise<UserRecord> {
    return this.insert(data);
  }

  async createFromGoogle(data: { email: string; googleSub: string }): Promise<UserRecord> {
    return this.insert(data);
  }

  async linkGoogle(id: string, googleSub: string): Promise<UserRecord> {
    return this.prisma.user.update({ where: { id }, data: { googleSub } });
  }

  // Un solo UPDATE atómico: suma el fallo y, si llega al máximo, bloquea y reinicia.
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

  private async insert(data: Prisma.UserCreateInput): Promise<UserRecord> {
    try {
      return await this.prisma.user.create({ data });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new EmailAlreadyExistsError();
      }
      throw err;
    }
  }
}