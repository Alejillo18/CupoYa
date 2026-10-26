import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { errorInterceptor } from './error.interceptor';
import { NotificationService } from './notification.service';

describe('errorInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  const notif = { error: vi.fn() };

  beforeEach(() => {
    notif.error.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor])),
        provideHttpClientTesting(),
        { provide: NotificationService, useValue: notif },
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
  });

  afterEach(() => ctrl.verify());

  function fallar(status: number, statusText = '') {
    let recibido: unknown;
    http.get('/api/v1/x').subscribe({ error: (e) => (recibido = e) });
    ctrl.expectOne('/api/v1/x').flush({ error: { code: 'X' } }, { status, statusText });
    return recibido;
  }

  it('avisa cuando no hay conexión (status 0)', () => {
    http.get('/api/v1/x').subscribe({ error: () => {} });
    ctrl.expectOne('/api/v1/x').error(new ProgressEvent('error'), { status: 0 });
    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('conexión'));
  });

  it('avisa ante 429', () => {
    fallar(429, 'Too Many Requests');
    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('Demasiados'));
  });

  it.each([500, 502, 503])('avisa ante %i', (status) => {
    fallar(status);
    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('servidor'));
  });

  it.each([400, 401, 403, 404, 409, 423])('no avisa ante %i (lo maneja cada pantalla)', (status) => {
    fallar(status);
    expect(notif.error).not.toHaveBeenCalled();
  });

  it('vuelve a lanzar el error para que el componente lo maneje', () => {
    const e = fallar(500) as { status: number };
    expect(e.status).toBe(500);
  });

  it('no avisa si la respuesta es exitosa', () => {
    http.get('/api/v1/x').subscribe();
    ctrl.expectOne('/api/v1/x').flush({});
    expect(notif.error).not.toHaveBeenCalled();
  });
});