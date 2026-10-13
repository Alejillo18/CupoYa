import bcrypt from 'bcryptjs';
import { AppError } from '../../errors/AppError';
import { EmailAlreadyExistsError, UserRepository } from './auth.repository';
import { RoleName, TokenService } from './token.service';
import { RefreshTokenService } from './refreshToken.service';

const BCRYPT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface PublicUser {
  id: string;
  email: string;
  role: RoleName;
}

export interface LoginResult {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshResult {
  accessToken: string;
  refreshToken: string;
}

const DUMMY_HASH = bcrypt.hashSync('contraseña-que-nadie-conoce', BCRYPT_ROUNDS);

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
    private readonly refreshTokens: RefreshTokenService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async register(email: string, password: string): Promise<PublicUser> {
    const normalizedEmail = email.trim().toLowerCase();

    const existing = await this.users.findByEmail(normalizedEmail);
    if (existing) {
      throw new AppError(409, 'EMAIL_YA_REGISTRADO', 'Ya existe una cuenta con ese email.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

    try {
      const user = await this.users.create({ email: normalizedEmail, passwordHash });
      return { id: user.id, email: user.email, role: user.role };
    } catch (err) {
      if (err instanceof EmailAlreadyExistsError) {
        throw new AppError(409, 'EMAIL_YA_REGISTRADO', 'Ya existe una cuenta con ese email.');
      }
      throw err;
    }
  }

  async login(email: string, password: string): Promise<LoginResult> {
    const normalizedEmail = email.trim().toLowerCase();
    const user = await this.users.findByEmail(normalizedEmail);

    if (user?.lockedUntil && user.lockedUntil > this.now()) {
      throw new AppError(
        423,
        'CUENTA_BLOQUEADA',
        'La cuenta está bloqueada temporalmente por demasiados intentos fallidos. Probá de nuevo más tarde.',
      );
    }
    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const passwordOk = await bcrypt.compare(password, hashToCheck);

    if (!user || !user.passwordHash || !passwordOk) {
      if (user) {
        const lockUntil = new Date(this.now().getTime() + LOCK_MINUTES * 60 * 1000);
        await this.users.registerFailedLogin(user.id, MAX_FAILED_ATTEMPTS, lockUntil);
      }
      throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    if (user.failedAttempts > 0 || user.lockedUntil) {
      await this.users.resetFailedLogins(user.id);
    }

    const { token: refreshToken } = await this.refreshTokens.issue(user.id);

    return {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken: this.tokens.signAccessToken({ id: user.id, role: user.role }),
      refreshToken,
    };
  }
  async refresh(refreshToken: string): Promise<RefreshResult> {
    const rotated = await this.refreshTokens.rotate(refreshToken);

    const user = await this.users.findById(rotated.userId);
    if (!user) {
      await this.refreshTokens.revoke(rotated.token);
      throw new AppError(401, 'REFRESH_INVALIDO', 'La sesión no es válida. Iniciá sesión de nuevo.');
    }

    return {
      accessToken: this.tokens.signAccessToken({ id: user.id, role: user.role }),
      refreshToken: rotated.token,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.refreshTokens.revoke(refreshToken);
  }
}
