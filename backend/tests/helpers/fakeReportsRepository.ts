import {
    ReportRecord,
    ReportsRepository,
    ReportStatus,
  } from '../../src/modules/reports/reports.repository';
  
  export class FakeReportsRepository implements ReportsRepository {
    reports: ReportRecord[] = [];
    datos = {
      events: [] as any[],
      reservations: [] as any[],
    };
    falla: Error | null = null;
  
    async create(requestedBy: string) {
      const r: ReportRecord = {
        id: `rep-${this.reports.length + 1}`,
        requestedBy,
        status: 'PENDIENTE',
        result: null,
        errorMessage: null,
        createdAt: new Date(),
        finishedAt: null,
      };
      this.reports.push(r);
      return r;
    }
  
    async findById(id: string) {
      return this.reports.find((r) => r.id === id) ?? null;
    }
  
    async setStatus(id: string, status: ReportStatus, extra: Partial<ReportRecord> = {}) {
      const r = this.reports.find((x) => x.id === id)!;
      Object.assign(r, extra, { status });
    }
  
    async loadData() {
      if (this.falla) throw this.falla;
      return this.datos;
    }
  }