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
}

// Reparte los avisos de cambio de ocupación entre todos los workers del cluster.
// Por el canal solo viaja el id del evento: cada worker consulta el estado actual.
export class RedisOccupancyBridge implements OccupancyNotifier {
  private readonly canal: string;
  private readonly reintentoMs: number;
  private activo = false;

  constructor(
    private readonly hub: Pick<OccupancyHub, 'markChanged'>,
    private readonly publisher: RedisPublisher,
    private readonly subscriber: RedisSubscriber,
    options: BridgeOptions = {},
  ) {
    this.canal = options.canal ?? CANAL_OCUPACION;
    this.reintentoMs = options.reintentoMs ?? 2000;
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
    this.publisher.publish(this.canal, eventId).catch((err: unknown) => {
      console.error('No se pudo publicar el aviso de ocupación:', err);
    });
  }

  async stop(): Promise<void> {
    this.activo = false;
    await this.subscriber.unsubscribe(this.canal).catch(() => undefined);
  }
}