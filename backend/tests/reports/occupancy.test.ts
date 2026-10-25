import { calcularOcupacion } from '../../src/modules/reports/occupancy';

const evento = (id: string, total: number, disponible: number, dias = 10, status = 'ACTIVO') => ({
  id,
  name: `Evento ${id}`,
  venue: 'Estadio',
  startsAt: new Date(Date.UTC(2026, 11, dias)),
  status,
  totalCapacity: total,
  availableCapacity: disponible,
});

const reserva = (eventId: string, quantity: number, status: 'CONFIRMADA' | 'CANCELADA' = 'CONFIRMADA') => ({
  eventId,
  quantity,
  status,
});

describe('calcularOcupacion', () => {
  it('sin eventos devuelve totales en cero', () => {
    const r = calcularOcupacion([], []);

    expect(r.events).toEqual([]);
    expect(r.totals).toEqual({
      events: 0,
      totalCapacity: 0,
      confirmedSeats: 0,
      occupancyPercent: 0,
      inconsistentEvents: 0,
    });
  });

  it('suma lugares confirmados y cancelados por separado', () => {
    const r = calcularOcupacion(
      [evento('a', 100, 70)],
      [reserva('a', 2), reserva('a', 4), reserva('a', 3, 'CANCELADA')],
    );

    expect(r.events[0]).toMatchObject({
      confirmedSeats: 6,
      cancelledSeats: 3,
      reservations: 2,
    });
  });

  it('calcula el porcentaje de ocupación con 2 decimales', () => {
    const r = calcularOcupacion([evento('a', 3, 2)], [reserva('a', 1)]);

    expect(r.events[0].occupancyPercent).toBe(33.33);
  });

  it('un evento sin reservas tiene 0 % y es consistente', () => {
    const r = calcularOcupacion([evento('a', 50, 50)], []);

    expect(r.events[0]).toMatchObject({ confirmedSeats: 0, occupancyPercent: 0, consistent: true });
  });

  it('marca como inconsistente si disponible + confirmadas no suma el cupo', () => {
    const r = calcularOcupacion([evento('a', 10, 5)], [reserva('a', 2)]);

    expect(r.events[0].consistent).toBe(false);
    expect(r.totals.inconsistentEvents).toBe(1);
  });

  it('ignora reservas de eventos que no están en la lista', () => {
    const r = calcularOcupacion([evento('a', 10, 10)], [reserva('zzz', 4)]);

    expect(r.totals.confirmedSeats).toBe(0);
  });

  it('un cupo total de 0 no produce división por cero', () => {
    const r = calcularOcupacion([evento('a', 0, 0)], []);

    expect(r.events[0].occupancyPercent).toBe(0);
    expect(r.totals.occupancyPercent).toBe(0);
  });

  it('ordena los eventos por fecha', () => {
    const r = calcularOcupacion(
      [evento('c', 10, 10, 25), evento('a', 10, 10, 5), evento('b', 10, 10, 15)],
      [],
    );

    expect(r.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
  });

  it('calcula los totales generales sobre todos los eventos', () => {
    const r = calcularOcupacion(
      [evento('a', 100, 90), evento('b', 100, 50)],
      [reserva('a', 4), reserva('a', 4), reserva('a', 2), reserva('b', 4), reserva('b', 4)],
    );

    expect(r.totals).toMatchObject({
      events: 2,
      totalCapacity: 200,
      confirmedSeats: 18,
      occupancyPercent: 9,
    });
  });

  it('devuelve las fechas como texto ISO para poder guardarse como JSON', () => {
    const r = calcularOcupacion([evento('a', 10, 10, 5)], []);

    expect(r.events[0].startsAt).toBe('2026-12-05T00:00:00.000Z');
  });
});