import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { EventsService } from './events.service';

const API = '/api/v1/events';
const crudo = {
  id: 'e1',
  name: 'Recital',
  description: 'Show',
  venue: 'Estadio',
  startsAt: '2026-12-01T20:00:00.000Z',
  totalCapacity: 100,
  availableCapacity: 40,
  status: 'ACTIVO',
};

describe('EventsService', () => {
  let service: EventsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(EventsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list envía page y pageSize y convierte las fechas', () => {
    let resultado: any;
    service.list(2, 10).subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url === API);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [crudo], total: 1, page: 2, pageSize: 10 });

    expect(resultado.total).toBe(1);
    expect(resultado.items[0].startsAt).toBeInstanceOf(Date);
    expect(resultado.items[0].startsAt.toISOString()).toBe('2026-12-01T20:00:00.000Z');
  });

  it('get pide el evento por id y convierte la fecha', () => {
    let resultado: any;
    service.get('e1').subscribe((r) => (resultado = r));

    http.expectOne(`${API}/e1`).flush({ event: crudo });

    expect(resultado.name).toBe('Recital');
    expect(resultado.startsAt).toBeInstanceOf(Date);
  });

  it('create envía los datos con la fecha en ISO', () => {
    let resultado: any;
    const startsAt = new Date('2026-12-01T20:00:00.000Z');
    service
      .create({ name: 'Recital', description: '', venue: 'Estadio', startsAt, totalCapacity: 100 })
      .subscribe((r) => (resultado = r));

    const req = http.expectOne(API);
    expect(req.request.method).toBe('POST');
    expect(req.request.body.startsAt).toBe('2026-12-01T20:00:00.000Z');
    req.flush({ event: crudo });

    expect(resultado.id).toBe('e1');
  });

  it('update envía solo los campos modificados', () => {
    service.update('e1', { name: 'Otro' }).subscribe();

    const req = http.expectOne(`${API}/e1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Otro' });
    req.flush({ event: { ...crudo, name: 'Otro' } });
  });

  it('update convierte la fecha a ISO si se modifica', () => {
    service.update('e1', { startsAt: new Date('2026-12-02T20:00:00.000Z') }).subscribe();

    const req = http.expectOne(`${API}/e1`);
    expect(req.request.body.startsAt).toBe('2026-12-02T20:00:00.000Z');
    req.flush({ event: crudo });
  });

  it('cancel hace DELETE', () => {
    let terminado = false;
    service.cancel('e1').subscribe(() => (terminado = true));

    const req = http.expectOne(`${API}/e1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });

    expect(terminado).toBe(true);
  });
});