import { APIRequestContext, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { asignarRol } from './db';

export const PASSWORD = 'Prueba12345';
export type Rol = 'USUARIO' | 'OPERADOR' | 'ADMIN';

export interface Sesion {
  id: string;
  email: string;
  password: string;
  rol: Rol;
  token: string;
}

let contador = 0;

export function emailUnico(prefijo = 'user'): string {
  const azar = Math.random().toString(36).slice(2, 7);
  return `${prefijo}-${Date.now()}-${process.pid}-${contador++}-${azar}@e2e.cupoya.test`;
}

export const conToken = (token: string) => ({ Authorization: `Bearer ${token}` });

/** Registra un usuario nuevo, le asigna el rol (en la base) e inicia sesión. */
export async function crearSesion(request: APIRequestContext, rol: Rol = 'USUARIO'): Promise<Sesion> {
  const email = emailUnico(rol.toLowerCase());

  const registro = await request.post('/api/v1/auth/register', { data: { email, password: PASSWORD } });
  expect(registro.status(), 'registro del usuario de prueba').toBe(201);

  // El rol viaja en el token: hay que asignarlo ANTES de iniciar sesión.
  if (rol !== 'USUARIO') await asignarRol(email, rol);

  const login = await request.post('/api/v1/auth/login', { data: { email, password: PASSWORD } });
  expect(login.status(), 'login del usuario de prueba').toBe(200);
  const cuerpo = await login.json();

  return { id: cuerpo.user.id, email, password: PASSWORD, rol, token: cuerpo.accessToken };
}

export interface EventoApi {
  id: string;
  name: string;
  venue: string;
  totalCapacity: number;
  availableCapacity: number;
  status: 'ACTIVO' | 'CANCELADO';
}

export function nombreEvento(): string {
  return `E2E ${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Fecha futura (por defecto dentro de 1 hora, para quedar al principio del listado). */
export function enHoras(horas = 1): string {
  return new Date(Date.now() + horas * 3_600_000).toISOString();
}

export async function crearEvento(
  request: APIRequestContext,
  token: string,
  datos: Partial<{ name: string; venue: string; startsAt: string; totalCapacity: number; description: string }> = {},
): Promise<EventoApi> {
  const res = await request.post('/api/v1/events', {
    headers: conToken(token),
    data: {
      name: nombreEvento(),
      venue: 'Teatro E2E',
      startsAt: enHoras(1),
      totalCapacity: 10,
      ...datos,
    },
  });
  expect(res.status(), 'creación del evento de prueba').toBe(201);
  return (await res.json()).event;
}

export async function reservar(
  request: APIRequestContext,
  token: string,
  eventId: string,
  quantity: number,
  idempotencyKey?: string,
) {
  return request.post(`/api/v1/events/${eventId}/reservations`, {
    headers: { ...conToken(token), ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}) },
    data: { quantity },
  });
}

export const uuidInexistente = () => randomUUID();
