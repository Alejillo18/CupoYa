import { DatePipe } from '@angular/common';
import { Component, inject, OnInit, signal } from '@angular/core';
import { catchError, forkJoin, map, of } from 'rxjs';
import { ConfirmService } from '../../core/confirm.service';
import { EventsService } from '../../core/events.service';
import { Reservation, ReservationsService } from '../../core/reservations.service';

@Component({
  selector: 'app-my-reservations',
  imports: [DatePipe],
  templateUrl: './my-reservations.component.html',
  styleUrl: '../auth/auth.css',
})
export class MyReservationsComponent implements OnInit {
  private readonly reservations = inject(ReservationsService);
  private readonly events = inject(EventsService);
  private readonly confirmService = inject(ConfirmService);

  readonly items = signal<Reservation[]>([]);
  readonly nombres = signal<Record<string, string>>({});
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.loading.set(true);
    this.error.set(null);
    this.reservations.listMine().subscribe({
      next: (lista) => {
        this.items.set(lista);
        this.loading.set(false);
        this.cargarNombres(lista);
      },
      error: () => {
        this.loading.set(false);
        this.error.set('No pudimos cargar tus reservas. Intentá de nuevo.');
      },
    });
  }

  nombreDe(eventId: string): string {
    return this.nombres()[eventId] ?? `Evento ${eventId.slice(0, 8)}`;
  }

  cancelar(reserva: Reservation): void {
    this.confirmService
      .confirm({
        titulo: 'Cancelar reserva',
        mensaje: `¿Cancelás tu reserva de ${reserva.quantity} lugar(es) para "${this.nombreDe(reserva.eventId)}"? Los lugares vuelven a estar disponibles.`,
        confirmar: 'Sí, cancelar reserva',
        cancelar: 'Volver',
      })
      .subscribe((ok) => {
        if (!ok) return;
        this.error.set(null);
        this.reservations.cancel(reserva.id).subscribe({
          next: (r) => this.items.update((l) => l.map((x) => (x.id === r.id ? r : x))),
          error: () => this.error.set('No pudimos cancelar la reserva. Intentá de nuevo.'),
        });
      });
  }

  // Un pedido por evento distinto; si alguno falla se muestra el id abreviado.
  private cargarNombres(lista: Reservation[]): void {
    const ids = [...new Set(lista.map((r) => r.eventId))];
    if (ids.length === 0) return;
    forkJoin(
      ids.map((id) =>
        this.events.get(id).pipe(
          map((e) => [id, e.name] as const),
          catchError(() => of(null)),
        ),
      ),
    ).subscribe((pares) => {
      const mapa: Record<string, string> = {};
      for (const p of pares) if (p) mapa[p[0]] = p[1];
      this.nombres.set(mapa);
    });
  }
}