import { Router } from 'express';
import { authenticate, authorize } from '../../middlewares/auth';
import { validateBody, validateQuery } from '../../middlewares/validate';
import { TokenService } from '../auth/token.service';
import { createEventSchema, listQuerySchema, updateEventSchema } from './events.schemas';
import { EventsService } from './events.service';

export function eventsRoutes(events: EventsService, tokens: TokenService): Router {
  const router = Router();
  const gestion = [authenticate(tokens), authorize('OPERADOR', 'ADMIN')];

  router.get('/', authenticate(tokens), validateQuery(listQuerySchema), async (req, res, next) => {
    try {
      const q = (req.validatedQuery ?? {}) as { page?: number; pageSize?: number };
      res.status(200).json(await events.list(q));
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', authenticate(tokens), async (req, res, next) => {
    try {
      res.status(200).json({ event: await events.get(String(req.params.id)) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/', ...gestion, validateBody(createEventSchema), async (req, res, next) => {
    try {
      res.status(201).json({ event: await events.create(req.body) });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:id', ...gestion, validateBody(updateEventSchema), async (req, res, next) => {
    try {
      res.status(200).json({ event: await events.update(String(req.params.id), req.body) });
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:id', ...gestion, async (req, res, next) => {
    try {
      await events.cancel(String(req.params.id));
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}