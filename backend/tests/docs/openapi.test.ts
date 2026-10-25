import request from 'supertest';
import { createApp } from '../../src/app';
import { openApiSpec } from '../../src/docs/openapi';
import { EventsService } from '../../src/modules/events/events.service';
import { ReportsService } from '../../src/modules/reports/reports.service';
import { ReservationsService } from '../../src/modules/reservations/reservations.service';
import { UsersService } from '../../src/modules/users/users.service';
import { buildAuthService, testTokens } from '../helpers/buildAuthService';
import { FakeEventRepository } from '../helpers/fakeEventRepository';
import { FakeReportsRepository } from '../helpers/fakeReportsRepository';
import { FakeReservationsRepository } from '../helpers/fakeReservationsRepository';
import { FakeUsersRepository } from '../helpers/fakeUsersRepository';

function appCompleta() {
  const { service } = buildAuthService();
  return createApp({
    authService: service,
    tokens: testTokens,
    eventsService: new EventsService(new FakeEventRepository()),
    usersService: new UsersService(new FakeUsersRepository()),
    reservationsService: new ReservationsService(new FakeReservationsRepository()),
    reportsService: new ReportsService(new FakeReportsRepository(), { run: jest.fn() }),
  });
}

const operaciones = (): { metodo: string; ruta: string }[] =>
  Object.entries(openApiSpec.paths).flatMap(([ruta, ops]) =>
    Object.keys(ops as object).map((metodo) => ({ metodo, ruta })),
  );

describe('OpenAPI', () => {
  it('es una especificación 3.x con título y esquema bearer', () => {
    expect(openApiSpec.openapi).toMatch(/^3\./);
    expect(openApiSpec.info.title).toBe('CupoYa API');
    expect(openApiSpec.components.securitySchemes.bearerAuth.scheme).toBe('bearer');
  });

  it('cada ruta documentada existe de verdad en la API', async () => {
    const app = appCompleta();
    const inexistentes: string[] = [];

    for (const { metodo, ruta } of operaciones()) {
      const url = '/api/v1' + ruta.replace(/\{[^}]+\}/g, 'x');
      const res = await (request(app) as any)[metodo](url).send({});
      if (res.status === 404 && res.body?.error?.code === 'NO_ENCONTRADO') {
        inexistentes.push(`${metodo.toUpperCase()} ${ruta}`);
      }
    }

    expect(inexistentes).toEqual([]);
  });

  it('toda operación tiene resumen y al menos una respuesta', () => {
    for (const { metodo, ruta } of operaciones()) {
      const op = (openApiSpec.paths as any)[ruta][metodo];
      expect([ruta, metodo, typeof op.summary]).toEqual([ruta, metodo, 'string']);
      expect(Object.keys(op.responses).length).toBeGreaterThan(0);
    }
  });

  it('sirve el JSON en /api/openapi.json y la interfaz en /api/docs/', async () => {
    const app = appCompleta();

    const json = await request(app).get('/api/openapi.json');
    const ui = await request(app).get('/api/docs/');

    expect(json.status).toBe(200);
    expect(json.body.info.title).toBe('CupoYa API');
    expect(ui.status).toBe(200);
    expect(ui.text).toContain('swagger');
  });
});