export interface OccupancyEventInput {
    id: string;
    name: string;
    venue: string;
    startsAt: Date;
    status: string;
    totalCapacity: number;
    availableCapacity: number;
  }
  
  export interface OccupancyReservationInput {
    eventId: string;
    quantity: number;
    status: 'CONFIRMADA' | 'CANCELADA';
  }
  
  export interface OccupancyEvent {
    id: string;
    name: string;
    venue: string;
    startsAt: string;
    status: string;
    totalCapacity: number;
    availableCapacity: number;
    confirmedSeats: number;
    cancelledSeats: number;
    reservations: number;
    occupancyPercent: number;
    consistent: boolean;
  }
  
  export interface OccupancyReport {
    events: OccupancyEvent[];
    totals: {
      events: number;
      totalCapacity: number;
      confirmedSeats: number;
      occupancyPercent: number;
      inconsistentEvents: number;
    };
  }
  
  const porcentaje = (parte: number, total: number): number =>
    total > 0 ? Math.round((parte / total) * 10_000) / 100 : 0;
  
  // Función pura: no toca base de datos ni reloj, así corre igual en el hilo de trabajo.
  export function calcularOcupacion(
    eventos: OccupancyEventInput[],
    reservas: OccupancyReservationInput[],
  ): OccupancyReport {
    const acumulado = new Map<string, { confirmed: number; cancelled: number; count: number }>();
    for (const r of reservas) {
      const a = acumulado.get(r.eventId) ?? { confirmed: 0, cancelled: 0, count: 0 };
      if (r.status === 'CONFIRMADA') {
        a.confirmed += r.quantity;
        a.count += 1;
      } else {
        a.cancelled += r.quantity;
      }
      acumulado.set(r.eventId, a);
    }
  
    const ordenados = [...eventos].sort((x, y) => x.startsAt.getTime() - y.startsAt.getTime());
  
    const events: OccupancyEvent[] = ordenados.map((e) => {
      const a = acumulado.get(e.id) ?? { confirmed: 0, cancelled: 0, count: 0 };
      return {
        id: e.id,
        name: e.name,
        venue: e.venue,
        startsAt: e.startsAt.toISOString(),
        status: e.status,
        totalCapacity: e.totalCapacity,
        availableCapacity: e.availableCapacity,
        confirmedSeats: a.confirmed,
        cancelledSeats: a.cancelled,
        reservations: a.count,
        occupancyPercent: porcentaje(a.confirmed, e.totalCapacity),
        consistent: e.availableCapacity + a.confirmed === e.totalCapacity,
      };
    });
  
    const totalCapacity = events.reduce((s, e) => s + e.totalCapacity, 0);
    const confirmedSeats = events.reduce((s, e) => s + e.confirmedSeats, 0);
  
    return {
      events,
      totals: {
        events: events.length,
        totalCapacity,
        confirmedSeats,
        occupancyPercent: porcentaje(confirmedSeats, totalCapacity),
        inconsistentEvents: events.filter((e) => !e.consistent).length,
      },
    };
  }