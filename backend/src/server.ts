import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { PrismaUserRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { GoogleAuthVerifier } from './modules/auth/google.verifier.real';
import { PrismaRefreshTokenRepository } from './modules/auth/refreshToken.repository';
import { RefreshTokenService } from './modules/auth/refreshToken.service';
import { TokenService } from './modules/auth/token.service';
import { PrismaEventRepository } from './modules/events/events.repository';
import { EventsService } from './modules/events/events.service';
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

const authService = new AuthService(
  new PrismaUserRepository(prisma),
  tokens,
  refreshTokens,
  undefined,
  google,
);
const eventsService = new EventsService(new PrismaEventRepository(prisma));
const usersService = new UsersService(new PrismaUsersRepository(prisma));
const reservationsService = new ReservationsService(new PrismaReservationsRepository(prisma));

createApp({
  authService,
  eventsService,
  usersService,
  reservationsService,
  tokens,
  cookieSecure: process.env.COOKIE_SECURE === 'true',
}).listen(port, () => {
  console.log(`CupoYa backend escuchando en el puerto ${port}`);
});