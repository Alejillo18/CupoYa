import bcrypt from 'bcryptjs';
import { AppError } from '../../errors/AppError';
import { EmailAlreadyExistsError, UserRepository } from './auth.repository';

const BCRYPT_ROUNDS = 10;

export interface PublicUser {
  id: string;
  email: string;
  role: 'USUARIO' | 'OPERADOR' | 'ADMIN';
}

export class AuthService {
  constructor(private readonly users: UserRepository) {}

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
}