import { DatePipe } from '@angular/common';
import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { mensajeGlobal } from '../../core/error.interceptor';
import { EventItem, EventsService } from '../../core/events.service';
import { NotificationService } from '../../core/notification.service';
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
  imports: [
    DatePipe,
    RouterLink,
    MatTableModule,
    MatSelectModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatButtonModule,
  ],
  templateUrl: './events-list.component.html',
  styleUrl: '../../shared/pagina.css',
})
export class EventsListComponent implements OnInit {
  private readonly events = inject(EventsService);
  private readonly reservations = inject(ReservationsService);
  private readonly auth = inject(AuthService);
  private readonly confirmService = inject(ConfirmService);
  private readonly notif = inject(NotificationService);

  readonly pageSize = PAGE_SIZE;
  readonly items = signal<EventItem[]>([]);
  readonly page = signal(1);
  readonly total = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly cantidades = signal<Record<string, number>>({});
  readonly opciones = [1, 2, 3, 4];

  // Una clave por intento: se reutiliza si falla la red, se descarta con una respuesta definitiva.
  private readonly claves = new Map<string, string>();

  readonly puedeGestionar = computed(() => {
    const r = this.auth.role();
    return r === 'OPERADOR' || r === 'ADMIN';
  });

  readonly columnas = computed(() => {
    const base = ['name', 'startsAt', 'venue', 'cupo', 'reservar'];
    return this.puedeGestionar() ? [...base, 'acciones'] : base;
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

  alPaginar(evento: PageEvent): void {
    this.cargar(evento.pageIndex + 1);
  }

  cantidadDe(id: string): number {
    return this.cantidades()[id] ?? 1;
  }

  setCantidad(id: string, cantidad: number): void {
    this.cantidades.update((c) => ({ ...c, [id]: cantidad }));
  }

  reservar(evento: EventItem): void {
    const clave = this.claves.get(evento.id) ?? crypto.randomUUID();
    this.claves.set(evento.id, clave);

    this.reservations.reserve(evento.id, this.cantidadDe(evento.id), clave).subscribe({
      next: () => {
        this.claves.delete(evento.id);
        this.notif.success(`Reserva confirmada para "${evento.name}".`);
        this.cargar(this.page());
      },
      error: (err) => {
        const codigo = err?.error?.error?.code as string | undefined;
        const definitivo = typeof err?.status === 'number' && err.status >= 400 && err.status < 500;
        if (definitivo) this.claves.delete(evento.id);
        // Red, 429 y 5xx ya los avisa el interceptor: acá solo los errores de negocio.
        if (mensajeGlobal(err)) return;
        this.notif.error(
          (codigo && MENSAJES[codigo]) || 'Ocurrió un error inesperado. Intentá de nuevo.',
        );
      },
    });
  }

  cancelar(evento: EventItem): void {
    this.confirmService
      .confirm({
        titulo: 'Cancelar evento',
        mensaje: `¿Cancelás el evento "${evento.name}"? Deja de estar disponible para reservar.`,
        confirmar: 'Sí, cancelar evento',
        cancelar: 'Volver',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.events.cancel(evento.id).subscribe({
          next: () => {
            this.notif.success(`Evento "${evento.name}" cancelado.`);
            this.cargar(this.page());
          },
          error: (err) => {
            if (mensajeGlobal(err)) return;
            this.notif.error('No pudimos cancelar el evento. Intentá de nuevo.');
          },
        });
      });
  }
}