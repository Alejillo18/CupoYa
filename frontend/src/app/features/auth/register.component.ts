import { Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ErrorStateMatcher } from '@angular/material/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeGlobal } from '../../core/error.interceptor';
import { NotificationService } from '../../core/notification.service';
import { GoogleButtonComponent } from './google-button.component';
import { PasswordFieldComponent } from './password-field.component';

function coinciden(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  return password === confirm ? null : { noCoinciden: true };
}

@Component({
  selector: 'app-register',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    GoogleButtonComponent,
    PasswordFieldComponent,
  ],
  templateUrl: './register.component.html',
  styleUrl: './auth-form.css',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notif = inject(NotificationService);

  readonly loading = signal(false);

  readonly form = this.fb.nonNullable.group(
    {
      email: ['', [Validators.required, Validators.email, Validators.maxLength(254)]],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(8),
          Validators.maxLength(72),
          Validators.pattern(/[A-Za-z]/),
          Validators.pattern(/[0-9]/),
        ],
      ],
      confirm: ['', [Validators.required]],
    },
    { validators: coinciden },
  );

  // El error "no coinciden" es del grupo, no del campo: este matcher lo muestra en "Repetir contraseña".
  readonly matcherConfirm: ErrorStateMatcher = {
    isErrorState: (control) =>
      !!control && control.touched && (control.invalid || this.form.hasError('noCoinciden')),
  };

  private readonly valorPassword = toSignal(this.form.controls.password.valueChanges, {
    initialValue: '',
  });

  // Lista que se tilda mientras se escribe. Son las mismas reglas del validador de arriba.
  readonly requisitos = computed(() => {
    const valor = this.valorPassword();
    return [
      { texto: 'Al menos 8 caracteres', cumple: valor.length >= 8 },
      { texto: 'Una letra', cumple: /[A-Za-z]/.test(valor) },
      { texto: 'Un número', cumple: /[0-9]/.test(valor) },
    ];
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    const { email, password } = this.form.getRawValue();

    this.auth.register(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/login?registrado=1');
      },
      error: (err) => {
        this.loading.set(false);
        // Red, 429 y 5xx ya los avisa el interceptor: acá solo los errores de negocio.
        if (mensajeGlobal(err)) return;
        this.notif.error(this.mensaje(err?.status));
      },
    });
  }

  private mensaje(status: number): string {
    if (status === 409) return 'Ya existe una cuenta con ese email.';
    if (status === 400) return 'Revisá los datos ingresados.';
    return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}