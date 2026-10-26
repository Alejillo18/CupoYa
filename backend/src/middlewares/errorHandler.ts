import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';

const SATURACION_BD = new Set(['P2028', 'P2024']);

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({
    error: {
      code: 'NO_ENCONTRADO',
      message: 'La ruta solicitada no existe.',
      details: [],
    },
  });
}

export function errorHandler(
  err: Error & { status?: number; type?: string },
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err.type === 'entity.parse.failed') {
    res.status(400).json({
      error: {
        code: 'SOLICITUD_INVALIDA',
        message: 'El cuerpo de la solicitud no es un JSON válido.',
        details: [],
      },
    });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError && SATURACION_BD.has(err.code)) {
    console.warn(`Base de datos saturada (${err.code}).`);
    res.setHeader('Retry-After', '1');
    res.status(503).json({
      error: {
        code: 'SERVICIO_SATURADO',
        message: 'El sistema está muy ocupado. Probá de nuevo en unos segundos.',
        details: [],
      },
    });
    return;
  }
  console.error(err);
  res.status(500).json({
    error: {
      code: 'ERROR_INTERNO',
      message: 'Ocurrió un error inesperado.',
      details: [],
    },
  });
}