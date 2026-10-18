import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { authInterceptor } from './auth.interceptor';

describe('authInterceptor', () => {
  let http: HttpClient;
  let ctrl: HttpTestingController;
  let token: string | null;
  let auth: {
    accessToken: () => string | null;
    refresh: ReturnType<typeof vi.fn>;
    clearSession: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(() => {
    token = 'tok1';
    auth = {
      accessToken: () => token,
      refresh: vi.fn(),
      clearSession: vi.fn(),
    };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
      ],
    });
    http = TestBed.inject(HttpClient);
    ctrl = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => ctrl.verify());

  it('agrega el Bearer a los pedidos a la API cuando hay token', () => {
    http.get('/api/v1/events').subscribe();

    const req = ctrl.expectOne('/api/v1/events');
    expect(req.request.headers.get('Authorization')).toBe('Bearer tok1');
    req.flush([]);
  });

  it('no agrega el header si no hay token', () => {
    token = null;
    http.get('/api/v1/events').subscribe();

    const req = ctrl.expectOne('/api/v1/events');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush([]);
  });

  it('no toca pedidos que no son de la API', () => {
    http.get('/assets/logo.svg').subscribe();

    const req = ctrl.expectOne('/assets/logo.svg');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush('');
  });

  it('no agrega el header a login, register ni refresh', () => {
    http.post('/api/v1/auth/login', {}).subscribe({ error: () => undefined });
    const req = ctrl.expectOne('/api/v1/auth/login');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(auth.refresh).not.toHaveBeenCalled();
  });

  it('ante un 401 renueva el token y reintenta con el token nuevo', () => {
    auth.refresh.mockImplementation(() => {
      token = 'tok2';
      return of({ accessToken: 'tok2' });
    });
    let resultado: unknown;
    http.get('/api/v1/events').subscribe((r) => (resultado = r));

    ctrl.expectOne('/api/v1/events').flush({}, { status: 401, statusText: 'Unauthorized' });

    const reintento = ctrl.expectOne('/api/v1/events');
    expect(reintento.request.headers.get('Authorization')).toBe('Bearer tok2');
    reintento.flush({ ok: true });
    expect(resultado).toEqual({ ok: true });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('si el reintento también da 401 no vuelve a renovar', () => {
    auth.refresh.mockReturnValue(of({ accessToken: 'tok2' }));
    let status = 0;
    http.get('/api/v1/events').subscribe({ error: (e) => (status = e.status) });

    ctrl.expectOne('/api/v1/events').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/events').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('si la renovación falla limpia la sesión y navega a /login', () => {
    auth.refresh.mockReturnValue(throwError(() => ({ status: 401 })));
    let status = 0;
    http.get('/api/v1/events').subscribe({ error: (e) => (status = e.status) });

    ctrl.expectOne('/api/v1/events').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(auth.clearSession).toHaveBeenCalled();
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login');
  });

  it('varios 401 simultáneos comparten una sola renovación', () => {
    auth.refresh.mockImplementation(() => {
      token = 'tok2';
      return of({ accessToken: 'tok2' });
    });
    http.get('/api/v1/a').subscribe();
    http.get('/api/v1/b').subscribe();

    ctrl.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    ctrl.expectOne('/api/v1/b').flush({}, { status: 401, statusText: 'Unauthorized' });

    expect(auth.refresh).toHaveBeenCalledTimes(1);
    ctrl.expectOne('/api/v1/a').flush({});
    ctrl.expectOne('/api/v1/b').flush({});
  });

  it('otros errores (403, 500) pasan sin renovar', () => {
    let status = 0;
    http.get('/api/v1/events').subscribe({ error: (e) => (status = e.status) });

    ctrl.expectOne('/api/v1/events').flush({}, { status: 403, statusText: 'Forbidden' });

    expect(status).toBe(403);
    expect(auth.refresh).not.toHaveBeenCalled();
  });
});