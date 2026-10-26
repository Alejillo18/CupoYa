import { Component, computed, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatToolbarModule } from '@angular/material/toolbar';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-navbar',
  imports: [RouterLink, RouterLinkActive, MatToolbarModule, MatButtonModule, MatMenuModule],
  template: `
    @if (user()) {
      <mat-toolbar>
        <a routerLink="/inicio" class="marca">CupoYa</a>

        <nav class="enlaces solo-ancho" aria-label="Principal">
          <a mat-button routerLink="/eventos" routerLinkActive="activo">Eventos</a>
          <a mat-button routerLink="/reservas" routerLinkActive="activo">Mis reservas</a>
          @if (esAdmin()) {
            <a mat-button routerLink="/reportes" routerLinkActive="activo">Reportes</a>
            <a mat-button routerLink="/usuarios" routerLinkActive="activo">Usuarios</a>
          }
        </nav>

        <span class="espacio"></span>

        <span class="usuario solo-ancho">{{ user()?.email }} · {{ role() }}</span>
        <button class="solo-ancho" mat-stroked-button type="button" (click)="salir()">
          Cerrar sesión
        </button>

        <button
          class="solo-angosto"
          mat-icon-button
          type="button"
          aria-label="Menú"
          [matMenuTriggerFor]="menu"
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path fill="currentColor" d="M3 6h18v2H3V6zm0 5h18v2H3v-2zm0 5h18v2H3v-2z" />
          </svg>
        </button>
      </mat-toolbar>

      <mat-menu #menu="matMenu" xPosition="before">
        <div class="menu-usuario" mat-menu-item disabled>
          {{ user()?.email }} · {{ role() }}
        </div>
        <a mat-menu-item routerLink="/eventos">Eventos</a>
        <a mat-menu-item routerLink="/reservas">Mis reservas</a>
        @if (esAdmin()) {
          <a mat-menu-item routerLink="/reportes">Reportes</a>
          <a mat-menu-item routerLink="/usuarios">Usuarios</a>
        }
        <button mat-menu-item type="button" (click)="salir()">Cerrar sesión</button>
      </mat-menu>
    }
  `,
  styles: `
  mat-toolbar {
    height: auto;
    min-height: 64px;
    padding: 0.25rem 1rem;
    gap: 0.5rem;
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
    flex-shrink: 0;
  }
  .activo {
    text-decoration: underline;
  }
  .espacio {
    flex: 1 1 auto;
  }
  .usuario {
    font-size: 0.875rem;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .solo-angosto {
    display: none;
  }
  .menu-usuario {
    font-size: 0.8rem;
    opacity: 0.8;
  }
  @media (max-width: 1100px) {
    .solo-ancho {
      display: none;
    }
    .solo-angosto {
      display: inline-flex;
    }
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