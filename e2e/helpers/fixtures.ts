import { test as base } from '@playwright/test';
import { Sesion, crearSesion } from './api';

/** Usuarios ya registrados y con sesión, creados solo si la prueba los pide. */
export const test = base.extend<{ usuario: Sesion; otroUsuario: Sesion; operador: Sesion; admin: Sesion }>({
  usuario: async ({ request }, use) => use(await crearSesion(request, 'USUARIO')),
  otroUsuario: async ({ request }, use) => use(await crearSesion(request, 'USUARIO')),
  operador: async ({ request }, use) => use(await crearSesion(request, 'OPERADOR')),
  admin: async ({ request }, use) => use(await crearSesion(request, 'ADMIN')),
});

export { expect } from '@playwright/test';
