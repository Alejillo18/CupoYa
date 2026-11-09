import { PrismaClient } from '@prisma/client';
import { OccupancyLoader } from './occupancy.hub';

// Una sola consulta por tanda: trae solo los eventos que algún administrador está mirando.
export function prismaOccupancyLoader(prisma: PrismaClient): OccupancyLoader {
  return async (eventIds) => {
    if (eventIds.length === 0) return [];
    const eventos = await prisma.event.findMany({
      where: { id: { in: eventIds } },
      select: { id: true, name: true, status: true, totalCapacity: true, availableCapacity: true },
    });
    return eventos.map((e) => ({
      eventId: e.id,
      name: e.name,
      status: e.status,
      totalCapacity: e.totalCapacity,
      availableCapacity: e.availableCapacity,
    }));
  };
}