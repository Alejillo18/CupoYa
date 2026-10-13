import { TokenService } from '../../src/modules/auth/token.service';

describe('TokenService', () => {
  const service = new TokenService('secreto-de-prueba-con-largo-suficiente', 900);

  it('firma un token que se puede verificar y devuelve sub y rol', () => {
    const token = service.signAccessToken({ id: 'u1', role: 'USUARIO' });
    const payload = service.verifyAccessToken(token);

    expect(payload.sub).toBe('u1');
    expect(payload.role).toBe('USUARIO');
  });

  it('rechaza un token manipulado', () => {
    const token = service.signAccessToken({ id: 'u1', role: 'USUARIO' });

    expect(() => service.verifyAccessToken(token + 'x')).toThrow();
  });

  it('rechaza un token firmado con otro secreto', () => {
    const otro = new TokenService('otro-secreto-distinto-y-largo-123456', 900);
    const token = otro.signAccessToken({ id: 'u1', role: 'ADMIN' });

    expect(() => service.verifyAccessToken(token)).toThrow();
  });

  it('rechaza un token vencido', () => {
    const corto = new TokenService('secreto-de-prueba-con-largo-suficiente', -10);
    const token = corto.signAccessToken({ id: 'u1', role: 'USUARIO' });

    expect(() => service.verifyAccessToken(token)).toThrow();
  });

  it('exige un secreto de al menos 32 caracteres', () => {
    expect(() => new TokenService('corto', 900)).toThrow();
  });
});