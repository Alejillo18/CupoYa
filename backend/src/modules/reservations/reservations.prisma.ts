import { Prisma, PrismaClient } from '@prisma/client';
import {
  CancelResult,
  MAX_PER_USER_PER_EVENT,
  ReservationRecord,
  ReservationsRepository,
  ReserveResult,
} from './reservations.repository';

export class PrismaReservationsRepository implements ReservationsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async reserve(input: {
    userId: string;
    eventId: string;
    quantity: number;
    idempotencyKey?: string;
  }): Promise<ReserveResult> {
    const { userId, eventId, quantity, idempotencyKey } = input;

    return this.prisma.$transaction(
      async (tx): Promise<ReserveResult> => {
        // 1. Serializa los pedidos del mismo usuario sobre el mismo evento
        //    (límite de 4 e idempotencia). Se libera solo al terminar la transacción.
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtextextended(${userId + ':' + eventId}, 0))`;

        // 2. Idempotencia: si ya existe, se devuelve la misma reserva.
        if (idempotencyKey) {
          const previa = await tx.reservation.findUnique({
            where: { userId_idempotencyKey: { userId, idempotencyKey } },
          });
          if (previa) return { ok: true, reservation: previa, replayed: true };
        }

        // 3. Límite por usuario y evento.
        const agg = await tx.reservation.aggregate({
          where: { userId, eventId, status: 'CONFIRMADA' },
          _sum: { quantity: true },
        });
        if ((agg._sum.quantity ?? 0) + quantity > MAX_PER_USER_PER_EVENT) {
          return { ok: false, reason: 'LIMITE_SUPERADO' };
        }

        // 4. Descuento atómico: la condición se evalúa dentro del mismo UPDATE.
        const filas = await tx.$executeRaw`
          UPDATE events
             SET available_capacity = available_capacity - ${quantity}::int
           WHERE id = ${eventId}::uuid
             AND status = 'ACTIVO'
             AND starts_at > now()
             AND available_capacity >= ${quantity}::int`;

        if (filas === 0) {
          const evento = await tx.event.findUnique({ where: { id: eventId } });
          if (!evento) return { ok: false, reason: 'EVENTO_NO_ENCONTRADO' };
          if (evento.status !== 'ACTIVO' || evento.startsAt <= new Date()) {
            return { ok: false, reason: 'EVENTO_NO_DISPONIBLE' };
          }
          return { ok: false, reason: 'SIN_CUPO' };
        }

        // 5. Alta de la reserva (si falla, el descuento se revierte).
        const reservation = await tx.reservation.create({
          data: { userId, eventId, quantity, idempotencyKey },
        });
        return { ok: true, reservation, replayed: false };
      },
      { maxWait: 30_000, timeout: 30_000 },
    );
  }

  async findById(id: string): Promise<ReservationRecord | null> {
    return this.prisma.reservation.findUnique({ where: { id } });
  }

  async listByUser(userId: string): Promise<ReservationRecord[]> {
    return this.prisma.reservation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancel(id: string): Promise<CancelResult> {
    return this.prisma.$transaction(async (tx): Promise<CancelResult> => {
      // Marca como cancelada solo si estaba confirmada: la segunda cancelación no encuentra filas.
      const filas = await tx.$executeRaw`
        UPDATE reservations
           SET status = 'CANCELADA', cancelled_at = now()
         WHERE id = ${id}::uuid AND status = 'CONFIRMADA'`;

      if (filas === 0) {
        const existe = await tx.reservation.findUnique({ where: { id } });
        return { ok: false, reason: existe ? 'YA_CANCELADA' : 'NO_EXISTE' };
      }

      const r = await tx.reservation.findUniqueOrThrow({ where: { id } });
      await tx.$executeRaw`
        UPDATE events
           SET available_capacity = available_capacity + ${r.quantity}::int
         WHERE id = ${r.eventId}::uuid`;
      return { ok: true, reservation: r };
    });
  }
}

export { Prisma };