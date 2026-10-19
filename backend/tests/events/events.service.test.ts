import { EventsService } from '../../src/modules/events/events.service';
import { FakeEventRepository } from '../helpers/fakeEventRepository';

const AHORA = new Date('2026-10-20T12:00:00Z');
const FUTURO = new Date('2026-12-01T20:00:00Z');
const base = { name: 'Recital', venue: 'Estadio', startsAt: FUTURO, totalCapacity: 100 };

describe('EventsService', () => {
  let repo: FakeEventRepository;
  let service: EventsService;

  beforeEach(() => {
    repo = new FakeEventRepository();
    service = new EventsService(repo, () => AHORA);
  });

  describe('create', () => {
    it('crea el evento con cupo disponible igual al total', async () => {
      const e = await service.create(base);

      expect(e.availableCapacity).toBe(100);
      expect(e.status).toBe('ACTIVO');
    });

    it('rechaza fechas pasadas (400)', async () => {
      await expect(
        service.create({ ...base, startsAt: new Date('2026-10-01T00:00:00Z') }),
      ).rejects.toMatchObject({ status: 400, code: 'FECHA_PASADA' });
    });

    it('rechaza un cupo menor o igual a cero (400)', async () => {
      await expect(service.create({ ...base, totalCapacity: 0 })).rejects.toMatchObject({
        status: 400,
        code: 'CUPO_INVALIDO',
      });
    });
  });

  describe('get', () => {
    it('devuelve el evento', async () => {
      const e = await service.create(base);

      expect((await service.get(e.id)).name).toBe('Recital');
    });

    it('si no existe devuelve 404', async () => {
      await expect(service.get('nada')).rejects.toMatchObject({
        status: 404,
        code: 'EVENTO_NO_ENCONTRADO',
      });
    });
  });

  describe('list', () => {
    it('lista solo activos y futuros, ordenados por fecha', async () => {
      await service.create({ ...base, name: 'B', startsAt: new Date('2026-12-05T20:00:00Z') });
      await service.create({ ...base, name: 'A', startsAt: new Date('2026-11-05T20:00:00Z') });
      const cancelado = await service.create({ ...base, name: 'C' });
      await service.cancel(cancelado.id);

      const r = await service.list({ page: 1, pageSize: 10 });

      expect(r.items.map((e) => e.name)).toEqual(['A', 'B']);
      expect(r.total).toBe(2);
    });

    it('pagina los resultados', async () => {
      for (let i = 0; i < 5; i++) await service.create({ ...base, name: `E${i}` });

      const r = await service.list({ page: 2, pageSize: 2 });

      expect(r.items).toHaveLength(2);
      expect(r.total).toBe(5);
      expect(r.page).toBe(2);
    });

    it('limita el tamaño de página a 100', async () => {
      const r = await service.list({ page: 1, pageSize: 5000 });

      expect(r.pageSize).toBe(100);
    });
  });

  describe('update', () => {
    it('modifica los datos del evento', async () => {
      const e = await service.create(base);

      const r = await service.update(e.id, { name: 'Nuevo nombre' });

      expect(r.name).toBe('Nuevo nombre');
    });

    it('al subir el cupo aumenta el disponible', async () => {
      const e = await service.create(base);

      const r = await service.update(e.id, { totalCapacity: 150 });

      expect(r.availableCapacity).toBe(150);
    });

    it('no permite bajar el cupo por debajo de lo reservado (409)', async () => {
      const e = await service.create(base);
      repo.events[0].availableCapacity = 30; // 70 reservados

      await expect(service.update(e.id, { totalCapacity: 50 })).rejects.toMatchObject({
        status: 409,
        code: 'CUPO_MENOR_A_RESERVAS',
      });
    });

    it('rechaza una fecha pasada (400)', async () => {
      const e = await service.create(base);

      await expect(
        service.update(e.id, { startsAt: new Date('2026-01-01T00:00:00Z') }),
      ).rejects.toMatchObject({ status: 400, code: 'FECHA_PASADA' });
    });

    it('no permite editar un evento cancelado (409)', async () => {
      const e = await service.create(base);
      await service.cancel(e.id);

      await expect(service.update(e.id, { name: 'x' })).rejects.toMatchObject({
        status: 409,
        code: 'EVENTO_CANCELADO',
      });
    });

    it('si no existe devuelve 404', async () => {
      await expect(service.update('nada', { name: 'x' })).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('cancel', () => {
    it('deja el evento CANCELADO sin borrarlo', async () => {
      const e = await service.create(base);

      await service.cancel(e.id);

      expect(repo.events).toHaveLength(1);
      expect(repo.events[0].status).toBe('CANCELADO');
    });

    it('cancelar dos veces no falla (idempotente)', async () => {
      const e = await service.create(base);
      await service.cancel(e.id);

      await expect(service.cancel(e.id)).resolves.toBeUndefined();
    });

    it('si no existe devuelve 404', async () => {
      await expect(service.cancel('nada')).rejects.toMatchObject({ status: 404 });
    });
  });
});