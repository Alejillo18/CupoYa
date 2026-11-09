import http from 'node:http';
import { AddressInfo } from 'node:net';
import { RawData, WebSocket } from 'ws';
import { TokenService } from '../../src/modules/auth/token.service';
import { OccupancyHub, OccupancyRow } from '../../src/modules/realtime/occupancy.hub';
import { attachRealtime, WS_PATH } from '../../src/modules/realtime/realtime.server';

const tokens = new TokenService('x'.repeat(40), 60);
const tokenAdmin = () => tokens.signAccessToken({ id: 'u-admin', role: 'ADMIN' });
const tokenUsuario = () => tokens.signAccessToken({ id: 'u-1', role: 'USUARIO' });

function fila(id: string, total = 100, disponible = 100): OccupancyRow {
  return {
    eventId: id,
    name: `Evento ${id}`,
    status: 'ACTIVO',
    totalCapacity: total,
    availableCapacity: disponible,
  };
}

async function esperarHasta(condicion: () => boolean, ms = 1000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('La condición no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('Servidor WebSocket de ocupación', () => {
  let server: http.Server;
  let realtime: { close(): Promise<void> };
  let hub: OccupancyHub;
  let estado: Record<string, OccupancyRow>;
  let url: string;
  const abiertos: WebSocket[] = [];

  function conectar() {
    const ws = new WebSocket(url);
    abiertos.push(ws);
    const recibidos: any[] = [];
    const esperando: Array<(m: any) => void> = [];

    ws.on('message', (data: RawData) => {
      const mensaje = JSON.parse(data.toString());
      const alguien = esperando.shift();
      if (alguien) alguien(mensaje);
      else recibidos.push(mensaje);
    });

    return {
      ws,
      recibidos,
      abierto: new Promise<void>((resolve, reject) => {
        ws.on('open', () => resolve());
        ws.on('error', reject);
      }),
      cierre: new Promise<number>((resolve) => ws.on('close', (codigo) => resolve(codigo))),
      siguiente: () =>
        new Promise<any>((resolve, reject) => {
          const ya = recibidos.shift();
          if (ya) return resolve(ya);
          const timer = setTimeout(() => reject(new Error('No llegó ningún mensaje')), 2000);
          esperando.push((m) => {
            clearTimeout(timer);
            resolve(m);
          });
        }),
      enviar: (m: unknown) => ws.send(JSON.stringify(m)),
    };
  }

  async function conectarAdmin() {
    const c = conectar();
    await c.abierto;
    c.enviar({ type: 'auth', token: tokenAdmin() });
    expect(await c.siguiente()).toEqual({ type: 'autenticado' });
    return c;
  }

  beforeEach(async () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    estado = { a: fila('a'), b: fila('b') };
    hub = new OccupancyHub(async (ids) =>
      ids.map((id) => estado[id]).filter((f): f is OccupancyRow => f !== undefined),
    );
    server = http.createServer();
    realtime = attachRealtime(server, { tokens, hub, authTimeoutMs: 200, flushIntervalMs: 20 });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    url = `ws://127.0.0.1:${(server.address() as AddressInfo).port}${WS_PATH}`;
  });

  afterEach(async () => {
    for (const ws of abiertos.splice(0)) ws.terminate();
    await realtime.close();
    await new Promise<void>((r) => server.close(() => r()));
    jest.restoreAllMocks();
  });

  it('autentica a un administrador con un token válido', async () => {
    await conectarAdmin();
  });

  it('cierra con 4401 si el token es inválido', async () => {
    const c = conectar();
    await c.abierto;

    c.enviar({ type: 'auth', token: 'no-es-un-token' });

    expect(await c.cierre).toBe(4401);
  });

  it('cierra con 4403 si el token es válido pero no es de administrador', async () => {
    const c = conectar();
    await c.abierto;

    c.enviar({ type: 'auth', token: tokenUsuario() });

    expect(await c.cierre).toBe(4403);
  });

  it('cierra con 4401 si no se autentica a tiempo', async () => {
    const c = conectar();
    await c.abierto;

    expect(await c.cierre).toBe(4401);
  });

  it('cierra con 4401 si lo primero que manda no es la autenticación', async () => {
    const c = conectar();
    await c.abierto;

    c.enviar({ type: 'suscribir', eventIds: ['a'] });

    expect(await c.cierre).toBe(4401);
  });

  it('al suscribirse recibe la foto actual de los eventos', async () => {
    estado.a = fila('a', 100, 60);
    const c = await conectarAdmin();

    c.enviar({ type: 'suscribir', eventIds: ['a'] });
    const foto = await c.siguiente();

    expect(foto.type).toBe('snapshot');
    expect(foto.events[0]).toMatchObject({ eventId: 'a', confirmedSeats: 40, occupancyPercent: 40 });
  });

  it('avisa los cambios de ocupación de los eventos que sigue', async () => {
    const c = await conectarAdmin();
    c.enviar({ type: 'suscribir', eventIds: ['a'] });
    await c.siguiente();

    estado.a = fila('a', 100, 70);
    hub.markChanged('a');
    const aviso = await c.siguiente();

    expect(aviso.type).toBe('ocupacion');
    expect(aviso.events[0]).toMatchObject({ eventId: 'a', confirmedSeats: 30 });
  });

  it('responde con un error, sin cortar, si pide más eventos que el máximo', async () => {
    const c = await conectarAdmin();

    c.enviar({ type: 'suscribir', eventIds: ['a', 'b', 'c', 'd', 'e', 'f'] });
    const error = await c.siguiente();

    expect(error).toMatchObject({ type: 'error', code: 'DEMASIADOS_EVENTOS' });
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('responde con un error, sin cortar, ante un mensaje que no es JSON', async () => {
    const c = await conectarAdmin();

    c.ws.send('esto no es json');
    const error = await c.siguiente();

    expect(error).toMatchObject({ type: 'error', code: 'MENSAJE_INVALIDO' });
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('responde con un error si los ids de eventos no son una lista de textos', async () => {
    const c = await conectarAdmin();

    c.enviar({ type: 'suscribir', eventIds: [1, 2] });

    expect(await c.siguiente()).toMatchObject({ type: 'error', code: 'MENSAJE_INVALIDO' });
  });

  it('corta la conexión si un mensaje supera el tamaño permitido', async () => {
    const c = await conectarAdmin();

    c.ws.send('x'.repeat(10_000));

    expect(await c.cierre).toBe(1009);
  });

  it('al cerrar el socket deja de seguir los eventos', async () => {
    const espia = jest.spyOn(hub, 'unsubscribe');
    const c = await conectarAdmin();
    c.enviar({ type: 'suscribir', eventIds: ['a'] });
    await c.siguiente();

    c.ws.close();

    await esperarHasta(() => espia.mock.calls.length > 0);
  });
});