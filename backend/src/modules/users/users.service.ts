import { AppError } from '../../errors/AppError';
import { RoleName } from '../auth/token.service';
import { ManagedUser, UsersRepository } from './users.repository';

const MAX_PAGE_SIZE = 100;

export class UsersService {
  constructor(private readonly users: UsersRepository) {}

  async list(opts: { page?: number; pageSize?: number }) {
    const page = Math.max(1, Math.floor(opts.page ?? 1));
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(opts.pageSize ?? 20)));
    const { items, total } = await this.users.list(page, pageSize);
    return { items, total, page, pageSize };
  }

  async changeRole(id: string, role: RoleName): Promise<ManagedUser> {
    const result = await this.users.updateRole(id, role);
    if (result === 'NO_EXISTE') {
      throw new AppError(404, 'USUARIO_NO_ENCONTRADO', 'El usuario no existe.');
    }
    if (result === 'ULTIMO_ADMIN') {
      throw new AppError(
        409,
        'ULTIMO_ADMIN',
        'Debe quedar al menos un administrador en el sistema.',
      );
    }
    return (await this.users.findById(id))!;
  }
}