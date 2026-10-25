import cookieParser from 'cookie-parser';
import express, { Application } from 'express';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { authRoutes } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { TokenService } from './modules/auth/token.service';
import { eventsRoutes } from './modules/events/events.routes';
import { EventsService } from './modules/events/events.service';
import { reservationsRoutes } from './modules/reservations/reservations.routes';
import { ReservationsService } from './modules/reservations/reservations.service';
import { usersRoutes } from './modules/users/users.routes';
import { UsersService } from './modules/users/users.service';

export interface AppDependencies {
  authService?: AuthService;
  eventsService?: EventsService;
  usersService?: UsersService;
  reservationsService?: ReservationsService;
  tokens?: TokenService;
  cookieSecure?: boolean;
}

export function createApp(deps: AppDependencies = {}): Application {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  if (deps.authService && deps.tokens) {
    app.use(
      '/api/v1/auth',
      authRoutes(deps.authService, { cookieSecure: deps.cookieSecure, tokens: deps.tokens }),
    );
  }

  // Las reservas se montan antes que los eventos: /events/:id/reservations
  // no debe quedar tapada por las rutas de /events/:id.
  if (deps.reservationsService && deps.tokens) {
    const r = reservationsRoutes(deps.reservationsService, deps.tokens);
    app.use('/api/v1/events', r.events);
    app.use('/api/v1/reservations', r.mine);
  }

  if (deps.eventsService && deps.tokens) {
    app.use('/api/v1/events', eventsRoutes(deps.eventsService, deps.tokens));
  }

  if (deps.usersService && deps.tokens) {
    app.use('/api/v1/users', usersRoutes(deps.usersService, deps.tokens));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}