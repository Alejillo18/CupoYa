import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from './notification.service';

/** Código de negocio que manda la API en { error: { code } }, si lo hay. */
export function codigoDe(err: { error?: unknown }): string | undefined {
  const cuerpo = err.error as { error?: { code?: unknown } } | null | undefined;
  const code = cuerpo?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

/** Mensaje para los errores que ninguna pantalla maneja: red, 429 y 5xx. */
export function mensajeGlobal(err: { status: number; error?: unknown }): string | null {
  if (err.status === 0) return 'No hay conexión con el servidor. Revisá tu red e intentá de nuevo.';
  if (err.status === 429) return 'Demasiados intentos. Esperá un momento e intentá de nuevo.';
  if (err.status === 503) {
    const codigo = codigoDe(err);
    if (codigo === 'SERVICIO_SATURADO') {
      return 'Hay mucha demanda en este momento. Intentá de nuevo en unos segundos.';
    }
    if (codigo === 'SERVICIO_NO_DISPONIBLE') {
      return 'El servicio no está disponible por un momento. Intentá de nuevo en unos segundos.';
    }
  }
  if (err.status >= 500) return 'Ocurrió un error en el servidor. Intentá de nuevo en unos minutos.';
  return null;
}

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notif = inject(NotificationService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse) {
        const mensaje = mensajeGlobal(err);
        if (mensaje) notif.error(mensaje);
      }
      return throwError(() => err);
    }),
  );
};