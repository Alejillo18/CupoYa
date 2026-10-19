import { LoginTicket, OAuth2Client } from 'google-auth-library';
import { GoogleAuthVerifier } from '../../src/modules/auth/google.verifier.real';

function clienteQueDevuelve(payload: Record<string, unknown> | undefined) {
  return {
    verifyIdToken: async () => ({ getPayload: () => payload }) as unknown as LoginTicket,
  } as unknown as OAuth2Client;
}

describe('GoogleAuthVerifier', () => {
  it('devuelve sub, email y emailVerified del payload', async () => {
    const v = new GoogleAuthVerifier(
      'client-id',
      clienteQueDevuelve({ sub: 'g-1', email: 'ana@mail.com', email_verified: true }),
    );

    expect(await v.verify('tok')).toEqual({
      sub: 'g-1',
      email: 'ana@mail.com',
      emailVerified: true,
    });
  });

  it('rechaza si el payload no trae email', async () => {
    const v = new GoogleAuthVerifier('client-id', clienteQueDevuelve({ sub: 'g-1' }));

    await expect(v.verify('tok')).rejects.toThrow();
  });

  it('rechaza si no hay payload', async () => {
    const v = new GoogleAuthVerifier('client-id', clienteQueDevuelve(undefined));

    await expect(v.verify('tok')).rejects.toThrow();
  });

  it('propaga el error si Google rechaza el token', async () => {
    const cliente = {
      verifyIdToken: async () => {
        throw new Error('Token used too late');
      },
    } as unknown as OAuth2Client;

    await expect(new GoogleAuthVerifier('client-id', cliente).verify('tok')).rejects.toThrow();
  });

  it('exige un client id', () => {
    expect(() => new GoogleAuthVerifier('')).toThrow();
  });
});