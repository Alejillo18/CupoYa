import { NextFunction, Request, Response } from 'express';

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

  console.error(err);
  res.status(500).json({
    error: {
      code: 'ERROR_INTERNO',
      message: 'Ocurrió un error inesperado.',
      details: [],
    },
  });
}