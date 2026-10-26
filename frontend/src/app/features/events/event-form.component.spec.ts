import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { EventsService } from '../../core/events.service';
import { NotificationService } from '../../core/notification.service';
import { EventFormComponent } from './event-form.component';

const futuro = () => {
  const d = new Date(Date.now() + 7 * 86_400_000);
  d.setSeconds(0, 0);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const valido = () => ({
  name: 'Recital',
  description: 'Show',
  venue: 'Estadio',
  startsAt: futuro(),
  totalCapacity: 100,
});

const eventoExistente = (disponible = 50) => ({
  id: 'e1',
  name: 'Viejo',
  description: '',
  venue: 'Teatro',
  startsAt: new Date(Date.now() + 5 * 86_400_000),
  totalCapacity: 50,
  availableCapacity: disponible,
  status: 'ACTIVO',
});

describe('EventFormComponent', () => {
  let events: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let notif: { success: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> };
  let router: Router;

  function crear(id?: string) {
    const fixture = TestBed.createComponent(EventFormComponent);
    if (id) fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    events = { create: vi.fn(), update: vi.fn(), get: vi.fn() };
    notif = { success: vi.fn(), error: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: EventsService, useValue: events },
        { provide: NotificationService, useValue: notif },
      ],
    });
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  });

  it('no envía si el formulario es inválido', () => {
    const f = crear();
    f.componentInstance.form.setValue({ ...valido(), name: '' });

    f.componentInstance.submit();

    expect(events.create).not.toHaveBeenCalled();
  });

  it('con un formulario inválido muestra los mensajes de validación', () => {
    const f = crear();
    f.componentInstance.form.setValue({ ...valido(), name: '' });

    f.componentInstance.submit();
    f.detectChanges();
    f.detectChanges();

    expect(f.nativeElement.textContent).toContain('El nombre es obligatorio');
  });

  it('rechaza un cupo menor a 1 o no entero', () => {
    const f = crear();
    f.componentInstance.form.setValue({ ...valido(), totalCapacity: 0 });
    expect(f.componentInstance.form.controls.totalCapacity.invalid).toBe(true);
    f.componentInstance.form.setValue({ ...valido(), totalCapacity: 10.5 });
    expect(f.componentInstance.form.controls.totalCapacity.invalid).toBe(true);
  });

  it('rechaza una fecha pasada', () => {
    const f = crear();
    f.componentInstance.form.setValue({ ...valido(), startsAt: '2020-01-01T10:00' });

    expect(f.componentInstance.form.controls.startsAt.invalid).toBe(true);
  });

  it('en modo alta crea el evento, avisa y vuelve al listado', () => {
    events.create.mockReturnValue(of({}));
    const f = crear();
    f.componentInstance.form.setValue(valido());

    f.componentInstance.submit();

    expect(events.create).toHaveBeenCalledTimes(1);
    const enviado = events.create.mock.calls[0][0];
    expect(enviado.startsAt).toBeInstanceOf(Date);
    expect(enviado.totalCapacity).toBe(100);
    expect(notif.success).toHaveBeenCalledWith(expect.stringContaining('Evento creado'));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/eventos');
  });

  it('en modo edición carga el evento, actualiza y avisa', () => {
    events.get.mockReturnValue(of(eventoExistente()));
    events.update.mockReturnValue(of({}));
    const f = crear('e1');

    expect(f.componentInstance.form.controls.name.value).toBe('Viejo');
    f.componentInstance.form.patchValue({ name: 'Nuevo' });
    f.componentInstance.submit();

    expect(events.update).toHaveBeenCalledWith('e1', expect.objectContaining({ name: 'Nuevo' }));
    expect(notif.success).toHaveBeenCalledWith(expect.stringContaining('Evento actualizado'));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/eventos');
  });

  it('si el evento a editar no existe notifica el motivo', () => {
    events.get.mockReturnValue(
      throwError(() => ({ status: 404, error: { error: { code: 'EVENTO_NO_ENCONTRADO' } } })),
    );

    crear('e1');

    expect(notif.error).toHaveBeenCalledWith('El evento no existe.');
  });

  it('notifica el mensaje de FECHA_PASADA devuelto por la API', () => {
    events.create.mockReturnValue(
      throwError(() => ({ status: 400, error: { error: { code: 'FECHA_PASADA' } } })),
    );
    const f = crear();
    f.componentInstance.form.setValue(valido());

    f.componentInstance.submit();

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('fecha'));
    expect(f.componentInstance.loading()).toBe(false);
  });

  it('notifica el mensaje de CUPO_MENOR_A_RESERVAS', () => {
    events.get.mockReturnValue(of(eventoExistente(10)));
    events.update.mockReturnValue(
      throwError(() => ({ status: 409, error: { error: { code: 'CUPO_MENOR_A_RESERVAS' } } })),
    );
    const f = crear('e1');

    f.componentInstance.submit();

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('reservados'));
  });

  it('con un error 4xx sin código notifica un mensaje genérico', () => {
    events.create.mockReturnValue(throwError(() => ({ status: 400 })));
    const f = crear();
    f.componentInstance.form.setValue(valido());

    f.componentInstance.submit();

    expect(notif.error).toHaveBeenCalledWith(expect.stringContaining('Ocurrió un error'));
  });

  it.each([0, 429, 500])(
    'con %i no notifica (lo avisa el interceptor) y libera el botón',
    (status) => {
      events.create.mockReturnValue(throwError(() => ({ status })));
      const f = crear();
      f.componentInstance.form.setValue(valido());

      f.componentInstance.submit();

      expect(notif.error).not.toHaveBeenCalled();
      expect(f.componentInstance.loading()).toBe(false);
    },
  );
});