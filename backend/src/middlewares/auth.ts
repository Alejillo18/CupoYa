import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';
import { RoleName, TokenService } from '../modules/auth/token.service';

function noAutenticado(): AppError {
  return new AppError(401, 'NO_AUTENTICADO', 'Necesitás iniciar sesión para acceder.');
}

export function authenticate(tokens: TokenService) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return next(noAutenticado());
    }

    try {
      const payload = tokens.verifyAccessToken(header.slice('Bearer '.length).trim());
      req.auth = { userId: payload.sub, role: payload.role };
      next();
    } catch {
      next(noAutenticado());
    }
  };
}

export function authorize(...allowed: RoleName[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth) {
      return next(noAutenticado());
    }
    if (!allowed.includes(req.auth.role)) {
      return next(new AppError(403, 'SIN_PERMISO', 'No tenés permiso para realizar esta acción.'));
    }
    next();
  };
}