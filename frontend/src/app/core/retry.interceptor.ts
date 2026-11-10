import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, throwError, timer } from 'rxjs';
import { codigoDe } from './error.interceptor';

const ESPERA_POR_DEFECTO_MS = 1000;
const ESPERA_MAXIMA_MS = 5000;
// Los 503 que la API manda cuando el pedido no se llegó a procesar.
const CODIGOS_REINTENTABLES = ['SERVICIO_SATURADO', 'SERVICIO_NO_DISPONIBLE'];

/** Cuánto esperar antes de reintentar: lo que diga Retry-After (en segundos), con tope. */
export function esperaMs(err: HttpErrorResponse): number {
  const segundos = Number(err.headers.get('Retry-After'));
  if (!Number.isFinite(segundos) || segundos <= 0) return ESPERA_POR_DEFECTO_MS;
  return Math.min(segundos * 1000, ESPERA_MAXIMA_MS);
}

function esReintentable(err: unknown): err is HttpErrorResponse {
  return (
    err instanceof HttpErrorResponse &&
    err.status === 503 &&
    CODIGOS_REINTENTABLES.includes(codigoDe(err) ?? '')
  );
}

// Reintenta una sola vez las lecturas (GET) que fallaron por saturación o caída momentánea.
// Las escrituras no se repiten solas: lo decide la persona desde la pantalla.
export const reintentoInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || !req.url.startsWith('/api/')) return next(req);
  return next(req).pipe(
    retry({
      count: 1,
      delay: (err: unknown) => (esReintentable(err) ? timer(esperaMs(err)) : throwError(() => err)),
    }),
  );
};