import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { Counter } from 'k6/metrics';

const data = new SharedArray('data', () => [JSON.parse(open('./data.json'))]);
const { eventId, tokens } = data[0];

const BASE = __ENV.BASE_URL || 'http://host.docker.internal:3000';

const confirmadas = new Counter('reservas_confirmadas');
const sinCupo = new Counter('reservas_sin_cupo');
const inesperadas = new Counter('respuestas_inesperadas');

export const options = {
  scenarios: {
    apertura: {
      executor: 'per-vu-iterations',
      vus: tokens.length,
      iterations: 1,
      maxDuration: '3m',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<500'],
    respuestas_inesperadas: ['count<20'],
  },
};

export default function () {
  const i = __VU - 1;
  sleep(Math.random() * 60); // la apertura se reparte en ~60 s

  const res = http.post(
    `${BASE}/api/v1/events/${eventId}/reservations`,
    JSON.stringify({ quantity: (i % 4) + 1 }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens[i]}`,
        'Idempotency-Key': `carga-${i}`,
      },
      // el 409 por falta de cupo NO es un error
      responseCallback: http.expectedStatuses(201, 409),
    },
  );

  if (res.status === 201) confirmadas.add(1);
  else if (res.status === 409) sinCupo.add(1);
  else inesperadas.add(1);

  check(res, { 'respuesta esperada (201 o 409)': (r) => r.status === 201 || r.status === 409 });
}