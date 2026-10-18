import { Component, inject, signal } from '@angular/core';
import {
  AbstractControl,
  FormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';

function coinciden(group: AbstractControl): ValidationErrors | null {
  const password = group.get('password')?.value;
  const confirm = group.get('confirm')?.value;
  return password === confirm ? null : { noCoinciden: true };
}

@Component({
  selector: 'app-register',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './auth.css',
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

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

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.register(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/login?registrado=1');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.mensaje(err?.status));
      },
    });
  }

  private mensaje(status: number): string {
    if (status === 409) return 'Ya existe una cuenta con ese email.';
    if (status === 400) return 'Revisá los datos ingresados.';
    return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}