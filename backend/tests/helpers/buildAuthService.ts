import { AuthService } from '../../src/modules/auth/auth.service';
import { GoogleVerifier } from '../../src/modules/auth/google.verifier';
import { RefreshTokenService } from '../../src/modules/auth/refreshToken.service';
import { TokenService } from '../../src/modules/auth/token.service';
import { UserRepository } from '../../src/modules/auth/auth.repository';
import { FakeGoogleVerifier } from './fakeGoogleVerifier';
import { FakeRefreshTokenRepository } from './fakeRefreshTokenRepository';
import { FakeUserRepository } from './fakeUserRepository';

export const testTokens = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

export function buildAuthService(
  options: { users?: UserRepository; now?: () => Date; google?: GoogleVerifier } = {},
) {
  const users = options.users ?? new FakeUserRepository();
  const google = options.google ?? new FakeGoogleVerifier();
  const refreshRepo = new FakeRefreshTokenRepository();
  const refresh = new RefreshTokenService(refreshRepo, 7, options.now);
  const service = new AuthService(users, testTokens, refresh, options.now, google);
  return { service, users, refresh, refreshRepo, google };
}