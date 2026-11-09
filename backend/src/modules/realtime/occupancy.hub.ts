import { AppError } from '../../errors/AppError';

export const MAX_EVENTOS_POR_CLIENTE = 5;

// Fila tal como sale de la base: no incluye datos derivados.
export interface OccupancyRow {
  eventId: string;
  name: string;
  status: string;
  totalCapacity: number;
  availableCapacity: number;
}

export interface EventOccupancy extends OccupancyRow {
  confirmedSeats: number;
  occupancyPercent: number;
}

export interface OccupancyMessage {
  // snapshot: estado completo al suscribirse; ocupacion: solo los eventos que cambiaron
  type: 'snapshot' | 'ocupacion';
  events: EventOccupancy[];
}

export type OccupancyLoader = (eventIds: string[]) => Promise<OccupancyRow[]>;
export type OccupancySend = (message: OccupancyMessage) => void;

interface Client {
  eventIds: Set<string>;
  send: OccupancySend;
}

function aOcupacion(fila: OccupancyRow): EventOccupancy {
  const confirmados = fila.totalCapacity - fila.availableCapacity;
  const porcentaje =
    fila.totalCapacity > 0 ? Math.round((confirmados / fila.totalCapacity) * 1000) / 10 : 0;
  return { ...fila, confirmedSeats: confirmados, occupancyPercent: porcentaje };
}

// Lleva la cuenta de quién sigue qué evento y agrupa los cambios para avisar
// en tandas. No sabe de sockets ni de timers: quien lo use llama a flush().
export class OccupancyHub {
  private readonly clients = new Map<string, Client>();
  private dirty = new Set<string>();

  constructor(private readonly load: OccupancyLoader) {}

  async subscribe(clientId: string, eventIds: string[], send: OccupancySend): Promise<void> {
    const unicos = [...new Set(eventIds)];
    if (unicos.length > MAX_EVENTOS_POR_CLIENTE) {
      throw new AppError(
        400,
        'DEMASIADOS_EVENTOS',
        `Podés seguir hasta ${MAX_EVENTOS_POR_CLIENTE} eventos a la vez.`,
      );
    }

    const client: Client = { eventIds: new Set(unicos), send };
    this.clients.set(clientId, client);

    const filas = unicos.length > 0 ? await this.load(unicos) : [];
    // Si mientras se consultaba se desuscribió o se volvió a suscribir, no se envía.
    if (this.clients.get(clientId) !== client) return;

    this.enviar(client, { type: 'snapshot', events: filas.map(aOcupacion) });
  }

  unsubscribe(clientId: string): void {
    this.clients.delete(clientId);
  }

  markChanged(eventId: string): void {
    this.dirty.add(eventId);
  }

  async flush(): Promise<void> {
    if (this.dirty.size === 0) return;
    const pendientes = this.dirty;
    this.dirty = new Set();

    const seguidos = new Set<string>();
    for (const client of this.clients.values()) {
      for (const id of client.eventIds) {
        if (pendientes.has(id)) seguidos.add(id);
      }
    }
    if (seguidos.size === 0) return;

    let filas: OccupancyRow[];
    try {
      filas = await this.load([...seguidos]);
    } catch (err) {
      // No se pierden los cambios: se reintentan en el próximo ciclo.
      console.error('No se pudo consultar la ocupación:', err);
      for (const id of seguidos) this.dirty.add(id);
      return;
    }

    const porId = new Map(filas.map((f) => [f.eventId, aOcupacion(f)]));
    for (const client of this.clients.values()) {
      const events: EventOccupancy[] = [];
      for (const id of client.eventIds) {
        const ocupacion = seguidos.has(id) ? porId.get(id) : undefined;
        if (ocupacion) events.push(ocupacion);
      }
      if (events.length > 0) this.enviar(client, { type: 'ocupacion', events });
    }
  }

  private enviar(client: Client, message: OccupancyMessage): void {
    try {
      client.send(message);
    } catch (err) {
      // Un socket roto no debe impedir avisar a los demás.
      console.error('No se pudo enviar el aviso de ocupación:', err);
    }
  }
}