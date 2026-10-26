import { AfterViewInit, Component, ElementRef, inject, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { mensajeGlobal } from '../../core/error.interceptor';
import { GoogleAuthService } from '../../core/google-auth.service';
import { NotificationService } from '../../core/notification.service';

@Component({
  selector: 'app-google-button',
  template: `
    <div class="google">
      <div #contenedor></div>
    </div>
  `,
  styles: `
    .google {
      display: flex;
      justify-content: center;
    }
  `,
})
export class GoogleButtonComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly google = inject(GoogleAuthService);
  private readonly router = inject(Router);
  private readonly notif = inject(NotificationService);

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');

  ngAfterViewInit(): void {
    void this.google.renderButton(this.contenedor().nativeElement, (idToken) =>
      this.ingresar(idToken),
    );
  }

  private ingresar(idToken: string): void {
    this.auth.loginWithGoogle(idToken).subscribe({
      next: () => this.router.navigateByUrl('/inicio'),
      error: (err) => {
        // Red, 429 y 5xx ya los avisa el interceptor: acá solo los errores de negocio.
        if (mensajeGlobal(err)) return;
        this.notif.error(this.mensaje(err?.status));
      },
    });
  }

  private mensaje(status: number): string {
    if (status === 401) return 'No pudimos verificar tu cuenta de Google.';
    if (status === 423) return 'Cuenta bloqueada temporalmente. Probá de nuevo más tarde.';
    return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}