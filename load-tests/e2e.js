import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate } from 'k6/metrics';

const data = new SharedArray('data', () => [JSON.parse(open('./data.json'))]);
const { eventId, tokens, adminToken } = data[0];

const BASE = __ENV.BASE_URL || 'http://host.docker.internal:8080';
const FASE = __ENV.FASE || 'mixta';

// 4xx son respuestas de negocio válidas (cupo agotado, límite por usuario...).
// Lo que cuenta como falla es la red caída y los 5xx, que medimos aparte.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 499 }));

const erroresServidor = new Rate('errores_servidor'); // status 0 o 5xx
const erroresAuth = new Counter('errores_auth'); // 401/403 inesperados
const limitados = new Counter('respuestas_429');
const reservasOk = new Counter('reservas_confirmadas');
const reservasRechazadas = new Counter('reservas_rechazadas');
const cancelacionesOk = new Counter('cancelaciones_ok');
const reportesListos = new Counter('reportes_completados');

// [segundos, VUs objetivo]
const PERFILES = {
  mixta: [[60, 200], [180, 200], [60, 0]],
  rampa: [200, 400, 600, 800, 1000, 1200, 1500, 1800].flatMap((t) => [[30, t], [60, t]]),
  spike: [[30, 50], [10, 2000], [60, 2000], [10, 50], [60, 50], [10, 0]],
  soak: [[120, 150], [1500, 150], [120, 0]],
};
if (!PERFILES[FASE]) throw new Error(`FASE desconocida: ${FASE} (mixta | rampa | spike | soak)`);

const stages = PERFILES[FASE].map(([s, t]) => ({ duration: `${s}s`, target: t }));
const total = PERFILES[FASE].reduce((acc, [s]) => acc + s, 0);

const escenarios = {
  usuarios: {
    executor: 'ramping-vus',
    startVUs: 0,
    stages,
    gracefulRampDown: '30s',
    gracefulStop: '30s',
  },
};
if (FASE === 'mixta' || FASE === 'soak') {
  escenarios.reportes = {
    executor: 'constant-vus',
    vus: 1,
    duration: `${total}s`,
    exec: 'admin',
  };
}

const umbrales = {
  errores_servidor: ['rate<0.001'],
  errores_auth: ['count==0'],
  'http_req_duration{tipo:lectura}': ['p(95)<500'],
  'http_req_duration{tipo:reserva}': ['p(95)<800'],
};
if (FASE === 'rampa') {
  // Corta sola al romperse: el escalón en que corta es el punto de quiebre
  umbrales['http_req_duration{tipo:lectura}'] = [
    { threshold: 'p(95)<1500', abortOnFail: true, delayAbortEval: '30s' },
  ];
  umbrales.errores_servidor = [
    { threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '30s' },
  ];
}
if (FASE === 'spike') {
  umbrales['http_req_duration{tipo:lectura}'] = ['p(95)<2000'];
  umbrales['http_req_duration{tipo:reserva}'] = ['p(95)<3000'];
}

export const options = { scenarios: escenarios, thresholds: umbrales };

function registrar(res) {
  erroresServidor.add(res.status === 0 || res.status >= 500);
  if (res.status === 401 || res.status === 403) erroresAuth.add(1);
  if (res.status === 429) limitados.add(1);
}

function json(res) {
  try {
    return res.json();
  } catch (_) {
    return null;
  }
}

function lista(body) {
  if (Array.isArray(body)) return body;
  if (body && Array.isArray(body.items)) return body.items;
  if (body && Array.isArray(body.data)) return body.data;
  return [];
}

export function setup() {
  const salud = http.get(`${BASE}/api/v1/health`);
  if (salud.status !== 200) {
    exec.test.abort(`El backend no responde en ${BASE} (health ${salud.status}).`);
  }
  const yo = http.get(`${BASE}/api/v1/auth/me`, {
    headers: { Authorization: `Bearer ${tokens[0]}` },
  });
  if (yo.status !== 200) {
    exec.test.abort(
      `El token de prueba fue rechazado (${yo.status}). ¿Coincide JWT_SECRET de backend/.env con el del compose?`,
    );
  }
}

let ultimaReserva = null; // estado por VU

export default function () {
  const i = (__VU - 1) % tokens.length;
  const headers = { Authorization: `Bearer ${tokens[i]}`, 'Content-Type': 'application/json' };

  const eventos = http.get(`${BASE}/api/v1/events`, { headers, tags: { tipo: 'lectura' } });
  registrar(eventos);
  check(eventos, { 'eventos: 200': (r) => r.status === 200 });

  const dado = Math.random();

  if (dado < 0.55) {
    const h = Object.assign({}, headers, {
      'Idempotency-Key': `e2e-${FASE}-${__VU}-${__ITER}-${Date.now()}`,
    });
    const res = http.post(
      `${BASE}/api/v1/events/${eventId}/reservations`,
      JSON.stringify({ quantity: 1 + Math.floor(Math.random() * 2) }),
      { headers: h, tags: { tipo: 'reserva' } },
    );
    registrar(res);
    if (res.status === 201) {
      reservasOk.add(1);
      const b = json(res);
      ultimaReserva = (b && (b.id || (b.reservation && b.reservation.id))) || null;
    } else if (res.status < 500 && res.status !== 0) {
      reservasRechazadas.add(1);
    }
  } else if (dado < 0.75) {
    const res = http.get(`${BASE}/api/v1/reservations/me`, { headers, tags: { tipo: 'lectura' } });
    registrar(res);
    check(res, { 'mis reservas: 200': (r) => r.status === 200 });
  } else if (dado < 0.9) {
    if (!ultimaReserva) {
      const mias = http.get(`${BASE}/api/v1/reservations/me`, { headers, tags: { tipo: 'lectura' } });
      registrar(mias);
      const confirmada = lista(json(mias)).find((r) => r.status === 'CONFIRMADA');
      ultimaReserva = confirmada ? confirmada.id : null;
    }
    if (ultimaReserva) {
      const res = http.post(`${BASE}/api/v1/reservations/${ultimaReserva}/cancel`, null, {
        headers,
        tags: { tipo: 'cancelacion' },
      });
      registrar(res);
      if (res.status >= 200 && res.status < 300) cancelacionesOk.add(1);
      ultimaReserva = null;
    }
  } else {
    const res = http.get(`${BASE}/api/v1/auth/me`, { headers, tags: { tipo: 'lectura' } });
    registrar(res);
  }

  sleep(1 + Math.random() * 2);
}

// Un ADMIN pide un reporte cada ~30 s y espera a que termine (worker_threads)
export function admin() {
  const headers = { Authorization: `Bearer ${adminToken}` };
  const pedido = http.post(`${BASE}/api/v1/reports`, null, { headers, tags: { tipo: 'reporte' } });
  registrar(pedido);
  const aceptado = check(pedido, { 'reporte aceptado (202)': (r) => r.status === 202 });
  if (aceptado) {
    const id = (json(pedido) || {}).id;
    for (let n = 0; id && n < 30; n++) {
      sleep(1);
      const estado = http.get(`${BASE}/api/v1/reports/${id}`, {
        headers,
        tags: { tipo: 'reporte' },
      });
      registrar(estado);
      const st = (json(estado) || {}).status;
      if (st && st !== 'PENDIENTE' && st !== 'PROCESANDO') {
        reportesListos.add(1);
        break;
      }
    }
  }
  sleep(25);
}