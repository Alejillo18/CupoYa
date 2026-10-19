import { EmailAlreadyExistsError } from '../../src/modules/auth/auth.repository';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';
import { FakeGoogleVerifier } from '../helpers/fakeGoogleVerifier';
import { FakeUserRepository } from '../helpers/fakeUserRepository';

const AHORA = new Date('2026-10-19T12:00:00Z');

function setup() {
  const google = new FakeGoogleVerifier();
  google.profiles.set('tok-ana', { sub: 'g-111', email: 'ana@mail.com', emailVerified: true });
  google.profiles.set('tok-sin-verificar', {
    sub: 'g-222',
    email: 'otra@mail.com',
    emailVerified: false,
  });
  google.profiles.set('tok-mayus', { sub: 'g-333', email: '  Luis@Mail.COM ', emailVerified: true });
  const users = new FakeUserRepository();
  const built = buildAuthService({ users, google, now: () => AHORA });
  return { ...built, users, google };
}

describe('AuthService.loginWithGoogle', () => {
  it('rechaza un token que Google no valida (401)', async () => {
    const { service } = setup();

    await expect(service.loginWithGoogle('token-falso')).rejects.toMatchObject({
      status: 401,
      code: 'GOOGLE_INVALIDO',
    });
  });

  it('rechaza un email no verificado por Google (401)', async () => {
    const { service, users } = setup();

    await expect(service.loginWithGoogle('tok-sin-verificar')).rejects.toMatchObject({
      status: 401,
      code: 'GOOGLE_INVALIDO',
    });
    expect(users.users).toHaveLength(0);
  });

  it('si el email no existe crea la cuenta con rol USUARIO, sin contraseña', async () => {
    const { service, users } = setup();

    const result = await service.loginWithGoogle('tok-ana');

    expect(result.user).toMatchObject({ email: 'ana@mail.com', role: 'USUARIO' });
    expect(users.users).toHaveLength(1);
    expect(users.users[0].passwordHash).toBeNull();
    expect(users.users[0].googleSub).toBe('g-111');
  });

  it('devuelve access token y refresh token como el login normal', async () => {
    const { service } = setup();

    const result = await service.loginWithGoogle('tok-ana');

    expect(testTokens.verifyAccessToken(result.accessToken).sub).toBe(result.user.id);
    expect(result.refreshToken.length).toBeGreaterThanOrEqual(40);
  });

  it('si el email ya existe, vincula la cuenta sin duplicarla', async () => {
    const { service, users } = setup();
    const registrado = await service.register('ana@mail.com', 'Clave1234');

    const result = await service.loginWithGoogle('tok-ana');

    expect(result.user.id).toBe(registrado.id);
    expect(users.users).toHaveLength(1);
    expect(users.users[0].googleSub).toBe('g-111');
  });

  it('tras vincular, la contraseña original sigue funcionando', async () => {
    const { service } = setup();
    await service.register('ana@mail.com', 'Clave1234');
    await service.loginWithGoogle('tok-ana');

    const result = await service.login('ana@mail.com', 'Clave1234');

    expect(result.user.email).toBe('ana@mail.com');
  });

  it('un segundo ingreso con Google usa la misma cuenta', async () => {
    const { service, users } = setup();
    const primero = await service.loginWithGoogle('tok-ana');

    const segundo = await service.loginWithGoogle('tok-ana');

    expect(segundo.user.id).toBe(primero.user.id);
    expect(users.users).toHaveLength(1);
  });

  it('normaliza el email que viene de Google', async () => {
    const { service, users } = setup();

    await service.loginWithGoogle('tok-mayus');

    expect(users.users[0].email).toBe('luis@mail.com');
  });

  it('una cuenta bloqueada responde 423 también con Google', async () => {
    const { service, users } = setup();
    await service.loginWithGoogle('tok-ana');
    users.users[0].lockedUntil = new Date(AHORA.getTime() + 10 * 60 * 1000);

    await expect(service.loginWithGoogle('tok-ana')).rejects.toMatchObject({
      status: 423,
      code: 'CUENTA_BLOQUEADA',
    });
  });

  it('si otro proceso crea la cuenta justo antes, vincula en vez de fallar', async () => {
    const { service, users } = setup();
    const original = users.findByEmail.bind(users);
    let llamadas = 0;
    users.findByEmail = async (email: string) => {
      llamadas += 1;
      return llamadas === 1 ? null : original(email);
    };
    users.createFromGoogle = async () => {
      users.users.push({
        id: 'x1',
        email: 'ana@mail.com',
        passwordHash: 'h',
        googleSub: null,
        role: 'USUARIO',
        failedAttempts: 0,
        lockedUntil: null,
      });
      throw new EmailAlreadyExistsError();
    };

    const result = await service.loginWithGoogle('tok-ana');

    expect(result.user.id).toBe('x1');
    expect(users.users[0].googleSub).toBe('g-111');
  });
});