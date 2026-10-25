import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { EventsService } from '../../core/events.service';
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

describe('EventFormComponent', () => {
  let events: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  function crear(id?: string) {
    const fixture = TestBed.createComponent(EventFormComponent);
    if (id) fixture.componentRef.setInput('id', id);
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    events = { create: vi.fn(), update: vi.fn(), get: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: EventsService, useValue: events }],
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

  it('en modo alta crea el evento y vuelve al listado', () => {
    events.create.mockReturnValue(of({}));
    const f = crear();
    f.componentInstance.form.setValue(valido());

    f.componentInstance.submit();

    expect(events.create).toHaveBeenCalledTimes(1);
    const enviado = events.create.mock.calls[0][0];
    expect(enviado.startsAt).toBeInstanceOf(Date);
    expect(enviado.totalCapacity).toBe(100);
    expect(router.navigateByUrl).toHaveBeenCalledWith('/eventos');
  });

  it('en modo edición carga el evento y actualiza', () => {
    events.get.mockReturnValue(
      of({
        id: 'e1',
        name: 'Viejo',
        description: '',
        venue: 'Teatro',
        startsAt: new Date(Date.now() + 5 * 86_400_000),
        totalCapacity: 50,
        availableCapacity: 50,
        status: 'ACTIVO',
      }),
    );
    events.update.mockReturnValue(of({}));
    const f = crear('e1');

    expect(f.componentInstance.form.controls.name.value).toBe('Viejo');
    f.componentInstance.form.patchValue({ name: 'Nuevo' });
    f.componentInstance.submit();

    expect(events.update).toHaveBeenCalledWith('e1', expect.objectContaining({ name: 'Nuevo' }));
    expect(router.navigateByUrl).toHaveBeenCalledWith('/eventos');
  });

  it('muestra el mensaje de FECHA_PASADA devuelto por la API', () => {
    events.create.mockReturnValue(
      throwError(() => ({ status: 400, error: { error: { code: 'FECHA_PASADA' } } })),
    );
    const f = crear();
    f.componentInstance.form.setValue(valido());

    f.componentInstance.submit();

    expect(f.componentInstance.error()).toContain('fecha');
    expect(f.componentInstance.loading()).toBe(false);
  });

  it('muestra el mensaje de CUPO_MENOR_A_RESERVAS', () => {
    events.get.mockReturnValue(
      of({
        id: 'e1',
        name: 'A',
        description: '',
        venue: 'B',
        startsAt: new Date(Date.now() + 5 * 86_400_000),
        totalCapacity: 50,
        availableCapacity: 10,
        status: 'ACTIVO',
      }),
    );
    events.update.mockReturnValue(
      throwError(() => ({ status: 409, error: { error: { code: 'CUPO_MENOR_A_RESERVAS' } } })),
    );
    const f = crear('e1');

    f.componentInstance.submit();

    expect(f.componentInstance.error()).toContain('reservados');
  });

  it('con un error genérico muestra un mensaje genérico', () => {
    events.create.mockReturnValue(throwError(() => ({ status: 500 })));
    const f = crear();
    f.componentInstance.form.setValue(valido());

    f.componentInstance.submit();

    expect(f.componentInstance.error()).toContain('Ocurrió un error');
  });
});