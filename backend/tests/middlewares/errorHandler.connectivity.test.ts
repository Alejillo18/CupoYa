import { Prisma } from '@prisma/client';
import { errorHandler } from '../../src/middlewares/errorHandler';

function respuestaFalsa() {
  const res = { status: jest.fn(), json: jest.fn(), setHeader: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

function errorPrisma(code: string) {
  return new Prisma.PrismaClientKnownRequestError('error de prueba', {
    code,
    clientVersion: 'test',
  });
}

function esperar503SinServicio(res: ReturnType<typeof respuestaFalsa>) {
  expect(res.status).toHaveBeenCalledWith(503);
  expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '2');
  expect(res.json).toHaveBeenCalledWith({
    error: {
      code: 'SERVICIO_NO_DISPONIBLE',
      message: expect.any(String),
      details: [],
    },
  });
}

describe('errorHandler ante una base de datos inaccesible', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['P1001', 'P1002', 'P1008', 'P1017'])('%s responde 503 con Retry-After', (code) => {
    const res = respuestaFalsa();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    errorHandler(errorPrisma(code), {} as never, res as never, jest.fn());

    esperar503SinServicio(res);
  });

  it('un error de inicialización de Prisma responde 503', () => {
    const res = respuestaFalsa();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const err = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      'test',
      'P1001',
    );

    errorHandler(err, {} as never, res as never, jest.fn());

    esperar503SinServicio(res);
  });

  it('un error de Prisma que no es de conectividad sigue siendo 500', () => {
    const res = respuestaFalsa();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(errorPrisma('P2002'), {} as never, res as never, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });
});

describe('errorHandler cuando Postgres se está recuperando', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([
    'Error in connector: Error querying the database: FATAL: the database system is starting up',
    'Error in connector: Error querying the database: FATAL: the database system is not yet accepting connections',
  ])('responde 503: %s', (mensaje) => {
    const res = respuestaFalsa();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const err = new Prisma.PrismaClientUnknownRequestError(mensaje, { clientVersion: 'test' });

    errorHandler(err, {} as never, res as never, jest.fn());

    esperar503SinServicio(res);
  });

  it('un error desconocido de Prisma con otro mensaje sigue siendo 500', () => {
    const res = respuestaFalsa();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const err = new Prisma.PrismaClientUnknownRequestError('algo inesperado', {
      clientVersion: 'test',
    });

    errorHandler(err, {} as never, res as never, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
  });
});