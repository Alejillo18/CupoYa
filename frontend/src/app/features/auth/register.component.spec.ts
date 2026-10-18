import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../core/auth.service';
import { RegisterComponent } from './register.component';

describe('RegisterComponent', () => {
  let auth: { register: ReturnType<typeof vi.fn> };
  let router: Router;

  function crear() {
    const fixture = TestBed.createComponent(RegisterComponent);
    fixture.detectChanges();
    return fixture;
  }

  function completar(
    fixture: ReturnType<typeof crear>,
    email: string,
    password: string,
    confirm = password,
  ) {
    fixture.componentInstance.form.setValue({ email, password, confirm });
  }

  beforeEach(() => {
    auth = { register: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AuthService, useValue: auth }],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('rechaza contraseñas de menos de 8 caracteres', () => {
    const f = crear();
    completar(f, 'ana@mail.com', 'Ab1');
    expect(f.componentInstance.form.controls.password.invalid).toBe(true);
  });

  it('rechaza contraseñas sin números o sin letras', () => {
    const f = crear();
    completar(f, 'ana@mail.com', 'SoloLetras');
    expect(f.componentInstance.form.controls.password.invalid).toBe(true);
    completar(f, 'ana@mail.com', '12345678');
    expect(f.componentInstance.form.controls.password.invalid).toBe(true);
  });

  it('rechaza contraseñas de más de 72 caracteres', () => {
    const f = crear();
    completar(f, 'ana@mail.com', 'a1'.repeat(40));
    expect(f.componentInstance.form.controls.password.invalid).toBe(true);
  });

  it('acepta una contraseña válida', () => {
    const f = crear();
    completar(f, 'ana@mail.com', 'Clave1234');
    expect(f.componentInstance.form.valid).toBe(true);
  });

  it('marca error si las contraseñas no coinciden', () => {
    const f = crear();
    completar(f, 'ana@mail.com', 'Clave1234', 'Otra12345');
    expect(f.componentInstance.form.hasError('noCoinciden')).toBe(true);
  });

  it('no llama a la API si el formulario es inválido', () => {
    const f = crear();
    completar(f, 'no-es-email', 'Clave1234');

    f.componentInstance.submit();

    expect(auth.register).not.toHaveBeenCalled();
  });

  it('con datos válidos registra y navega a /login', () => {
    auth.register.mockReturnValue(of({ user: {} }));
    const f = crear();
    completar(f, 'ana@mail.com', 'Clave1234');

    f.componentInstance.submit();

    expect(auth.register).toHaveBeenCalledWith('ana@mail.com', 'Clave1234');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/login?registrado=1');
  });

  it('con 409 muestra que el email ya existe', () => {
    auth.register.mockReturnValue(throwError(() => ({ status: 409 })));
    const f = crear();
    completar(f, 'ana@mail.com', 'Clave1234');

    f.componentInstance.submit();

    expect(f.componentInstance.error()).toBe('Ya existe una cuenta con ese email.');
    expect(f.componentInstance.loading()).toBe(false);
  });

  it('con otro error muestra un mensaje genérico', () => {
    auth.register.mockReturnValue(throwError(() => ({ status: 500 })));
    const f = crear();
    completar(f, 'ana@mail.com', 'Clave1234');

    f.componentInstance.submit();

    expect(f.componentInstance.error()).toContain('Ocurrió un error');
  });
});