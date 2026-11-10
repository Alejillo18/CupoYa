import { TestBed } from '@angular/core/testing';
import {
  HttpClient,
  HttpHeaders,
  provideHttpClient,
  withInterceptors,
} from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { reintentoInterceptor } from './retry.interceptor';

describe('reintentoInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([reintentoInterceptor])),
        provideHttpClientTesting(),
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    ctrl.verify();
    vi.useRealTimers();
  });

  const cuerpo = (code: string) => ({ error: { code, message: 'x' } });
  const respuesta503 = (retryAfter?: string) => ({
    status: 503,
    statusText: 'Service Unavailable',
    headers: new HttpHeaders(retryAfter ? { 'Retry-After': retryAfter } : {}),
  });

  it('reintenta una lectura saturada después de lo que indica Retry-After', () => {
    let resultado: unknown;
    http.get('/api/v1/events').subscribe((r) => (resultado = r));

    ctrl.expectOne('/api/v1/events').flush(cuerpo('SERVICIO_SATURADO'), respuesta503('2'));
    ctrl.expectNone('/api/v1/events');
    vi.advanceTimersByTime(1999);
    ctrl.expectNone('/api/v1/events');
    vi.advanceTimersByTime(1);

    ctrl.expectOne('/api/v1/events').flush({ ok: true });
    expect(resultado).toEqual({ ok: true });
  });

  it('también reintenta cuando el servicio no está disponible', () => {
    http.get('/api/v1/events').subscribe();

    ctrl.expectOne('/api/v1/events').flush(cuerpo('SERVICIO_NO_DISPONIBLE'), respuesta503('1'));
    vi.advanceTimersByTime(1000);

    ctrl.expectOne('/api/v1/events').flush({});
  });

  it('reintenta una sola vez: si vuelve a fallar entrega el error', () => {
    let status = 0;
    http.get('/api/v1/events').subscribe({ error: (e) => (status = e.status) });

    ctrl.expectOne('/api/v1/events').flush(cuerpo('SERVICIO_SATURADO'), respuesta503('1'));
    vi.advanceTimersByTime(1000);
    ctrl.expectOne('/api/v1/events').flush(cuerpo('SERVICIO_SATURADO'), respuesta503('1'));
    vi.advanceTimersByTime(10_000);

    expect(status).toBe(503);
  });

  it('sin Retry-After espera 1 segundo', () => {
    http.get('/api/v1/events').subscribe();

    ctrl.expectOne('/api/v1/events').flush(cuerpo('SERVICIO_SATURADO'), respuesta503());
    vi.advanceTimersByTime(999);
    ctrl.expectNone('/api/v1/events');
    vi.advanceTimersByTime(1);

    ctrl.expectOne('/api/v1/events').flush({});
  });

  it('limita la espera a 5 segundos aunque Retry-After pida más', () => {
    http.get('/api/v1/events').subscribe();

    ctrl.expectOne('/api/v1/events').flush(cuerpo('SERVICIO_SATURADO'), respuesta503('120'));
    vi.advanceTimersByTime(5000);

    ctrl.expectOne('/api/v1/events').flush({});
  });

  it('no reintenta escrituras', () => {
    let status = 0;
    http.post('/api/v1/events/1/reservations', {}).subscribe({ error: (e) => (status = e.status) });

    ctrl
      .expectOne('/api/v1/events/1/reservations')
      .flush(cuerpo('SERVICIO_SATURADO'), respuesta503('1'));
    vi.advanceTimersByTime(10_000);

    expect(status).toBe(503);
  });

  it('no reintenta un 503 sin código conocido ni otros errores', () => {
    let status = 0;
    http.get('/api/v1/a').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/v1/a').flush(cuerpo('OTRO'), respuesta503('1'));
    vi.advanceTimersByTime(10_000);
    expect(status).toBe(503);

    http.get('/api/v1/b').subscribe({ error: (e) => (status = e.status) });
    ctrl.expectOne('/api/v1/b').flush({}, { status: 500, statusText: 'Error' });
    vi.advanceTimersByTime(10_000);
    expect(status).toBe(500);
  });

  it('no toca pedidos que no son de la API', () => {
    let status = 0;
    http.get('/assets/x.json').subscribe({ error: (e) => (status = e.status) });

    ctrl.expectOne('/assets/x.json').flush(cuerpo('SERVICIO_SATURADO'), respuesta503('1'));
    vi.advanceTimersByTime(10_000);

    expect(status).toBe(503);
  });
});