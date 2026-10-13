import { PrismaClient } from '@prisma/client';
import { createApp } from './app';
import { PrismaUserRepository } from './modules/auth/auth.repository';
import { AuthService } from './modules/auth/auth.service';

const port = Number(process.env.PORT) || 3000;
const prisma = new PrismaClient();
const authService = new AuthService(new PrismaUserRepository(prisma));

createApp({ authService }).listen(port, () => {
  console.log(`CupoYa backend escuchando en el puerto ${port}`);
});