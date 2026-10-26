import { DatePipe } from '@angular/common';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTableModule } from '@angular/material/table';
import { mensajeGlobal } from '../../core/error.interceptor';
import { NotificationService } from '../../core/notification.service';
import { Report, ReportsService } from '../../core/reports.service';

const SONDEO_MS = 2000;

@Component({
  selector: 'app-reports',
  imports: [DatePipe, MatTableModule, MatButtonModule, MatProgressBarModule],
  templateUrl: './reports.component.html',
  styleUrl: '../../shared/pagina.css',
})
export class ReportsComponent implements OnDestroy {
  private readonly reports = inject(ReportsService);
  private readonly notif = inject(NotificationService);

  readonly columnas = ['name', 'startsAt', 'venue', 'totalCapacity', 'confirmedSeats', 'occupancy'];
  readonly reporte = signal<Report | null>(null);
  readonly generando = signal(false);

  private timer: ReturnType<typeof setInterval> | null = null;

  solicitar(): void {
    this.detener();
    this.reporte.set(null);
    this.generando.set(true);

    this.reports.request().subscribe({
      next: (r) => {
        this.reporte.set(r);
        this.timer = setInterval(() => this.consultar(r.id), SONDEO_MS);
      },
      error: (err) => {
        this.generando.set(false);
        // Red, 429 y 5xx ya los avisa el interceptor.
        if (mensajeGlobal(err)) return;
        this.notif.error('No pudimos solicitar el reporte. Intentá de nuevo.');
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
      error: (err) => {
        if (mensajeGlobal(err)) return;
        this.notif.error('No pudimos descargar el CSV. Intentá de nuevo.');
      },
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
          if (r.status === 'LISTO') this.notif.success('Reporte listo.');
        }
      },
      error: (err) => {
        this.detener();
        this.generando.set(false);
        if (mensajeGlobal(err)) return;
        this.notif.error('No pudimos consultar el estado del reporte.');
      },
    });
  }

  private detener(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}