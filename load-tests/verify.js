const path = require('node:path');
const fs = require('node:fs');
const { PrismaClient } = require(
  path.join(__dirname, '..', 'backend', 'node_modules', '@prisma/client'),
);

async function main() {
  const { eventId } = JSON.parse(fs.readFileSync(path.join(__dirname, 'data.json'), 'utf8'));
  const prisma = new PrismaClient();

  const eventos = await prisma.event.findMany();
  const sumas = await prisma.reservation.groupBy({
    by: ['eventId'],
    where: { status: 'CONFIRMADA' },
    _sum: { quantity: true },
    _count: true,
  });
  const porEvento = new Map(sumas.map((s) => [s.eventId, s]));

  // Invariante: disponible >= 0 y disponible + confirmados == total.
  // "faltan" = lugares que no están ni disponibles ni confirmados (0 si todo cuadra).
  const revision = eventos.map((e) => {
    const confirmados = porEvento.get(e.id)?._sum.quantity ?? 0;
    const faltan = e.totalCapacity - e.availableCapacity - confirmados;
    return {
      id: e.id,
      nombre: e.name,
      total: e.totalCapacity,
      disponible: e.availableCapacity,
      confirmados,
      faltan,
      consistente: e.availableCapacity >= 0 && faltan === 0,
    };
  });
  const carga = revision.find((r) => r.id === eventId);
  const otrosRotos = revision.filter((r) => r.id !== eventId && !r.consistente);

  // Regla de negocio: nadie supera 4 lugares confirmados por evento
  const excedidos = await prisma.$queryRaw`
    SELECT event_id, user_id FROM reservations
     WHERE status = 'CONFIRMADA'
     GROUP BY event_id, user_id HAVING sum(quantity) > 4`;

  const cargaAgg = porEvento.get(eventId);
  const hayActividad = (cargaAgg?._count ?? 0) > 0;

  console.log({
    eventosRevisados: eventos.length,
    usuariosConMasDe4: excedidos.length,
    carga: carga && {
      total: carga.total,
      disponible: carga.disponible,
      lugaresConfirmados: carga.confirmados,
      reservasConfirmadas: cargaAgg?._count ?? 0,
      faltan: carga.faltan,
    },
  });
  if (otrosRotos.length) {
    console.log('AVISO: otros eventos con lugares sin explicar (no son del evento de carga):');
    console.table(otrosRotos);
  }
  if (!hayActividad) console.log('AVISO: el evento de carga no tiene reservas confirmadas.');

  const ok = !!carga && carga.consistente && excedidos.length === 0 && hayActividad;
  console.log(
    ok
      ? 'RESULTADO: OK, el evento de carga está consistente y sin sobreventa'
      : 'RESULTADO: FALLA, hay inconsistencia en el evento de carga',
  );
  await prisma.$disconnect();
  process.exit(ok ? 0 : 1);
}

main();