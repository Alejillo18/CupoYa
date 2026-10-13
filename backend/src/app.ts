import cookieParser from 'cookie-parser';
import express, { Application } from 'express';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { AuthService } from './modules/auth/auth.service';
import { authRoutes } from './modules/auth/auth.routes';

export interface AppDependencies {
  authService?: AuthService;
  cookieSecure?: boolean;
}

export function createApp(deps: AppDependencies = {}): Application {
  const app = express();

  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/v1/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  if (deps.authService) {
    app.use('/api/v1/auth', authRoutes(deps.authService, { cookieSecure: deps.cookieSecure }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}