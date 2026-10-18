import { Injectable, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { AuthService } from './auth.service';
@Injectable({ providedIn: 'root' })
export class RefreshCoordinator {
  private readonly auth = inject(AuthService);
  private enCurso: Observable<unknown> | null = null;
  private generacion = 0;

  renovar(): Observable<unknown> {
    if (!this.enCurso) {
      const id = ++this.generacion;
      const compartido = this.auth.refresh().pipe(
        shareReplay({ bufferSize: 1, refCount: false }),
      );
      this.enCurso = compartido;
      const liberar = () =>
        setTimeout(() => {
          if (this.generacion === id) this.enCurso = null;
        });
      compartido.subscribe({ next: liberar, error: liberar });
    }
    return this.enCurso;
  }
}