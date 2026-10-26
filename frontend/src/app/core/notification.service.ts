import { Injectable, inject } from '@angular/core';
import { MatSnackBar } from '@angular/material/snack-bar';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly snack = inject(MatSnackBar);

  success(mensaje: string): void {
    this.mostrar(mensaje, 3000, 'notif-ok');
  }

  info(mensaje: string): void {
    this.mostrar(mensaje, 4000, 'notif-info');
  }

  error(mensaje: string): void {
    this.mostrar(mensaje, 6000, 'notif-error');
  }

  private mostrar(mensaje: string, duration: number, clase: string): void {
    if (!mensaje.trim()) return;
    this.snack.open(mensaje, 'Cerrar', {
      duration,
      panelClass: [clase],
      horizontalPosition: 'center',
      verticalPosition: 'bottom',
    });
  }
}