import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { RefreshCoordinator } from './refresh-coordinator';

const API_PREFIX = '/api/';
const SIN_TOKEN = ['/auth/login', '/auth/register', '/auth/refresh'];

const esApi = (url: string) => url.startsWith(API_PREFIX);
const esPublico = (url: string) => SIN_TOKEN.some((p) => url.includes(p));

function conToken(req: HttpRequest<unknown>, token: string | null): HttpRequest<unknown> {
  return token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!esApi(req.url) || esPublico(req.url)) {
    return next(req);
  }

  const auth = inject(AuthService);
  const router = inject(Router);
  const coordinator = inject(RefreshCoordinator);

  return next(conToken(req, auth.accessToken())).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      return coordinator.renovar().pipe(

        catchError((refreshErr: unknown) => {
          auth.clearSession();
          router.navigateByUrl('/login');
          return throwError(() => refreshErr);
        }),

        switchMap(() => next(conToken(req, auth.accessToken()))),
      );
    }),
  );
};