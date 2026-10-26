import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeGlobal } from '../../core/error.interceptor';
import { NotificationService } from '../../core/notification.service';
import { GoogleButtonComponent } from './google-button.component';

@Component({
  selector: 'app-login',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    GoogleButtonComponent,
  ],
  templateUrl: './login.component.html',
  styleUrl: './auth-form.css',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly notif = inject(NotificationService);

  readonly loading = signal(false);
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
    const { email, password } = this.form.getRawValue();

    this.auth.login(email, password).subscribe({
      next: () => {
        this.loading.set(false);
        this.router.navigateByUrl('/inicio');
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
    if (status === 401) return 'Email o contraseña incorrectos.';
    if (status === 423) return 'Cuenta bloqueada temporalmente. Probá de nuevo más tarde.';
    return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}