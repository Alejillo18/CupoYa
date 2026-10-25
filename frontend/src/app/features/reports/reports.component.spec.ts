import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ReportsService } from '../../core/reports.service';
import { ReportsComponent } from './reports.component';

const totals = (inconsistentEvents = 0) => ({
  events: 1,
  totalCapacity: 100,
  confirmedSeats: 6,
  occupancyPercent: 6,
  inconsistentEvents,
});

const listo = (inconsistentEvents = 0) => ({
  id: 'r1',
  status: 'LISTO' as const,
  errorMessage: null,
  createdAt: new Date(),
  finishedAt: new Date(),
  report: {
    totals: totals(inconsistentEvents),
    events: [
      {
        id: 'a',
        name: 'Recital',
        venue: 'Estadio',
        startsAt: new Date('2026-12-05T00:00:00Z'),
        status: 'ACTIVO',
        totalCapacity: 100,
        availableCapacity: 94,
        confirmedSeats: 6,
        cancelledSeats: 0,
        reservations: 2,
        occupancyPercent: 6,
        consistent: true,
      },
    ],
  },
});

const enCurso = (status: 'PENDIENTE' | 'EN_PROCESO') => ({
  id: 'r1',
  status,
  errorMessage: null,
  createdAt: new Date(),
  finishedAt: null,
  report: null,
});

describe('ReportsComponent', () => {
  let reports: {
    request: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
    downloadCsv: ReturnType<typeof vi.fn>;
  };

  function crear() {
    const fixture = TestBed.createComponent(ReportsComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    reports = { request: vi.fn(), get: vi.fn(), downloadCsv: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: ReportsService, useValue: reports }],
    });
  });

  afterEach(() => vi.useRealTimers());

  it('al inicio no hay reporte y se ofrece solicitarlo', () => {
    const f = crear();

    expect(f.nativeElement.textContent).toContain('Solicitar reporte');
    expect(f.componentInstance.reporte()).toBeNull();
  });

  it('solicitar pide el reporte y empieza a consultar su estado', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(of(enCurso('EN_PROCESO')));
    const f = crear();

    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);

    expect(reports.request).toHaveBeenCalledTimes(1);
    expect(reports.get).toHaveBeenCalledWith('r1');
    expect(f.componentInstance.generando()).toBe(true);
  });

  it('el sondeo se detiene cuando el reporte está LISTO', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(of(listo()));
    const f = crear();

    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);
    const llamadas = reports.get.mock.calls.length;
    vi.advanceTimersByTime(10_000);

    expect(reports.get.mock.calls.length).toBe(llamadas);
    expect(f.componentInstance.generando()).toBe(false);
    expect(f.componentInstance.reporte()?.status).toBe('LISTO');
  });

  it('muestra la tabla y los totales cuando está listo', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(of(listo()));
    const f = crear();

    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);
    f.detectChanges();

    const t = f.nativeElement.textContent;
    expect(t).toContain('Recital');
    expect(t).toContain('Estadio');
    expect(t).toContain('Descargar CSV');
  });

  it('avisa si hay eventos inconsistentes', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(of(listo(2)));
    const f = crear();

    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);
    f.detectChanges();

    expect(f.nativeElement.textContent).toContain('inconsistencia');
  });

  it('no avisa inconsistencias si no las hay', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(of(listo(0)));
    const f = crear();

    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);
    f.detectChanges();

    expect(f.nativeElement.textContent).not.toContain('inconsistencia');
  });

  it('si el reporte termina en ERROR muestra el mensaje y deja de consultar', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(
      of({ ...enCurso('EN_PROCESO'), status: 'ERROR' as const, errorMessage: 'el hilo falló' }),
    );
    const f = crear();

    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);
    f.detectChanges();

    expect(f.nativeElement.textContent).toContain('el hilo falló');
    expect(f.componentInstance.generando()).toBe(false);
  });

  it('si falla el pedido inicial muestra un mensaje', () => {
    reports.request.mockReturnValue(throwError(() => ({ status: 500 })));
    const f = crear();

    f.componentInstance.solicitar();

    expect(f.componentInstance.error()).toContain('No pudimos solicitar');
    expect(f.componentInstance.generando()).toBe(false);
  });

  it('descargar pide el CSV y lo guarda como archivo', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(of(listo()));
    reports.downloadCsv.mockReturnValue(of(new Blob(['a,b'], { type: 'text/csv' })));
    URL.createObjectURL = vi.fn().mockReturnValue('blob:x');
    URL.revokeObjectURL = vi.fn();
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const f = crear();
    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);

    f.componentInstance.descargar();

    expect(reports.downloadCsv).toHaveBeenCalledWith('r1');
    expect(clic).toHaveBeenCalled();
  });

  it('al destruirse el componente se detiene el sondeo', () => {
    reports.request.mockReturnValue(of(enCurso('PENDIENTE')));
    reports.get.mockReturnValue(of(enCurso('EN_PROCESO')));
    const f = crear();
    f.componentInstance.solicitar();
    vi.advanceTimersByTime(2000);
    const llamadas = reports.get.mock.calls.length;

    f.destroy();
    vi.advanceTimersByTime(10_000);

    expect(reports.get.mock.calls.length).toBe(llamadas);
  });
});