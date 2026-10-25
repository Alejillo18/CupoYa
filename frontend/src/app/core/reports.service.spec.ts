import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReportsService } from './reports.service';

const totals = {
  events: 1,
  totalCapacity: 100,
  confirmedSeats: 6,
  occupancyPercent: 6,
  inconsistentEvents: 0,
};

const crudo = (status: string, result: unknown = null) => ({
  id: 'r1',
  status,
  errorMessage: null,
  createdAt: '2026-10-25T12:00:00.000Z',
  finishedAt: status === 'LISTO' ? '2026-10-25T12:00:02.000Z' : null,
  result,
});

describe('ReportsService', () => {
  let service: ReportsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReportsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('request hace POST y devuelve el reporte pendiente', () => {
    let res: any;
    service.request().subscribe((r) => (res = r));

    const req = http.expectOne('/api/v1/reports');
    expect(req.request.method).toBe('POST');
    req.flush({ report: crudo('PENDIENTE') }, { status: 202, statusText: 'Accepted' });

    expect(res.id).toBe('r1');
    expect(res.status).toBe('PENDIENTE');
    expect(res.report).toBeNull();
  });

  it('get aplana el resultado y convierte las fechas', () => {
    let res: any;
    service.get('r1').subscribe((r) => (res = r));

    http
      .expectOne('/api/v1/reports/r1')
      .flush({
        report: crudo('LISTO', {
          report: {
            events: [{ id: 'a', name: 'Recital', startsAt: '2026-12-05T00:00:00.000Z' }],
            totals,
          },
        }),
      });

    expect(res.status).toBe('LISTO');
    expect(res.report.totals.confirmedSeats).toBe(6);
    expect(res.report.events[0].startsAt).toBeInstanceOf(Date);
    expect(res.finishedAt).toBeInstanceOf(Date);
  });

  it('get de un reporte sin resultado deja report en null', () => {
    let res: any;
    service.get('r1').subscribe((r) => (res = r));

    http.expectOne('/api/v1/reports/r1').flush({ report: crudo('EN_PROCESO') });

    expect(res.report).toBeNull();
    expect(res.finishedAt).toBeNull();
  });

  it('downloadCsv pide un blob', () => {
    let res: Blob | undefined;
    service.downloadCsv('r1').subscribe((b) => (res = b));

    const req = http.expectOne('/api/v1/reports/r1/download');
    expect(req.request.responseType).toBe('blob');
    req.flush(new Blob(['id,nombre\n'], { type: 'text/csv' }));

    expect(res).toBeInstanceOf(Blob);
  });
});