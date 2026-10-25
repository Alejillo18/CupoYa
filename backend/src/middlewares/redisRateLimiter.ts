import Redis from 'ioredis';
import { RateLimiter, RateResult } from './rateLimit';

// Ventana fija: INCR atómico; solo el primer pedido de la ventana fija el vencimiento.
export class RedisRateLimiter implements RateLimiter {
  constructor(
    private readonly redis: Redis,
    private readonly max: number,
    private readonly ventanaSeg: number,
  ) {}

  async hit(clave: string): Promise<RateResult> {
    const k = `rl:${clave}`;
    const cuenta = await this.redis.incr(k);
    if (cuenta === 1) await this.redis.expire(k, this.ventanaSeg);
    const ttl = await this.redis.ttl(k);
    return {
      permitido: cuenta <= this.max,
      restante: Math.max(0, this.max - cuenta),
      reiniciaEnSeg: ttl > 0 ? ttl : this.ventanaSeg,
    };
  }
}