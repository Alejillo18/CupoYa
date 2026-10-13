import { AuthService } from '../../src/modules/auth/auth.service';
import { RefreshTokenService } from '../../src/modules/auth/refreshToken.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { UserRepository } from '../../src/modules/auth/auth.repository';
import { FakeRefreshTokenRepository } from './fakeRefreshTokenRepository';
import { FakeUserRepository } from './fakeUserRepository';

export const testTokens = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

export function buildAuthService(options: { users?: UserRepository; now?: () => Date } = {}) {
  const users = options.users ?? new FakeUserRepository();
  const refreshRepo = new FakeRefreshTokenRepository();
  const refresh = new RefreshTokenService(refreshRepo, 7, options.now);
  const service = new AuthService(users, testTokens, refresh, options.now);
  return { service, users, refresh, refreshRepo };
}