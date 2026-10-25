import { AppError } from '../../errors/AppError';
import { RoleName } from '../auth/token.service';
import {
  ReservationRecord,
  ReservationsRepository,
  ReserveFailure,
} from './reservations.repository';

const ERRORES: Record<ReserveFailure, AppError> = {
  EVENTO_NO_ENCONTRADO: new AppError(404, 'EVENTO_NO_ENCONTRADO', 'El evento no existe.'),
  EVENTO_NO_DISPONIBLE: new AppError(
    409,
    'EVENTO_NO_DISPONIBLE',
    'El evento está cancelado o ya pasó.',
  ),
  SIN_CUPO: new AppError(409, 'CUPO_INSUFICIENTE', 'No hay lugares suficientes para este evento.'),
  LIMITE_SUPERADO: new AppError(
    409,
    'LIMITE_SUPERADO',
    'Superás el máximo de 4 lugares por evento.',
  ),
};

export class ReservationsService {
  constructor(private readonly reservations: ReservationsRepository) {}

  async reserve(input: {
    userId: string;
    eventId: string;
    quantity: number;
    idempotencyKey?: string;
  }): Promise<{ reservation: ReservationRecord; replayed: boolean }> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 4) {
      throw new AppError(400, 'CANTIDAD_INVALIDA', 'La cantidad debe ser un entero entre 1 y 4.');
    }

    const result = await this.reservations.reserve(input);
    if (!result.ok) {
      const e = ERRORES[result.reason];
      throw new AppError(e.status, e.code, e.message);
    }
    return { reservation: result.reservation, replayed: result.replayed };
  }

  listMine(userId: string): Promise<ReservationRecord[]> {
    return this.reservations.listByUser(userId);
  }

  async cancel(
    id: string,
    requester: { userId: string; role: RoleName },
  ): Promise<ReservationRecord> {
    const existing = await this.reservations.findById(id);
    if (!existing) {
      throw new AppError(404, 'RESERVA_NO_ENCONTRADA', 'La reserva no existe.');
    }
    if (existing.userId !== requester.userId && requester.role !== 'ADMIN') {
      throw new AppError(403, 'SIN_PERMISO', 'No tenés permiso para cancelar esta reserva.');
    }

    const result = await this.reservations.cancel(id);
    if (result.ok) return result.reservation;
    if (result.reason === 'YA_CANCELADA') return existing;
    throw new AppError(404, 'RESERVA_NO_ENCONTRADA', 'La reserva no existe.');
  }
}