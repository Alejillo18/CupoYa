import { EventEmitter } from 'node:events';
import { RedisOccupancyBridge } from '../../src/modules/realtime/redis.occupancy.bridge';

async function esperarHasta(condicion: () => boolean, ms = 1000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('La condición no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 5));
  }
}

function crear(opciones: { publish?: jest.Mock; subscribe?: jest.Mock } = {}) {
  const hub = { markChanged: jest.fn() };
  const emisor = new EventEmitter();
  const publisher = { publish: opciones.publish ?? jest.fn().mockResolvedValue(1) };
  const subscriber = {
    subscribe: opciones.subscribe ?? jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(1),
    on: (evento: 'message', escucha: (canal: string, mensaje: string) => void) =>
      emisor.on(evento, escucha),
  };
  const bridge = new RedisOccupancyBridge(hub, publisher, subscriber, {
    canal: 'canal-test',
    reintentoMs: 5,
  });
  return {
    hub,
    publisher,
    subscriber,
    bridge,
    recibir: (canal: string, mensaje: string) => emisor.emit('message', canal, mensaje),
  };
}

describe('RedisOccupancyBridge', () => {
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('al avisar un cambio lo anota en este worker y lo publica en el canal', () => {
    const { bridge, hub, publisher } = crear();

    bridge.eventChanged('e1');

    expect(hub.markChanged).toHaveBeenCalledWith('e1');
    expect(publisher.publish).toHaveBeenCalledWith('canal-test', 'e1');
  });

  it('si Redis falla al publicar no lanza error y el worker local igual se entera', async () => {
    const { bridge, hub } = crear({ publish: jest.fn().mockRejectedValue(new Error('redis caído')) });

    expect(() => bridge.eventChanged('e1')).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));

    expect(hub.markChanged).toHaveBeenCalledWith('e1');
  });

  it('start se suscribe al canal', async () => {
    const { bridge, subscriber } = crear();

    await bridge.start();

    expect(subscriber.subscribe).toHaveBeenCalledWith('canal-test');
  });

  it('un mensaje del canal anota el cambio en el hub', async () => {
    const { bridge, hub, recibir } = crear();
    await bridge.start();

    recibir('canal-test', 'e7');

    expect(hub.markChanged).toHaveBeenCalledWith('e7');
  });

  it('ignora mensajes de otros canales y mensajes vacíos', async () => {
    const { bridge, hub, recibir } = crear();
    await bridge.start();

    recibir('otro-canal', 'e7');
    recibir('canal-test', '');

    expect(hub.markChanged).not.toHaveBeenCalled();
  });

  it('si la suscripción falla, reintenta hasta lograrla', async () => {
    const subscribe = jest
      .fn()
      .mockRejectedValueOnce(new Error('redis caído'))
      .mockResolvedValue(1);
    const { bridge } = crear({ subscribe });

    await bridge.start();

    expect(subscribe).toHaveBeenCalledTimes(2);
  });

  it('después de stop se desuscribe y deja de escuchar', async () => {
    const { bridge, hub, subscriber, recibir } = crear();
    await bridge.start();

    await bridge.stop();
    recibir('canal-test', 'e1');

    expect(subscriber.unsubscribe).toHaveBeenCalledWith('canal-test');
    expect(hub.markChanged).not.toHaveBeenCalled();
  });

  it('stop corta los reintentos si la suscripción nunca prosperó', async () => {
    const subscribe = jest.fn().mockRejectedValue(new Error('redis caído'));
    const { bridge } = crear({ subscribe });
    const arranque = bridge.start();

    await esperarHasta(() => subscribe.mock.calls.length >= 1);
    await bridge.stop();

    await expect(arranque).resolves.toBeUndefined();
  });
});