import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, Role } from '../../core/auth.service';
import { HomeComponent } from './home.component';

describe('HomeComponent', () => {
  const rol = signal<Role>('OPERADOR');
  let auth: {
    user: ReturnType<typeof signal>;
    role: typeof rol;
    logout: ReturnType<typeof vi.fn>;
  };

  function crear() {
    const fixture = TestBed.createComponent(HomeComponent);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    rol.set('OPERADOR');
    auth = {
      user: signal({ id: 'u1', email: 'ana@mail.com', role: 'OPERADOR' }),
      role: rol,
      logout: vi.fn().mockReturnValue(of(undefined)),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
  });

  it('muestra el email y el rol del usuario', () => {
    const texto = crear().nativeElement.textContent;

    expect(texto).toContain('ana@mail.com');
    expect(texto).toContain('OPERADOR');
  });

  it('ofrece ir a los eventos y a las reservas', () => {
    const texto = crear().nativeElement.textContent;

    expect(texto).toContain('Ver eventos');
    expect(texto).toContain('Mis reservas');
  });

  it('no tiene su propio botón de cerrar sesión (lo ofrece la barra)', () => {
    const texto = crear().nativeElement.textContent;

    expect(texto).not.toContain('Cerrar sesión');
  });

  it('un ADMIN no ve enlaces de administración repetidos (están en la barra)', () => {
    rol.set('ADMIN');

    const texto = crear().nativeElement.textContent;

    expect(texto).not.toContain('Administrar usuarios');
    expect(texto).not.toContain('Reportes de ocupación');
  });
});