import {
    CancelResult,
    ReservationRecord,
    ReservationsRepository,
    ReserveFailure,
    ReserveResult,
  } from '../../src/modules/reservations/reservations.repository';
  
  export class FakeReservationsRepository implements ReservationsRepository {
    reservas: ReservationRecord[] = [];
    falla: ReserveFailure | null = null;
  
    async reserve(input: {
      userId: string;
      eventId: string;
      quantity: number;
      idempotencyKey?: string;
    }): Promise<ReserveResult> {
      if (this.falla) return { ok: false, reason: this.falla };
      const previa = input.idempotencyKey
        ? this.reservas.find(
            (r) => r.userId === input.userId && r.idempotencyKey === input.idempotencyKey,
          )
        : undefined;
      if (previa) return { ok: true, reservation: previa, replayed: true };
      const r: ReservationRecord = {
        id: `r-${this.reservas.length + 1}`,
        userId: input.userId,
        eventId: input.eventId,
        quantity: input.quantity,
        status: 'CONFIRMADA',
        idempotencyKey: input.idempotencyKey ?? null,
        createdAt: new Date(),
        cancelledAt: null,
      };
      this.reservas.push(r);
      return { ok: true, reservation: r, replayed: false };
    }
  
    async findById(id: string) {
      return this.reservas.find((r) => r.id === id) ?? null;
    }
  
    async listByUser(userId: string) {
      return this.reservas.filter((r) => r.userId === userId);
    }
  
    async cancel(id: string): Promise<CancelResult> {
      const r = this.reservas.find((x) => x.id === id);
      if (!r) return { ok: false, reason: 'NO_EXISTE' };
      if (r.status === 'CANCELADA') return { ok: false, reason: 'YA_CANCELADA' };
      r.status = 'CANCELADA';
      r.cancelledAt = new Date();
      return { ok: true, reservation: r };
    }
  }