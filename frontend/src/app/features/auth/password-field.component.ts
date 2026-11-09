import { Component, input, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

// Campo de contraseña con botón de ojo para ver lo que se escribe.
@Component({
  selector: 'app-password-field',
  imports: [ReactiveFormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './password-field.component.html',
  styleUrl: './password-field.component.css',
})
export class PasswordFieldComponent {
  readonly control = input.required<FormControl<string>>();
  readonly etiqueta = input('Contraseña');
  readonly autocomplete = input('current-password');
  readonly ayuda = input('');
  readonly error = input('');
  // Por defecto el error aparece cuando el campo es inválido y se tocó.
  readonly matcher = input<ErrorStateMatcher>(new ErrorStateMatcher());

  readonly visible = signal(false);

  alternar(): void {
    this.visible.update((v) => !v);
  }
}