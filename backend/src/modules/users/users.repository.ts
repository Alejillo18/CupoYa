import { PrismaClient } from '@prisma/client';
import { RoleName } from '../auth/token.service';

export interface ManagedUser {
  id: string;
  email: string;
  role: RoleName;
  lockedUntil: Date | null;
  createdAt: Date;
}

export type RoleChangeResult = 'OK' | 'NO_EXISTE' | 'ULTIMO_ADMIN';

export interface UsersRepository {
  list(page: number, pageSize: number): Promise<{ items: ManagedUser[]; total: number }>;
  findById(id: string): Promise<ManagedUser | null>;
  updateRole(id: string, role: RoleName): Promise<RoleChangeResult>;
}

// Solo los campos que se pueden exponer: nunca passwordHash ni googleSub.
const select = {
  id: true,
  email: true,
  role: true,
  lockedUntil: true,
  createdAt: true,
} as const;

export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(page: number, pageSize: number) {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        select,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count(),
    ]);
    return { items, total };
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({ where: { id }, select });
  }

  // Una sola sentencia: degrada a un ADMIN solo si queda al menos otro.
  async updateRole(id: string, role: RoleName): Promise<RoleChangeResult> {
    const filas = await this.prisma.$executeRaw`
      UPDATE users
         SET role = ${role}::"Role"
       WHERE id = ${id}::uuid
         AND (
           role <> 'ADMIN'
           OR ${role} = 'ADMIN'
           OR (SELECT count(*) FROM users WHERE role = 'ADMIN') > 1
         )`;
    if (filas === 1) return 'OK';
    return (await this.findById(id)) ? 'ULTIMO_ADMIN' : 'NO_EXISTE';
  }
}