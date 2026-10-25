import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { EventItem, EventsService } from '../../core/events.service';
import { ReservationsService } from '../../core/reservations.service';

const PAGE_SIZE = 10;

const MENSAJES: Record<string, string> = {
  CUPO_INSUFICIENTE: 'No hay lugares suficientes para este evento.',
  LIMITE_SUPERADO: 'Superás el máximo de 4 lugares por evento.',
  EVENTO_NO_DISPONIBLE: 'El evento está cancelado o ya pasó.',
  EVENTO_NO_ENCONTRADO: 'El evento no existe.',
  CANTIDAD_INVALIDA: 'La cantidad debe ser entre 1 y 4.',
};

@Component({
  selector: 'app-events-list',
  imports: [DatePipe, RouterLink],
  templateUrl: './events-list.component.html',
  styleUrl: '../auth/auth.css',
})
export class EventsListComponent implements OnInit {
  private readonly events = inject(EventsService);
  private readonly reservations = inject(ReservationsService);
  private readonly auth = inject(AuthService);

  readonly items = signal<EventItem[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly cantidades = signal<Record<string, number>>({});
  readonly opciones = [1, 2, 3, 4];

  // Una clave por intento: se reutiliza si falla la red, se descarta con una respuesta definitiva.
  private readonly claves = new Map<string, string>();

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

  cantidadDe(id: string): number {
    return this.cantidades()[id] ?? 1;
  }

  setCantidad(id: string, cantidad: number): void {
    this.cantidades.update((c) => ({ ...c, [id]: cantidad }));
  }

  alElegirCantidad(id: string, evento: Event): void {
    this.setCantidad(id, Number((evento.target as HTMLSelectElement).value));
  }

  reservar(evento: EventItem): void {
    this.error.set(null);
    this.aviso.set(null);
    const clave = this.claves.get(evento.id) ?? crypto.randomUUID();
    this.claves.set(evento.id, clave);

    this.reservations.reserve(evento.id, this.cantidadDe(evento.id), clave).subscribe({
      next: () => {
        this.claves.delete(evento.id);
        this.aviso.set(`Reserva confirmada para "${evento.name}".`);
        this.cargar(this.page());
      },
      error: (err) => {
        const codigo = err?.error?.error?.code as string | undefined;
        const definitivo = typeof err?.status === 'number' && err.status >= 400 && err.status < 500;
        if (definitivo) this.claves.delete(evento.id);
        this.error.set(
          (codigo && MENSAJES[codigo]) || 'Ocurrió un error inesperado. Intentá de nuevo.',
        );
      },
    });
  }

  cancelar(evento: EventItem): void {
    if (!window.confirm(`¿Cancelar el evento "${evento.name}"?`)) return;
    this.events.cancel(evento.id).subscribe({
      next: () => this.cargar(this.page()),
      error: () => this.error.set('No pudimos cancelar el evento. Intentá de nuevo.'),
    });
  }
}