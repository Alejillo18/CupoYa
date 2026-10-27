import http from 'k6/http';
import exec from 'k6/execution';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter, Rate, Trend } from 'k6/metrics';

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
const reportesFallidos = new Counter('reportes_fallidos');
const reporteTiempo = new Trend('reporte_tiempo_ms', true);

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
if (FASE === 'mixta' || FASE === 'soak') {
  // El módulo de reportes (worker_threads) también tiene que funcionar bajo carga
  umbrales.reportes_completados = ['count>0'];
  umbrales.reportes_fallidos = ['count==0'];
  umbrales.reporte_tiempo_ms = ['p(95)<5000'];
}
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
  // Durante el pico se toleran errores y lentitud; lo que se exige es recuperarse
  umbrales.errores_servidor = ['rate<0.5'];
  umbrales['http_req_duration{tipo:lectura}'] = ['p(95)<30000'];
  umbrales['http_req_duration{tipo:reserva}'] = ['p(95)<30000'];
  umbrales['errores_servidor{etapa:pre}'] = ['rate<0.001'];
  umbrales['errores_servidor{etapa:post}'] = ['rate<0.001'];
  umbrales['http_req_duration{etapa:post}'] = ['p(95)<500'];
}

export const options = { scenarios: escenarios, thresholds: umbrales };

// Etapa del spike según el tiempo transcurrido (perfil: 0-30 pre, 30-110 pico,
// 110-130 transición para que drene la cola, 130+ post = recuperación)
function etapaActual() {
  if (FASE !== 'spike') return 'unica';
  const t = exec.instance.currentTestRunDuration / 1000;
  if (t < 30) return 'pre';
  if (t < 110) return 'pico';
  if (t < 130) return 'transicion';
  return 'post';
}

function registrar(res, etapa) {
  erroresServidor.add(res.status === 0 || res.status >= 500, { etapa });
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
  const etapa = etapaActual();
  const i = (__VU - 1) % tokens.length;
  const headers = { Authorization: `Bearer ${tokens[i]}`, 'Content-Type': 'application/json' };

  const eventos = http.get(`${BASE}/api/v1/events`, {
    headers,
    tags: { tipo: 'lectura', etapa },
  });
  registrar(eventos, etapa);
  check(eventos, { 'eventos: 200': (r) => r.status === 200 });

  const dado = Math.random();

  if (dado < 0.55) {
    const h = Object.assign({}, headers, {
      'Idempotency-Key': `e2e-${FASE}-${__VU}-${__ITER}-${Date.now()}`,
    });
    const res = http.post(
      `${BASE}/api/v1/events/${eventId}/reservations`,
      JSON.stringify({ quantity: 1 + Math.floor(Math.random() * 2) }),
      { headers: h, tags: { tipo: 'reserva', etapa } },
    );
    registrar(res, etapa);
    if (res.status === 201) {
      reservasOk.add(1);
      const b = json(res);
      ultimaReserva = (b && (b.id || (b.reservation && b.reservation.id))) || null;
    } else if (res.status < 500 && res.status !== 0) {
      reservasRechazadas.add(1);
    }
  } else if (dado < 0.75) {
    const res = http.get(`${BASE}/api/v1/reservations/me`, {
      headers,
      tags: { tipo: 'lectura', etapa },
    });
    registrar(res, etapa);
    check(res, { 'mis reservas: 200': (r) => r.status === 200 });
  } else if (dado < 0.9) {
    if (!ultimaReserva) {
      const mias = http.get(`${BASE}/api/v1/reservations/me`, {
        headers,
        tags: { tipo: 'lectura', etapa },
      });
      registrar(mias, etapa);
      const confirmada = lista(json(mias)).find((r) => r.status === 'CONFIRMADA');
      ultimaReserva = confirmada ? confirmada.id : null;
    }
    if (ultimaReserva) {
      // La etiqueta "name" agrupa todas las cancelaciones bajo un solo endpoint
      const res = http.post(`${BASE}/api/v1/reservations/${ultimaReserva}/cancel`, null, {
        headers,
        tags: { tipo: 'cancelacion', etapa, name: 'POST /reservations/:id/cancel' },
      });
      registrar(res, etapa);
      if (res.status >= 200 && res.status < 300) cancelacionesOk.add(1);
      ultimaReserva = null;
    }
  } else {
    const res = http.get(`${BASE}/api/v1/auth/me`, {
      headers,
      tags: { tipo: 'lectura', etapa },
    });
    registrar(res, etapa);
  }

  sleep(1 + Math.random() * 2);
}

// Un ADMIN pide un reporte cada ~30 s y espera a que termine (worker_threads).
// La respuesta anida los datos bajo "report": { id, status, finishedAt, ... }
export function admin() {
  const etapa = 'unica';
  const headers = { Authorization: `Bearer ${adminToken}` };
  const pedido = http.post(`${BASE}/api/v1/reports`, null, {
    headers,
    tags: { tipo: 'reporte', etapa },
  });
  registrar(pedido, etapa);
  const aceptado = check(pedido, { 'reporte aceptado (202)': (r) => r.status === 202 });

  const cuerpo = aceptado ? json(pedido) : null;
  const id = cuerpo && cuerpo.report ? cuerpo.report.id : null;

  if (id) {
    const inicio = Date.now();
    let terminado = false;
    for (let n = 0; n < 60 && !terminado; n++) {
      sleep(0.5);
      const estado = http.get(`${BASE}/api/v1/reports/${id}`, {
        headers,
        tags: { tipo: 'reporte', etapa, name: 'GET /reports/:id' },
      });
      registrar(estado, etapa);
      const body = json(estado);
      const r = body ? body.report : null;
      if (r && r.finishedAt) {
        terminado = true;
        if (r.status === 'LISTO') {
          reportesListos.add(1);
          reporteTiempo.add(Date.now() - inicio);
        } else {
          reportesFallidos.add(1);
        }
      }
    }
    if (!terminado) reportesFallidos.add(1); // no terminó en 30 s
  } else if (aceptado) {
    reportesFallidos.add(1); // aceptado, pero la respuesta no trae el id esperado
  }
  sleep(25);
}