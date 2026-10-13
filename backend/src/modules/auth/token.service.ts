import jwt from 'jsonwebtoken';

export type RoleName = 'USUARIO' | 'OPERADOR' | 'ADMIN';

export interface AccessPayload {
  sub: string;
  role: RoleName;
}

export class TokenService {
  constructor(
    private readonly secret: string,
    private readonly accessTtlSeconds: number,
  ) {
    if (secret.length < 32) {
      throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
    }
  }

  signAccessToken(user: { id: string; role: RoleName }): string {
    return jwt.sign({ role: user.role }, this.secret, {
      subject: user.id,
      expiresIn: this.accessTtlSeconds,
      algorithm: 'HS256',
    });
  }

  verifyAccessToken(token: string): AccessPayload {
    const decoded = jwt.verify(token, this.secret, { algorithms: ['HS256'] });
    if (typeof decoded === 'string' || !decoded.sub || !decoded.role) {
      throw new Error('Token inválido');
    }
    return { sub: decoded.sub, role: decoded.role as RoleName };
  }
}