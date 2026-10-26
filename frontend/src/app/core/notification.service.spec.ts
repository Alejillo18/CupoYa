import { TestBed } from '@angular/core/testing';
import { MatSnackBar } from '@angular/material/snack-bar';
import { vi } from 'vitest';
import { NotificationService } from './notification.service';

describe('NotificationService', () => {
  let snack: { open: ReturnType<typeof vi.fn> };
  let service: NotificationService;

  beforeEach(() => {
    snack = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: MatSnackBar, useValue: snack }],
    });
    service = TestBed.inject(NotificationService);
  });

  it('success muestra el mensaje 3 segundos con estilo de éxito', () => {
    service.success('Reserva confirmada');

    expect(snack.open).toHaveBeenCalledWith(
      'Reserva confirmada',
      'Cerrar',
      expect.objectContaining({ duration: 3000, panelClass: ['notif-ok'] }),
    );
  });

  it('error dura más y tiene estilo de error', () => {
    service.error('No hay cupo');

    expect(snack.open).toHaveBeenCalledWith(
      'No hay cupo',
      'Cerrar',
      expect.objectContaining({ duration: 6000, panelClass: ['notif-error'] }),
    );
  });

  it('info usa 4 segundos y estilo neutro', () => {
    service.info('Cargando…');

    expect(snack.open).toHaveBeenCalledWith(
      'Cargando…',
      'Cerrar',
      expect.objectContaining({ duration: 4000, panelClass: ['notif-info'] }),
    );
  });

  it('ignora mensajes vacíos', () => {
    service.error('');
    service.success('   ');

    expect(snack.open).not.toHaveBeenCalled();
  });
});