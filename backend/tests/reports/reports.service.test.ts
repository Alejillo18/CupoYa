import { ReportTaskOutput } from '../../src/modules/reports/report.task';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { FakeReportsRepository } from '../helpers/fakeReportsRepository';

const salida: ReportTaskOutput = {
  report: {
    events: [],
    totals: {
      events: 0,
      totalCapacity: 0,
      confirmedSeats: 0,
      occupancyPercent: 0,
      inconsistentEvents: 0,
    },
  },
  csv: 'id,nombre\n',
};

// Espera a que termine el trabajo en segundo plano.
const esperar = () => new Promise((r) => setTimeout(r, 20));

describe('ReportsService', () => {
  let repo: FakeReportsRepository;
  let pool: { run: jest.Mock<Promise<ReportTaskOutput>, [unknown]> };
  let ahora: Date;
  let service: ReportsService;

  beforeEach(() => {
    repo = new FakeReportsRepository();
    pool = { run: jest.fn().mockResolvedValue(salida) };
    ahora = new Date('2026-10-25T12:00:00Z');
    service = new ReportsService(repo, pool, () => ahora);
  });

  it('request crea el reporte PENDIENTE y responde sin esperar el cálculo', async () => {
    let liberar!: () => void;
    pool.run.mockReturnValue(new Promise<ReportTaskOutput>((r) => (liberar = () => r(salida))));

    const r = await service.request('adm');

    expect(r.status).toBe('PENDIENTE');
    expect(repo.reports).toHaveLength(1);
    liberar();
    await esperar();
  });

  it('el trabajo en segundo plano deja el reporte LISTO con el resultado', async () => {
    const r = await service.request('adm');
    await esperar();

    const guardado = await service.get(r.id);

    expect(guardado.status).toBe('LISTO');
    expect(guardado.finishedAt).not.toBeNull();
    expect(pool.run).toHaveBeenCalledTimes(1);
  });

  it('pasa por EN_PROCESO mientras el hilo trabaja', async () => {
    let liberar!: () => void;
    pool.run.mockReturnValue(new Promise<ReportTaskOutput>((r) => (liberar = () => r(salida))));
    const r = await service.request('adm');
    await esperar();

    expect((await service.get(r.id)).status).toBe('EN_PROCESO');
    liberar();
    await esperar();
  });

  it('si el cálculo falla deja el reporte en ERROR con el mensaje', async () => {
    pool.run.mockRejectedValue(new Error('el hilo falló'));
    const r = await service.request('adm');
    await esperar();

    const g = await service.get(r.id);

    expect(g.status).toBe('ERROR');
    expect(g.errorMessage).toContain('el hilo falló');
  });

  it('si falla la lectura de datos también queda en ERROR', async () => {
    repo.falla = new Error('base caída');
    const r = await service.request('adm');
    await esperar();

    expect((await service.get(r.id)).status).toBe('ERROR');
    expect(pool.run).not.toHaveBeenCalled();
  });

  it('get de un reporte inexistente devuelve 404', async () => {
    await expect(service.get('nada')).rejects.toMatchObject({
      status: 404,
      code: 'REPORTE_NO_ENCONTRADO',
    });
  });

  it('un reporte EN_PROCESO hace más de 10 minutos se marca como ERROR', async () => {
    const r = await service.request('adm');
    await esperar();
    repo.reports[0].status = 'EN_PROCESO';
    repo.reports[0].createdAt = new Date(ahora.getTime() - 11 * 60 * 1000);

    const g = await service.get(r.id);

    expect(g.status).toBe('ERROR');
    expect(g.errorMessage).toContain('tiempo');
  });

  it('download devuelve el CSV cuando el reporte está listo', async () => {
    const r = await service.request('adm');
    await esperar();

    const csv = await service.download(r.id);

    expect(csv).toBe('id,nombre\n');
  });

  it('download de un reporte no listo devuelve 409', async () => {
    let liberar!: () => void;
    pool.run.mockReturnValue(new Promise<ReportTaskOutput>((r) => (liberar = () => r(salida))));
    const r = await service.request('adm');
    await esperar();

    await expect(service.download(r.id)).rejects.toMatchObject({
      status: 409,
      code: 'REPORTE_NO_LISTO',
    });
    liberar();
    await esperar();
  });
  it('pasa la carga simulada configurada al hilo', async () => {
    service = new ReportsService(repo, pool, () => ahora, 250);

    await service.request('adm');
    await esperar();

    expect(pool.run).toHaveBeenCalledWith(expect.objectContaining({ simulatedWorkMs: 250 }));
  });

  it('por defecto no simula carga', async () => {
    await service.request('adm');
    await esperar();

    expect(pool.run).toHaveBeenCalledWith(expect.objectContaining({ simulatedWorkMs: 0 }));
  });
});