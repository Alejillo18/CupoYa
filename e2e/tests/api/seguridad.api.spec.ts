import { test, expect } from '../../helpers/fixtures';
import { conToken, crearEvento, emailUnico } from '../../helpers/api';

test.describe('Seguridad básica', () => {
  test('un payload de inyección SQL en el login es rechazado por validación', async ({ request }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { email: "' OR 1=1 --", password: "' OR '1'='1" },
    });
    expect(res.status()).toBe(400);
  });

  test('un payload SQL en la contraseña no autentica a nadie', async ({ request, usuario }) => {
    const res = await request.post('/api/v1/auth/login', {
      data: { email: usuario.email, password: "' OR '1'='1" },
    });
    expect(res.status()).toBe(401);
  });

  test('un nombre de evento con SQL/HTML se guarda como texto y se devuelve sin alterar', async ({
    request,
    operador,
  }) => {
    const nombre = `E2E '); DROP TABLE events;-- <script>alert(1)</script>`;
    const evento = await crearEvento(request, operador.token, { name: nombre });
    const res = await request.get(`/api/v1/events/${evento.id}`, { headers: conToken(operador.token) });
    expect((await res.json()).event.name).toBe(nombre);
  });

  test('una ruta inexistente devuelve 404 en JSON (no una página de error con detalles)', async ({ request }) => {
    const res = await request.get('/api/v1/no-existe');
    expect(res.status()).toBe(404);
    expect((await res.json()).error.code).toBe('NO_ENCONTRADO');
  });

  test('el frontend manda los headers de seguridad de nginx y no revela la versión', async ({ request }) => {
    const res = await request.get('/');
    const h = res.headers();
    expect(h['x-content-type-options']).toBe('nosniff');
    expect(h['x-frame-options']).toBe('DENY');
    expect(h['referrer-policy']).toBeTruthy();
    expect(h['server'] ?? '').not.toMatch(/\d/);
  });

  test('la documentación OpenAPI está disponible y es JSON válido', async ({ request }) => {
    const res = await request.get('/api/openapi.json');
    expect(res.status()).toBe(200);
    expect((await res.json()).openapi).toBeTruthy();
  });

  // Solo corre si levantaste el stack CON el limitador (RATE_LIMIT_ENABLED=true, por defecto 20 por minuto).
  test('el limitador de tasa frena la fuerza bruta en /auth/login con 429', async ({ request }) => {
    test.skip(process.env.RATE_LIMIT_ENABLED !== 'true', 'Definí RATE_LIMIT_ENABLED=true y levantá el stack con el limitador.');

    const estados: number[] = [];
    for (let i = 0; i < 30; i++) {
      const res = await request.post('/api/v1/auth/login', {
        data: { email: emailUnico('rate'), password: 'Incorrecta1' },
      });
      estados.push(res.status());
    }
    expect(estados).toContain(429);
  });
});
