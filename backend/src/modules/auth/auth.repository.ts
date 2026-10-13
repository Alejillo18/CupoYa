import { PrismaClient } from '@prisma/client';

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string | null;
  role: 'USUARIO' | 'OPERADOR' | 'ADMIN';
}

export interface UserRepository {
  findByEmail(email: string): Promise<UserRecord | null>;
  create(data: { email: string; passwordHash: string }): Promise<UserRecord>;
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(data: { email: string; passwordHash: string }): Promise<UserRecord> {
    return this.prisma.user.create({ data });
  }
}