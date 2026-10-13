import { RefreshTokenService } from '../../src/modules/auth/refreshToken.service';
import { FakeRefreshTokenRepository } from '../helpers/fakeRefreshTokenRepository';

describe('RefreshTokenService', () => {
  let repo: FakeRefreshTokenRepository;
  let service: RefreshTokenService;
  let ahora: Date;
  const TTL_DIAS = 7;

  beforeEach(() => {
    repo = new FakeRefreshTokenRepository();
    ahora = new Date('2026-10-13T12:00:00Z');
    service = new RefreshTokenService(repo, TTL_DIAS, () => ahora);
  });

  it('issue devuelve un token opaco y guarda solo su hash', async () => {
    const { token } = await service.issue('u1');

    expect(token.length).toBeGreaterThanOrEqual(40);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0].tokenHash).not.toBe(token);
    expect(JSON.stringify(repo.rows)).not.toContain(token);
  });

  it('issue crea una familia nueva en cada sesión', async () => {
    await service.issue('u1');
    await service.issue('u1');

    expect(repo.rows[0].familyId).not.toBe(repo.rows[1].familyId);
  });

  it('issue fija el vencimiento a 7 días', async () => {
    await service.issue('u1');

    const esperado = ahora.getTime() + 7 * 24 * 60 * 60 * 1000;
    expect(repo.rows[0].expiresAt.getTime()).toBe(esperado);
  });

  it('rotate con un token válido devuelve usuario y un token nuevo de la misma familia', async () => {
    const { token } = await service.issue('u1');

    const result = await service.rotate(token);

    expect(result.userId).toBe('u1');
    expect(result.token).not.toBe(token);
    expect(repo.rows).toHaveLength(2);
    expect(repo.rows[1].familyId).toBe(repo.rows[0].familyId);
    expect(repo.rows[0].usedAt).not.toBeNull();
  });

  it('rotate con un token desconocido devuelve 401', async () => {
    await expect(service.rotate('token-inventado')).rejects.toMatchObject({
      status: 401,
      code: 'REFRESH_INVALIDO',
    });
  });

  it('rotate con un token vencido devuelve 401', async () => {
    const { token } = await service.issue('u1');
    ahora = new Date(ahora.getTime() + 8 * 24 * 60 * 60 * 1000);

    await expect(service.rotate(token)).rejects.toMatchObject({ status: 401 });
  });

  it('reutilizar un token ya usado devuelve 401 y revoca toda la familia', async () => {
    const { token } = await service.issue('u1');
    const { token: nuevo } = await service.rotate(token);

    await expect(service.rotate(token)).rejects.toMatchObject({
      status: 401,
      code: 'REFRESH_INVALIDO',
    });

    // el token legítimo más nuevo también quedó inutilizado
    await expect(service.rotate(nuevo)).rejects.toMatchObject({ status: 401 });
  });

  it('dos rotaciones simultáneas del mismo token: solo una gana', async () => {
    const { token } = await service.issue('u1');

    const resultados = await Promise.allSettled([service.rotate(token), service.rotate(token)]);

    const ok = resultados.filter((r) => r.status === 'fulfilled');
    expect(ok).toHaveLength(1);
  });

  it('revoke invalida el token y toda su familia', async () => {
    const { token } = await service.issue('u1');
    const { token: nuevo } = await service.rotate(token);

    await service.revoke(nuevo);

    await expect(service.rotate(nuevo)).rejects.toMatchObject({ status: 401 });
  });

  it('revoke con un token desconocido no falla (logout idempotente)', async () => {
    await expect(service.revoke('token-inventado')).resolves.toBeUndefined();
  });
});