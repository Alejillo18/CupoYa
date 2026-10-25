import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ReservationsService } from './reservations.service';

const crudo = {
  id: 'r1',
  userId: 'u1',
  eventId: 'e1',
  quantity: 2,
  status: 'CONFIRMADA',
  idempotencyKey: 'k',
  createdAt: '2026-10-25T12:00:00.000Z',
  cancelledAt: null,
};

describe('ReservationsService', () => {
  let service: ReservationsService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(ReservationsService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('reserve envía la cantidad y la Idempotency-Key indicada', () => {
    let res: any;
    service.reserve('e1', 2, 'mi-clave').subscribe((r) => (res = r));

    const req = http.expectOne('/api/v1/events/e1/reservations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ quantity: 2 });
    expect(req.request.headers.get('Idempotency-Key')).toBe('mi-clave');
    req.flush({ reservation: crudo }, { status: 201, statusText: 'Created' });

    expect(res.id).toBe('r1');
    expect(res.createdAt).toBeInstanceOf(Date);
  });

  it('reserve genera una clave distinta en cada llamada si no se indica', () => {
    service.reserve('e1', 1).subscribe();
    service.reserve('e1', 1).subscribe();

    const reqs = http.match('/api/v1/events/e1/reservations');
    const k1 = reqs[0].request.headers.get('Idempotency-Key');
    const k2 = reqs[1].request.headers.get('Idempotency-Key');
    expect(k1).toBeTruthy();
    expect(k1).not.toBe(k2);
    reqs.forEach((r) => r.flush({ reservation: crudo }));
  });

  it('listMine devuelve las reservas con fechas convertidas', () => {
    let res: any;
    service.listMine().subscribe((r) => (res = r));

    http.expectOne('/api/v1/reservations/me').flush({ items: [crudo] });

    expect(res).toHaveLength(1);
    expect(res[0].createdAt).toBeInstanceOf(Date);
  });

  it('cancel hace POST y devuelve la reserva cancelada', () => {
    let res: any;
    service.cancel('r1').subscribe((r) => (res = r));

    const req = http.expectOne('/api/v1/reservations/r1/cancel');
    expect(req.request.method).toBe('POST');
    req.flush({ reservation: { ...crudo, status: 'CANCELADA', cancelledAt: '2026-10-25T13:00:00.000Z' } });

    expect(res.status).toBe('CANCELADA');
    expect(res.cancelledAt).toBeInstanceOf(Date);
  });
});