import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { EventItem, EventsService } from '../../core/events.service';
import { EstadoConexion, EventOccupancy, OccupancyService } from '../../core/occupancy.service';
import { OccupancyLiveComponent, seleccionInicial } from './occupancy-live.component';

const DIA = 24 * 60 * 60 * 1000;

const evento = (
  id: string,
  dias: number,
  status: 'ACTIVO' | 'CANCELADO' = 'ACTIVO',
): EventItem => ({
  id,
  name: `Evento ${id}`,
  description: '',
  venue: 'Sala',
  startsAt: new Date(Date.now() + dias * DIA),
  totalCapacity: 100,
  availableCapacity: 100,
  status,
});

const vivo = (id: string, confirmados: number, total = 100): EventOccupancy => ({
  eventId: id,
  name: `Evento ${id}`,
  status: 'ACTIVO',
  totalCapacity: total,
  availableCapacity: total - confirmados,
  confirmedSeats: confirmados,
  occupancyPercent: Math.round((confirmados / total) * 100),
});

// fixture.nativeElement es `any`; con este ayudante queda tipado como HTMLElement.
const el = (f: { nativeElement: any }) => f.nativeElement as HTMLElement;

describe('seleccionInicial', () => {
  const ahora = new Date('2026-06-01T12:00:00Z');
  const en = (id: string, iso: string, status: 'ACTIVO' | 'CANCELADO' = 'ACTIVO') => ({
    ...evento(id, 0, status),
    startsAt: new Date(iso),
  });

  it('elige los más próximos por fecha, ignorando pasados y cancelados', () => {
    const items = [
      en('lejano', '2026-09-01T00:00:00Z'),
      en('pasado', '2026-05-01T00:00:00Z'),
      en('cancelado', '2026-06-02T00:00:00Z', 'CANCELADO'),
      en('cercano', '2026-06-10T00:00:00Z'),
      en('medio', '2026-07-01T00:00:00Z'),
    ];

    expect(seleccionInicial(items, ahora)).toEqual(['cercano', 'medio', 'lejano']);
  });

  it('respeta el máximo', () => {
    const items = ['a', 'b', 'c', 'd'].map((id, i) => en(id, `2026-07-0${i + 1}T00:00:00Z`));

    expect(seleccionInicial(items, ahora, 2)).toEqual(['a', 'b']);
  });
});

describe('OccupancyLiveComponent', () => {
  const estado = signal<EstadoConexion>('conectando');
  const eventos = signal<Record<string, EventOccupancy>>({});
  const error = signal<string | null>(null);
  const ocupacion = {
    estado: estado.asReadonly(),
    eventos: eventos.asReadonly(),
    error: error.asReadonly(),
    seguir: vi.fn(),
    detener: vi.fn(),
  };

  function montar(items: EventItem[] | 'error') {
    estado.set('conectando');
    eventos.set({});
    error.set(null);
    ocupacion.seguir.mockClear();
    ocupacion.detener.mockClear();
    const list = vi.fn(() =>
      items === 'error'
        ? throwError(() => new Error('falló'))
        : of({ items, total: items.length, page: 1, pageSize: 50 }),
    );
    TestBed.configureTestingModule({
      providers: [
        { provide: EventsService, useValue: { list } },
        { provide: OccupancyService, useValue: ocupacion },
      ],
    });
    const fixture = TestBed.createComponent(OccupancyLiveComponent);
    fixture.detectChanges();
    return fixture;
  }

  const barras = (f: { nativeElement: any }) =>
    Array.from(el(f).querySelectorAll<HTMLElement>('.barra'));

  it('al iniciar sigue los 5 eventos activos más próximos', () => {
    montar([1, 2, 3, 4, 5, 6, 7].map((d) => evento(`e${d}`, 8 - d)));

    expect(ocupacion.seguir).toHaveBeenCalledWith(['e7', 'e6', 'e5', 'e4', 'e3']);
  });

  it('no sigue eventos pasados ni cancelados', () => {
    montar([evento('pasado', -2), evento('cancelado', 1, 'CANCELADO'), evento('a', 3)]);

    expect(ocupacion.seguir).toHaveBeenCalledWith(['a']);
  });

  it('sin eventos próximos avisa y no abre la conexión', () => {
    const f = montar([evento('pasado', -2)]);

    expect(ocupacion.seguir).not.toHaveBeenCalled();
    expect(el(f).textContent).toContain('No hay eventos próximos');
  });

  it('si falla la carga de eventos lo informa', () => {
    const f = montar('error');

    expect(ocupacion.seguir).not.toHaveBeenCalled();
    expect(el(f).querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudieron cargar los eventos',
    );
  });

  it('muestra una barra por evento seguido con nombre y valores', () => {
    const f = montar([evento('a', 1), evento('b', 2)]);
    eventos.set({ a: vivo('a', 35), b: vivo('b', 80) });
    f.detectChanges();

    const filas = barras(f);
    expect(filas).toHaveLength(2);
    expect(filas[0].textContent).toContain('Evento a');
    expect(filas[0].textContent).toContain('35 / 100');
    expect(filas[0].textContent).toContain('35%');
    expect(filas[1].textContent).toContain('80 / 100');
  });

  it('el ancho de la parte llena es el porcentaje de ocupación', () => {
    const f = montar([evento('a', 1)]);
    eventos.set({ a: vivo('a', 35) });
    f.detectChanges();

    const lleno = el(f).querySelector<HTMLElement>('.barra__lleno')!;
    expect(lleno.style.width).toBe('35%');
  });

  it('la barra se actualiza sola cuando llega un cambio', () => {
    const f = montar([evento('a', 1)]);
    eventos.set({ a: vivo('a', 35) });
    f.detectChanges();

    eventos.set({ a: vivo('a', 60) });
    f.detectChanges();

    const lleno = el(f).querySelector<HTMLElement>('.barra__lleno')!;
    expect(lleno.style.width).toBe('60%');
    expect(barras(f)[0].textContent).toContain('60 / 100');
  });

  it('antes del primer dato muestra la barra vacía con un guion', () => {
    const f = montar([evento('a', 1)]);

    expect(barras(f)).toHaveLength(1);
    expect(barras(f)[0].textContent).toContain('—');
    expect(el(f).querySelector<HTMLElement>('.barra__lleno')!.style.width).toBe('0%');
  });

  it('marca como alta la ocupación de 90% o más', () => {
    const f = montar([evento('a', 1), evento('b', 2)]);
    eventos.set({ a: vivo('a', 90), b: vivo('b', 89) });
    f.detectChanges();

    const llenos = el(f).querySelectorAll<HTMLElement>('.barra__lleno');
    expect(llenos[0].classList.contains('alta')).toBe(true);
    expect(llenos[1].classList.contains('alta')).toBe(false);
  });

  it('cada barra tiene una descripción accesible', () => {
    const f = montar([evento('a', 1)]);
    eventos.set({ a: vivo('a', 35) });
    f.detectChanges();

    const pista = el(f).querySelector('.barra__pista')!;
    expect(pista.getAttribute('aria-label')).toBe(
      'Evento a: 35 de 100 asientos confirmados (35%)',
    );
  });

  it('cambiar la selección sigue esos eventos y deja de mostrar los otros', () => {
    const f = montar([evento('a', 1), evento('b', 2), evento('c', 3)]);

    f.componentInstance.cambiar(['b']);
    f.detectChanges();

    expect(ocupacion.seguir).toHaveBeenLastCalledWith(['b']);
    expect(barras(f)).toHaveLength(1);
  });

  it('cambiar nunca sigue más de 5 eventos', () => {
    const f = montar([evento('a', 1)]);

    f.componentInstance.cambiar(['a', 'b', 'c', 'd', 'e', 'f']);

    expect(ocupacion.seguir).toHaveBeenLastCalledWith(['a', 'b', 'c', 'd', 'e']);
  });

  it('sin eventos elegidos cierra la conexión', () => {
    const f = montar([evento('a', 1)]);

    f.componentInstance.cambiar([]);

    expect(ocupacion.detener).toHaveBeenCalled();
  });

  it('con 5 elegidos deshabilita las demás opciones pero no las elegidas', () => {
    const f = montar([evento('a', 1)]);
    f.componentInstance.cambiar(['a', 'b', 'c', 'd', 'e']);

    expect(f.componentInstance.deshabilitada('z')).toBe(true);
    expect(f.componentInstance.deshabilitada('a')).toBe(false);
  });

  it('con menos de 5 elegidos ninguna opción queda deshabilitada', () => {
    const f = montar([evento('a', 1)]);
    f.componentInstance.cambiar(['a', 'b']);

    expect(f.componentInstance.deshabilitada('z')).toBe(false);
  });

  it('muestra el estado de la conexión', () => {
    const f = montar([evento('a', 1)]);
    estado.set('en-vivo');
    f.detectChanges();
    expect(el(f).querySelector('[role="status"]')?.textContent).toContain('En vivo');

    estado.set('reconectando');
    f.detectChanges();
    expect(el(f).querySelector('[role="status"]')?.textContent).toContain('Reconectando');
  });

  it('traduce los errores del servicio a un mensaje claro', () => {
    const f = montar([evento('a', 1)]);

    error.set('SIN_PERMISO');
    f.detectChanges();
    expect(el(f).querySelector('[role="alert"]')?.textContent).toContain('permiso');

    error.set('SESION_VENCIDA');
    f.detectChanges();
    expect(el(f).querySelector('[role="alert"]')?.textContent).toContain('sesión');
  });

  it('al destruirse cierra la conexión', () => {
    const f = montar([evento('a', 1)]);

    f.destroy();

    expect(ocupacion.detener).toHaveBeenCalled();
  });
});