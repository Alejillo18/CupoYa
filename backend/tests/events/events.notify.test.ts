import { OccupancyNotifier } from '../../src/modules/realtime/occupancy.notifier';
import { EventRecord, EventRepository } from '../../src/modules/events/events.repository';
import { EventsService } from '../../src/modules/events/events.service';

const ahora = () => new Date('2026-01-01T00:00:00Z');
const nuevo = {
  name: 'Recital',
  venue: 'Estadio',
  startsAt: new Date('2027-01-01T00:00:00Z'),
  totalCapacity: 10,
} as never;
const activo = { id: 'e1', status: 'ACTIVO' } as unknown as EventRecord;

function crear(repo: Record<string, jest.Mock>, notifier: OccupancyNotifier) {
  return new EventsService(repo as unknown as EventRepository, ahora, notifier);
}

describe('EventsService: aviso de cambios de ocupación', () => {
  let notifier: { eventChanged: jest.Mock };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    notifier = { eventChanged: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('avisa el evento al crearlo', async () => {
    const repo = { create: jest.fn().mockResolvedValue(activo) };

    await crear(repo, notifier).create(nuevo);

    expect(notifier.eventChanged).toHaveBeenCalledWith('e1');
  });

  it('avisa el evento al editarlo', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(activo),
      update: jest.fn().mockResolvedValue(activo),
    };

    await crear(repo, notifier).update('e1', { totalCapacity: 20 });

    expect(notifier.eventChanged).toHaveBeenCalledWith('e1');
  });

  it('no avisa si la edición se rechaza por cupo menor a lo reservado', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(activo),
      update: jest.fn().mockResolvedValue(null),
    };

    await expect(crear(repo, notifier).update('e1', { totalCapacity: 1 })).rejects.toMatchObject({
      code: 'CUPO_MENOR_A_RESERVAS',
    });

    expect(notifier.eventChanged).not.toHaveBeenCalled();
  });

  it('avisa el evento al cancelarlo', async () => {
    const repo = { cancel: jest.fn().mockResolvedValue(true) };

    await crear(repo, notifier).cancel('e1');

    expect(notifier.eventChanged).toHaveBeenCalledWith('e1');
  });

  it('no avisa si el evento a cancelar no existe', async () => {
    const repo = { cancel: jest.fn().mockResolvedValue(false) };

    await expect(crear(repo, notifier).cancel('e1')).rejects.toMatchObject({
      code: 'EVENTO_NO_ENCONTRADO',
    });

    expect(notifier.eventChanged).not.toHaveBeenCalled();
  });

  it('la operación sigue funcionando si el aviso falla', async () => {
    notifier.eventChanged.mockImplementation(() => {
      throw new Error('redis caído');
    });
    const repo = { cancel: jest.fn().mockResolvedValue(true) };

    await expect(crear(repo, notifier).cancel('e1')).resolves.toBeUndefined();
  });
});