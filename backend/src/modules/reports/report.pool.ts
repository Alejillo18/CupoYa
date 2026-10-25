import path from 'node:path';
import Piscina from 'piscina';
import { ReportTaskInput, ReportTaskOutput } from './report.task';

export interface ReportPoolOptions {
  threads?: number;
}

// Compilado (.js) carga el worker .js; en desarrollo y pruebas (.ts) carga el .ts con tsx.
export function resolverWorker(archivoActual: string = __filename): {
  filename: string;
  execArgv: string[];
} {
  const ext = path.extname(archivoActual);
  const filename = path.join(path.dirname(archivoActual), `report.worker${ext}`);
  return { filename, execArgv: ext === '.ts' ? ['--import', 'tsx'] : [] };
}

export class ReportPool {
  private readonly pool: Piscina;

  constructor(options: ReportPoolOptions = {}) {
    const { filename, execArgv } = resolverWorker();
    const threads = options.threads ?? (Number(process.env.REPORT_THREADS) || 2);
    this.pool = new Piscina({ filename, execArgv, minThreads: threads, maxThreads: threads });
  }

  run(input: ReportTaskInput): Promise<ReportTaskOutput> {
    return this.pool.run(input);
  }

  destroy(): Promise<void> {
    return this.pool.destroy();
  }
}