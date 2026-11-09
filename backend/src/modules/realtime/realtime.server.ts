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

export interface RealtimeOptions {
  tokens: TokenService;
  hub: OccupancyHub;
  path?: string;
  authTimeoutMs?: number;
  flushIntervalMs?: number;
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

// Engancha el WebSocket de ocupación al servidor HTTP existente.
// Solo los administradores pueden conectarse: el primer mensaje debe ser la autenticación.
export function attachRealtime(
  server: Server,
  options: RealtimeOptions,
): { close(): Promise<void> } {
  const path = options.path ?? WS_PATH;
  const authTimeoutMs = options.authTimeoutMs ?? 5000;
  const wss = new WebSocketServer({ noServer: true, maxPayload: TAMANO_MAXIMO_MENSAJE });

  const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer): void => {
    const ruta = new URL(req.url ?? '/', 'http://localhost').pathname;
    if (ruta !== path) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => atender(ws));
  };
  server.on('upgrade', onUpgrade);

  const atender = (ws: WebSocket): void => {
    const id = randomUUID();
    let autenticado = false;

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
      options.hub.unsubscribe(id);
    });

    // ws ya cierra la conexión con el código que corresponde (por ejemplo 1009).
    ws.on('error', () => undefined);
  };

  const ciclo = setInterval(() => {
    options.hub.flush().catch((err: unknown) => console.error('Error al avisar la ocupación:', err));
  }, options.flushIntervalMs ?? 500);
  ciclo.unref();

  return {
    async close(): Promise<void> {
      clearInterval(ciclo);
      server.off('upgrade', onUpgrade);
      for (const cliente of wss.clients) cliente.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}