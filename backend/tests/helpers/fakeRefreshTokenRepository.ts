import {
    RefreshTokenRecord,
    RefreshTokenRepository,
  } from '../../src/modules/auth/refreshToken.repository';
  
  interface Row extends RefreshTokenRecord {
    tokenHash: string;
  }
  
  export class FakeRefreshTokenRepository implements RefreshTokenRepository {
    rows: Row[] = [];
  
    async create(data: { userId: string; familyId: string; tokenHash: string; expiresAt: Date }) {
      this.rows.push({
        id: `rt-${this.rows.length + 1}`,
        ...data,
        usedAt: null,
        revokedAt: null,
      });
    }
  
    async findByHash(tokenHash: string) {
      return this.rows.find((r) => r.tokenHash === tokenHash) ?? null;
    }
  
    async markUsed(id: string, now: Date) {
      const row = this.rows.find((r) => r.id === id)!;
      if (row.usedAt || row.revokedAt) return false;
      row.usedAt = now;
      return true;
    }
  
    async revokeFamily(familyId: string, now: Date) {
      this.rows
        .filter((r) => r.familyId === familyId && !r.revokedAt)
        .forEach((r) => (r.revokedAt = now));
    }
  }