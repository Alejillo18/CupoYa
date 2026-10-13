import { Router } from 'express';
import { validateBody } from '../../middlewares/validate';
import { AuthService } from './auth.service';
import { registerSchema } from './auth.schemas';

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

  return router;
}