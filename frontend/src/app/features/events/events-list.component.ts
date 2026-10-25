import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { EventItem, EventsService } from '../../core/events.service';

const PAGE_SIZE = 10;

@Component({
  selector: 'app-events-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './events-list.component.html',
  styleUrl: '../auth/auth.css',
})
export class EventsListComponent implements OnInit {
  private readonly events = inject(EventsService);
  private readonly auth = inject(AuthService);

  readonly items = signal<EventItem[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.total() / PAGE_SIZE)));
  readonly hayAnterior = computed(() => this.page() > 1);
  readonly haySiguiente = computed(() => this.page() < this.totalPages());
  readonly puedeGestionar = computed(() => {
    const r = this.auth.role();
    return r === 'OPERADOR' || r === 'ADMIN';
  });

  ngOnInit(): void {
    this.cargar(1);
  }

  cargar(page: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.events.list(page, PAGE_SIZE).subscribe({
      next: (r) => {
        this.items.set(r.items);
        this.total.set(r.total);
        this.page.set(r.page);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No pudimos cargar los eventos. Intentá de nuevo.');
      },
    });
  }

  siguiente(): void {
    if (this.haySiguiente()) this.cargar(this.page() + 1);
  }

  anterior(): void {
    if (this.hayAnterior()) this.cargar(this.page() - 1);
  }

  cancelar(evento: EventItem): void {
    if (!window.confirm(`¿Cancelar el evento "${evento.name}"?`)) return;
    this.events.cancel(evento.id).subscribe({
      next: () => this.cargar(this.page()),
      error: () => this.error.set('No pudimos cancelar el evento. Intentá de nuevo.'),
    });
  }
}