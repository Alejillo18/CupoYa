import { AuthService } from '../../src/modules/auth/auth.service';
import { UserRepository, UserRecord } from '../../src/modules/auth/auth.repository';
import { EmailAlreadyExistsError } from '../../src/modules/auth/auth.repository';
import { TokenService } from '../../src/modules/auth/token.service';
import bcrypt from 'bcryptjs';

class FakeUserRepository implements UserRepository {
  users: UserRecord[] = [];

  async findByEmail(email: string) {
    return this.users.find((u) => u.email === email) ?? null;
  }

  async create(data: { email: string; passwordHash: string }) {
    const user: UserRecord = {
      id: `id-${this.users.length + 1}`,
      email: data.email,
      passwordHash: data.passwordHash,
      role: 'USUARIO',
    };
    this.users.push(user);
    return user;
  }
}

describe('AuthService.register', () => {
  let repo: FakeUserRepository;
  let service: AuthService;

  beforeEach(() => {
    repo = new FakeUserRepository();
    service = new AuthService(repo, new TokenService('secreto-de-prueba-con-largo-suficiente', 900));
  });

  it('crea el usuario con rol USUARIO', async () => {
    const user = await service.register('ana@mail.com', 'Clave1234');

    expect(user.email).toBe('ana@mail.com');
    expect(user.role).toBe('USUARIO');
  });

  it('guarda un hash y nunca la contraseña en texto plano', async () => {
    await service.register('ana@mail.com', 'Clave1234');

    const guardado = repo.users[0].passwordHash;
    expect(guardado).not.toBe('Clave1234');
    expect(await bcrypt.compare('Clave1234', guardado!)).toBe(true);
  });

  it('el resultado no incluye el hash de la contraseña', async () => {
    const user = await service.register('ana@mail.com', 'Clave1234');

    expect(user).not.toHaveProperty('passwordHash');
  });

  it('rechaza un email ya registrado con 409', async () => {
    await service.register('ana@mail.com', 'Clave1234');

    await expect(service.register('ana@mail.com', 'OtraClave99')).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_YA_REGISTRADO',
    });
  });

  it('normaliza el email (minúsculas y sin espacios)', async () => {
    await service.register('  Ana@Mail.COM ', 'Clave1234');

    expect(repo.users[0].email).toBe('ana@mail.com');
  });
});
describe('AuthService.register (carrera por email duplicado)', () => {
  it('traduce el error de unicidad de la base a 409', async () => {
    const racingRepo: UserRepository = {
      findByEmail: async () => null,
      create: async () => {
        throw new EmailAlreadyExistsError();
      },
    };
    const service = new AuthService(
      racingRepo,
      new TokenService('secreto-de-prueba-con-largo-suficiente', 900),
    );

    await expect(service.register('ana@mail.com', 'Clave1234')).rejects.toMatchObject({
      status: 409,
      code: 'EMAIL_YA_REGISTRADO',
    });
  });
});
describe('AuthService.login', () => {
  let repo: FakeUserRepository;
  let service: AuthService;
  const tokens = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

  beforeEach(async () => {
    repo = new FakeUserRepository();
    service = new AuthService(repo, tokens);
    await service.register('ana@mail.com', 'Clave1234');
  });

  it('con credenciales válidas devuelve usuario y access token', async () => {
    const result = await service.login('ana@mail.com', 'Clave1234');

    expect(result.user.email).toBe('ana@mail.com');
    expect(tokens.verifyAccessToken(result.accessToken).sub).toBe(result.user.id);
  });

  it('el resultado no incluye el hash', async () => {
    const result = await service.login('ana@mail.com', 'Clave1234');

    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('acepta el email con mayúsculas y espacios', async () => {
    const result = await service.login('  ANA@mail.com ', 'Clave1234');

    expect(result.user.email).toBe('ana@mail.com');
  });

  it('contraseña incorrecta devuelve 401 genérico', async () => {
    await expect(service.login('ana@mail.com', 'Equivocada1')).rejects.toMatchObject({
      status: 401,
      code: 'CREDENCIALES_INVALIDAS',
    });
  });

  it('email inexistente devuelve exactamente el mismo 401', async () => {
    await expect(service.login('nadie@mail.com', 'Clave1234')).rejects.toMatchObject({
      status: 401,
      code: 'CREDENCIALES_INVALIDAS',
      message: 'Email o contraseña incorrectos.',
    });
  });

  it('una cuenta sin contraseña (solo Google) no puede entrar con clave', async () => {
    repo.users.push({ id: 'g1', email: 'goog@mail.com', passwordHash: null, role: 'USUARIO' });

    await expect(service.login('goog@mail.com', 'Clave1234')).rejects.toMatchObject({
      status: 401,
      code: 'CREDENCIALES_INVALIDAS',
    });
  });
});