import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { AppError } from '../../errors/AppError';
import { RefreshTokenRepository } from './refreshToken.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function invalid(): AppError {
  return new AppError(401, 'REFRESH_INVALIDO', 'La sesión no es válida. Iniciá sesión de nuevo.');
}

export class RefreshTokenService {
  constructor(
    private readonly repo: RefreshTokenRepository,
    private readonly ttlDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async issue(userId: string, familyId: string = randomUUID()): Promise<{ token: string }> {
    const token = randomBytes(32).toString('base64url');
    await this.repo.create({
      userId,
      familyId,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.now().getTime() + this.ttlDays * DAY_MS),
    });
    return { token };
  }

  async rotate(token: string): Promise<{ userId: string; token: string }> {
    const record = await this.repo.findByHash(hashToken(token));
    if (!record) throw invalid();

    const now = this.now();

    // Token ya usado o revocado: posible robo. Se invalida toda la sesión.
    if (record.usedAt || record.revokedAt) {
      await this.repo.revokeFamily(record.familyId, now);
      throw invalid();
    }

    if (record.expiresAt <= now) throw invalid();

    // Solo una solicitud puede ganar la carrera por este token.
    const won = await this.repo.markUsed(record.id, now);
    if (!won) {
      await this.repo.revokeFamily(record.familyId, now);
      throw invalid();
    }

    const next = await this.issue(record.userId, record.familyId);
    return { userId: record.userId, token: next.token };
  }

  async revoke(token: string): Promise<void> {
    const record = await this.repo.findByHash(hashToken(token));
    if (!record) return;
    await this.repo.revokeFamily(record.familyId, this.now());
  }
}