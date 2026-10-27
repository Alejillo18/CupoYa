import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';

const SATURACION_BD = new Set(['P2028', 'P2024']);


const SIN_CONEXION_BD = new Set(['P1001', 'P1002', 'P1008', 'P1017']);

const BD_NO_LISTA =
  /the database system is (starting up|not yet accepting connections|shutting down|in recovery mode)/i;

function esBaseNoDisponible(err: Error): boolean {
  if (err instanceof Prisma.PrismaClientInitializationError) return true;
  if (err instanceof Prisma.PrismaClientKnownRequestError) return SIN_CONEXION_BD.has(err.code);
  if (err instanceof Prisma.PrismaClientUnknownRequestError) return BD_NO_LISTA.test(err.message);
  return false;
}

function servicioNoDisponible(
  res: Response,
  codigo: string,
  mensaje: string,
  reintentarEnSeg: number,
): void {
  res.setHeader('Retry-After', String(reintentarEnSeg));
  res.status(503).json({ error: { code: codigo, message: mensaje, details: [] } });
}

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
    // Una línea corta: bajo carga, el stack completo por cada pedido inunda el log.
    console.warn(`Base de datos saturada (${err.code}).`);
    servicioNoDisponible(
      res,
      'SERVICIO_SATURADO',
      'El sistema está muy ocupado. Probá de nuevo en unos segundos.',
      1,
    );
    return;
  }
  if (esBaseNoDisponible(err)) {
    console.warn('Base de datos no disponible.');
    servicioNoDisponible(
      res,
      'SERVICIO_NO_DISPONIBLE',
      'El servicio no está disponible. Probá de nuevo en unos segundos.',
      2,
    );
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