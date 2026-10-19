import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { Component, inject, input, signal } from '@angular/core';
import { GoogleButtonComponent } from './google-button.component';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, RouterLink, GoogleButtonComponent],
  templateUrl: './login.component.html',
  styleUrl: './auth.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly registrado = input<string | undefined>();

  readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  submit(): void {
    if (this.form.invalid || this.loading()) {
      this.form.markAllAsTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/inicio');
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(this.mensaje(err?.status));
      },
    });
  }

  private mensaje(status: number): string {
    if (status === 401) return 'Email o contraseña incorrectos.';
    if (status === 423) return 'Cuenta bloqueada temporalmente. Probá de nuevo más tarde.';
    return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}