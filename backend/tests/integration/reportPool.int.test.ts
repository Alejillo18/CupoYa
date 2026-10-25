import { ReportPool } from '../../src/modules/reports/report.pool';

describe('ReportPool (hilo real con worker_threads)', () => {
  let pool: ReportPool;

  beforeAll(() => {
    pool = new ReportPool({ threads: 2 });
  });

  afterAll(async () => {
    await pool.destroy();
  });

  const evento = {
    id: 'a',
    name: 'Recital',
    venue: 'Estadio',
    startsAt: new Date('2026-12-05T00:00:00Z'),
    status: 'ACTIVO',
    totalCapacity: 100,
    availableCapacity: 94,
  };

  it('calcula el reporte en otro hilo y conserva los datos', async () => {
    const r = await pool.run({
      events: [evento],
      reservations: [{ eventId: 'a', quantity: 6, status: 'CONFIRMADA' }],
    });

    expect(r.report.totals.confirmedSeats).toBe(6);
    expect(r.csv).toContain('Recital');
  });

  it('el event loop sigue libre mientras el hilo trabaja', async () => {
    const trabajo = pool.run({ events: [], reservations: [], simulatedWorkMs: 800 });

    // Mientras el hilo gira 800 ms, el hilo principal debe poder ejecutar timers.
    let ticks = 0;
    const intervalo = setInterval(() => ticks++, 20);
    await trabajo;
    clearInterval(intervalo);

    // Si el trabajo bloqueara el event loop, habría ~0 ticks.
    expect(ticks).toBeGreaterThan(15);
  }, 20_000);

  it('varias tareas se reparten entre los hilos', async () => {
    const inicio = Date.now();

    await Promise.all([
      pool.run({ events: [], reservations: [], simulatedWorkMs: 500 }),
      pool.run({ events: [], reservations: [], simulatedWorkMs: 500 }),
    ]);

    // En paralelo (2 hilos) tarda ~500 ms, no ~1000 ms.
    expect(Date.now() - inicio).toBeLessThan(900);
  }, 20_000);
});