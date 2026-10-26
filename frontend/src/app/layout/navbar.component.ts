import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule],
  template: `
    @if (user()) {
      <mat-toolbar>
        <a routerLink="/inicio" class="marca">CupoYa</a>
        <nav class="enlaces" aria-label="Principal">
          <a mat-button routerLink="/eventos" routerLinkActive="activo">Eventos</a>
          <a mat-button routerLink="/reservas" routerLinkActive="activo">Mis reservas</a>
          @if (esAdmin()) {
            <a mat-button routerLink="/reportes" routerLinkActive="activo">Reportes</a>
            <a mat-button routerLink="/usuarios" routerLinkActive="activo">Usuarios</a>
          }
        </nav>
        <span class="espacio"></span>
        <span class="usuario">{{ user()?.email }} · {{ role() }}</span>
        <button mat-stroked-button type="button" (click)="salir()">Cerrar sesión</button>
      </mat-toolbar>
    }
  `,
  styles: `
    mat-toolbar {
      gap: 0.5rem;
      flex-wrap: wrap;
    }
    .marca {
      font-weight: 700;
      color: inherit;
      text-decoration: none;
      margin-right: 1rem;
    }
    .enlaces {
      display: flex;
      gap: 0.25rem;
      flex-wrap: wrap;
    }
    .activo {
      text-decoration: underline;
    }
    .espacio {
      flex: 1 1 auto;
    }
    .usuario {
      font-size: 0.875rem;
    }
  `,
})
export class NavbarComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly role = this.auth.role;
  readonly esAdmin = computed(() => this.auth.role() === 'ADMIN');

  salir(): void {
    this.auth.logout().subscribe(() => this.router.navigateByUrl('/login'));
  }
}