import {
    MAX_EVENTOS_POR_CLIENTE,
    OccupancyHub,
    OccupancyMessage,
    OccupancyRow,
  } from '../../src/modules/realtime/occupancy.hub';
  
  function fila(id: string, total = 100, disponible = 100): OccupancyRow {
    return {
      eventId: id,
      name: `Evento ${id}`,
      status: 'ACTIVO',
      totalCapacity: total,
      availableCapacity: disponible,
    };
  }
  
  function crearLoader(estado: Record<string, OccupancyRow>) {
    return jest.fn(async (ids: string[]) =>
      ids.map((id) => estado[id]).filter((f): f is OccupancyRow => f !== undefined),
    );
  }
  
  function cliente() {
    const mensajes: OccupancyMessage[] = [];
    return {
      mensajes,
      send: (m: OccupancyMessage) => {
        mensajes.push(m);
      },
    };
  }
  
  describe('OccupancyHub', () => {
    beforeEach(() => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });
  
    afterEach(() => {
      jest.restoreAllMocks();
    });
  
    it('al suscribirse envía una foto con confirmados y porcentaje calculados', async () => {
      const hub = new OccupancyHub(crearLoader({ a: fila('a', 200, 150) }));
      const c = cliente();
  
      await hub.subscribe('c1', ['a'], c.send);
  
      expect(c.mensajes).toEqual([
        {
          type: 'snapshot',
          events: [
            {
              eventId: 'a',
              name: 'Evento a',
              status: 'ACTIVO',
              totalCapacity: 200,
              availableCapacity: 150,
              confirmedSeats: 50,
              occupancyPercent: 25,
            },
          ],
        },
      ]);
    });
  
    it('el porcentaje es 0 si el cupo total es cero', async () => {
      const hub = new OccupancyHub(crearLoader({ a: fila('a', 0, 0) }));
      const c = cliente();
  
      await hub.subscribe('c1', ['a'], c.send);
  
      expect(c.mensajes[0].events[0].occupancyPercent).toBe(0);
    });
  
    it('no acepta más eventos por cliente que el máximo', async () => {
      const hub = new OccupancyHub(crearLoader({}));
      const ids = Array.from({ length: MAX_EVENTOS_POR_CLIENTE + 1 }, (_, i) => `e${i}`);
  
      await expect(hub.subscribe('c1', ids, cliente().send)).rejects.toMatchObject({
        code: 'DEMASIADOS_EVENTOS',
      });
    });
  
    it('los ids repetidos no cuentan dos veces para el límite', async () => {
      const hub = new OccupancyHub(crearLoader({}));
      const ids = ['a', 'a', 'b', 'c', 'd', 'e', 'e'];
  
      await expect(hub.subscribe('c1', ids, cliente().send)).resolves.toBeUndefined();
    });
  
    it('avisa un cambio solo a quien sigue ese evento', async () => {
      const estado: Record<string, OccupancyRow> = { a: fila('a'), b: fila('b') };
      const hub = new OccupancyHub(crearLoader(estado));
      const c1 = cliente();
      const c2 = cliente();
      await hub.subscribe('c1', ['a'], c1.send);
      await hub.subscribe('c2', ['b'], c2.send);
      c1.mensajes.length = 0;
      c2.mensajes.length = 0;
  
      estado.a = fila('a', 100, 90);
      hub.markChanged('a');
      await hub.flush();
  
      expect(c1.mensajes).toHaveLength(1);
      expect(c1.mensajes[0].type).toBe('ocupacion');
      expect(c1.mensajes[0].events[0]).toMatchObject({ eventId: 'a', confirmedSeats: 10 });
      expect(c2.mensajes).toHaveLength(0);
    });
  
    it('junta varios cambios del mismo evento en una sola consulta y un solo aviso', async () => {
      const loader = crearLoader({ a: fila('a') });
      const hub = new OccupancyHub(loader);
      const c = cliente();
      await hub.subscribe('c1', ['a'], c.send);
      c.mensajes.length = 0;
      loader.mockClear();
  
      hub.markChanged('a');
      hub.markChanged('a');
      hub.markChanged('a');
      await hub.flush();
  
      expect(loader).toHaveBeenCalledTimes(1);
      expect(loader).toHaveBeenCalledWith(['a']);
      expect(c.mensajes).toHaveLength(1);
    });
  
    it('sin cambios pendientes no consulta nada', async () => {
      const loader = crearLoader({ a: fila('a') });
      const hub = new OccupancyHub(loader);
      await hub.subscribe('c1', ['a'], cliente().send);
      loader.mockClear();
  
      await hub.flush();
  
      expect(loader).not.toHaveBeenCalled();
    });
  
    it('un cambio en un evento que nadie sigue no genera consulta', async () => {
      const loader = crearLoader({ a: fila('a'), z: fila('z') });
      const hub = new OccupancyHub(loader);
      await hub.subscribe('c1', ['a'], cliente().send);
      loader.mockClear();
  
      hub.markChanged('z');
      await hub.flush();
  
      expect(loader).not.toHaveBeenCalled();
    });
  
    it('después de desuscribirse no recibe más avisos', async () => {
      const hub = new OccupancyHub(crearLoader({ a: fila('a') }));
      const c = cliente();
      await hub.subscribe('c1', ['a'], c.send);
      c.mensajes.length = 0;
  
      hub.unsubscribe('c1');
      hub.markChanged('a');
      await hub.flush();
  
      expect(c.mensajes).toHaveLength(0);
    });
  
    it('al volver a suscribirse reemplaza los eventos que seguía', async () => {
      const hub = new OccupancyHub(crearLoader({ a: fila('a'), b: fila('b') }));
      const c = cliente();
      await hub.subscribe('c1', ['a'], c.send);
      await hub.subscribe('c1', ['b'], c.send);
      c.mensajes.length = 0;
  
      hub.markChanged('a');
      hub.markChanged('b');
      await hub.flush();
  
      expect(c.mensajes).toHaveLength(1);
      expect(c.mensajes[0].events.map((e) => e.eventId)).toEqual(['b']);
    });
  
    it('si la consulta falla conserva los cambios para el próximo ciclo', async () => {
      let fallar = false;
      const loader = jest.fn(async (ids: string[]) => {
        if (fallar) throw new Error('base caída');
        return ids.map((id) => fila(id, 100, 80));
      });
      const hub = new OccupancyHub(loader);
      const c = cliente();
      await hub.subscribe('c1', ['a'], c.send);
      c.mensajes.length = 0;
  
      fallar = true;
      hub.markChanged('a');
      await expect(hub.flush()).resolves.toBeUndefined();
      expect(c.mensajes).toHaveLength(0);
  
      fallar = false;
      await hub.flush();
  
      expect(c.mensajes).toHaveLength(1);
      expect(c.mensajes[0].events[0]).toMatchObject({ eventId: 'a', confirmedSeats: 20 });
    });
  
    it('un cliente que falla al recibir no impide avisar a los demás', async () => {
      const hub = new OccupancyHub(crearLoader({ a: fila('a') }));
      let romper = false;
      await hub.subscribe('malo', ['a'], () => {
        if (romper) throw new Error('socket cerrado');
      });
      const bueno = cliente();
      await hub.subscribe('bueno', ['a'], bueno.send);
      bueno.mensajes.length = 0;
  
      romper = true;
      hub.markChanged('a');
      await hub.flush();
  
      expect(bueno.mensajes).toHaveLength(1);
    });
  });