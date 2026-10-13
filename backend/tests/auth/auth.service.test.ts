import { AuthService } from '../../src/modules/auth/auth.service';
import { UserRepository, UserRecord } from '../../src/modules/auth/auth.repository';
import { EmailAlreadyExistsError } from '../../src/modules/auth/auth.repository';
import { TokenService } from '../../src/modules/auth/token.service';
import bcrypt from 'bcryptjs';
import { FakeUserRepository } from '../helpers/fakeUserRepository';
import { RefreshTokenService } from '../../src/modules/auth/refreshToken.service';
import { FakeRefreshTokenRepository } from '../helpers/fakeRefreshTokenRepository';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';

describe('AuthService.register', () => {
  let repo: FakeUserRepository;
  let service: AuthService;

  beforeEach(() => {
    repo = new FakeUserRepository();
    service = buildAuthService({ users: repo }).service;
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
      findById: async () => null,
      create: async () => {
        throw new EmailAlreadyExistsError();
      },
      registerFailedLogin: async () => {},
      resetFailedLogins: async () => {},
    };
    const service = buildAuthService({ users: racingRepo }).service;

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
    service = buildAuthService({ users: repo }).service;
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
    repo.users.push({
      id: 'g1',
      email: 'goog@mail.com',
      passwordHash: null,
      role: 'USUARIO',
      failedAttempts: 0,
      lockedUntil: null,
    });

    await expect(service.login('goog@mail.com', 'Clave1234')).rejects.toMatchObject({
      status: 401,
      code: 'CREDENCIALES_INVALIDAS',
    });
  });
});

describe('AuthService.login (bloqueo por intentos fallidos)', () => {
  let repo: FakeUserRepository;
  let service: AuthService;
  let ahora: Date;
  const tokens = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

  beforeEach(async () => {
    repo = new FakeUserRepository();
    ahora = new Date('2026-10-13T12:00:00Z');
    service = buildAuthService({ users: repo, now: () => ahora }).service;
    await service.register('ana@mail.com', 'Clave1234');
  });

  async function fallar(veces: number) {
    for (let i = 0; i < veces; i++) {
      await expect(service.login('ana@mail.com', 'Mala12345')).rejects.toMatchObject({
        status: 401,
      });
    }
  }

  it('los primeros 4 fallos devuelven 401 y no bloquean', async () => {
    await fallar(4);

    const result = await service.login('ana@mail.com', 'Clave1234');
    expect(result.user.email).toBe('ana@mail.com');
  });

  it('el 5.º fallo seguido bloquea la cuenta: el siguiente intento devuelve 423', async () => {
    await fallar(5);

    await expect(service.login('ana@mail.com', 'Clave1234')).rejects.toMatchObject({
      status: 423,
      code: 'CUENTA_BLOQUEADA',
    });
  });

  it('mientras está bloqueada, ni la clave correcta entra', async () => {
    await fallar(5);
    ahora = new Date(ahora.getTime() + 14 * 60 * 1000);

    await expect(service.login('ana@mail.com', 'Clave1234')).rejects.toMatchObject({
      status: 423,
    });
  });

  it('pasados 15 minutos el bloqueo termina', async () => {
    await fallar(5);
    ahora = new Date(ahora.getTime() + 15 * 60 * 1000 + 1000);

    const result = await service.login('ana@mail.com', 'Clave1234');
    expect(result.user.email).toBe('ana@mail.com');
  });

  it('un login exitoso reinicia el contador', async () => {
    await fallar(4);
    await service.login('ana@mail.com', 'Clave1234');
    await fallar(4);

    const result = await service.login('ana@mail.com', 'Clave1234');
    expect(result.user.email).toBe('ana@mail.com');
  });

  it('un email inexistente sigue dando el mismo 401 (sin bloqueo)', async () => {
    await expect(service.login('nadie@mail.com', 'Mala12345')).rejects.toMatchObject({
      status: 401,
      code: 'CREDENCIALES_INVALIDAS',
    });
  });
});

describe('AuthService: sesión con refresh token', () => {
  it('login devuelve también un refresh token', async () => {
    const { service } = buildAuthService();
    await service.register('ana@mail.com', 'Clave1234');

    const result = await service.login('ana@mail.com', 'Clave1234');

    expect(result.refreshToken.length).toBeGreaterThanOrEqual(40);
  });

  it('refresh entrega nuevo access token y nuevo refresh token', async () => {
    const { service } = buildAuthService();
    await service.register('ana@mail.com', 'Clave1234');
    const login = await service.login('ana@mail.com', 'Clave1234');

    const result = await service.refresh(login.refreshToken);

    expect(result.refreshToken).not.toBe(login.refreshToken);
    expect(testTokens.verifyAccessToken(result.accessToken).sub).toBe(login.user.id);
  });

  it('refresh con el token anterior (ya rotado) devuelve 401', async () => {
    const { service } = buildAuthService();
    await service.register('ana@mail.com', 'Clave1234');
    const login = await service.login('ana@mail.com', 'Clave1234');
    await service.refresh(login.refreshToken);

    await expect(service.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401 });
  });

  it('refresh con el rol actualizado: el nuevo access token refleja el rol vigente', async () => {
    const { service, users } = buildAuthService();
    await service.register('ana@mail.com', 'Clave1234');
    const login = await service.login('ana@mail.com', 'Clave1234');
    (users as FakeUserRepository).users[0].role = 'OPERADOR';

    const result = await service.refresh(login.refreshToken);

    expect(testTokens.verifyAccessToken(result.accessToken).role).toBe('OPERADOR');
  });

  it('logout invalida el refresh token', async () => {
    const { service } = buildAuthService();
    await service.register('ana@mail.com', 'Clave1234');
    const login = await service.login('ana@mail.com', 'Clave1234');

    await service.logout(login.refreshToken);

    await expect(service.refresh(login.refreshToken)).rejects.toMatchObject({ status: 401 });
  });
});