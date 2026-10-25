const path = require('node:path');
const fs = require('node:fs');
const back = (m) => require(path.join(__dirname, '..', 'backend', 'node_modules', m));

const { PrismaClient } = back('@prisma/client');
const bcrypt = back('bcryptjs');
const jwt = back('jsonwebtoken');

const USUARIOS = Number(process.env.LOAD_USERS) || 2000;
const CUPO = Number(process.env.LOAD_CAPACITY) || 5000;

async function main() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('Falta JWT_SECRET (backend/.env)');
  const prisma = new PrismaClient();

  // Limpieza de corridas anteriores (solo datos de carga)
  const viejos = await prisma.user.findMany({
    where: { email: { endsWith: '@carga.test' } },
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
  await prisma.user.createMany({
    data: Array.from({ length: USUARIOS }, (_, i) => ({
      email: `carga${i}@carga.test`,
      passwordHash,
    })),
  });
  const usuarios = await prisma.user.findMany({
    where: { email: { endsWith: '@carga.test' } },
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

  const tokens = usuarios.map((u) =>
    jwt.sign({ role: u.role }, secret, { subject: u.id, expiresIn: 3600, algorithm: 'HS256' }),
  );

  fs.writeFileSync(
    path.join(__dirname, 'data.json'),
    JSON.stringify({ eventId: evento.id, tokens }),
  );
  console.log(`Listo: ${usuarios.length} usuarios, evento ${evento.id} con ${CUPO} lugares.`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});