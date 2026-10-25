import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { UsersService } from './users.service';

const API = '/api/v1/users';
const crudo = {
  id: 'u1',
  email: 'ana@mail.com',
  role: 'USUARIO',
  lockedUntil: null,
  createdAt: '2026-10-01T00:00:00.000Z',
};

describe('UsersService', () => {
  let service: UsersService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(UsersService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('list envía page y pageSize', () => {
    let resultado: any;
    service.list(2, 10).subscribe((r) => (resultado = r));

    const req = http.expectOne((r) => r.url === API);
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('page')).toBe('2');
    expect(req.request.params.get('pageSize')).toBe('10');
    req.flush({ items: [crudo], total: 1, page: 2, pageSize: 10 });

    expect(resultado.total).toBe(1);
    expect(resultado.items[0].email).toBe('ana@mail.com');
  });

  it('marca como bloqueado al usuario con lockedUntil en el futuro', () => {
    let resultado: any;
    service.list().subscribe((r) => (resultado = r));
    const futuro = new Date(Date.now() + 600_000).toISOString();

    http
      .expectOne((r) => r.url === API)
      .flush({
        items: [crudo, { ...crudo, id: 'u2', lockedUntil: futuro }],
        total: 2,
        page: 1,
        pageSize: 20,
      });

    expect(resultado.items[0].bloqueado).toBe(false);
    expect(resultado.items[1].bloqueado).toBe(true);
  });

  it('changeRole hace PATCH con el rol y devuelve el usuario', () => {
    let resultado: any;
    service.changeRole('u1', 'OPERADOR').subscribe((r) => (resultado = r));

    const req = http.expectOne(`${API}/u1/role`);
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ role: 'OPERADOR' });
    req.flush({ user: { ...crudo, role: 'OPERADOR' } });

    expect(resultado.role).toBe('OPERADOR');
  });
});