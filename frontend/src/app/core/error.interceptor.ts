import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { NotificationService } from './notification.service';

/** Mensaje para los errores que ninguna pantalla maneja: red, 429 y 5xx. */
export function mensajeGlobal(err: { status: number }): string | null {
  if (err.status === 0) return 'No hay conexión con el servidor. Revisá tu red e intentá de nuevo.';
  if (err.status === 429) return 'Demasiados intentos. Esperá un momento e intentá de nuevo.';
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