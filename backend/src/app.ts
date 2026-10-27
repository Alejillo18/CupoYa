import cookieParser from 'cookie-parser';
import express, { Application } from 'express';
import swaggerUi from 'swagger-ui-express';
import { openApiSpec } from './docs/openapi';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { RateLimiter } from './middlewares/rateLimit';
import { authRoutes } from './modules/auth/auth.routes';
import { AuthService } from './modules/auth/auth.service';
import { TokenService } from './modules/auth/token.service';
import { eventsRoutes } from './modules/events/events.routes';
import { EventsService } from './modules/events/events.service';
import { reportsRoutes } from './modules/reports/reports.routes';
import { ReportsService } from './modules/reports/reports.service';
import { reservationsRoutes } from './modules/reservations/reservations.routes';
import { ReservationsService } from './modules/reservations/reservations.service';
import { usersRoutes } from './modules/users/users.routes';
import { UsersService } from './modules/users/users.service';

export interface AppDependencies {
  authService?: AuthService;
  eventsService?: EventsService;
  usersService?: UsersService;
  reservationsService?: ReservationsService;
  reportsService?: ReportsService;
  tokens?: TokenService;
  rateLimiter?: RateLimiter;
  cookieSecure?: boolean;
}

export function createApp(deps: AppDependencies = {}): Application {
  const app = express();

  // Detrás de nginx (un solo salto): la IP real es la última entrada de
  // X-Forwarded-For, la que agrega nginx. Con `true` se tomaría la primera,
  // que escribe el cliente, y se podría esquivar el limitador de tasa.
  // Si se agrega otro proxy o balanceador delante de nginx, subir este número.
  app.set('trust proxy', 1);

  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  // Documentación de la API (OpenAPI + Swagger UI)
  app.get('/api/openapi.json', (_req, res) => {
    res.json(openApiSpec);
  });
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));

  if (deps.authService && deps.tokens) {
    app.use(
      '/api/v1/auth',
      authRoutes(deps.authService, {
        cookieSecure: deps.cookieSecure,
        tokens: deps.tokens,
        rateLimiter: deps.rateLimiter,
      }),
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

  if (deps.reportsService && deps.tokens) {
    app.use('/api/v1/reports', reportsRoutes(deps.reportsService, deps.tokens));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}