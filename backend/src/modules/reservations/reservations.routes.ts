import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middlewares/auth';
import { validateBody } from '../../middlewares/validate';
import { TokenService } from '../auth/token.service';
import { ReservationsService } from './reservations.service';

// La validación fina (1 a 4) la hace el servicio; acá solo se exige que venga un número.
const reserveSchema = z.object({ quantity: z.number() });

export function reservationsRoutes(
  reservations: ReservationsService,
  tokens: TokenService,
): { events: Router; mine: Router } {
  const auth = authenticate(tokens);

  // Se monta en /api/v1/events
  const events = Router();
  events.post('/:id/reservations', auth, validateBody(reserveSchema), async (req, res, next) => {
    try {
      const key = req.header('Idempotency-Key')?.trim().slice(0, 128) || undefined;
      const { reservation, replayed } = await reservations.reserve({
        userId: req.auth!.userId,
        eventId: String(req.params.id),
        quantity: req.body.quantity,
        idempotencyKey: key,
      });
      res.status(replayed ? 200 : 201).json({ reservation });
    } catch (err) {
      next(err);
    }
  });

  // Se monta en /api/v1/reservations
  const mine = Router();
  mine.get('/me', auth, async (req, res, next) => {
    try {
      res.status(200).json({ items: await reservations.listMine(req.auth!.userId) });
    } catch (err) {
      next(err);
    }
  });

  mine.post('/:id/cancel', auth, async (req, res, next) => {
    try {
      const reservation = await reservations.cancel(String(req.params.id), {
        userId: req.auth!.userId,
        role: req.auth!.role,
      });
      res.status(200).json({ reservation });
    } catch (err) {
      next(err);
    }
  });

  return { events, mine };
}