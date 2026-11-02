import { test, expect } from '../../helpers/fixtures';
import { PASSWORD, emailUnico } from '../../helpers/api';
import { aviso, iniciarSesion } from '../../helpers/ui';

test.describe('Registro', () => {
  test('crear una cuenta lleva al login con el aviso de cuenta creada', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Email').fill(emailUnico('ui-reg'));
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Repetir contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page).toHaveURL(/\/login\?registrado=1$/);
    await expect(page.getByRole('status')).toHaveText('Cuenta creada. Ya podés ingresar.');
  });

  test('si las contraseñas no coinciden muestra el error y no avanza', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Email').fill(emailUnico('ui-reg'));
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Repetir contraseña').fill('OtraClave123');
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(page.getByText('Las contraseñas no coinciden.')).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });

  test('una contraseña débil (sin números) muestra la regla', async ({ page }) => {
    await page.goto('/registro');
    await page.getByLabel('Contraseña', { exact: true }).fill('soloLetrasAca');
    await page.getByLabel('Contraseña', { exact: true }).blur();

    await expect(page.getByText('Mínimo 8 caracteres, con letras y números (máximo 72).')).toBeVisible();
  });

  test('un email ya registrado muestra el aviso de error', async ({ page, usuario }) => {
    await page.goto('/registro');
    await page.getByLabel('Email').fill(usuario.email);
    await page.getByLabel('Contraseña', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Repetir contraseña').fill(PASSWORD);
    await page.getByRole('button', { name: 'Crear cuenta' }).click();

    await expect(aviso(page, 'Ya existe una cuenta con ese email.')).toBeVisible();
    await expect(page).toHaveURL(/\/registro$/);
  });
});

test.describe('Login y sesión', () => {
  test('ingresar muestra el email y el rol en el inicio y en la barra', async ({ page, usuario }) => {
    await iniciarSesion(page, usuario.email);

    await expect(page.getByRole('heading', { name: 'CupoYa' })).toBeVisible();
    await expect(page.getByText(`Rol: USUARIO`)).toBeVisible();
    await expect(page.getByText(`${usuario.email} · USUARIO`).first()).toBeVisible();
  });

  test('credenciales incorrectas muestran el aviso y no entran', async ({ page, usuario }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(usuario.email);
    await page.getByLabel('Contraseña').fill('Incorrecta123');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();

    await expect(aviso(page, 'Email o contraseña incorrectos.')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('los campos vacíos muestran los errores y no llaman a la API', async ({ page }) => {
    let llamadas = 0;
    page.on('request', (r) => {
      if (r.url().includes('/api/v1/auth/login')) llamadas++;
    });

    await page.goto('/login');
    await page.getByRole('button', { name: 'Ingresar', exact: true }).click();

    await expect(page.getByText('Ingresá un email válido.')).toBeVisible();
    await expect(page.getByText('Ingresá tu contraseña.')).toBeVisible();
    expect(llamadas).toBe(0);
  });

  test('la sesión sobrevive a recargar la página', async ({ page, usuario }) => {
    await iniciarSesion(page, usuario.email);
    await page.reload();

    await expect(page).toHaveURL(/\/inicio$/);
    await expect(page.getByText(`${usuario.email} · USUARIO`).first()).toBeVisible();
  });

  test('cerrar sesión vuelve al login y la sesión no se recupera al recargar', async ({ page, usuario }) => {
    await iniciarSesion(page, usuario.email);
    await page.getByRole('button', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);

    await page.goto('/eventos');
    await expect(page).toHaveURL(/\/login$/);
  });

  test('las pantallas privadas redirigen al login si no hay sesión', async ({ page }) => {
    for (const ruta of ['/inicio', '/eventos', '/reservas', '/eventos/nuevo', '/usuarios', '/reportes']) {
      await page.goto(ruta);
      await expect(page, ruta).toHaveURL(/\/login$/);
    }
  });

  test('una ruta que no existe cae en el login', async ({ page }) => {
    await page.goto('/esto-no-existe');
    await expect(page).toHaveURL(/\/login$/);
  });
});

test.describe('En un celular', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('la navegación se pasa al menú de hamburguesa', async ({ page, usuario }) => {
    await iniciarSesion(page, usuario.email);

    await page.getByRole('button', { name: 'Menú' }).click();
    await expect(page.getByRole('menuitem', { name: 'Mis reservas' })).toBeVisible();
    await page.getByRole('menuitem', { name: 'Cerrar sesión' }).click();
    await expect(page).toHaveURL(/\/login$/);
  });
});
