import { PrismaClient } from '@prisma/client';
import { prismaOccupancyLoader } from '../../src/modules/realtime/occupancy.loader';

describe('prismaOccupancyLoader', () => {
  it('consulta solo los eventos pedidos y devuelve filas con el formato del hub', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { id: 'e1', name: 'Recital', status: 'ACTIVO', totalCapacity: 100, availableCapacity: 40 },
    ]);
    const cargar = prismaOccupancyLoader({ event: { findMany } } as unknown as PrismaClient);

    const filas = await cargar(['e1', 'e2']);

    expect(findMany).toHaveBeenCalledWith({
      where: { id: { in: ['e1', 'e2'] } },
      select: { id: true, name: true, status: true, totalCapacity: true, availableCapacity: true },
    });
    expect(filas).toEqual([
      { eventId: 'e1', name: 'Recital', status: 'ACTIVO', totalCapacity: 100, availableCapacity: 40 },
    ]);
  });

  it('sin ids no consulta la base', async () => {
    const findMany = jest.fn();
    const cargar = prismaOccupancyLoader({ event: { findMany } } as unknown as PrismaClient);

    expect(await cargar([])).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});