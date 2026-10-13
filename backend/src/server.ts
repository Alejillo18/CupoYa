import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { PrismaUserRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';
import { PrismaRefreshTokenRepository } from './modules/auth/refreshToken.repository';
import { RefreshTokenService } from './modules/auth/refreshToken.service';
import { TokenService } from './modules/auth/token.service';

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
const authService = new AuthService(new PrismaUserRepository(prisma), tokens, refreshTokens);

createApp({ authService, cookieSecure: process.env.COOKIE_SECURE === 'true' }).listen(port, () => {
  console.log(`CupoYa backend escuchando en el puerto ${port}`);
});