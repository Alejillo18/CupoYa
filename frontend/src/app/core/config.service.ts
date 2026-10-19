import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, map, of, tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private readonly http = inject(HttpClient);
  private readonly _googleClientId = signal<string | null>(null);

  readonly googleClientId = this._googleClientId.asReadonly();

  load(): Observable<void> {
    return this.http.get<{ googleClientId?: string }>('/config.json').pipe(
      tap((cfg) => this._googleClientId.set(cfg.googleClientId || null)),
      map(() => undefined),
      catchError(() => of(undefined)),
    );
  }
}