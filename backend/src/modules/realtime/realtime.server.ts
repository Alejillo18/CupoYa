import { randomUUID } from 'node:crypto';
import { IncomingMessage, Server } from 'node:http';
import { Duplex } from 'node:stream';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { AppError } from '../../errors/AppError';
import { TokenService } from '../auth/token.service';
import { OccupancyHub } from './occupancy.hub';

export const WS_PATH = '/api/v1/ws';
export const CIERRE_NO_AUTENTICADO = 4401;
export const CIERRE_SIN_PERMISO = 4403;

const TAMANO_MAXIMO_MENSAJE = 4096;
const HEARTBEAT_MS = 30_000;
// setTimeout no admite más de ~24,8 días; un token no dura tanto, pero no se arriesga.
const MAXIMO_TIMER_MS = 2 ** 31 - 1;

export interface RealtimeOptions {
  tokens: TokenService;
  hub: OccupancyHub;
  path?: string;
  authTimeoutMs?: number;
  flushIntervalMs?: number;
  heartbeatMs?: number;
}

interface ClientMessage {
  type: string;
  [clave: string]: unknown;
}

function leer(data: RawData): ClientMessage | undefined {
  try {
    const mensaje: unknown = JSON.parse(data.toString());
    if (mensaje && typeof mensaje === 'object' && typeof (mensaje as ClientMessage).type === 'string') {
      return mensaje as ClientMessage;
    }
  } catch {
    // JSON inválido: se trata igual que un mensaje sin tipo.
  }
  return undefined;
}

// El token ya fue verificado: solo se lee de él cuándo vence (en milisegundos).
function vencimientoDelToken(token: string): number | undefined {
  try {
    const carga: unknown = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString());
    const exp = (carga as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

// Engancha el WebSocket de ocupación al servidor HTTP existente.
// Solo los administradores pueden conectarse: el primer mensaje debe ser la autenticación.
export function attachRealtime(
  server: Server,
  options: RealtimeOptions,
): { close(): Promise<void> } {
  const path = options.path ?? WS_PATH;
  const authTimeoutMs = options.authTimeoutMs ?? 5000;
  const heartbeatMs = options.heartbeatMs ?? HEARTBEAT_MS;
  // Un socket está "vivo" si respondió con pong desde el último ping.
  const vivos = new WeakSet<WebSocket>();
  const wss = new WebSocketServer({ noServer: true, maxPayload: TAMANO_MAXIMO_MENSAJE });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const ruta = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (ruta !== path) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      vivos.add(ws);
      ws.on('pong', () => vivos.add(ws));
      atender(ws);
    });
  };
  server.on('upgrade', onUpgrade);

  const atender = (ws: WebSocket): void => {
    const id = randomUUID();
    let autenticado = false;
    let sesionVencida: NodeJS.Timeout | undefined;

    const enviar = (mensaje: unknown): void => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(mensaje));
    };
    const error = (code: string, message: string): void => enviar({ type: 'error', code, message });

    const vencimiento = setTimeout(
      () => ws.close(CIERRE_NO_AUTENTICADO, 'Autenticación requerida'),
      authTimeoutMs,
    );

    const autenticar = (mensaje: ClientMessage | undefined): void => {
      if (!mensaje || mensaje.type !== 'auth' || typeof mensaje.token !== 'string') {
        ws.close(CIERRE_NO_AUTENTICADO, 'Autenticación requerida');
        return;
      }
      let rol: string;
      try {
        rol = options.tokens.verifyAccessToken(mensaje.token).role;
      } catch {
        ws.close(CIERRE_NO_AUTENTICADO, 'Token inválido');
        return;
      }
      if (rol !== 'ADMIN') {
        ws.close(CIERRE_SIN_PERMISO, 'Sin permiso');
        return;
      }
      autenticado = true;
      clearTimeout(vencimiento);
      // Una sesión vencida no puede seguir recibiendo datos: se corta con el mismo
      // código que un token inválido, y el cliente renueva la sesión y reconecta.
      const venceEn = vencimientoDelToken(mensaje.token);
      if (venceEn !== undefined) {
        const restante = Math.min(Math.max(venceEn - Date.now(), 0), MAXIMO_TIMER_MS);
        sesionVencida = setTimeout(() => ws.close(CIERRE_NO_AUTENTICADO, 'Sesión vencida'), restante);
        sesionVencida.unref();
      }
      enviar({ type: 'autenticado' });
    };

    const suscribir = (mensaje: ClientMessage): void => {
      const ids = mensaje.eventIds;
      if (!Array.isArray(ids) || !ids.every((x) => typeof x === 'string')) {
        error('MENSAJE_INVALIDO', 'eventIds debe ser una lista de textos.');
        return;
      }
      options.hub.subscribe(id, ids as string[], enviar).catch((err: unknown) => {
        if (err instanceof AppError) {
          error(err.code, err.message);
        } else {
          console.error('No se pudo suscribir:', err);
          error('ERROR_INTERNO', 'No pudimos seguir esos eventos. Probá de nuevo.');
        }
      });
    };

    ws.on('message', (data: RawData) => {
      const mensaje = leer(data);
      if (!autenticado) {
        autenticar(mensaje);
        return;
      }
      if (!mensaje) {
        error('MENSAJE_INVALIDO', 'El mensaje no es válido.');
      } else if (mensaje.type === 'suscribir') {
        suscribir(mensaje);
      } else {
        error('MENSAJE_INVALIDO', `Tipo de mensaje desconocido: ${mensaje.type}.`);
      }
    });

    ws.on('close', () => {
      clearTimeout(vencimiento);
      clearTimeout(sesionVencida);
      options.hub.unsubscribe(id);
    });

    // ws ya cierra la conexión con el código que corresponde (por ejemplo 1009).
    ws.on('error', () => undefined);
  };

  const ciclo = setInterval(() => {
    options.hub.flush().catch((err: unknown) => console.error('Error al avisar la ocupación:', err));
  }, options.flushIntervalMs ?? 500);
  ciclo.unref();

  // Detecta conexiones muertas (red caída, equipo suspendido) que nunca avisan que se fueron.
  const latido = setInterval(() => {
    for (const ws of wss.clients) {
      if (!vivos.has(ws)) {
        ws.terminate();
        continue;
      }
      vivos.delete(ws);
      ws.ping();
    }
  }, heartbeatMs);
  latido.unref();

  return {
    async close(): Promise<void> {
      clearInterval(ciclo);
      clearInterval(latido);
      server.off('upgrade', onUpgrade);
      for (const cliente of wss.clients) cliente.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}