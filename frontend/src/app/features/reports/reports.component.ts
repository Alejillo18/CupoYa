import { DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { Report, ReportsService } from '../../core/reports.service';

const SONDEO_MS = 2000;

@Component({
  selector: 'app-reports',
  imports: [DatePipe],
  templateUrl: './reports.component.html',
  styleUrl: '../auth/auth.css',
})
export class ReportsComponent implements OnDestroy {
  private readonly reports = inject(ReportsService);

  readonly reporte = signal<Report | null>(null);
  readonly generando = signal(false);
  readonly error = signal<string | null>(null);

  private timer: ReturnType<typeof setInterval> | null = null;

  solicitar(): void {
    this.detener();
    this.error.set(null);
    this.reporte.set(null);
    this.generando.set(true);

    this.reports.request().subscribe({
      next: (r) => {
        this.reporte.set(r);
        this.timer = setInterval(() => this.consultar(r.id), SONDEO_MS);
      },
      error: () => {
        this.generando.set(false);
        this.error.set('No pudimos solicitar el reporte. Intentá de nuevo.');
      },
    });
  }

  descargar(): void {
    const r = this.reporte();
    if (!r) return;
    this.reports.downloadCsv(r.id).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-ocupacion-${r.id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set('No pudimos descargar el CSV. Intentá de nuevo.'),
    });
  }

  ngOnDestroy(): void {
    this.detener();
  }

  private consultar(id: string): void {
    this.reports.get(id).subscribe({
      next: (r) => {
        this.reporte.set(r);
        if (r.status === 'LISTO' || r.status === 'ERROR') {
          this.detener();
          this.generando.set(false);
        }
      },
      error: () => {
        this.detener();
        this.generando.set(false);
        this.error.set('Perdimos la conexión al consultar el reporte.');
      },
    });
  }

  private detener(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}