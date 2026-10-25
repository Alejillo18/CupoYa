import request from 'supertest';
import { createApp } from '../../src/app';
import { ReportTaskOutput } from '../../src/modules/reports/report.task';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';
import { FakeReportsRepository } from '../helpers/fakeReportsRepository';

const salida: ReportTaskOutput = {
  report: {
    events: [],
    totals: {
      events: 0,
      totalCapacity: 0,
      confirmedSeats: 0,
      occupancyPercent: 0,
      inconsistentEvents: 0,
    },
  },
  csv: 'id,nombre\n',
};

const esperar = () => new Promise((r) => setTimeout(r, 30));

function setup(run?: () => Promise<ReportTaskOutput>) {
  const { service } = buildAuthService();
  const repo = new FakeReportsRepository();
  const pool = { run: jest.fn(run ?? (() => Promise.resolve(salida))) };
  const app = createApp({
    authService: service,
    tokens: testTokens,
    reportsService: new ReportsService(repo, pool),
  });
  const bearer = (role: 'USUARIO' | 'OPERADOR' | 'ADMIN') =>
    `Bearer ${testTokens.signAccessToken({ id: 'u1', role })}`;
  return { app, bearer };
}

describe('Rutas de reportes', () => {
  it('sin token devuelve 401', async () => {
    const { app } = setup();

    expect((await request(app).post('/api/v1/reports')).status).toBe(401);
    expect((await request(app).get('/api/v1/reports/x')).status).toBe(401);
    expect((await request(app).get('/api/v1/reports/x/download')).status).toBe(401);
  });

  it('USUARIO y OPERADOR reciben 403', async () => {
    const { app, bearer } = setup();

    for (const rol of ['USUARIO', 'OPERADOR'] as const) {
      const a = await request(app).post('/api/v1/reports').set('Authorization', bearer(rol));
      const b = await request(app).get('/api/v1/reports/x').set('Authorization', bearer(rol));
      expect([a.status, b.status]).toEqual([403, 403]);
    }
  });

  it('POST responde 202 con el id y el estado PENDIENTE', async () => {
    const { app, bearer } = setup();

    const res = await request(app).post('/api/v1/reports').set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(202);
    expect(res.body.report).toMatchObject({ id: 'rep-1', status: 'PENDIENTE' });
  });

  it('POST responde 202 aunque el cálculo siga en curso', async () => {
    const { app, bearer } = setup(() => new Promise(() => undefined));

    const res = await request(app).post('/api/v1/reports').set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(202);
  });

  it('GET devuelve el estado y, listo, el resultado sin el CSV', async () => {
    const { app, bearer } = setup();
    await request(app).post('/api/v1/reports').set('Authorization', bearer('ADMIN'));
    await esperar();

    const res = await request(app).get('/api/v1/reports/rep-1').set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.body.report.status).toBe('LISTO');
    expect(res.body.report.result.report.totals).toBeDefined();
    expect(JSON.stringify(res.body)).not.toContain('csv');
  });

  it('GET de un reporte inexistente devuelve 404', async () => {
    const { app, bearer } = setup();

    const res = await request(app).get('/api/v1/reports/zzz').set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(404);
  });

  it('download entrega el CSV con sus encabezados', async () => {
    const { app, bearer } = setup();
    await request(app).post('/api/v1/reports').set('Authorization', bearer('ADMIN'));
    await esperar();

    const res = await request(app)
      .get('/api/v1/reports/rep-1/download')
      .set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('reporte-ocupacion');
    expect(res.text).toBe('id,nombre\n');
  });

  it('download de un reporte no listo devuelve 409', async () => {
    const { app, bearer } = setup(() => new Promise(() => undefined));
    await request(app).post('/api/v1/reports').set('Authorization', bearer('ADMIN'));
    await esperar();

    const res = await request(app)
      .get('/api/v1/reports/rep-1/download')
      .set('Authorization', bearer('ADMIN'));

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('REPORTE_NO_LISTO');
  });
});