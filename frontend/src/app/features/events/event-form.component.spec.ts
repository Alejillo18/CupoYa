import { TestBed } from '@angular/core/testing';
import { MatFormField } from '@angular/material/form-field';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { EventsService } from '../../core/events.service';
import { NotificationService } from '../../core/notification.service';
import { EventFormComponent } from './event-form.component';

// Un momento a "n" días de hoy, a la hora indicada.
const enDias = (n: number, hora = 21, minutos = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(hora, minutos, 0, 0);
  return d;
};

const valido = () => ({
  name: 'Recital',
  description: 'Show',
  venue: 'Estadio',
  fecha: enDias(7),
  hora: enDias(7),
  totalCapacity: 100,
});

const eventoExistente = (disponible = 50, startsAt = enDias(5, 20, 30)) => ({
  id: 'e1',
  name: 'Viejo',
  description: '',
  venue: 'Teatro',
  startsAt,
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
    f.componentInstance.form.setValue({ ...valido(), fecha: enDias(-1), hora: enDias(-1) });

    expect(f.componentInstance.form.hasError('fechaPasada')).toBe(true);
  });

  it('rechaza hoy con una hora que ya pasó', () => {
    const f = crear();
    const haceUnMinuto = new Date(Date.now() - 60_000);
    f.componentInstance.form.setValue({ ...valido(), fecha: haceUnMinuto, hora: haceUnMinuto });

    expect(f.componentInstance.form.hasError('fechaPasada')).toBe(true);
  });

  it('acepta hoy con una hora que todavía no llegó', () => {
    const f = crear();
    const enDosHoras = new Date(Date.now() + 2 * 3_600_000);
    f.componentInstance.form.setValue({ ...valido(), fecha: enDosHoras, hora: enDosHoras });

    expect(f.componentInstance.form.hasError('fechaPasada')).toBe(false);
    expect(f.componentInstance.form.valid).toBe(true);
  });

  it('la fecha y la hora son obligatorias', () => {
    const f = crear();
    f.componentInstance.form.setValue({ ...valido(), fecha: null, hora: null });

    expect(f.componentInstance.form.controls.fecha.hasError('required')).toBe(true);
    expect(f.componentInstance.form.controls.hora.hasError('required')).toBe(true);
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

  it('combina el día elegido y la hora elegida en un solo inicio', () => {
    events.create.mockReturnValue(of({}));
    const f = crear();
    const dia = enDias(10, 0, 0);
    f.componentInstance.form.setValue({
      ...valido(),
      fecha: dia,
      hora: new Date(2000, 0, 1, 21, 30),
    });

    f.componentInstance.submit();

    const esperado = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 21, 30, 0, 0);
    expect(events.create.mock.calls[0][0].startsAt.getTime()).toBe(esperado.getTime());
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

  it('en modo edición separa el inicio del evento en fecha y hora', () => {
    const inicio = enDias(5, 20, 30);
    events.get.mockReturnValue(of(eventoExistente(50, inicio)));
    const f = crear('e1');

    const { fecha, hora } = f.componentInstance.form.getRawValue();
    expect(fecha!.toDateString()).toBe(inicio.toDateString());
    expect([hora!.getHours(), hora!.getMinutes()]).toEqual([20, 30]);
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

  describe('elección de fecha y hora', () => {
    it('ofrece un calendario para elegir la fecha y una lista para elegir la hora', () => {
      const f = crear();
      const raiz = f.nativeElement as HTMLElement;

      expect(raiz.querySelector('mat-datepicker-toggle')).not.toBeNull();
      expect(raiz.querySelector('mat-timepicker-toggle')).not.toBeNull();
    });

    it('no deja elegir días anteriores a hoy', () => {
      const f = crear();
      const inicioDeHoy = new Date();
      inicioDeHoy.setHours(0, 0, 0, 0);

      expect(f.componentInstance.hoy.getTime()).toBe(inicioDeHoy.getTime());
    });

    it('aclara el formato de la fecha y de la hora, y qué zona horaria se usa', () => {
      const f = crear();
      const texto = (f.nativeElement as HTMLElement).textContent!;

      expect(texto).toContain('dd/mm/aaaa');
      expect(texto).toContain('HH:mm');
      expect(texto).toContain('Hora de tu dispositivo');
    });

    it('si falta la fecha lo dice con claridad', () => {
      const f = crear();
      f.componentInstance.form.setValue({ ...valido(), fecha: null });

      f.componentInstance.submit();
      f.detectChanges();
      f.detectChanges();

      expect(f.nativeElement.textContent).toContain('Elegí la fecha del evento');
    });

    it('si falta la hora lo dice con claridad', () => {
      const f = crear();
      f.componentInstance.form.setValue({ ...valido(), hora: null });

      f.componentInstance.submit();
      f.detectChanges();
      f.detectChanges();

      expect(f.nativeElement.textContent).toContain('Elegí la hora de inicio');
    });

    it('si el inicio ya pasó explica que tiene que ser en el futuro', () => {
      const f = crear();
      const haceUnMinuto = new Date(Date.now() - 60_000);
      f.componentInstance.form.setValue({ ...valido(), fecha: haceUnMinuto, hora: haceUnMinuto });

      f.componentInstance.submit();
      f.detectChanges();
      f.detectChanges();

      expect(f.nativeElement.textContent).toContain('El evento tiene que empezar en el futuro');
    });

    it('los mensajes de error ocupan su lugar y no pisan los campos', () => {
      const f = crear();
      const campos = f.debugElement.queryAll(By.directive(MatFormField));

      expect(campos).toHaveLength(6);
      for (const campo of campos) {
        expect((campo.componentInstance as MatFormField).subscriptSizing).toBe('dynamic');
      }
    });
  });
});