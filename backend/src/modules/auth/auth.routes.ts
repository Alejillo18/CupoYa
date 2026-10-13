import { Router } from 'express';
import { validateBody } from '../../middlewares/validate';
import { AuthService } from './auth.service';
import { loginSchema, registerSchema } from './auth.schemas';

export function authRoutes(authService: AuthService): Router {
  const router = Router();

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
      const result = await authService.login(req.body.email, req.body.password);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}