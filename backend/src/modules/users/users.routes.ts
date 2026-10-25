import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { TokenService } from '../auth/token.service';
import { changeRoleSchema, usersListQuerySchema } from './users.schemas';
import { UsersService } from './users.service';

export function usersRoutes(users: UsersService, tokens: TokenService): Router {
  const router = Router();
  const soloAdmin = [authenticate(tokens), authorize('ADMIN')];

  router.get('/', ...soloAdmin, validateQuery(usersListQuerySchema), async (req, res, next) => {
    try {
      const q = (req.validatedQuery ?? {}) as { page?: number; pageSize?: number };
      res.status(200).json(await users.list(q));
    } catch (err) {
      next(err);
    }
  });

  router.patch('/:id/role', ...soloAdmin, validateBody(changeRoleSchema), async (req, res, next) => {
    try {
      res.status(200).json({ user: await users.changeRole(String(req.params.id), req.body.role) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}