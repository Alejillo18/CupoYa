import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';

export type ReportStatus = 'PENDIENTE' | 'EN_PROCESO' | 'LISTO' | 'ERROR';

export interface OccupancyEvent {
  id: string;
  name: string;
  venue: string;
  startsAt: Date;
  status: string;
  totalCapacity: number;
  availableCapacity: number;
  confirmedSeats: number;
  cancelledSeats: number;
  reservations: number;
  occupancyPercent: number;
  consistent: boolean;
}

export interface OccupancyData {
  events: OccupancyEvent[];
  totals: {
    events: number;
    totalCapacity: number;
    confirmedSeats: number;
    occupancyPercent: number;
    inconsistentEvents: number;
  };
}

export interface Report {
  id: string;
  status: ReportStatus;
  errorMessage: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  report: OccupancyData | null;
}

interface ReportRaw {
  id: string;
  status: ReportStatus;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
  result: { report?: { events: any[]; totals: OccupancyData['totals'] } } | null;
}

const API = '/api/v1/reports';

const aReporte = (r: ReportRaw): Report => ({
  id: r.id,
  status: r.status,
  errorMessage: r.errorMessage,
  createdAt: new Date(r.createdAt),
  finishedAt: r.finishedAt ? new Date(r.finishedAt) : null,
  report: r.result?.report
    ? {
        totals: r.result.report.totals,
        events: r.result.report.events.map((e) => ({ ...e, startsAt: new Date(e.startsAt) })),
      }
    : null,
});

@Injectable({ providedIn: 'root' })
export class ReportsService {
  private readonly http = inject(HttpClient);

  request(): Observable<Report> {
    return this.http.post<{ report: ReportRaw }>(API, {}).pipe(map((r) => aReporte(r.report)));
  }

  get(id: string): Observable<Report> {
    return this.http.get<{ report: ReportRaw }>(`${API}/${id}`).pipe(map((r) => aReporte(r.report)));
  }

  downloadCsv(id: string): Observable<Blob> {
    return this.http.get(`${API}/${id}/download`, { responseType: 'blob' });
  }
}