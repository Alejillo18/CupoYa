import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { NotificationService } from '../../core/notification.service';
import { LoginComponent } from './login.component';

describe('LoginComponent', () => {
  let auth: { login: ReturnType<typeof vi.fn> };
  let notif: { error: ReturnType<typeof vi.fn> };
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
    notif = { error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: auth },
        { provide: NotificationService, useValue: notif },
      ],
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

  it('con un formulario inválido muestra los mensajes de validación', () => {
    const fixture = crear();
    completar(fixture, 'no-es-email', '');

    fixture.componentInstance.submit();
    fixture.detectChanges();
    fixture.detectChanges();

    const texto = fixture.nativeElement.textContent;
    expect(texto).toContain('Ingresá un email válido');
    expect(texto).toContain('Ingresá tu contraseña');
  });

  it('con datos válidos llama a login y navega a /inicio', () => {
    auth.login.mockReturnValue(of({ user: {}, accessToken: 't' }));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();

    expect(auth.login).toHaveBeenCalledWith('ana@mail.com', 'Clave1234');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/inicio');
  });

  it('con 401 notifica credenciales incorrectas', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 401 })));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'mala12345');

    fixture.componentInstance.submit();

    expect(notif.error).toHaveBeenCalledWith('Email o contraseña incorrectos.');
    expect(fixture.componentInstance.loading()).toBe(false);
  });

  it('con 423 notifica cuenta bloqueada', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 423 })));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('bloqueada'));
  });

  it('con otro error 4xx notifica un mensaje genérico', () => {
    auth.login.mockReturnValue(throwError(() => ({ status: 400 })));
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('Ocurrió un error'));
  });

  it.each([0, 429, 500, 503])(
    'con %i no notifica (ya lo avisa el interceptor) y libera el botón',
    (status) => {
      auth.login.mockReturnValue(throwError(() => ({ status })));
      const fixture = crear();
      completar(fixture, 'ana@mail.com', 'Clave1234');

      fixture.componentInstance.submit();

      expect(notif.error).not.toHaveBeenCalled();
      expect(fixture.componentInstance.loading()).toBe(false);
    },
  );

  it('el botón se deshabilita mientras carga', () => {
    auth.login.mockReturnValue(of());
    const fixture = crear();
    completar(fixture, 'ana@mail.com', 'Clave1234');

    fixture.componentInstance.submit();
    fixture.detectChanges();

    const boton = fixture.nativeElement.querySelector('button[type="submit"]') as HTMLButtonElement;
    expect(boton.disabled).toBe(true);
  });

  it('muestra el aviso de cuenta creada cuando llega ?registrado=1', () => {
    const fixture = TestBed.createComponent(LoginComponent);
    fixture.componentRef.setInput('registrado', '1');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Cuenta creada');
  });

  it('no muestra el aviso sin el parámetro', () => {
    const fixture = crear();

    expect(fixture.nativeElement.textContent).not.toContain('Cuenta creada');
  });
});