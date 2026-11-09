import { DOCUMENT } from '@angular/common';
import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';

export type EstadoConexion = 'desconectado' | 'conectando' | 'en-vivo' | 'reconectando';

export interface EventOccupancy {
  eventId: string;
  name: string;
  status: string;
  totalCapacity: number;
  availableCapacity: number;
  confirmedSeats: number;
  occupancyPercent: number;
}

// Lo mínimo que se usa de un WebSocket; permite reemplazarlo en las pruebas.
export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: string }) => void) | null;
  onclose: ((ev: { code: number }) => void) | null;
  send(data: string): void;
  close(): void;
}

export const SOCKET_FACTORY = new InjectionToken<(url: string) => WebSocketLike>(
  'SOCKET_FACTORY',
  {
    providedIn: 'root',
    factory: () => (url) => new WebSocket(url) as unknown as WebSocketLike,
  },
);

const CIERRE_NO_AUTENTICADO = 4401;
const CIERRE_SIN_PERMISO = 4403;
const ESPERA_BASE_MS = 1000;
const ESPERA_MAXIMA_MS = 30_000;

export function esperaReconexion(intento: number): number {
  return Math.min(ESPERA_BASE_MS * 2 ** intento, ESPERA_MAXIMA_MS);
}

const porId = (eventos: EventOccupancy[]): Record<string, EventOccupancy> =>
  Object.fromEntries(eventos.map((e) => [e.eventId, e]));

@Injectable({ providedIn: 'root' })
export class OccupancyService {
  private readonly auth = inject(AuthService);
  private readonly crearSocket = inject(SOCKET_FACTORY);
  private readonly ubicacion = inject(DOCUMENT).location;

  private readonly _estado = signal<EstadoConexion>('desconectado');
  private readonly _eventos = signal<Record<string, EventOccupancy>>({});
  private readonly _error = signal<string | null>(null);

  readonly estado = this._estado.asReadonly();
  readonly eventos = this._eventos.asReadonly();
  readonly error = this._error.asReadonly();

  private ids: string[] = [];
  private socket: WebSocketLike | null = null;
  private activo = false;
  private autenticado = false;
  private yaRefresco = false;
  private intento = 0;
  private temporizador: ReturnType<typeof setTimeout> | null = null;

  // Empieza a seguir estos eventos (el servidor admite hasta 5). Si ya está
  // conectado, solo cambia la suscripción; si no, abre la conexión.
  seguir(ids: string[]): void {
    this.ids = [...new Set(ids)];
    this._error.set(null);
    this._eventos.update((actual) =>
      Object.fromEntries(Object.entries(actual).filter(([id]) => this.ids.includes(id))),
    );

    if (!this.activo) {
      this.activo = true;
      this.conectar();
    } else if (this.autenticado) {
      this.suscribir();
    }
  }

  detener(): void {
    this.activo = false;
    this.ids = [];
    this.intento = 0;
    this.yaRefresco = false;
    this.autenticado = false;
    this.cancelarReintento();
    const socket = this.socket;
    this.socket = null;
    socket?.close();
    this._estado.set('desconectado');
    this._eventos.set({});
    this._error.set(null);
  }

  private url(): string {
    const protocolo = this.ubicacion.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocolo}//${this.ubicacion.host}/api/v1/ws`;
  }

  private conectar(): void {
    const token = this.auth.accessToken();
    if (!token) {
      this.rendirse('SESION_VENCIDA');
      return;
    }

    this._estado.set(this.intento === 0 ? 'conectando' : 'reconectando');
    const socket = this.crearSocket(this.url());
    this.socket = socket;
    this.autenticado = false;

    socket.onopen = () => socket.send(JSON.stringify({ type: 'auth', token }));
    socket.onmessage = (ev) => this.alRecibir(JSON.parse(ev.data));
    socket.onclose = (ev) => this.alCerrar(socket, ev.code);
  }

  private suscribir(): void {
    this.socket?.send(JSON.stringify({ type: 'suscribir', eventIds: this.ids }));
  }

  private alRecibir(mensaje: { type: string; [clave: string]: any }): void {
    switch (mensaje.type) {
      case 'autenticado':
        this.autenticado = true;
        this.intento = 0;
        this.yaRefresco = false;
        this._estado.set('en-vivo');
        if (this.ids.length > 0) this.suscribir();
        break;
      case 'snapshot':
        this._eventos.set(porId(mensaje['events']));
        break;
      case 'ocupacion':
        this._eventos.update((actual) => ({ ...actual, ...porId(mensaje['events']) }));
        break;
      case 'error':
        this._error.set(mensaje['code']);
        break;
    }
  }

  private alCerrar(socket: WebSocketLike, codigo: number): void {
    if (socket !== this.socket) return; // un socket viejo ya reemplazado
    this.socket = null;
    this.autenticado = false;
    if (!this.activo) return;

    if (codigo === CIERRE_SIN_PERMISO) {
      this.rendirse('SIN_PERMISO');
      return;
    }

    if (codigo === CIERRE_NO_AUTENTICADO) {
      // Token vencido: se renueva una vez. Si el servidor lo rechaza otra vez, no se insiste.
      if (this.yaRefresco) {
        this.rendirse('SESION_VENCIDA');
        return;
      }
      this.yaRefresco = true;
      this._estado.set('reconectando');
      this.auth.refresh().subscribe({
        next: () => {
          if (this.activo) this.conectar();
        },
        error: () => this.rendirse('SESION_VENCIDA'),
      });
      return;
    }

    this._estado.set('reconectando');
    this.temporizador = setTimeout(() => this.conectar(), esperaReconexion(this.intento));
    this.intento++;
  }

  private rendirse(error: string): void {
    this.activo = false;
    this.cancelarReintento();
    this._estado.set('desconectado');
    this._error.set(error);
  }

  private cancelarReintento(): void {
    if (this.temporizador) clearTimeout(this.temporizador);
    this.temporizador = null;
  }
}