import { Injectable, inject } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Observable, map } from 'rxjs';
import { ConfirmDialogComponent } from './confirm-dialog.component';

export interface ConfirmOptions {
  titulo: string;
  mensaje: string;
  confirmar?: string;
  cancelar?: string;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly dialog = inject(MatDialog);

  confirm(o: ConfirmOptions): Observable<boolean> {
    return this.dialog
      .open(ConfirmDialogComponent, {
        width: '24rem',
        data: {
          titulo: o.titulo,
          mensaje: o.mensaje,
          confirmar: o.confirmar ?? 'Aceptar',
          cancelar: o.cancelar ?? 'Volver',
        },
      })
      .afterClosed()
      .pipe(map((r) => r === true));
  }
}