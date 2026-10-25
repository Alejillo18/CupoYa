import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { EventsService } from '../../core/events.service';
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
  let events: { list: ReturnType<typeof vi.fn> };

  async function crear() {
    const fixture = TestBed.createComponent(EventsListComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture;
  }

  beforeEach(() => {
    events = { list: vi.fn() };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: EventsService, useValue: events }],
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
});