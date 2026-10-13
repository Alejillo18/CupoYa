import { CookieOptions, Request, Response, Router } from 'express';
import { AppError } from '../../errors/AppError';
import { validateBody } from '../../middlewares/validate';
import { AuthService } from './auth.service';
import { loginSchema, registerSchema } from './auth.schemas';

const COOKIE_NAME = 'refresh_token';
const COOKIE_PATH = '/api/v1/auth';
const REFRESH_DAYS = 7;

export interface AuthRoutesOptions {
  cookieSecure?: boolean;
}

export function authRoutes(authService: AuthService, options: AuthRoutesOptions = {}): Router {
  const router = Router();

  const baseCookie: CookieOptions = {
    httpOnly: true,
    sameSite: 'strict',
    secure: options.cookieSecure ?? false,
    path: COOKIE_PATH,
  };

  const setRefreshCookie = (res: Response, token: string) =>
    res.cookie(COOKIE_NAME, token, {
      ...baseCookie,
      maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
    });

  const clearRefreshCookie = (res: Response) => res.clearCookie(COOKIE_NAME, baseCookie);

  const readRefreshCookie = (req: Request): string | undefined => req.cookies?.[COOKIE_NAME];

  router.post('/register', validateBody(registerSchema), async (req, res, next) => {
    try {
      const user = await authService.register(req.body.email, req.body.password);
      res.status(201).json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', validateBody(loginSchema), async (req, res, next) => {
    try {
      const { refreshToken, ...result } = await authService.login(
        req.body.email,
        req.body.password,
      );
      setRefreshCookie(res, refreshToken);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/refresh', async (req, res, next) => {
    try {
      const token = readRefreshCookie(req);
      if (!token) {
        throw new AppError(401, 'REFRESH_INVALIDO', 'La sesión no es válida. Iniciá sesión de nuevo.');
      }
      const { refreshToken, accessToken } = await authService.refresh(token);
      setRefreshCookie(res, refreshToken);
      res.status(200).json({ accessToken });
    } catch (err) {
      clearRefreshCookie(res);
      next(err);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const token = readRefreshCookie(req);
      if (token) await authService.logout(token);
      clearRefreshCookie(res);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}