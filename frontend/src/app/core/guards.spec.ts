import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, Router, RouterStateSnapshot, UrlTree, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import { AuthService, Role } from './auth.service';
import { authGuard, guestGuard, roleGuard } from './guards';

describe('guards', () => {
  const autenticado = signal(false);
  const rol = signal<Role | null>(null);
  let router: Router;

  const ejecutar = (guard: ReturnType<typeof roleGuard> | typeof authGuard) =>
    TestBed.runInInjectionContext(() =>
      guard({} as ActivatedRouteSnapshot, {} as RouterStateSnapshot),
    );

  beforeEach(() => {
    autenticado.set(false);
    rol.set(null);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { isAuthenticated: autenticado, role: rol } },
      ],
    });
    router = TestBed.inject(Router);
  });

  describe('authGuard', () => {
    it('sin sesión redirige a /login', () => {
      const r = ejecutar(authGuard) as UrlTree;
      expect(router.serializeUrl(r)).toBe('/login');
    });

    it('con sesión deja pasar', () => {
      autenticado.set(true);
      expect(ejecutar(authGuard)).toBe(true);
    });
  });

  describe('guestGuard', () => {
    it('sin sesión deja pasar', () => {
      expect(ejecutar(guestGuard)).toBe(true);
    });

    it('con sesión redirige a /inicio', () => {
      autenticado.set(true);
      const r = ejecutar(guestGuard) as UrlTree;
      expect(router.serializeUrl(r)).toBe('/inicio');
    });
  });

  describe('roleGuard', () => {
    it('sin sesión redirige a /login', () => {
      const r = ejecutar(roleGuard('ADMIN')) as UrlTree;
      expect(router.serializeUrl(r)).toBe('/login');
    });

    it('con rol permitido deja pasar', () => {
      autenticado.set(true);
      rol.set('OPERADOR');
      expect(ejecutar(roleGuard('OPERADOR', 'ADMIN'))).toBe(true);
    });

    it('con rol no permitido redirige a /inicio', () => {
      autenticado.set(true);
      rol.set('USUARIO');
      const r = ejecutar(roleGuard('ADMIN')) as UrlTree;
      expect(router.serializeUrl(r)).toBe('/inicio');
    });
  });
});