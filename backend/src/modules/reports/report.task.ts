import {
    OccupancyEvent,
    OccupancyEventInput,
    OccupancyReport,
    OccupancyReservationInput,
    calcularOcupacion,
  } from './occupancy';
  
  export interface ReportTaskInput {
    events: OccupancyEventInput[];
    reservations: OccupancyReservationInput[];
    // Solo para demostrar que el hilo no bloquea la API; en producción vale 0.
    simulatedWorkMs?: number;
  }
  
  export interface ReportTaskOutput {
    report: OccupancyReport;
    csv: string;
  }
  
  const COLUMNAS = [
    'id',
    'nombre',
    'lugar',
    'fecha',
    'estado',
    'cupo_total',
    'disponible',
    'confirmados',
    'cancelados',
    'reservas',
    'ocupacion_pct',
    'consistente',
  ];
  
  function celda(valor: string | number | boolean): string {
    let texto = typeof valor === 'boolean' ? (valor ? 'si' : 'no') : String(valor);
    // Un texto que empieza con = + - @ lo interpretaría una planilla como fórmula.
    if (/^[=+\-@]/.test(texto)) texto = `'${texto}`;
    return /[",\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
  }
  
  export function aCsv(events: OccupancyEvent[]): string {
    const filas = events.map((e) =>
      [
        e.id,
        e.name,
        e.venue,
        e.startsAt,
        e.status,
        e.totalCapacity,
        e.availableCapacity,
        e.confirmedSeats,
        e.cancelledSeats,
        e.reservations,
        e.occupancyPercent,
        e.consistent,
      ]
        .map(celda)
        .join(','),
    );
    return [COLUMNAS.join(','), ...filas].join('\n');
  }
  
  function ocuparCpu(ms: number): void {
    const fin = Date.now() + ms;
    while (Date.now() < fin) {
      Math.sqrt(Math.random() * 1e9);
    }
  }
  
  export function procesarReporte(input: ReportTaskInput): ReportTaskOutput {
    if (input.simulatedWorkMs && input.simulatedWorkMs > 0) ocuparCpu(input.simulatedWorkMs);
    const report = calcularOcupacion(input.events, input.reservations);
    return { report, csv: aCsv(report.events) };
  }