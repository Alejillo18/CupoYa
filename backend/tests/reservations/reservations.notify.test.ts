import { OccupancyNotifier } from '../../src/modules/realtime/occupancy.notifier';
import {
  ReservationRecord,
  ReservationsRepository,
} from '../../src/modules/reservations/reservations.repository';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';

const reserva = { id: 'r1', userId: 'u1', eventId: 'e1', quantity: 2 } as unknown as ReservationRecord;
const dueno = { userId: 'u1', role: 'USUARIO' as const };

function crear(repo: Record<string, jest.Mock>, notifier: OccupancyNotifier) {
  return new ReservationsService(repo as unknown as ReservationsRepository, notifier);
}

describe('ReservationsService: aviso de cambios de ocupación', () => {
  let notifier: { eventChanged: jest.Mock };

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    notifier = { eventChanged: jest.fn() };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('avisa el evento al confirmar una reserva nueva', async () => {
    const repo = { reserve: jest.fn().mockResolvedValue({ ok: true, reservation: reserva, replayed: false }) };

    await crear(repo, notifier).reserve({ userId: 'u1', eventId: 'e1', quantity: 2 });

    expect(notifier.eventChanged).toHaveBeenCalledWith('e1');
  });

  it('no avisa si la reserva era una repetición idempotente', async () => {
    const repo = { reserve: jest.fn().mockResolvedValue({ ok: true, reservation: reserva, replayed: true }) };

    await crear(repo, notifier).reserve({ userId: 'u1', eventId: 'e1', quantity: 2 });

    expect(notifier.eventChanged).not.toHaveBeenCalled();
  });

  it('no avisa si la reserva fue rechazada', async () => {
    const repo = { reserve: jest.fn().mockResolvedValue({ ok: false, reason: 'SIN_CUPO' }) };

    await expect(
      crear(repo, notifier).reserve({ userId: 'u1', eventId: 'e1', quantity: 2 }),
    ).rejects.toMatchObject({ code: 'CUPO_INSUFICIENTE' });

    expect(notifier.eventChanged).not.toHaveBeenCalled();
  });

  it('avisa el evento de la reserva al cancelarla', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(reserva),
      cancel: jest.fn().mockResolvedValue({ ok: true, reservation: reserva }),
    };

    await crear(repo, notifier).cancel('r1', dueno);

    expect(notifier.eventChanged).toHaveBeenCalledWith('e1');
  });

  it('no avisa si la reserva ya estaba cancelada', async () => {
    const repo = {
      findById: jest.fn().mockResolvedValue(reserva),
      cancel: jest.fn().mockResolvedValue({ ok: false, reason: 'YA_CANCELADA' }),
    };

    await crear(repo, notifier).cancel('r1', dueno);

    expect(notifier.eventChanged).not.toHaveBeenCalled();
  });

  it('la reserva sigue funcionando si el aviso falla', async () => {
    notifier.eventChanged.mockImplementation(() => {
      throw new Error('redis caído');
    });
    const repo = { reserve: jest.fn().mockResolvedValue({ ok: true, reservation: reserva, replayed: false }) };

    const resultado = await crear(repo, notifier).reserve({ userId: 'u1', eventId: 'e1', quantity: 2 });

    expect(resultado.reservation).toBe(reserva);
  });
});