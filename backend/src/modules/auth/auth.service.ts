import bcrypt from 'bcryptjs';
import { AppError } from '../../errors/AppError';
import { EmailAlreadyExistsError, UserRepository } from './auth.repository';
import { RoleName, TokenService } from './token.service';

const BCRYPT_ROUNDS = 10;

export interface PublicUser {
  id: string;
  email: string;
  role: RoleName;
}

export interface LoginResult {
  user: PublicUser;
  accessToken: string;
}

const DUMMY_HASH = bcrypt.hashSync('contraseña-que-nadie-conoce', BCRYPT_ROUNDS);

export class AuthService {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
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

    // Siempre se compara contra un hash, exista o no el usuario.
    const hashToCheck = user?.passwordHash ?? DUMMY_HASH;
    const passwordOk = await bcrypt.compare(password, hashToCheck);

    if (!user || !user.passwordHash || !passwordOk) {
      throw new AppError(401, 'CREDENCIALES_INVALIDAS', 'Email o contraseña incorrectos.');
    }

    return {
      user: { id: user.id, email: user.email, role: user.role },
      accessToken: this.tokens.signAccessToken({ id: user.id, role: user.role }),
    };
  }
}