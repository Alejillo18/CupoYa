import { AfterViewInit, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { GoogleAuthService } from '../../core/google-auth.service';

@Component({
  selector: 'app-google-button',
  template: `
    <div class="google">
      <div #contenedor></div>
      @if (error()) {
        <p class="error" role="alert">{{ error() }}</p>
      }
    </div>
  `,
  styleUrl: './auth.css',
})
export class GoogleButtonComponent implements AfterViewInit {
  private readonly auth = inject(AuthService);
  private readonly google = inject(GoogleAuthService);
  private readonly router = inject(Router);

  private readonly contenedor = viewChild.required<ElementRef<HTMLElement>>('contenedor');
  readonly error = signal<string | null>(null);

  ngAfterViewInit(): void {
    void this.google.renderButton(this.contenedor().nativeElement, (idToken) =>
      this.ingresar(idToken),
    );
  }

  private ingresar(idToken: string): void {
    this.error.set(null);
    this.auth.loginWithGoogle(idToken).subscribe({
      next: () => this.router.navigateByUrl('/inicio'),
      error: (err) => this.error.set(this.mensaje(err?.status)),
    });
  }

  private mensaje(status: number): string {
    if (status === 401) return 'No pudimos verificar tu cuenta de Google.';
    if (status === 423) return 'Cuenta bloqueada temporalmente. Probá de nuevo más tarde.';
    return 'Ocurrió un error inesperado. Intentá de nuevo.';
  }
}