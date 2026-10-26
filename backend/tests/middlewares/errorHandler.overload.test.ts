import { Prisma } from '@prisma/client';
import { errorHandler } from "../../src/middlewares/errorHandler";

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

describe('errorHandler ante saturación de la base de datos', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each(['P2028', 'P2024'])('%s responde 503 con Retry-After', (code) => {
    const res = respuestaFalsa();
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);

    errorHandler(errorPrisma(code), {} as never, res as never, jest.fn());

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.setHeader).toHaveBeenCalledWith('Retry-After', '1');
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'SERVICIO_SATURADO',
        message: expect.any(String),
        details: [],
      },
    });
  });

  it('otros errores de Prisma siguen siendo 500', () => {
    const res = respuestaFalsa();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    errorHandler(errorPrisma('P2002'), {} as never, res as never, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.setHeader).not.toHaveBeenCalled();
  });
});