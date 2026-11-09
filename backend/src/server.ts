import { PrismaClient } from '@prisma/client';
import Redis, { RedisOptions } from 'ioredis';
import { createApp } from './app';
import { RedisRateLimiter } from './middlewares/redisRateLimiter';
import { PrismaUserRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { GoogleAuthVerifier } from './modules/auth/google.verifier.real';
import { PrismaRefreshTokenRepository } from './modules/auth/refreshToken.repository';
import { RefreshTokenService } from './modules/auth/refreshToken.service';
import { TokenService } from './modules/auth/token.service';
import { PrismaEventRepository } from './modules/events/events.repository';
import { EventsService } from './modules/events/events.service';
import { OccupancyHub } from './modules/realtime/occupancy.hub';
import { prismaOccupancyLoader } from './modules/realtime/occupancy.loader';
import { OccupancyNotifier, sinNotificacion } from './modules/realtime/occupancy.notifier';
import { attachRealtime } from './modules/realtime/realtime.server';
import { RedisOccupancyBridge } from './modules/realtime/redis.occupancy.bridge';
import { ReportPool } from './modules/reports/report.pool';
import { PrismaReportsRepository } from './modules/reports/reports.repository';
import { ReportsService } from './modules/reports/reports.service';
import { PrismaReservationsRepository } from './modules/reservations/reservations.prisma';
import { ReservationsService } from './modules/reservations/reservations.service';
import { PrismaUsersRepository } from './modules/users/users.repository';
import { UsersService } from './modules/users/users.service';

const port = Number(process.env.PORT) || 3000;
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
  throw new Error('Falta la variable de entorno JWT_SECRET');
}

const prisma = new PrismaClient();
const tokens = new TokenService(jwtSecret, Number(process.env.JWT_ACCESS_TTL) || 900);
const refreshTokens = new RefreshTokenService(
  new PrismaRefreshTokenRepository(prisma),
  Number(process.env.REFRESH_TTL_DAYS) || 7,
);

const googleClientId = process.env.GOOGLE_CLIENT_ID;
const google = googleClientId ? new GoogleAuthVerifier(googleClientId) : undefined;
if (!google) {
  console.warn('GOOGLE_CLIENT_ID no definido: el ingreso con Google está deshabilitado.');
}

// Tiempo real: ocupación de eventos por WebSocket. Con Redis, los avisos se reparten
// entre todos los workers; sin Redis, solo funcionan dentro del mismo proceso.
const tiempoRealActivo = process.env.REALTIME_ENABLED !== 'false';
const hub = new OccupancyHub(prismaOccupancyLoader(prisma));
let notifier: OccupancyNotifier = sinNotificacion;
if (tiempoRealActivo) {
  notifier = { eventChanged: (id) => hub.markChanged(id) };
  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const conectar = (nombre: string, opciones: RedisOptions = {}) => {
      const redis = new Redis(redisUrl, opciones);
      redis.on('error', (e) => console.error(`Redis (${nombre}):`, e.message));
      return redis;
    };
    // El publicador no encola comandos si Redis está caído: falla enseguida y no acumula memoria.
    const publicador = conectar('tiempo real, publicación', {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
    const suscriptor = conectar('tiempo real, suscripción');
    const puente = new RedisOccupancyBridge(hub, publicador, suscriptor);
    void puente.start();
    notifier = puente;
  } else {
    console.warn('REDIS_URL no definido: el tiempo real solo funciona dentro de cada proceso.');
  }
} else {
  console.warn('Tiempo real deshabilitado.');
}

const authService = new AuthService(
  new PrismaUserRepository(prisma),
  tokens,
  refreshTokens,
  undefined,
  google,
);
const eventsService = new EventsService(new PrismaEventRepository(prisma), undefined, notifier);
const usersService = new UsersService(new PrismaUsersRepository(prisma));
const reservationsService = new ReservationsService(
  new PrismaReservationsRepository(prisma),
  notifier,
);
const reportsService = new ReportsService(
  new PrismaReportsRepository(prisma),
  new ReportPool(),
  undefined,
  Number(process.env.REPORT_SIMULATED_WORK_MS) || 0,
);

let rateLimiter: RedisRateLimiter | undefined;
if (process.env.RATE_LIMIT_ENABLED !== 'false' && process.env.REDIS_URL) {
  const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1 });
  redis.on('error', (e) => console.error('Redis:', e.message));
  rateLimiter = new RedisRateLimiter(redis, Number(process.env.RATE_LIMIT_MAX) || 20, 60);
} else {
  console.warn('Rate limiting deshabilitado.');
}

const server = createApp({
  authService,
  eventsService,
  usersService,
  reservationsService,
  reportsService,
  rateLimiter,
  tokens,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
}).listen(port, () => {
  console.log(`CupoYa backend escuchando en el puerto ${port}`);
});

if (tiempoRealActivo) {
  attachRealtime(server, { tokens, hub });
}