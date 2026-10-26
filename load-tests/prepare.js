const path = require('node:path');
const fs = require('node:fs');
const back = (m) => require(path.join(__dirname, '..', 'backend', 'node_modules', m));

const { PrismaClient } = back('@prisma/client');
const bcrypt = back('bcryptjs');
const jwt = back('jsonwebtoken');

const USUARIOS = Number(process.env.LOAD_USERS) || 2000;
const CUPO = Number(process.env.LOAD_CAPACITY) || 5000;
// Las fases largas (soak) superan la hora: por defecto 2 horas
const TTL = Number(process.env.LOAD_TOKEN_TTL) || 7200;
const ADMIN_EMAIL = 'admin@carga.test';

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Falta JWT_SECRET (backend/.env)');
  const prisma = new PrismaClient();

  // Limpieza de corridas anteriores (solo datos de carga).
  // El admin se conserva: puede tener reportes asociados.
  const viejos = await prisma.user.findMany({
    where: { email: { endsWith: '@carga.test' }, NOT: { email: ADMIN_EMAIL } },
    select: { id: true },
  });
  const ids = viejos.map((u) => u.id);
  await prisma.reservation.deleteMany({ where: { userId: { in: ids } } });
  await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
  await prisma.reservation.deleteMany({ where: { event: { name: 'Carga' } } });
  await prisma.event.deleteMany({ where: { name: 'Carga' } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });

  // Un solo hash reutilizado: 2.000 hashes con bcrypt tardarían minutos
  const passwordHash = bcrypt.hashSync('Carga12345', 10);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { role: 'ADMIN' },
    create: { email: ADMIN_EMAIL, passwordHash, role: 'ADMIN' },
  });

  await prisma.user.createMany({
    data: Array.from({ length: USUARIOS }, (_, i) => ({
      email: `carga${i}@carga.test`,
      passwordHash,
    })),
  });
  const usuarios = await prisma.user.findMany({
    where: { email: { endsWith: '@carga.test' }, NOT: { email: ADMIN_EMAIL } },
    orderBy: { email: 'asc' },
  });

  const evento = await prisma.event.create({
    data: {
      name: 'Carga',
      venue: 'Estadio de prueba',
      startsAt: new Date(Date.now() + 30 * 86_400_000),
      totalCapacity: CUPO,
      availableCapacity: CUPO,
    },
  });

  const firmar = (u) =>
    jwt.sign({ role: u.role }, secret, { subject: u.id, expiresIn: TTL, algorithm: 'HS256' });

  fs.writeFileSync(
    path.join(__dirname, 'data.json'),
    JSON.stringify({
      eventId: evento.id,
      tokens: usuarios.map(firmar),
      adminToken: firmar(admin),
    }),
  );
  console.log(
    `Listo: ${usuarios.length} usuarios + 1 admin, evento ${evento.id} con ${CUPO} lugares, tokens de ${TTL}s.`,
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});