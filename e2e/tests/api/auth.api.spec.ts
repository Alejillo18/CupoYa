import type { PlaywrightWorkerArgs } from '@playwright/test';
import { test, expect } from '../../helpers/fixtures';
import { PASSWORD, conToken, emailUnico } from '../../helpers/api';

type Playwright = PlaywrightWorkerArgs['playwright'];

const cookieDe = (setCookie: string) => /refresh_token=([^;]+)/.exec(setCookie)?.[1] ?? '';

/** Llama con un contexto aislado, para controlar a mano la cookie del refresh token. */
async function post(playwright: Playwright, baseURL: string | undefined, path: string, cookie?: string) {
  const ctx = await playwright.request.newContext({
    baseURL,
    extraHTTPHeaders: cookie ? { Cookie: `refresh_token=${cookie}` } : {},
  });
  try {
    const res = await ctx.post(path);
    return {
      status: res.status(),
      setCookie: res.headers()['set-cookie'] ?? '',
      body: await res.json().catch(() => null),
    };
  } finally {
    await ctx.dispose();
  }
}

async function registrar(request: import('@playwright/test').APIRequestContext) {
  const email = emailUnico('auth');
  const res = await request.post('/api/v1/auth/register', { data: { email, password: PASSWORD } });
  expect(res.status()).toBe(201);
  return email;
}

test.describe('Registro', () => {
  test('crea la cuenta con rol USUARIO y no expone datos sensibles', async ({ request }) => {
    const email = emailUnico('reg');
    const res = await request.post('/api/v1/auth/register', { data: { email, password: PASSWORD } });

    expect(res.status()).toBe(201);
    const { user } = await res.json();
    expect(user).toMatchObject({ email, role: 'USUARIO' });
    expect(user.id).toBeTruthy();
    expect(JSON.stringify(user)).not.toMatch(/password|hash/i);
  });

  test('normaliza el email a minúsculas y espacios', async ({ request }) => {
    const email = emailUnico('mayus');
    const res = await request.post('/api/v1/auth/register', {
      data: { email: `  ${email.toUpperCase()}  `, password: PASSWORD },
    });
    expect(res.status()).toBe(201);
    expect((await res.json()).user.email).toBe(email);
  });

  test('rechaza un email repetido, aunque cambien las mayúsculas', async ({ request }) => {
    const email = await registrar(request);
    const res = await request.post('/api/v1/auth/register', {
      data: { email: email.toUpperCase(), password: PASSWORD },
    });
    expect(res.status()).toBe(409);
    expect((await res.json()).error.code).toBe('EMAIL_YA_REGISTRADO');
  });

  const invalidos: Array<[string, { email?: string; password?: string }]> = [
    ['email sin arroba', { email: 'sin-arroba.test' }],
    ['email de más de 254 caracteres', { email: `${'a'.repeat(250)}@e2e.cupoya.test` }],
    ['contraseña de 7 caracteres', { password: 'Abcde12' }],
    ['contraseña solo con letras', { password: 'soloLetrasAca' }],
    ['contraseña solo con números', { password: '1234567890' }],
    ['contraseña de 73 caracteres', { password: `${'a'.repeat(72)}1` }],
  ];

  for (const [caso, parcial] of invalidos) {
    test(`valida: ${caso}`, async ({ request }) => {
      const res = await request.post('/api/v1/auth/register', {
        data: { email: emailUnico('inv'), password: PASSWORD, ...parcial },
      });
      expect(res.status()).toBe(400);
      const { error } = await res.json();
      expect(error.code).toBe('VALIDACION');
      expect(error.details.length).toBeGreaterThan(0);
    });
  }

  // Valores límite: el mínimo y el máximo permitidos tienen que pasar.
  for (const [caso, password] of [
    ['8 caracteres (mínimo)', 'Abcdef12'],
    ['72 caracteres (máximo)', `${'a'.repeat(71)}1`],
  ] as const) {
    test(`acepta una contraseña de ${caso}`, async ({ request }) => {
      const res = await request.post('/api/v1/auth/register', { data: { email: emailUnico('lim'), password } });
      expect(res.status()).toBe(201);
    });
  }

  test('un JSON mal formado devuelve 400 y no 500', async ({ request }) => {
    const res = await request.post('/api/v1/auth/register', {
      headers: { 'Content-Type': 'application/json' },
      data: '{"email": ',
    });
    expect(res.status()).toBe(400);
    expect((await res.json()).error.code).toBe('SOLICITUD_INVALIDA');
  });
});

test.describe('Login', () => {
  test('devuelve accessToken, y el refresh token viaja solo en una cookie segura', async ({ request }) => {
    const email = await registrar(request);
    const res = await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });

    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user.email).toBe(email);
    expect(body).not.toHaveProperty('refreshToken');

    const cookie = res.headers()['set-cookie'];
    expect(cookie).toContain('refresh_token=');
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/i);
  });

  test('contraseña incorrecta y usuario inexistente dan la misma respuesta (no filtra qué emails existen)', async ({
    request,
  }) => {
    const email = await registrar(request);
    const mala = await request.post('/api/v1/auth/login', { data: { email, password: 'Incorrecta1' } });
    const fantasma = await request.post('/api/v1/auth/login', {
      data: { email: emailUnico('fantasma'), password: 'Incorrecta1' },
    });

    expect(mala.status()).toBe(401);
    expect(fantasma.status()).toBe(401);
    const a = (await mala.json()).error;
    const b = (await fantasma.json()).error;
    expect(a.code).toBe('CREDENCIALES_INVALIDAS');
    expect(a).toEqual(b);
  });

  test('bloquea la cuenta después de 5 intentos fallidos, incluso con la contraseña correcta', async ({
    request,
  }) => {
    const email = await registrar(request);
    for (let i = 0; i < 5; i++) {
      const res = await request.post('/api/v1/auth/login', { data: { email, password: 'Incorrecta1' } });
      expect(res.status(), `intento fallido ${i + 1}`).toBe(401);
    }
    const res = await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
    expect(res.status()).toBe(423);
    expect((await res.json()).error.code).toBe('CUENTA_BLOQUEADA');
  });

  test('un login correcto antes del límite reinicia el contador', async ({ request }) => {
    const email = await registrar(request);
    for (let i = 0; i < 4; i++) {
      await request.post('/api/v1/auth/login', { data: { email, password: 'Incorrecta1' } });
    }
    expect((await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } })).status()).toBe(200);
    // Si el contador no se hubiera reiniciado, este fallo ya bloquearía la cuenta.
    await request.post('/api/v1/auth/login', { data: { email, password: 'Incorrecta1' } });
    expect((await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } })).status()).toBe(200);
  });
});

test.describe('GET /auth/me', () => {
  test('exige un token válido', async ({ request, usuario }) => {
    const casos: Array<[string, Record<string, string>]> = [
      ['sin header', {}],
      ['esquema Basic', { Authorization: 'Basic abc' }],
      ['token basura', { Authorization: 'Bearer no.es.un.jwt' }],
      ['token con la firma alterada', conToken(`${usuario.token.slice(0, -3)}AAA`)],
    ];
    for (const [caso, headers] of casos) {
      const res = await request.get('/api/v1/auth/me', { headers });
      expect(res.status(), caso).toBe(401);
      expect((await res.json()).error.code, caso).toBe('NO_AUTENTICADO');
    }
  });

  test('con token válido devuelve el usuario', async ({ request, usuario }) => {
    const res = await request.get('/api/v1/auth/me', { headers: conToken(usuario.token) });
    expect(res.status()).toBe(200);
    expect((await res.json()).user).toMatchObject({ email: usuario.email, role: 'USUARIO' });
  });

  test('rechaza un token "alg: none" que se declara ADMIN', async ({ request, usuario }) => {
    const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const original = JSON.parse(Buffer.from(usuario.token.split('.')[1], 'base64url').toString());
    const falso = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ ...original, role: 'ADMIN' })}.`;

    const res = await request.get('/api/v1/users', { headers: conToken(falso) });
    expect(res.status()).toBe(401);
  });
});

test.describe('Refresh token y logout', () => {
  test('rota el token: el nuevo sirve y reutilizar el viejo invalida toda la sesión', async ({
    request,
    playwright,
    baseURL,
  }) => {
    const email = await registrar(request);
    const ctx = await playwright.request.newContext({ baseURL });
    const loginRes = await ctx.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
    const viejo = cookieDe(loginRes.headers()['set-cookie']);
    await ctx.dispose();
    expect(viejo).not.toBe('');

    const primero = await post(playwright, baseURL, '/api/v1/auth/refresh', viejo);
    expect(primero.status).toBe(200);
    expect(primero.body.accessToken).toEqual(expect.any(String));
    const nuevo = cookieDe(primero.setCookie);
    expect(nuevo).not.toBe('');
    expect(nuevo).not.toBe(viejo);

    // Reuso del token ya usado = posible robo.
    const reuso = await post(playwright, baseURL, '/api/v1/auth/refresh', viejo);
    expect(reuso.status).toBe(401);
    expect(reuso.body.error.code).toBe('REFRESH_INVALIDO');

    // Y el token nuevo de la misma familia también queda revocado.
    const trasReuso = await post(playwright, baseURL, '/api/v1/auth/refresh', nuevo);
    expect(trasReuso.status).toBe(401);
  });

  test('sin cookie devuelve 401', async ({ playwright, baseURL }) => {
    const res = await post(playwright, baseURL, '/api/v1/auth/refresh');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('REFRESH_INVALIDO');
  });

  test('el logout responde 204, es idempotente y deja inútil el refresh token', async ({
    request,
    playwright,
    baseURL,
  }) => {
    const email = await registrar(request);
    const ctx = await playwright.request.newContext({ baseURL });
    const loginRes = await ctx.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
    const cookie = cookieDe(loginRes.headers()['set-cookie']);
    await ctx.dispose();

    expect((await post(playwright, baseURL, '/api/v1/auth/logout', cookie)).status).toBe(204);
    expect((await post(playwright, baseURL, '/api/v1/auth/logout', cookie)).status).toBe(204);
    expect((await post(playwright, baseURL, '/api/v1/auth/logout')).status).toBe(204);
    expect((await post(playwright, baseURL, '/api/v1/auth/refresh', cookie)).status).toBe(401);
  });
});
