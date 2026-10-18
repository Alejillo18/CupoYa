import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let auth: { login: ReturnType<typeof vi.fn> };
  let router: Router;

  function crear() {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.detectChanges();
    return fixture;
  }

  function completar(fixture: ReturnType<typeof crear>, email: string, password: string) {
    const c = fixture.componentInstance;
    c.form.setValue({ email, password });
  }

  beforeEach(() => {
    auth = { login: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('no llama a la API si el formulario es inválido', () => {
    const fixture = crear();
    completar(fixture, 'no-es-email', '');

    fixture.componentInstance.submit();

    expect(auth.login).not.toHaveBeenCalled();
  });

  it('con datos válidos llama a login y navega a /inicio', () => {
    auth.login.mockReturnValue(of({ user: {}, accessToken: 't' }));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();

    expect(auth.login).toHaveBeenCalledWith('ana@mail.com', 'Clave1234');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inicio');
  });

  it('con 401 muestra el mensaje de credenciales incorrectas', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 401 })));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'mala12345');

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.error()).toBe('Email o contraseña incorrectos.');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('con 423 muestra el mensaje de cuenta bloqueada', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 423 })));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.error()).toContain('bloqueada');
  });

  it('con otro error muestra un mensaje genérico', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 500 })));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();

    expect(fixture.componentInstance.error()).toContain('Ocurrió un error');
  });

  it('el botón se deshabilita mientras carga', () => {
    auth.login.mockReturnValue(of());
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });
});