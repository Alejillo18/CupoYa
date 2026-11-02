import { Page, expect } from '@playwright/test';
import { PASSWORD } from './api';

export const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export async function iniciarSesion(page: Page, email: string, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Contraseña').fill(password);
  await page.getByRole('button', { name: 'Ingresar', exact: true }).click();
  await expect(page).toHaveURL(/\/inicio$/);
}

/** Va a /eventos y devuelve la fila del evento, pasando de página si hace falta (10 por página). */
export async function filaDeEvento(page: Page, nombre: string) {
  await page.goto('/eventos');
  const fila = page.getByRole('row', { name: new RegExp(escapar(nombre)) });
  const tabla = page.getByRole('table').or(page.getByText('No hay eventos disponibles.')).first();
  await tabla.waitFor();

  for (let i = 0; i < 20 && !(await fila.isVisible()); i++) {
    const siguiente = page.getByRole('button', { name: 'Página siguiente' });
    if (!(await siguiente.isEnabled())) break;
    await siguiente.click();
  }
  return fila;
}

/** El snackbar de Angular Material (notificaciones de éxito/error). */
export const aviso = (page: Page, texto: string | RegExp) =>
  page.locator('.mat-mdc-snack-bar-container').filter({ hasText: texto });

/** "YYYY-MM-DDTHH:mm" en hora local, el formato que acepta <input type="datetime-local">. */
export function fechaLocalEnHoras(horas = 2): string {
  const d = new Date(Date.now() + horas * 3_600_000);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`;
}
