import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Role } from '../../core/auth.service';
import { ManagedUser, UsersService } from '../../core/users.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-users-list',
  imports: [RouterLink],
  templateUrl: './users-list.component.html',
  styleUrl: '../auth/auth.css',
})
export class UsersListComponent implements OnInit {
  private readonly users = inject(UsersService);

  readonly roles: Role[] = ['USUARIO', 'OPERADOR', 'ADMIN'];
  readonly items = signal<ManagedUser[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly hayAnterior = computed(() => this.page() > 1);
  readonly haySiguiente = computed(() => this.page() < this.totalPages());

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

  siguiente(): void {
    if (this.haySiguiente()) this.cargar(this.page() + 1);
  }

  anterior(): void {
    if (this.hayAnterior()) this.cargar(this.page() - 1);
  }

  cambiarRol(usuario: ManagedUser, role: Role): void {
    this.error.set(null);
    this.users.changeRole(usuario.id, role).subscribe({
      next: (actualizado) =>
        this.items.update((lista) => lista.map((u) => (u.id === actualizado.id ? actualizado : u))),
      error: (err) => {
        // Se vuelve a pintar la lista para que el selector recupere el rol real.
        this.items.update((lista) => [...lista]);
        this.error.set(
          err?.error?.error?.code === 'ULTIMO_ADMIN'
            ? 'Debe quedar al menos un administrador en el sistema.'
            : 'No pudimos cambiar el rol. Intentá de nuevo.',
        );
      },
    });
  }

  alCambiar(usuario: ManagedUser, evento: Event): void {
    this.cambiarRol(usuario, (evento.target as HTMLSelectElement).value as Role);
  }
}