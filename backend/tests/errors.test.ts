import request from 'supertest';
import { createApp } from '../src/app';

describe('Manejo de errores', () => {
  it('una ruta inexistente devuelve 404 con el formato unificado', async () => {
    const res = await request(createApp()).get('/api/v1/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      error: {
        code: 'NO_ENCONTRADO',
        message: 'La ruta solicitada no existe.',
        details: [],
      },
    });
  });

  it('un JSON mal formado devuelve 400 con el formato unificado', async () => {
    const res = await request(createApp())
      .post('/api/v1/health')
      .set('Content-Type', 'application/json')
      .send('{ esto no es json');

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('SOLICITUD_INVALIDA');
  });
});