import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthService } from './auth.service';

const API = '/api/v1/auth';

describe('AuthService', () => {
  let service: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('arranca sin sesión', () => {
    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });

  it('login guarda usuario y token en memoria y envía credenciales', () => {
    service.login('ana@mail.com', 'Clave1234').subscribe();

    const req = http.expectOne(`${API}/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ email: 'ana@mail.com', password: 'Clave1234' });
    req.flush({ user: { id: 'u1', email: 'ana@mail.com', role: 'USUARIO' }, accessToken: 'tok1' });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.accessToken()).toBe('tok1');
    expect(service.role()).toBe('USUARIO');
  });

  it('login no guarda nada en localStorage ni sessionStorage', () => {
    service.login('ana@mail.com', 'Clave1234').subscribe();
    http.expectOne(`${API}/login`).flush({
      user: { id: 'u1', email: 'ana@mail.com', role: 'USUARIO' },
      accessToken: 'tok1',
    });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('un login fallido no deja sesión', () => {
    let status = 0;
    service.login('ana@mail.com', 'mala').subscribe({ error: (e) => (status = e.status) });

    http
      .expectOne(`${API}/login`)
      .flush({ error: { code: 'CREDENCIALES_INVALIDAS' } }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(service.isAuthenticated()).toBe(false);
  });

  it('register no inicia sesión', () => {
    service.register('ana@mail.com', 'Clave1234').subscribe();

    const req = http.expectOne(`${API}/register`);
    req.flush({ user: { id: 'u1', email: 'ana@mail.com', role: 'USUARIO' } });

    expect(service.isAuthenticated()).toBe(false);
  });

  it('refresh actualiza el token y, si falla, limpia la sesión', () => {
    service.login('ana@mail.com', 'Clave1234').subscribe();
    http.expectOne(`${API}/login`).flush({
      user: { id: 'u1', email: 'ana@mail.com', role: 'USUARIO' },
      accessToken: 'tok1',
    });

    service.refresh().subscribe();
    const ok = http.expectOne(`${API}/refresh`);
    expect(ok.request.withCredentials).toBe(true);
    ok.flush({ accessToken: 'tok2' });
    expect(service.accessToken()).toBe('tok2');

    service.refresh().subscribe({ error: () => undefined });
    http
      .expectOne(`${API}/refresh`)
      .flush({ error: { code: 'REFRESH_INVALIDO' } }, { status: 401, statusText: 'Unauthorized' });
    expect(service.isAuthenticated()).toBe(false);
    expect(service.accessToken()).toBeNull();
  });

  it('logout limpia la sesión aunque el servidor falle', () => {
    service.login('ana@mail.com', 'Clave1234').subscribe();
    http.expectOne(`${API}/login`).flush({
      user: { id: 'u1', email: 'ana@mail.com', role: 'USUARIO' },
      accessToken: 'tok1',
    });

    service.logout().subscribe();
    const req = http.expectOne(`${API}/logout`);
    expect(req.request.withCredentials).toBe(true);
    req.flush(null, { status: 500, statusText: 'Error' });

    expect(service.isAuthenticated()).toBe(false);
  });

  it('restoreSession recupera usuario y token usando la cookie', () => {
    service.restoreSession().subscribe();

    http.expectOne(`${API}/refresh`).flush({ accessToken: 'tok9' });
    http
      .expectOne(`${API}/me`)
      .flush({ user: { id: 'u1', email: 'ana@mail.com', role: 'ADMIN' } });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.role()).toBe('ADMIN');
  });

  it('restoreSession sin cookie válida termina sin error y sin sesión', () => {
    let terminado = false;
    service.restoreSession().subscribe(() => (terminado = true));

    http
      .expectOne(`${API}/refresh`)
      .flush({ error: { code: 'REFRESH_INVALIDO' } }, { status: 401, statusText: 'Unauthorized' });

    expect(terminado).toBe(true);
    expect(service.isAuthenticated()).toBe(false);
  });
  it('loginWithGoogle envía el idToken con credenciales y guarda la sesión', () => {
    service.loginWithGoogle('id-token-123').subscribe();

    const req = http.expectOne(`${API}/google`);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBe(true);
    expect(req.request.body).toEqual({ idToken: 'id-token-123' });
    req.flush({ user: { id: 'u1', email: 'ana@mail.com', role: 'USUARIO' }, accessToken: 'tokG' });

    expect(service.isAuthenticated()).toBe(true);
    expect(service.accessToken()).toBe('tokG');
  });

  it('loginWithGoogle fallido no deja sesión', () => {
    let status = 0;
    service.loginWithGoogle('malo').subscribe({ error: (e) => (status = e.status) });

    http
      .expectOne(`${API}/google`)
      .flush({ error: { code: 'GOOGLE_INVALIDO' } }, { status: 401, statusText: 'Unauthorized' });

    expect(status).toBe(401);
    expect(service.isAuthenticated()).toBe(false);
  });
});