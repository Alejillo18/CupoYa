import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, Role } from '../core/auth.service';
import { NavbarComponent } from './navbar.component';

describe('NavbarComponent', () => {
  const user = signal<{ email: string; role: Role } | null>(null);
  const rol = signal<Role | null>(null);
  let logout: ReturnType<typeof vi.fn>;

  function crear() {
    const fixture = TestBed.createComponent(NavbarComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    user.set({ email: 'ana@mail.com', role: 'USUARIO' });
    rol.set('USUARIO');
    logout = vi.fn().mockReturnValue(of(undefined));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: { user, role: rol, logout } },
      ],
    });
  });

  it('no muestra nada si no hay usuario logueado', () => {
    user.set(null);
    rol.set(null);

    const f = crear();

    expect(f.nativeElement.textContent.trim()).toBe('');
  });

  it('muestra el email y el rol del usuario', () => {
    const f = crear();

    const t = f.nativeElement.textContent;
    expect(t).toContain('ana@mail.com');
    expect(t).toContain('USUARIO');
  });

  it('un USUARIO ve Eventos y Mis reservas, pero no Reportes ni Usuarios', () => {
    const f = crear();

    const t = f.nativeElement.textContent;
    expect(t).toContain('Eventos');
    expect(t).toContain('Mis reservas');
    expect(t).not.toContain('Reportes');
    expect(t).not.toContain('Usuarios');
  });

  it('un ADMIN también ve Reportes y Usuarios', () => {
    user.set({ email: 'root@mail.com', role: 'ADMIN' });
    rol.set('ADMIN');

    const f = crear();

    const t = f.nativeElement.textContent;
    expect(t).toContain('Reportes');
    expect(t).toContain('Usuarios');
  });

  it('cerrar sesión llama al logout y vuelve al login', () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = crear();

    const boton = Array.from(f.nativeElement.querySelectorAll('button')).find((b: any) =>
      b.textContent.includes('Cerrar sesión'),
    ) as HTMLButtonElement;
    boton.click();

    expect(logout).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/login');
  });
  it('tiene un botón de menú para pantallas chicas', () => {
    const f = crear();

    expect(f.nativeElement.querySelector('button[aria-label="Menú"]')).toBeTruthy();
  });

  it('el menú desplegable muestra enlaces, usuario y permite cerrar sesión', async () => {
    const nav = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const f = crear();

    (f.nativeElement.querySelector('button[aria-label="Menú"]') as HTMLButtonElement).click();
    f.detectChanges();
    await f.whenStable();

    const items = Array.from(document.querySelectorAll('.mat-mdc-menu-item')) as HTMLElement[];
    const textos = items.map((i) => i.textContent ?? '');
    expect(textos.some((t) => t.includes('Eventos'))).toBe(true);
    expect(textos.some((t) => t.includes('Mis reservas'))).toBe(true);
    expect(textos.some((t) => t.includes('@'))).toBe(true);

    items.find((i) => (i.textContent ?? '').includes('Cerrar sesión'))!.click();

    expect(logout).toHaveBeenCalled();
    expect(nav).toHaveBeenCalledWith('/login');
  });
});