// Escucha la ocupación en vivo de uno o más eventos (hasta 5).
// Uso: WS_URL=ws://localhost:8080/api/v1/ws node --env-file=.env scripts/ws-ocupacion.js <idEvento> [...]
const jwt = require('jsonwebtoken');
const WebSocket = require('ws');

const ids = process.argv.slice(2);
const url = process.env.WS_URL || 'ws://localhost:3000/api/v1/ws';
const token = jwt.sign({ role: 'ADMIN' }, process.env.JWT_SECRET, {
  subject: 'prueba',
  expiresIn: 600,
  algorithm: 'HS256',
});

const ws = new WebSocket(url);
ws.on('open', () => ws.send(JSON.stringify({ type: 'auth', token })));
ws.on('message', (d) => {
  const m = JSON.parse(d);
  console.log(JSON.stringify(m));
  if (m.type === 'autenticado') ws.send(JSON.stringify({ type: 'suscribir', eventIds: ids }));
});
ws.on('error', (e) => console.log('error:', e.message));
ws.on('close', (c) => console.log('cerrado', c));
