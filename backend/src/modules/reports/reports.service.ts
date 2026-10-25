import { AppError } from '../../errors/AppError';
import { ReportTaskInput, ReportTaskOutput } from './report.task';
import { ReportRecord, ReportsRepository } from './reports.repository';

const TIMEOUT_MS = 10 * 60 * 1000;

export interface ReportRunner {
  run(input: ReportTaskInput): Promise<ReportTaskOutput>;
}

export class ReportsService {
  constructor(
    private readonly repo: ReportsRepository,
    private readonly pool: ReportRunner,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async request(userId: string): Promise<ReportRecord> {
    const report = await this.repo.create(userId);
    // Se responde ya; el cálculo sigue en segundo plano, en un hilo aparte.
    setImmediate(() => void this.procesar(report.id));
    return report;
  }

  async get(id: string): Promise<ReportRecord> {
    const report = await this.repo.findById(id);
    if (!report) {
      throw new AppError(404, 'REPORTE_NO_ENCONTRADO', 'El reporte no existe.');
    }

    // Si el proceso que lo calculaba murió, no puede quedar "en proceso" para siempre.
    if (
      report.status === 'EN_PROCESO' &&
      this.now().getTime() - report.createdAt.getTime() > TIMEOUT_MS
    ) {
      const extra = {
        errorMessage: 'El reporte superó el tiempo máximo de generación.',
        finishedAt: this.now(),
      };
      await this.repo.setStatus(id, 'ERROR', extra);
      return { ...report, status: 'ERROR', ...extra };
    }
    return report;
  }

  async download(id: string): Promise<string> {
    const report = await this.get(id);
    if (report.status !== 'LISTO') {
      throw new AppError(409, 'REPORTE_NO_LISTO', 'El reporte todavía no está listo.');
    }
    return (report.result as { csv: string }).csv;
  }

  private async procesar(id: string): Promise<void> {
    try {
      await this.repo.setStatus(id, 'EN_PROCESO');
      const datos = await this.repo.loadData();
      const salida = await this.pool.run(datos);
      await this.repo.setStatus(id, 'LISTO', { result: salida, finishedAt: this.now() });
    } catch (err) {
      const mensaje = err instanceof Error ? err.message : 'Error desconocido';
      await this.repo
        .setStatus(id, 'ERROR', { errorMessage: mensaje, finishedAt: this.now() })
        .catch(() => undefined);
    }
  }
}