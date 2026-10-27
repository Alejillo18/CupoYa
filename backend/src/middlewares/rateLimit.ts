import { NextFunction, Request, Response } from 'express';
import { AppError } from '../errors/AppError';

export interface RateResult {
  permitido: boolean;
  restante: number;
  reiniciaEnSeg: number;
}

export interface RateLimiter {
  hit(clave: string): Promise<RateResult>;
}

export class MemoryRateLimiter implements RateLimiter {
  private readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();

  constructor(
    private readonly max: number,
    private readonly ventanaSeg: number,
    private readonly ahora: () => number = () => Date.now(),
  ) {}

  async hit(clave: string): Promise<RateResult> {
    const t = this.ahora();
    let v = this.ventanas.get(clave);
    if (!v || t - v.inicio >= this.ventanaSeg * 1000) {
      v = { inicio: t, cuenta: 0 };
      this.ventanas.set(clave, v);
    }
    v.cuenta += 1;
    const reinicia = Math.max(1, Math.ceil((v.inicio + this.ventanaSeg * 1000 - t) / 1000));
    return {
      permitido: v.cuenta <= this.max,
      restante: Math.max(0, this.max - v.cuenta),
      reiniciaEnSeg: reinicia,
    };
  }
}

const TIMEOUT_LIMITADOR_MS = 1000;

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`el limitador no respondio en ${ms} ms`)), ms);
    promesa.then(
      (valor) => {
        clearTimeout(timer);
        resolve(valor);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export function rateLimit(limiter: RateLimiter, grupo: string, timeoutMs: number = TIMEOUT_LIMITADOR_MS) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const r = await conTimeout(limiter.hit(`${grupo}:${req.ip}`), timeoutMs);
      if (!r.permitido) {
        res.setHeader('Retry-After', String(r.reiniciaEnSeg));
        return next(
          new AppError(429, 'DEMASIADAS_SOLICITUDES', 'Demasiados intentos. Probá de nuevo en unos instantes.'),
        );
      }
    } catch (err) {

      console.error('Rate limiter no disponible:', err);
    }
    next();
  };
}