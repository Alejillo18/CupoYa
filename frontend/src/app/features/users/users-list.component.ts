import { Component, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { Role } from '../../core/auth.service';
import { mensajeGlobal } from '../../core/error.interceptor';
import { NotificationService } from '../../core/notification.service';
import { ManagedUser, UsersService } from '../../core/users.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-users-list',
  imports: [
    MatTableModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatButtonModule,
  ],
  templateUrl: './users-list.component.html',
  styleUrl: '../../shared/pagina.css',
})
export class UsersListComponent implements OnInit {
  private readonly users = inject(UsersService);
  private readonly notif = inject(NotificationService);

  readonly pageSize = PAGE_SIZE;
  readonly roles: Role[] = ['USUARIO', 'OPERADOR', 'ADMIN'];
  readonly columnas = ['email', 'role', 'estado'];
  readonly items = signal<ManagedUser[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.cargar(1);
  }

  cargar(page: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.users.list(page, PAGE_SIZE).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.page.set(r.page);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No pudimos cargar los usuarios. Intentá de nuevo.');
      },
    });
  }

  alPaginar(evento: PageEvent): void {
    this.cargar(evento.pageIndex + 1);
  }

  cambiarRol(usuario: ManagedUser, role: Role): void {
    this.users.changeRole(usuario.id, role).subscribe({
      next: (actualizado) => {
        this.items.update((lista) => lista.map((u) => (u.id === actualizado.id ? actualizado : u)));
        this.notif.success(`${actualizado.email} ahora es ${actualizado.role}.`);
      },
      error: (err) => {
        // Objeto nuevo: Angular recrea la fila y el selector recupera el rol real.
        this.items.update((lista) => lista.map((u) => (u.id === usuario.id ? { ...u } : u)));
        // Red, 429 y 5xx ya los avisa el interceptor: acá solo los errores de negocio.
        if (mensajeGlobal(err)) return;
        this.notif.error(
          err?.error?.error?.code === 'ULTIMO_ADMIN'
            ? 'Debe quedar al menos un administrador en el sistema.'
            : 'No pudimos cambiar el rol. Intentá de nuevo.',
        );
      },
    });
  }
}