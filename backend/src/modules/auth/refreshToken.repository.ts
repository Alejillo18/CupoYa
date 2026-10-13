import { PrismaClient } from '@prisma/client';

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  familyId: string;
  expiresAt: Date;
  usedAt: Date | null;
  revokedAt: Date | null;
}

export interface RefreshTokenRepository {
  create(data: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  markUsed(id: string, now: Date): Promise<boolean>;
  revokeFamily(familyId: string, now: Date): Promise<void>;
}

export class PrismaRefreshTokenRepository implements RefreshTokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    userId: string;
    familyId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<void> {
    await this.prisma.refreshToken.create({ data });
  }

  async findByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    return this.prisma.refreshToken.findUnique({ where: { tokenHash } });
  }

  // updateMany con condición: atómico. Devuelve true solo si este llamado fue quien lo marcó.
  async markUsed(id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.refreshToken.updateMany({
      where: { id, usedAt: null, revokedAt: null },
      data: { usedAt: now },
    });
    return result.count === 1;
  }

  async revokeFamily(familyId: string, now: Date): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: now },
    });
  }
}