import { UsersService } from '../../src/modules/users/users.service';
import { FakeUsersRepository } from '../helpers/fakeUsersRepository';

const usuario = (id: string, role: 'USUARIO' | 'OPERADOR' | 'ADMIN' = 'USUARIO') => ({
  id,
  email: `${id}@mail.com`,
  role,
  lockedUntil: null,
  createdAt: new Date('2026-10-01T00:00:00Z'),
});

describe('UsersService', () => {
  let repo: FakeUsersRepository;
  let service: UsersService;

  beforeEach(() => {
    repo = new FakeUsersRepository();
    repo.users = [usuario('a', 'ADMIN'), usuario('b'), usuario('c', 'OPERADOR')];
    service = new UsersService(repo);
  });

  it('list devuelve usuarios paginados', async () => {
    const r = await service.list({ page: 1, pageSize: 2 });

    expect(r.items).toHaveLength(2);
    expect(r.total).toBe(3);
    expect(r.page).toBe(1);
  });

  it('list limita el tamaño de página a 100', async () => {
    expect((await service.list({ pageSize: 9999 })).pageSize).toBe(100);
  });

  it('changeRole cambia el rol', async () => {
    const u = await service.changeRole('b', 'OPERADOR');

    expect(u.role).toBe('OPERADOR');
  });

  it('changeRole a un usuario inexistente devuelve 404', async () => {
    await expect(service.changeRole('zzz', 'ADMIN')).rejects.toMatchObject({
      status: 404,
      code: 'USUARIO_NO_ENCONTRADO',
    });
  });

  it('no permite degradar al último administrador (409)', async () => {
    await expect(service.changeRole('a', 'USUARIO')).rejects.toMatchObject({
      status: 409,
      code: 'ULTIMO_ADMIN',
    });
    expect(repo.users[0].role).toBe('ADMIN');
  });

  it('permite degradar a un admin si hay otro', async () => {
    await service.changeRole('b', 'ADMIN');

    const u = await service.changeRole('a', 'USUARIO');

    expect(u.role).toBe('USUARIO');
  });

  it('asignar el mismo rol no falla', async () => {
    const u = await service.changeRole('a', 'ADMIN');

    expect(u.role).toBe('ADMIN');
  });
});