import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, switchMap, tap, throwError } from 'rxjs';

export type Role = 'USUARIO' | 'OPERADOR' | 'ADMIN';

export interface User {
  id: string;
  email: string;
  role: Role;
}

const API = '/api/v1/auth';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);

  private readonly _accessToken = signal<string | null>(null);
  private readonly _user = signal<User | null>(null);

  readonly accessToken = this._accessToken.asReadonly();
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null && this._accessToken() !== null);
  readonly role = computed(() => this._user()?.role ?? null);

  register(email: string, password: string): Observable<{ user: User }> {
    return this.http.post<{ user: User }>(`${API}/register`, { email, password });
  }

  login(email: string, password: string): Observable<{ user: User; accessToken: string }> {
    return this.http
      .post<{ user: User; accessToken: string }>(
        `${API}/login`,
        { email, password },
        { withCredentials: true },
      )
      .pipe(
        tap((res) => {
          this._accessToken.set(res.accessToken);
          this._user.set(res.user);
        }),
      );
  }
  loginWithGoogle(idToken: string): Observable<{ user: User; accessToken: string }> {
    return this.http
      .post<{ user: User; accessToken: string }>(
        `${API}/google`,
        { idToken },
        { withCredentials: true },
      )
      .pipe(
        tap((res) => {
          this._accessToken.set(res.accessToken);
          this._user.set(res.user);
        }),
      );
  }

  refresh(): Observable<{ accessToken: string }> {
    return this.http
      .post<{ accessToken: string }>(`${API}/refresh`, {}, { withCredentials: true })
      .pipe(
        tap((res) => this._accessToken.set(res.accessToken)),
        catchError((err) => {
          this.clearSession();
          return throwError(() => err);
        }),
      );
  }

  logout(): Observable<void> {
    return this.http.post<void>(`${API}/logout`, {}, { withCredentials: true }).pipe(
      catchError(() => of(undefined)),
      map(() => undefined),
      tap(() => this.clearSession()),
    );
  }

  restoreSession(): Observable<void> {
    return this.refresh().pipe(
      switchMap(() =>
        this.http.get<{ user: User }>(`${API}/me`, {
          headers: new HttpHeaders({ Authorization: `Bearer ${this._accessToken()}` }),
        }),
      ),
      tap((res) => this._user.set(res.user)),
      map(() => undefined),
      catchError(() => {
        this.clearSession();
        return of(undefined);
      }),
    );
  }

  clearSession(): void {
    this._accessToken.set(null);
    this._user.set(null);
  }
}