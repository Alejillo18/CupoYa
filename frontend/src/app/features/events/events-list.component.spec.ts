import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { AuthService, Role } from '../../core/auth.service';
import { ConfirmService } from '../../core/confirm.service';
import { EventsService } from '../../core/events.service';
import { ReservationsService } from '../../core/reservations.service';
import { EventsListComponent } from './events-list.component';

const evento = (id: string, name: string, disponible = 40) => ({
  id,
  name,
  description: '',
  venue: 'Estadio',
  startsAt: new Date('2026-12-01T20:00:00Z'),
  totalCapacity: 100,
  availableCapacity: disponible,
  status: 'ACTIVO' as const,
});

describe('EventsListComponent', () => {
  let events: { list: ReturnType<typeof vi.fn>; cancel: ReturnType<typeof vi.fn> };
  let reservations: { reserve: ReturnType<typeof vi.fn> };
  let confirmar: { confirm: ReturnType<typeof vi.fn> };
  const rol = signal<Role | null>('USUARIO');

  async function crear() {
    const fixture = TestBed.createComponent(EventsListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    rol.set('USUARIO');
    events = { list: vi.fn(), cancel: vi.fn() };
    reservations = { reserve: vi.fn() };
    confirmar = { confirm: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EventsService, useValue: events },
        { provide: AuthService, useValue: { role: rol } },
        { provide: ReservationsService, useValue: reservations },
        { provide: ConfirmService, useValue: confirmar },
      ],
    });
  });

  it('carga la primera página al iniciar', async () => {
    events.list.mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 10 }));

    await crear();

    expect(events.list).toHaveBeenCalledWith(1, 10);
  });

  it('muestra nombre, lugar y cupo disponible', async () => {
    events.list.mockReturnValue(
      of({ items: [evento('e1', 'Recital')], total: 1, page: 1, pageSize: 10 }),
    );

    const f = await crear();

    const texto = f.nativeElement.textContent;
    expect(texto).toContain('Recital');
    expect(texto).toContain('Estadio');
    expect(texto).toContain('40 / 100');
  });

  it('muestra "Agotado" cuando no quedan lugares', async () => {
    events.list.mockReturnValue(
      of({ items: [evento('e1', 'Final', 0)], total: 1, page: 1, pageSize: 10 }),
    );

    const f = await crear();

    expect(f.nativeElement.textContent).toContain('Agotado');
  });

  it('sin eventos muestra el mensaje de vacío', async () => {
    events.list.mockReturnValue(of({ items: [], total: 0, page: 1, pageSize: 10 }));

    const f = await crear();

    expect(f.nativeElement.textContent).toContain('No hay eventos disponibles');
  });

  it('ante un error muestra mensaje y permite reintentar', async () => {
    events.list.mockReturnValueOnce(throwError(() => ({ status: 500 })));
    const f = await crear();
    expect(f.nativeElement.textContent).toContain('No pudimos cargar los eventos');

    events.list.mockReturnValue(
      of({ items: [evento('e1', 'Recital')], total: 1, page: 1, pageSize: 10 }),
    );
    f.componentInstance.cargar(1);
    f.detectChanges();

    expect(f.nativeElement.textContent).toContain('Recital');
    expect(f.nativeElement.textContent).not.toContain('No pudimos cargar los eventos');
  });

  it('siguiente pide la página 2 y anterior vuelve a la 1', async () => {
    events.list.mockReturnValue(
      of({ items: [evento('e1', 'A')], total: 25, page: 1, pageSize: 10 }),
    );
    const f = await crear();

    events.list.mockReturnValue(
      of({ items: [evento('e2', 'B')], total: 25, page: 2, pageSize: 10 }),
    );
    f.componentInstance.siguiente();
    expect(events.list).toHaveBeenLastCalledWith(2, 10);

    f.componentInstance.anterior();
    expect(events.list).toHaveBeenLastCalledWith(1, 10);
  });

  it('no avanza más allá de la última página ni retrocede antes de la primera', async () => {
    events.list.mockReturnValue(
      of({ items: [evento('e1', 'A')], total: 5, page: 1, pageSize: 10 }),
    );
    const f = await crear();
    const llamadas = events.list.mock.calls.length;

    f.componentInstance.siguiente();
    f.componentInstance.anterior();

    expect(events.list.mock.calls.length).toBe(llamadas);
  });

  describe('gestión (OPERADOR y ADMIN)', () => {
    const conEvento = () =>
      events.list.mockReturnValue(
        of({ items: [evento('e1', 'Recital')], total: 1, page: 1, pageSize: 10 }),
      );

    it('un USUARIO no ve los botones de gestión', async () => {
      conEvento();

      const f = await crear();

      const texto = f.nativeElement.textContent;
      expect(texto).not.toContain('Nuevo evento');
      expect(texto).not.toContain('Editar');
      expect(texto).not.toContain('Cancelar evento');
    });

    it('un OPERADOR ve Nuevo, Editar y Cancelar', async () => {
      rol.set('OPERADOR');
      conEvento();

      const f = await crear();

      const texto = f.nativeElement.textContent;
      expect(texto).toContain('Nuevo evento');
      expect(texto).toContain('Editar');
      expect(texto).toContain('Cancelar evento');
    });

    it('un ADMIN también ve los botones de gestión', async () => {
      rol.set('ADMIN');
      conEvento();

      const f = await crear();

      expect(f.nativeElement.textContent).toContain('Nuevo evento');
    });

    it('cancelar con confirmación llama a la API y recarga', async () => {
      rol.set('OPERADOR');
      conEvento();
      events.cancel.mockReturnValue(of(undefined));
      confirmar.confirm.mockReturnValue(of(true));
      const f = await crear();
      const llamadas = events.list.mock.calls.length;

      f.componentInstance.cancelar(evento('e1', 'Recital'));

      expect(events.cancel).toHaveBeenCalledWith('e1');
      expect(events.list.mock.calls.length).toBe(llamadas + 1);
    });

    it('pide confirmación nombrando el evento', async () => {
      rol.set('OPERADOR');
      conEvento();
      confirmar.confirm.mockReturnValue(of(false));
      const f = await crear();

      f.componentInstance.cancelar(evento('e1', 'Recital'));

      expect(confirmar.confirm).toHaveBeenCalledWith(
        expect.objectContaining({ mensaje: expect.stringContaining('Recital') }),
      );
    });

    it('si el usuario no confirma, no cancela', async () => {
      rol.set('OPERADOR');
      conEvento();
      confirmar.confirm.mockReturnValue(of(false));
      const f = await crear();

      f.componentInstance.cancelar(evento('e1', 'Recital'));

      expect(events.cancel).not.toHaveBeenCalled();
    });

    it('si la API falla al cancelar muestra un mensaje', async () => {
      rol.set('OPERADOR');
      conEvento();
      events.cancel.mockReturnValue(throwError(() => ({ status: 500 })));
      confirmar.confirm.mockReturnValue(of(true));
      const f = await crear();

      f.componentInstance.cancelar(evento('e1', 'Recital'));

      expect(f.componentInstance.error()).toContain('No pudimos cancelar');
    });
  });

  describe('reservar', () => {
    const conEvento = (disponible = 40) =>
      events.list.mockReturnValue(
        of({ items: [evento('e1', 'Recital', disponible)], total: 1, page: 1, pageSize: 10 }),
      );

    it('reserva la cantidad elegida y recarga el listado', async () => {
      conEvento();
      reservations.reserve.mockReturnValue(of({ id: 'r1' }));
      const f = await crear();
      const llamadas = events.list.mock.calls.length;

      f.componentInstance.setCantidad('e1', 3);
      f.componentInstance.reservar(evento('e1', 'Recital'));

      expect(reservations.reserve).toHaveBeenCalledWith('e1', 3, expect.any(String));
      expect(events.list.mock.calls.length).toBe(llamadas + 1);
      expect(f.componentInstance.aviso()).toContain('Reserva confirmada');
    });

    it('por defecto reserva 1 lugar', async () => {
      conEvento();
      reservations.reserve.mockReturnValue(of({ id: 'r1' }));
      const f = await crear();

      f.componentInstance.reservar(evento('e1', 'Recital'));

      expect(reservations.reserve).toHaveBeenCalledWith('e1', 1, expect.any(String));
    });

    it.each([
      ['CUPO_INSUFICIENTE', 'No hay lugares suficientes'],
      ['LIMITE_SUPERADO', 'máximo de 4'],
      ['EVENTO_NO_DISPONIBLE', 'cancelado o ya pasó'],
    ])('con %s muestra el mensaje correspondiente', async (codigo, texto) => {
      conEvento();
      reservations.reserve.mockReturnValue(
        throwError(() => ({ status: 409, error: { error: { code: codigo } } })),
      );
      const f = await crear();

      f.componentInstance.reservar(evento('e1', 'Recital'));

      expect(f.componentInstance.error()).toContain(texto);
    });

    it('reintenta con la misma clave tras un error de red', async () => {
      conEvento();
      reservations.reserve.mockReturnValue(throwError(() => ({ status: 0 })));
      const f = await crear();

      f.componentInstance.reservar(evento('e1', 'Recital'));
      f.componentInstance.reservar(evento('e1', 'Recital'));

      const k1 = reservations.reserve.mock.calls[0][2];
      const k2 = reservations.reserve.mock.calls[1][2];
      expect(k1).toBe(k2);
    });

    it('usa una clave nueva después de una respuesta definitiva', async () => {
      conEvento();
      reservations.reserve.mockReturnValue(
        throwError(() => ({ status: 409, error: { error: { code: 'CUPO_INSUFICIENTE' } } })),
      );
      const f = await crear();

      f.componentInstance.reservar(evento('e1', 'Recital'));
      f.componentInstance.reservar(evento('e1', 'Recital'));

      expect(reservations.reserve.mock.calls[0][2]).not.toBe(reservations.reserve.mock.calls[1][2]);
    });

    it('un evento agotado tiene el botón Reservar deshabilitado', async () => {
      conEvento(0);

      const f = await crear();

      const boton = Array.from(f.nativeElement.querySelectorAll('button')).find((b: any) =>
        b.textContent.includes('Reservar'),
      ) as HTMLButtonElement;
      expect(boton.disabled).toBe(true);
    });
  });
});