import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export interface Reservation {
  id: string;
  userId: string;
  eventId: string;
  quantity: number;
  status: 'CONFIRMADA' | 'CANCELADA';
  createdAt: Date;
  cancelledAt: Date | null;
}

interface ReservationRaw extends Omit<Reservation, 'createdAt' | 'cancelledAt'> {
  createdAt: string;
  cancelledAt: string | null;
}

const aReserva = (r: ReservationRaw): Reservation => ({
  id: r.id,
  userId: r.userId,
  eventId: r.eventId,
  quantity: r.quantity,
  status: r.status,
  createdAt: new Date(r.createdAt),
  cancelledAt: r.cancelledAt ? new Date(r.cancelledAt) : null,
});

@Injectable({ providedIn: 'root' })
export class ReservationsService {
  private readonly http = inject(HttpClient);

  reserve(eventId: string, quantity: number, idempotencyKey?: string): Observable<Reservation> {
    const headers = new HttpHeaders({ 'Idempotency-Key': idempotencyKey ?? crypto.randomUUID() });
    return this.http
      .post<{ reservation: ReservationRaw }>(
        `/api/v1/events/${eventId}/reservations`,
        { quantity },
        { headers },
      )
      .pipe(map((r) => aReserva(r.reservation)));
  }

  listMine(): Observable<Reservation[]> {
    return this.http
      .get<{ items: ReservationRaw[] }>('/api/v1/reservations/me')
      .pipe(map((r) => r.items.map(aReserva)));
  }

  cancel(id: string): Observable<Reservation> {
    return this.http
      .post<{ reservation: ReservationRaw }>(`/api/v1/reservations/${id}/cancel`, {})
      .pipe(map((r) => aReserva(r.reservation)));
  }
}