import Redis from 'ioredis';
import { RedisRateLimiter } from '../../src/middlewares/redisRateLimiter';

const redis = new Redis(process.env.TEST_REDIS_URL ?? 'redis://localhost:6379');

describe('RedisRateLimiter (Redis real)', () => {
  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
    await redis.quit();
  });

  it('permite hasta el máximo y rechaza el siguiente', async () => {
    const l = new RedisRateLimiter(redis, 3, 60);

    const r = [await l.hit('a'), await l.hit('a'), await l.hit('a'), await l.hit('a')];

    expect(r.map((x) => x.permitido)).toEqual([true, true, true, false]);
  });

  it('la clave siempre queda con vencimiento', async () => {
    const l = new RedisRateLimiter(redis, 3, 60);

    await l.hit('a');

    const ttl = await redis.ttl('rl:a');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(60);
  });

  it('100 pedidos simultáneos: exactamente el máximo es permitido', async () => {
    const l = new RedisRateLimiter(redis, 10, 60);

    const r = await Promise.all(Array.from({ length: 100 }, () => l.hit('x')));

    expect(r.filter((x) => x.permitido)).toHaveLength(10);
  });
});