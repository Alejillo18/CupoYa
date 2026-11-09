import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { of, tap, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from './auth.service';
import { OccupancyService, SOCKET_FACTORY, esperaReconexion } from './occupancy.service';

class SocketFalso {
  static instancias: SocketFalso[] = [];

  readyState = 0;
  enviados: any[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;

  constructor(public url: string) {
    SocketFalso.instancias.push(this);
  }

  send(data: string): void {
    this.enviados.push(JSON.parse(data));
  }

  close(): void {
    this.readyState = 3;
    this.onclose?.({ code: 1000 });
  }

  // Ayudas para simular al servidor
  abrir(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  recibir(mensaje: unknown): void {
    this.onmessage?.({ data: JSON.stringify(mensaje) });
  }

  cerrarDesdeServidor(code: number): void {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

const fila = (id: string, confirmados: number) => ({
  eventId: id,
  name: `Evento ${id}`,
  status: 'ACTIVO',
  totalCapacity: 100,
  availableCapacity: 100 - confirmados,
  confirmedSeats: confirmados,
  occupancyPercent: confirmados,
});

describe('OccupancyService', () => {
  let servicio: OccupancyService;
  let token: ReturnType<typeof signal<string | null>>;
  let refresh: ReturnType<typeof vi.fn>;

  const ultimo = () => SocketFalso.instancias[SocketFalso.instancias.length - 1];

  function enVivo(ids: string[]): SocketFalso {
    servicio.seguir(ids);
    const socket = ultimo();
    socket.abrir();
    socket.recibir({ type: 'autenticado' });
    return socket;
  }

  beforeEach(() => {
    vi.useFakeTimers();
    SocketFalso.instancias = [];
    token = signal<string | null>('tok-1');
    refresh = vi.fn(() =>
      of({ accessToken: 'tok-2' }).pipe(tap((r) => token.set(r.accessToken))),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: { accessToken: token.asReadonly(), refresh } },
        { provide: SOCKET_FACTORY, useValue: (url: string) => new SocketFalso(url) },
      ],
    });
    servicio = TestBed.inject(OccupancyService);
  });

  afterEach(() => {
    servicio.detener();
    vi.useRealTimers();
  });

  it('seguir abre un socket a /api/v1/ws y queda conectando', () => {
    servicio.seguir(['a']);

    expect(SocketFalso.instancias).toHaveLength(1);
    expect(ultimo().url).toMatch(/^ws:\/\/.+\/api\/v1\/ws$/);
    expect(servicio.estado()).toBe('conectando');
  });

  it('al abrir se autentica con el token de acceso y recién después se suscribe', () => {
    servicio.seguir(['a', 'b']);
    const socket = ultimo();

    socket.abrir();
    expect(socket.enviados).toEqual([{ type: 'auth', token: 'tok-1' }]);

    socket.recibir({ type: 'autenticado' });
    expect(socket.enviados[1]).toEqual({ type: 'suscribir', eventIds: ['a', 'b'] });
    expect(servicio.estado()).toBe('en-vivo');
  });

  it('la foto inicial carga la ocupación de los eventos', () => {
    const socket = enVivo(['a', 'b']);

    socket.recibir({ type: 'snapshot', events: [fila('a', 10), fila('b', 20)] });

    expect(servicio.eventos()['a'].confirmedSeats).toBe(10);
    expect(servicio.eventos()['b'].confirmedSeats).toBe(20);
  });

  it('un aviso actualiza solo el evento que cambió', () => {
    const socket = enVivo(['a', 'b']);
    socket.recibir({ type: 'snapshot', events: [fila('a', 10), fila('b', 20)] });

    socket.recibir({ type: 'ocupacion', events: [fila('a', 35)] });

    expect(servicio.eventos()['a'].confirmedSeats).toBe(35);
    expect(servicio.eventos()['b'].confirmedSeats).toBe(20);
  });

  it('cambiar la lista estando en vivo manda la nueva suscripción sin reconectar', () => {
    const socket = enVivo(['a']);
    socket.recibir({ type: 'snapshot', events: [fila('a', 10)] });

    servicio.seguir(['b']);

    expect(socket.enviados[socket.enviados.length - 1]).toEqual({
      type: 'suscribir',
      eventIds: ['b'],
    });
    expect(SocketFalso.instancias).toHaveLength(1);
    expect(servicio.eventos()['a']).toBeUndefined();
  });

  it('un error del servidor queda expuesto sin cortar la conexión', () => {
    const socket = enVivo(['a']);

    socket.recibir({ type: 'error', code: 'DEMASIADOS_EVENTOS', message: 'x' });

    expect(servicio.error()).toBe('DEMASIADOS_EVENTOS');
    expect(servicio.estado()).toBe('en-vivo');
  });

  it('sin token no conecta y avisa que la sesión venció', () => {
    token.set(null);

    servicio.seguir(['a']);

    expect(SocketFalso.instancias).toHaveLength(0);
    expect(servicio.estado()).toBe('desconectado');
    expect(servicio.error()).toBe('SESION_VENCIDA');
  });

  it('si se corta la conexión reconecta con espera creciente', () => {
    const primero = enVivo(['a']);

    primero.cerrarDesdeServidor(1006);
    expect(servicio.estado()).toBe('reconectando');
    vi.advanceTimersByTime(999);
    expect(SocketFalso.instancias).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(SocketFalso.instancias).toHaveLength(2);

    ultimo().cerrarDesdeServidor(1006);
    vi.advanceTimersByTime(1999);
    expect(SocketFalso.instancias).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(SocketFalso.instancias).toHaveLength(3);
  });

  it('al reconectar se autentica y se suscribe de nuevo a los mismos eventos', () => {
    const primero = enVivo(['a', 'b']);
    primero.cerrarDesdeServidor(1006);
    vi.advanceTimersByTime(1000);

    const segundo = ultimo();
    segundo.abrir();
    segundo.recibir({ type: 'autenticado' });

    expect(segundo.enviados).toEqual([
      { type: 'auth', token: 'tok-1' },
      { type: 'suscribir', eventIds: ['a', 'b'] },
    ]);
    expect(servicio.estado()).toBe('en-vivo');
  });

  it('tras una reconexión exitosa la espera vuelve a empezar desde un segundo', () => {
    const primero = enVivo(['a']);
    primero.cerrarDesdeServidor(1006);
    vi.advanceTimersByTime(1000);
    ultimo().cerrarDesdeServidor(1006);
    vi.advanceTimersByTime(2000);
    const tercero = ultimo();
    tercero.abrir();
    tercero.recibir({ type: 'autenticado' });

    tercero.cerrarDesdeServidor(1006);
    vi.advanceTimersByTime(1000);

    expect(SocketFalso.instancias).toHaveLength(4);
  });

  it('con 4403 (sin permiso) no reintenta y lo informa', () => {
    const socket = enVivo(['a']);

    socket.cerrarDesdeServidor(4403);
    vi.advanceTimersByTime(60_000);

    expect(SocketFalso.instancias).toHaveLength(1);
    expect(servicio.estado()).toBe('desconectado');
    expect(servicio.error()).toBe('SIN_PERMISO');
  });

  it('con 4401 (token vencido) pide un token nuevo y reconecta con él', () => {
    const socket = enVivo(['a']);

    socket.cerrarDesdeServidor(4401);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(SocketFalso.instancias).toHaveLength(2);
    ultimo().abrir();
    expect(ultimo().enviados[0]).toEqual({ type: 'auth', token: 'tok-2' });
  });

  it('si no se puede renovar el token, se rinde sin reintentar', () => {
    refresh.mockReturnValue(throwError(() => new Error('401')));
    const socket = enVivo(['a']);

    socket.cerrarDesdeServidor(4401);
    vi.advanceTimersByTime(60_000);

    expect(SocketFalso.instancias).toHaveLength(1);
    expect(servicio.estado()).toBe('desconectado');
    expect(servicio.error()).toBe('SESION_VENCIDA');
  });

  it('si el servidor rechaza también el token renovado, se rinde', () => {
    const socket = enVivo(['a']);
    socket.cerrarDesdeServidor(4401);

    ultimo().cerrarDesdeServidor(4401);
    vi.advanceTimersByTime(60_000);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(SocketFalso.instancias).toHaveLength(2);
    expect(servicio.estado()).toBe('desconectado');
    expect(servicio.error()).toBe('SESION_VENCIDA');
  });

  it('detener cierra el socket, limpia los datos y no reconecta', () => {
    const socket = enVivo(['a']);
    socket.recibir({ type: 'snapshot', events: [fila('a', 10)] });

    servicio.detener();
    vi.advanceTimersByTime(60_000);

    expect(socket.readyState).toBe(3);
    expect(servicio.estado()).toBe('desconectado');
    expect(servicio.eventos()).toEqual({});
    expect(SocketFalso.instancias).toHaveLength(1);
  });
});

describe('esperaReconexion', () => {
  it('duplica la espera en cada intento hasta un tope de 30 segundos', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 10].map(esperaReconexion)).toEqual([
      1000, 2000, 4000, 8000, 16000, 30000, 30000, 30000,
    ]);
  });
});