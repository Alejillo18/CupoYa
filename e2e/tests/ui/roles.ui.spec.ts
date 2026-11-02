import { test, expect } from '../../helpers/fixtures';
import { crearEvento, nombreEvento } from '../../helpers/api';
import { aviso, fechaLocalEnHoras, filaDeEvento, iniciarSesion } from '../../helpers/ui';

test.describe('Usuario común', () => {
  test('no ve opciones de gestión y las pantallas de gestión lo devuelven al inicio', async ({ page, usuario }) => {
    await iniciarSesion(page, usuario.email);

    await page.goto('/eventos');
    await expect(page.getByRole('heading', { name: 'Eventos' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Nuevo evento' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Reportes' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Usuarios' })).toHaveCount(0);

    for (const ruta of ['/eventos/nuevo', '/usuarios', '/reportes']) {
      await page.goto(ruta);
      await expect(page, ruta).toHaveURL(/\/inicio$/);
    }
  });
});

test.describe('Operador', () => {
  test('crea un evento desde el formulario y lo ve en el listado', async ({ page, operador }) => {
    const nombre = nombreEvento();
    await iniciarSesion(page, operador.email);

    await page.goto('/eventos');
    await page.getByRole('link', { name: 'Nuevo evento' }).click();
    await page.getByLabel('Nombre').fill(nombre);
    await page.getByLabel('Descripción').fill('Creado por una prueba E2E');
    await page.getByLabel('Lugar').fill('Sala de pruebas');
    await page.getByLabel('Fecha y hora').fill(fechaLocalEnHoras(1));
    await page.getByLabel('Cupo total').fill('12');
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(aviso(page, 'Evento creado.')).toBeVisible();
    await expect(page).toHaveURL(/\/eventos$/);
    const fila = await filaDeEvento(page, nombre);
    await expect(fila).toContainText('12 / 12');
    await expect(fila).toContainText('Sala de pruebas');
  });

  test('el formulario valida cupo inválido y campos obligatorios sin llamar a la API', async ({ page, operador }) => {
    let llamadas = 0;
    page.on('request', (r) => {
      if (r.method() === 'POST' && r.url().endsWith('/api/v1/events')) llamadas++;
    });
    await iniciarSesion(page, operador.email);
    await page.goto('/eventos/nuevo');

    await page.getByLabel('Cupo total').fill('0');
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(page.getByText('El nombre es obligatorio (máximo 120 caracteres).')).toBeVisible();
    await expect(page.getByText('El lugar es obligatorio (máximo 160 caracteres).')).toBeVisible();
    await expect(page.getByText('El cupo debe ser un entero mayor a cero.')).toBeVisible();
    expect(llamadas).toBe(0);
  });

  test('edita un evento existente', async ({ page, request, operador }) => {
    const evento = await crearEvento(request, operador.token);
    const nuevoNombre = nombreEvento();
    await iniciarSesion(page, operador.email);

    const fila = await filaDeEvento(page, evento.name);
    await fila.getByRole('link', { name: 'Editar' }).click();
    await expect(page.getByRole('heading', { name: 'Editar evento' })).toBeVisible();
    await page.getByLabel('Nombre').fill(nuevoNombre);
    await page.getByRole('button', { name: 'Guardar' }).click();

    await expect(aviso(page, 'Evento actualizado.')).toBeVisible();
    await expect(await filaDeEvento(page, nuevoNombre)).toBeVisible();
  });

  test('cancelar un evento pide confirmación y lo saca del listado', async ({ page, request, operador }) => {
    const evento = await crearEvento(request, operador.token);
    await iniciarSesion(page, operador.email);

    const fila = await filaDeEvento(page, evento.name);
    await fila.getByRole('button', { name: 'Cancelar evento' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar evento' }).click();

    await expect(aviso(page, `Evento "${evento.name}" cancelado.`)).toBeVisible();
    await expect(page.getByRole('row', { name: new RegExp(evento.name) })).toHaveCount(0);
  });

  test('un nombre con HTML se muestra como texto y no ejecuta código (XSS)', async ({
    page,
    request,
    operador,
    usuario,
  }) => {
    const peligroso = 'E2E <img src=x onerror="window.__xss=1"> <b>negrita</b>';
    await crearEvento(request, operador.token, { name: peligroso });
    await iniciarSesion(page, usuario.email);
    await page.goto('/eventos');
    await page.getByRole('table').waitFor();

    await expect(page.getByText(peligroso, { exact: false }).first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)).toBeUndefined();
  });
});

test.describe('Administrador', () => {
  test('ve Reportes y Usuarios en la barra y puede abrir esas pantallas', async ({ page, admin }) => {
    await iniciarSesion(page, admin.email);
    await expect(page.getByText(`${admin.email} · ADMIN`).first()).toBeVisible();

    await page.getByRole('link', { name: 'Usuarios' }).click();
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();

    await page.getByRole('link', { name: 'Reportes' }).click();
    await expect(page.getByRole('heading', { name: 'Reporte de ocupación' })).toBeVisible();
  });
});
