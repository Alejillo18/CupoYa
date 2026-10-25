export interface ReservationRecord {
    id: string;
    userId: string;
    eventId: string;
    quantity: number;
    status: 'CONFIRMADA' | 'CANCELADA';
    idempotencyKey: string | null;
    createdAt: Date;
    cancelledAt: Date | null;
  }
  
  export type ReserveFailure =
    | 'EVENTO_NO_ENCONTRADO'
    | 'EVENTO_NO_DISPONIBLE'
    | 'SIN_CUPO'
    | 'LIMITE_SUPERADO';
  
  export type ReserveResult =
    | { ok: true; reservation: ReservationRecord; replayed: boolean }
    | { ok: false; reason: ReserveFailure };
  
  export type CancelResult =
    | { ok: true; reservation: ReservationRecord }
    | { ok: false; reason: 'NO_EXISTE' | 'YA_CANCELADA' };
  
  export interface ReservationsRepository {
    reserve(input: {
      userId: string;
      eventId: string;
      quantity: number;
      idempotencyKey?: string;
    }): Promise<ReserveResult>;
    findById(id: string): Promise<ReservationRecord | null>;
    listByUser(userId: string): Promise<ReservationRecord[]>;
    cancel(id: string): Promise<CancelResult>;
  }
  
  export const MAX_PER_USER_PER_EVENT = 4;