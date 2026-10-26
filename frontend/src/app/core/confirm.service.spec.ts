import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let dialog: { open: ReturnType<typeof vi.fn> };
  let service: ConfirmService;

  beforeEach(() => {
    dialog = { open: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: MatDialog, useValue: dialog }],
    });
    service = TestBed.inject(ConfirmService);
  });

  it('abre el diálogo con título, mensaje y textos por defecto', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });

    service.confirm({ titulo: 'Cancelar', mensaje: '¿Seguro?' }).subscribe();

    const datos = dialog.open.mock.calls[0][1].data;
    expect(datos).toMatchObject({
      titulo: 'Cancelar',
      mensaje: '¿Seguro?',
      confirmar: 'Aceptar',
      cancelar: 'Volver',
    });
  });

  it('devuelve true cuando el usuario acepta', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(true) });
    let r: boolean | undefined;

    service.confirm({ titulo: 't', mensaje: 'm' }).subscribe((v) => (r = v));

    expect(r).toBe(true);
  });

  it('devuelve false si cancela o cierra sin elegir', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(undefined) });
    let r: boolean | undefined;

    service.confirm({ titulo: 't', mensaje: 'm' }).subscribe((v) => (r = v));

    expect(r).toBe(false);
  });

  it('respeta los textos de botones personalizados', () => {
    dialog.open.mockReturnValue({ afterClosed: () => of(false) });

    service
      .confirm({ titulo: 't', mensaje: 'm', confirmar: 'Sí, cancelar', cancelar: 'No' })
      .subscribe();

    expect(dialog.open.mock.calls[0][1].data).toMatchObject({
      confirmar: 'Sí, cancelar',
      cancelar: 'No',
    });
  });
});