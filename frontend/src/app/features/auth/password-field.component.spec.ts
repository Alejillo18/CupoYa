import { TestBed } from '@angular/core/testing';
import { FormControl, ValidatorFn, Validators } from '@angular/forms';
import { MatFormField } from '@angular/material/form-field';
import { By } from '@angular/platform-browser';
import { describe, expect, it } from 'vitest';
import { PasswordFieldComponent } from './password-field.component';

// fixture.nativeElement es `any`; con este ayudante queda tipado como HTMLElement.
const el = (f: { nativeElement: any }) => f.nativeElement as HTMLElement;

describe('PasswordFieldComponent', () => {
  function crear(
    opciones: {
      validators?: ValidatorFn[];
      etiqueta?: string;
      autocomplete?: string;
      ayuda?: string;
      error?: string;
      matcher?: { isErrorState: () => boolean };
    } = {},
  ) {
    const control = new FormControl('', {
      nonNullable: true,
      validators: opciones.validators ?? [],
    });
    const fixture = TestBed.createComponent(PasswordFieldComponent);
    fixture.componentRef.setInput('control', control);
    if (opciones.etiqueta) fixture.componentRef.setInput('etiqueta', opciones.etiqueta);
    if (opciones.autocomplete) fixture.componentRef.setInput('autocomplete', opciones.autocomplete);
    if (opciones.ayuda) fixture.componentRef.setInput('ayuda', opciones.ayuda);
    if (opciones.error) fixture.componentRef.setInput('error', opciones.error);
    if (opciones.matcher) fixture.componentRef.setInput('matcher', opciones.matcher);
    fixture.detectChanges();
    return { fixture, control };
  }

  const entrada = (f: { nativeElement: any }) => el(f).querySelector('input') as HTMLInputElement;
  const ojo = (f: { nativeElement: any }) =>
    el(f).querySelector('button.ojo') as HTMLButtonElement;

  it('arranca con la contraseña oculta', () => {
    const { fixture } = crear();

    expect(entrada(fixture).type).toBe('password');
    expect(ojo(fixture).getAttribute('aria-label')).toBe('Mostrar contraseña');
    expect(ojo(fixture).getAttribute('aria-pressed')).toBe('false');
  });

  it('el ojo muestra la contraseña', () => {
    const { fixture } = crear();

    ojo(fixture).click();
    fixture.detectChanges();

    expect(entrada(fixture).type).toBe('text');
    expect(ojo(fixture).getAttribute('aria-label')).toBe('Ocultar contraseña');
    expect(ojo(fixture).getAttribute('aria-pressed')).toBe('true');
  });

  it('tocar el ojo de nuevo la vuelve a ocultar', () => {
    const { fixture } = crear();

    ojo(fixture).click();
    fixture.detectChanges();
    ojo(fixture).click();
    fixture.detectChanges();

    expect(entrada(fixture).type).toBe('password');
    expect(ojo(fixture).getAttribute('aria-label')).toBe('Mostrar contraseña');
  });

  it('el ojo es un botón común: no envía el formulario', () => {
    const { fixture } = crear();

    expect(ojo(fixture).type).toBe('button');
  });

  it('mostrar la contraseña no altera lo escrito', () => {
    const { fixture, control } = crear();
    control.setValue('Clave1234');

    ojo(fixture).click();
    fixture.detectChanges();

    expect(entrada(fixture).value).toBe('Clave1234');
    expect(control.value).toBe('Clave1234');
  });

  it('lo que se escribe llega al control', () => {
    const { fixture, control } = crear();

    const input = entrada(fixture);
    input.value = 'Clave1234';
    input.dispatchEvent(new Event('input'));

    expect(control.value).toBe('Clave1234');
  });

  it('muestra la etiqueta recibida', () => {
    const { fixture } = crear({ etiqueta: 'Repetir contraseña' });

    expect(el(fixture).textContent).toContain('Repetir contraseña');
  });

  it('usa el autocomplete recibido', () => {
    const { fixture } = crear({ autocomplete: 'new-password' });

    expect(entrada(fixture).getAttribute('autocomplete')).toBe('new-password');
  });

  it('muestra la ayuda mientras no hay error', () => {
    const { fixture } = crear({ ayuda: 'Mínimo 8 caracteres' });

    expect(el(fixture).textContent).toContain('Mínimo 8 caracteres');
  });

  it('no muestra el error antes de que el campo se toque', () => {
    const { fixture } = crear({ validators: [Validators.required], error: 'Ingresá tu contraseña.' });

    expect(el(fixture).textContent).not.toContain('Ingresá tu contraseña.');
  });

  it('muestra el error cuando el campo es inválido y se tocó', () => {
    const { fixture, control } = crear({
      validators: [Validators.required],
      error: 'Ingresá tu contraseña.',
    });

    control.markAsTouched();
    fixture.detectChanges();
    fixture.detectChanges();

    expect(el(fixture).textContent).toContain('Ingresá tu contraseña.');
  });

  it('acepta un criterio propio para decidir cuándo mostrar el error', () => {
    const { fixture } = crear({ error: 'No coinciden.', matcher: { isErrorState: () => true } });

    fixture.detectChanges();
    fixture.detectChanges();

    expect(el(fixture).textContent).toContain('No coinciden.');
  });

  it('el mensaje de error ocupa su propio lugar y no pisa al campo siguiente', () => {
    const { fixture } = crear();

    const campo = fixture.debugElement.query(By.directive(MatFormField))
      .componentInstance as MatFormField;
    expect(campo.subscriptSizing).toBe('dynamic');
  });
});