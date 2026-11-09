import { DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { EventItem, EventsService } from '../../core/events.service';
import { EstadoConexion, OccupancyService } from '../../core/occupancy.service';

export const MAX_EVENTOS = 5;
const TAMANO_CATALOGO = 50;
const OCUPACION_ALTA = 90;

// Los eventos activos que todavía no empezaron, del más próximo al más lejano.
export function seleccionInicial(
  eventos: EventItem[],
  ahora = new Date(),
  max = MAX_EVENTOS,
): string[] {
  return eventos
    .filter((e) => e.status === 'ACTIVO' && e.startsAt.getTime() >= ahora.getTime())
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
    .slice(0, max)
    .map((e) => e.id);
}

interface Fila {
  id: string;
  nombre: string;
  valor: string;
  percent: number;
  alta: boolean;
  etiqueta: string;
}

const ETIQUETAS_ESTADO: Record<EstadoConexion, string> = {
  desconectado: 'Desconectado',
  conectando: 'Conectando…',
  'en-vivo': 'En vivo',
  reconectando: 'Reconectando…',
};

const MENSAJES_ERROR: Record<string, string> = {
  SIN_PERMISO: 'No tenés permiso para ver la ocupación en vivo.',
  SESION_VENCIDA: 'Tu sesión venció. Volvé a iniciar sesión.',
  DEMASIADOS_EVENTOS: `Podés seguir hasta ${MAX_EVENTOS} eventos a la vez.`,
};

@Component({
  selector: 'app-occupancy-live',
  imports: [DatePipe, MatFormFieldModule, MatSelectModule],
  templateUrl: './occupancy-live.component.html',
  styleUrl: './occupancy-live.component.css',
})
export class OccupancyLiveComponent implements OnInit, OnDestroy {
  private readonly events = inject(EventsService);
  private readonly ocupacion = inject(OccupancyService);

  readonly max = MAX_EVENTOS;
  readonly catalogo = signal<EventItem[]>([]);
  readonly seleccion = signal<string[]>([]);
  readonly cargando = signal(true);
  readonly errorCarga = signal(false);

  readonly estado = computed(() => ETIQUETAS_ESTADO[this.ocupacion.estado()]);
  readonly estadoClave = this.ocupacion.estado;
  readonly mensajeError = computed(() => {
    const codigo = this.ocupacion.error();
    if (!codigo) return null;
    return MENSAJES_ERROR[codigo] ?? 'No se pudo actualizar la ocupación en vivo.';
  });

  readonly filas = computed<Fila[]>(() => {
    const vivo = this.ocupacion.eventos();
    const catalogo = this.catalogo();
    return this.seleccion().map((id) => {
      const dato = vivo[id];
      const nombre = dato?.name ?? catalogo.find((e) => e.id === id)?.name ?? id;
      if (!dato) {
        return { id, nombre, valor: '—', percent: 0, alta: false, etiqueta: `${nombre}: sin datos todavía` };
      }
      const percent = dato.occupancyPercent;
      return {
        id,
        nombre,
        valor: `${dato.confirmedSeats} / ${dato.totalCapacity} (${percent}%)`,
        percent,
        alta: percent >= OCUPACION_ALTA,
        etiqueta: `${nombre}: ${dato.confirmedSeats} de ${dato.totalCapacity} asientos confirmados (${percent}%)`,
      };
    });
  });

  ngOnInit(): void {
    this.events.list(1, TAMANO_CATALOGO).subscribe({
      next: (pagina) => {
        this.catalogo.set(pagina.items.filter((e) => e.status === 'ACTIVO'));
        this.cargando.set(false);
        const inicial = seleccionInicial(pagina.items);
        if (inicial.length > 0) this.cambiar(inicial);
      },
      error: () => {
        this.cargando.set(false);
        this.errorCarga.set(true);
      },
    });
  }

  ngOnDestroy(): void {
    this.ocupacion.detener();
  }

  cambiar(ids: string[]): void {
    const elegidos = ids.slice(0, MAX_EVENTOS);
    this.seleccion.set(elegidos);
    if (elegidos.length === 0) {
      this.ocupacion.detener();
    } else {
      this.ocupacion.seguir(elegidos);
    }
  }

  deshabilitada(id: string): boolean {
    const elegidos = this.seleccion();
    return elegidos.length >= MAX_EVENTOS && !elegidos.includes(id);
  }
}