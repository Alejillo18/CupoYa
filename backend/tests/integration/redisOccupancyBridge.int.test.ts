import Redis from 'ioredis';
import { RedisOccupancyBridge } from '../../src/modules/realtime/redis.occupancy.bridge';

const url = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379';

async function esperarHasta(condicion: () => boolean, ms = 2000): Promise<void> {
  const limite = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > limite) throw new Error('La condición no se cumplió a tiempo');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('RedisOccupancyBridge (Redis real)', () => {
  const conexiones: Redis[] = [];
  const nueva = () => {
    const r = new Redis(url);
    conexiones.push(r);
    return r;
  };

  afterAll(async () => {
    await Promise.all(conexiones.map((c) => c.quit()));
  });

  it('un aviso publicado en un worker llega a los hubs de los demás workers', async () => {
    const canal = `cupoya:test:ocupacion:${Date.now()}`;
    const hubA = { markChanged: jest.fn() };
    const hubB = { markChanged: jest.fn() };
    const workerA = new RedisOccupancyBridge(hubA, nueva(), nueva(), { canal });
    const workerB = new RedisOccupancyBridge(hubB, nueva(), nueva(), { canal });
    await Promise.all([workerA.start(), workerB.start()]);

    workerA.eventChanged('evento-1');

    await esperarHasta(() => hubB.markChanged.mock.calls.length > 0);
    expect(hubB.markChanged).toHaveBeenCalledWith('evento-1');
    expect(hubA.markChanged).toHaveBeenCalledWith('evento-1');

    await Promise.all([workerA.stop(), workerB.stop()]);
  });
});