import { test, expect } from '../../helpers/fixtures';
import { crearEvento, reservar } from '../../helpers/api';
import { cupoEnBase } from '../../helpers/db';
import { aviso, filaDeEvento, iniciarSesion } from '../../helpers/ui';

test.describe('Reservar desde la interfaz', () => {
  test('el usuario reserva 2 lugares: aviso, cupo actualizado y la reserva aparece en "Mis reservas"', async ({
    page,
    request,
    operador,
    usuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    await iniciarSesion(page, usuario.email);

    const fila = await filaDeEvento(page, evento.name);
    await expect(fila).toContainText('10 / 10');

    await fila.getByRole('combobox', { name: `Cantidad para ${evento.name}` }).click();
    await page.getByRole('option', { name: '2', exact: true }).click();
    await fila.getByRole('button', { name: 'Reservar' }).click();

    await expect(aviso(page, `Reserva confirmada para "${evento.name}".`)).toBeVisible();
    await expect(fila).toContainText('8 / 10');
    expect(await cupoEnBase(evento.id)).toBe(8);

    await page.getByRole('link', { name: 'Mis reservas' }).first().click();
    const reserva = page.getByRole('row', { name: new RegExp(evento.name) });
    await expect(reserva).toContainText('CONFIRMADA');
    await expect(reserva).toContainText('2');
  });

  test('pasarse del límite de 4 muestra el aviso de error', async ({ page, request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 20 });
    expect((await reservar(request, usuario.token, evento.id, 3)).status()).toBe(201);
    await iniciarSesion(page, usuario.email);

    const fila = await filaDeEvento(page, evento.name);
    await fila.getByRole('combobox').click();
    await page.getByRole('option', { name: '2', exact: true }).click();
    await fila.getByRole('button', { name: 'Reservar' }).click();

    await expect(aviso(page, 'Superás el máximo de 4 lugares por evento.')).toBeVisible();
    expect(await cupoEnBase(evento.id)).toBe(17); // no se descontó nada más
  });

  test('un evento agotado muestra "Agotado" y no deja reservar', async ({
    page,
    request,
    operador,
    usuario,
    otroUsuario,
  }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 1 });
    expect((await reservar(request, otroUsuario.token, evento.id, 1)).status()).toBe(201);
    await iniciarSesion(page, usuario.email);

    const fila = await filaDeEvento(page, evento.name);
    await expect(fila).toContainText('Agotado');
    await expect(fila.getByRole('button', { name: 'Reservar' })).toBeDisabled();
  });

  test('un usuario sin reservas ve el mensaje vacío', async ({ page, usuario }) => {
    await iniciarSesion(page, usuario.email);
    await page.goto('/reservas');
    await expect(page.getByText('Todavía no tenés reservas.')).toBeVisible();
  });
});

test.describe('Cancelar reservas desde la interfaz', () => {
  test('cancelar libera el cupo y la reserva pasa a CANCELADA', async ({ page, request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    expect((await reservar(request, usuario.token, evento.id, 3)).status()).toBe(201);
    await iniciarSesion(page, usuario.email);
    await page.goto('/reservas');

    const fila = page.getByRole('row', { name: new RegExp(evento.name) });
    await fila.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.getByRole('button', { name: 'Sí, cancelar reserva' }).click();

    await expect(aviso(page, 'Reserva cancelada.')).toBeVisible();
    await expect(fila).toContainText('CANCELADA');
    await expect(fila.getByRole('button', { name: 'Cancelar reserva' })).toHaveCount(0);
    expect(await cupoEnBase(evento.id)).toBe(10);
  });

  test('"Volver" en la confirmación no cancela nada', async ({ page, request, operador, usuario }) => {
    const evento = await crearEvento(request, operador.token, { totalCapacity: 10 });
    expect((await reservar(request, usuario.token, evento.id, 1)).status()).toBe(201);
    await iniciarSesion(page, usuario.email);
    await page.goto('/reservas');

    const fila = page.getByRole('row', { name: new RegExp(evento.name) });
    await fila.getByRole('button', { name: 'Cancelar reserva' }).click();
    await page.getByRole('button', { name: 'Volver' }).click();

    await expect(fila).toContainText('CONFIRMADA');
    expect(await cupoEnBase(evento.id)).toBe(9);
  });
});
