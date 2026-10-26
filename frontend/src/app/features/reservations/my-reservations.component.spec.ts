import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { ConfirmService } from '../../core/confirm.service';
import { EventsService } from '../../core/events.service';
import { NotificationService } from '../../core/notification.service';
import { ReservationsService } from '../../core/reservations.service';
import { MyReservationsComponent } from './my-reservations.component';

const reserva = (id: string, status: 'CONFIRMADA' | 'CANCELADA' = 'CONFIRMADA', eventId = 'e1') => ({
  id,
  userId: 'u1',
  eventId,
  quantity: 2,
  status,
  createdAt: new Date('2026-10-25T12:00:00Z'),
  cancelledAt: null,
});

describe('MyReservationsComponent', () => {
  let reservations: { listMine: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  let events: { get: ReturnType<typeof vi.fn> };
  let confirmar: { confirm: ReturnType<typeof vi.fn> };
  let notif: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };

  async function crear() {
    const fixture = TestBed.createComponent(MyReservationsComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    reservations = { listMine: vi.fn(), cancel: vi.fn() };
    events = { get: vi.fn().mockReturnValue(of({ id: 'e1', name: 'Recital' })) };
    confirmar = { confirm: vi.fn() };
    notif = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ReservationsService, useValue: reservations },
        { provide: EventsService, useValue: events },
        { provide: ConfirmService, useValue: confirmar },
        { provide: NotificationService, useValue: notif },
      ],
    });
  });

  it('muestra el nombre del evento, la cantidad y el estado en una tabla de Material', async () => {
    reservations.listMine.mockReturnValue(of([reserva('r1')]));

    const f = await crear();

    const t = f.nativeElement.textContent;
    expect(t).toContain('Recital');
    expect(t).toContain('2');
    expect(t).toContain('CONFIRMADA');
    expect(f.nativeElement.querySelector('table[mat-table]')).not.toBeNull();
  });

  it('pide una sola vez el evento aunque haya varias reservas del mismo', async () => {
    reservations.listMine.mockReturnValue(of([reserva('r1'), reserva('r2')]));

    await crear();

    expect(events.get).toHaveBeenCalledTimes(1);
  });

  it('si no puede cargar el evento igual muestra la reserva', async () => {
    events.get.mockReturnValue(throwError(() => ({ status: 404 })));
    reservations.listMine.mockReturnValue(of([reserva('r1')]));

    const f = await crear();

    expect(f.nativeElement.textContent).toContain('CONFIRMADA');
  });

  it('sin reservas muestra el mensaje de vacío', async () => {
    reservations.listMine.mockReturnValue(of([]));

    const f = await crear();

    expect(f.nativeElement.textContent).toContain('Todavía no tenés reservas');
  });

  it('ante un error de carga muestra mensaje y permite reintentar', async () => {
    reservations.listMine.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    const f = await crear();
    expect(f.nativeElement.textContent).toContain('No pudimos cargar tus reservas');
    expect(f.nativeElement.textContent).toContain('Reintentar');

    reservations.listMine.mockReturnValue(of([reserva('r1')]));
    f.componentInstance.cargar();
    f.detectChanges();

    expect(f.nativeElement.textContent).toContain('Recital');
    expect(f.nativeElement.textContent).not.toContain('No pudimos cargar tus reservas');
  });

  it('solo las confirmadas tienen botón de cancelar', async () => {
    reservations.listMine.mockReturnValue(of([reserva('r1'), reserva('r2', 'CANCELADA')]));

    const f = await crear();

    const botones = f.nativeElement.querySelectorAll('button.cancelar');
    expect(botones.length).toBe(1);
  });

  it('cancelar con confirmación llama a la API, actualiza la fila y avisa', async () => {
    reservations.listMine.mockReturnValue(of([reserva('r1')]));
    reservations.cancel.mockReturnValue(of(reserva('r1', 'CANCELADA')));
    confirmar.confirm.mockReturnValue(of(true));
    const f = await crear();

    f.componentInstance.cancelar(f.componentInstance.items()[0]);

    expect(reservations.cancel).toHaveBeenCalledWith('r1');
    expect(f.componentInstance.items()[0].status).toBe('CANCELADA');
    expect(notif.success).toHaveBeenCalledWith(expect.stringContaining('Reserva cancelada'));
  });

  it('pide confirmación nombrando el evento', async () => {
    reservations.listMine.mockReturnValue(of([reserva('r1')]));
    confirmar.confirm.mockReturnValue(of(false));
    const f = await crear();

    f.componentInstance.cancelar(f.componentInstance.items()[0]);

    expect(confirmar.confirm).toHaveBeenCalledWith(
      expect.objectContaining({ mensaje: expect.stringContaining('Recital') }),
    );
  });

  it('si no confirma, no cancela', async () => {
    reservations.listMine.mockReturnValue(of([reserva('r1')]));
    confirmar.confirm.mockReturnValue(of(false));
    const f = await crear();

    f.componentInstance.cancelar(f.componentInstance.items()[0]);

    expect(reservations.cancel).not.toHaveBeenCalled();
  });

  it('si la API rechaza la cancelación (4xx) notifica y conserva el estado', async () => {
    reservations.listMine.mockReturnValue(of([reserva('r1')]));
    reservations.cancel.mockReturnValue(throwError(() => ({ status: 409 })));
    confirmar.confirm.mockReturnValue(of(true));
    const f = await crear();

    f.componentInstance.cancelar(f.componentInstance.items()[0]);

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('No pudimos cancelar'));
    expect(f.componentInstance.items()[0].status).toBe('CONFIRMADA');
  });

  it.each([0, 429, 500])(
    'con %i no notifica (lo avisa el interceptor) y conserva el estado',
    async (status) => {
      reservations.listMine.mockReturnValue(of([reserva('r1')]));
      reservations.cancel.mockReturnValue(throwError(() => ({ status })));
      confirmar.confirm.mockReturnValue(of(true));
      const f = await crear();

      f.componentInstance.cancelar(f.componentInstance.items()[0]);

      expect(notif.error).not.toHaveBeenCalled();
      expect(f.componentInstance.items()[0].status).toBe('CONFIRMADA');
    },
  );
});