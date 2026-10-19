import request from 'supertest';
import { createApp } from '../src/app';
import { buildAuthService, testTokens } from './helpers/buildAuthService';

describe('Errores inesperados', () => {
  it('devuelve 500 sin filtrar detalles internos y el servidor sigue respondiendo', async () => {
    const { service } = buildAuthService();
    jest.spyOn(service, 'login').mockRejectedValueOnce(new Error('cadena-de-conexion-secreta'));
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const app = createApp({ authService: service, tokens: testTokens });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ana@mail.com', password: 'Clave1234' });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('ERROR_INTERNO');
    expect(JSON.stringify(res.body)).not.toContain('secreta');

    const health = await request(app).get('/api/v1/health');
    expect(health.status).toBe(200);
  });
});