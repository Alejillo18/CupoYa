import { procesarReporte, aCsv } from '../../src/modules/reports/report.task';

const evento = {
  id: 'a',
  name: 'Recital, "Rock"',
  venue: 'Estadio',
  startsAt: new Date('2026-12-05T00:00:00Z'),
  status: 'ACTIVO',
  totalCapacity: 100,
  availableCapacity: 94,
};

describe('procesarReporte', () => {
  it('devuelve el reporte de ocupación y el CSV', () => {
    const r = procesarReporte({
      events: [evento],
      reservations: [{ eventId: 'a', quantity: 6, status: 'CONFIRMADA' }],
    });

    expect(r.report.totals.confirmedSeats).toBe(6);
    expect(r.csv.split('\n')).toHaveLength(2);
  });

  it('con simulatedWorkMs ocupa el hilo al menos ese tiempo', () => {
    const inicio = Date.now();

    procesarReporte({ events: [], reservations: [], simulatedWorkMs: 120 });

    expect(Date.now() - inicio).toBeGreaterThanOrEqual(115);
  });
});

describe('aCsv', () => {
  it('escribe encabezado y una fila por evento', () => {
    const csv = aCsv([
      {
        id: 'a',
        name: 'Recital',
        venue: 'Estadio',
        startsAt: '2026-12-05T00:00:00.000Z',
        status: 'ACTIVO',
        totalCapacity: 100,
        availableCapacity: 94,
        confirmedSeats: 6,
        cancelledSeats: 0,
        reservations: 2,
        occupancyPercent: 6,
        consistent: true,
      },
    ]);

    const [encabezado, fila] = csv.split('\n');
    expect(encabezado).toBe(
      'id,nombre,lugar,fecha,estado,cupo_total,disponible,confirmados,cancelados,reservas,ocupacion_pct,consistente',
    );
    expect(fila).toBe('a,Recital,Estadio,2026-12-05T00:00:00.000Z,ACTIVO,100,94,6,0,2,6,si');
  });

  it('escapa comas y comillas', () => {
    const csv = aCsv([
      {
        id: 'a',
        name: 'Recital, "Rock"',
        venue: 'Estadio',
        startsAt: '2026-12-05T00:00:00.000Z',
        status: 'ACTIVO',
        totalCapacity: 1,
        availableCapacity: 1,
        confirmedSeats: 0,
        cancelledSeats: 0,
        reservations: 0,
        occupancyPercent: 0,
        consistent: true,
      },
    ]);

    expect(csv.split('\n')[1]).toContain('"Recital, ""Rock"""');
  });

  it('neutraliza fórmulas de planilla (inyección de CSV)', () => {
    const csv = aCsv([
      {
        id: 'a',
        name: '=HYPERLINK("http://x")',
        venue: 'Estadio',
        startsAt: '2026-12-05T00:00:00.000Z',
        status: 'ACTIVO',
        totalCapacity: 1,
        availableCapacity: 1,
        confirmedSeats: 0,
        cancelledSeats: 0,
        reservations: 0,
        occupancyPercent: 0,
        consistent: true,
      },
    ]);

    expect(csv.split('\n')[1]).toContain("'=HYPERLINK");
  });
});