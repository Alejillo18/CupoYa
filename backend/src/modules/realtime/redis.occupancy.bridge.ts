import { OccupancyHub } from './occupancy.hub';
import { OccupancyNotifier } from './occupancy.notifier';

export const CANAL_OCUPACION = 'cupoya:ocupacion';

// Lo mínimo que se necesita de una conexión de ioredis para publicar.
export interface RedisPublisher {
  publish(canal: string, mensaje: string): Promise<unknown>;
}

// Y para escuchar. Una conexión en modo suscripción no puede publicar,
// por eso son dos conexiones distintas.
export interface RedisSubscriber {
  subscribe(canal: string): Promise<unknown>;
  unsubscribe(canal: string): Promise<unknown>;
  on(evento: 'message', escucha: (canal: string, mensaje: string) => void): unknown;
}

export interface BridgeOptions {
  canal?: string;
  reintentoMs?: number;
  // Con Redis caído cada reserva falla al publicar: se registra como máximo una vez por intervalo.
  logIntervaloMs?: number;
  ahora?: () => number;
}

// Reparte los avisos de cambio de ocupación entre todos los workers del cluster.
// Por el canal solo viaja el id del evento: cada worker consulta el estado actual.
export class RedisOccupancyBridge implements OccupancyNotifier {
  private readonly canal: string;
  private readonly reintentoMs: number;
  private readonly logIntervaloMs: number;
  private readonly ahora: () => number;
  private activo = false;
  private ultimoRegistro = Number.NEGATIVE_INFINITY;
  private omitidos = 0;
  private enFalla = false;

  constructor(
    private readonly hub: Pick<OccupancyHub, 'markChanged'>,
    private readonly publisher: RedisPublisher,
    private readonly subscriber: RedisSubscriber,
    options: BridgeOptions = {},
  ) {
    this.canal = options.canal ?? CANAL_OCUPACION;
    this.reintentoMs = options.reintentoMs ?? 2000;
    this.logIntervaloMs = options.logIntervaloMs ?? 30_000;
    this.ahora = options.ahora ?? Date.now;
  }

  // Resuelve cuando la suscripción quedó hecha. Si Redis no está disponible,
  // reintenta cada tanto; nunca rechaza ni tira el arranque del servidor.
  async start(): Promise<void> {
    this.activo = true;
    this.subscriber.on('message', (canal, mensaje) => {
      if (this.activo && canal === this.canal && mensaje) this.hub.markChanged(mensaje);
    });

    while (this.activo) {
      try {
        await this.subscriber.subscribe(this.canal);
        return;
      } catch (err) {
        console.error('No se pudo suscribir al canal de ocupación; se reintenta:', err);
        await new Promise<void>((resolve) => {
          setTimeout(resolve, this.reintentoMs).unref();
        });
      }
    }
  }

  eventChanged(eventId: string): void {
    // El worker local se entera siempre, aunque Redis falle.
    this.hub.markChanged(eventId);
    this.publisher.publish(this.canal, eventId).then(
      () => this.alPublicar(),
      (err: unknown) => this.alFallar(err),
    );
  }

  private alFallar(err: unknown): void {
    this.enFalla = true;
    const ahora = this.ahora();
    if (ahora - this.ultimoRegistro < this.logIntervaloMs) {
      this.omitidos += 1;
      return;
    }
    const resto = this.omitidos > 0 ? ` (y ${this.omitidos} más desde el último registro)` : '';
    console.error(`No se pudo publicar el aviso de ocupación${resto}:`, err);
    this.ultimoRegistro = ahora;
    this.omitidos = 0;
  }

  private alPublicar(): void {
    if (!this.enFalla) return;
    this.enFalla = false;
    this.omitidos = 0;
    console.info('Redis volvió a responder: los avisos de ocupación se publican de nuevo.');
  }

  async stop(): Promise<void> {
    this.activo = false;
    await this.subscriber.unsubscribe(this.canal).catch(() => undefined);
  }
}