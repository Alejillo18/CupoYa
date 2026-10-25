const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require(
  path.join(__dirname, '..', 'backend', 'node_modules', '@prisma/client'),
);

async function main() {
  const { eventId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
  const prisma = new PrismaClient();
  const e = await prisma.event.findUniqueOrThrow({ where: { id: eventId } });
  const agg = await prisma.reservation.aggregate({
    where: { eventId, status: 'CONFIRMADA' },
    _sum: { quantity: true },
    _count: true,
  });
  const confirmadas = agg._sum.quantity ?? 0;
  const excedidos = await prisma.$queryRaw`
    SELECT user_id FROM reservations
     WHERE event_id = ${eventId}::uuid AND status = 'CONFIRMADA'
     GROUP BY user_id HAVING sum(quantity) > 4`;

  console.log({
    total: e.totalCapacity,
    disponible: e.availableCapacity,
    lugaresConfirmados: confirmadas,
    reservasConfirmadas: agg._count,
    usuariosConMasDe4: excedidos.length,
  });
  const ok =
    e.availableCapacity >= 0 &&
    e.availableCapacity + confirmadas === e.totalCapacity &&
    excedidos.length === 0;
    confirmadas > 0;
  console.log(ok ? 'RESULTADO: OK, sin sobreventa' : 'RESULTADO: FALLA, hay inconsistencia');
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main();