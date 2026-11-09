// Flujo de acceso de la web contra la API simulada (HU-0104, HU-0109).
import { expect, test } from '@playwright/test';
import { simularApi, USUARIO } from './api-simulada';

test('sin sesión lleva a Ingresar; con clave correcta entra a Proyectos y puede salir', async ({ page }) => {
  await simularApi(page, { conSesion: false });
  await page.goto('/');
  await expect(page).toHaveURL(/\/ingresar$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingresar');

  await page.getByLabel('Correo').fill(USUARIO.email);
  await page.getByLabel('Clave').fill('clave-equivocada');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page.getByRole('alert')).toHaveText('Correo o clave incorrectos');

  await page.getByLabel('Clave').fill('clave-correcta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Proyectos');
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Inicio/Proyectos');
  await expect(page.getByRole('link', { name: 'Proyectos' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('navigation', { name: 'Menú principal' })).toContainText('Diseño instruccional');

  await page.getByRole('button', { name: 'Salir' }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
});

test('se puede ingresar solo con el teclado', async ({ page }) => {
  await simularApi(page, { conSesion: false });
  await page.goto('/ingresar');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingresar');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Correo')).toBeFocused();
  await page.keyboard.type(USUARIO.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type('clave-correcta');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Proyectos');
});

test('pedir cambio de clave muestra el mismo mensaje exista o no el correo', async ({ page }) => {
  await simularApi(page, { conSesion: false });
  await page.goto('/ingresar');
  await page.getByRole('link', { name: '¿Olvidaste tu clave?' }).click();
  await page.getByLabel('Correo').fill('quien-sea@ejemplo.test');
  await page.getByRole('button', { name: 'Enviar enlace' }).click();
  await expect(page.getByRole('status')).toHaveText('Si el correo está registrado, recibirás el enlace en unos minutos.');
});

test('crear la clave desde la invitación y avisar si el enlace venció', async ({ page }) => {
  await simularApi(page, { conSesion: false });
  await page.goto('/clave?token=vigente');
  const guardar = page.getByRole('button', { name: 'Guardar clave' });
  await page.getByLabel('Clave nueva').fill('corta');
  await expect(guardar).toBeDisabled();
  await page.getByLabel('Clave nueva').fill('una-clave-larga');
  await page.getByLabel('Repite la clave').fill('una-clave-larga');
  await guardar.click();
  await expect(page.getByRole('status')).toContainText('Tu clave quedó guardada');

  await page.goto('/clave?token=usado');
  await page.getByLabel('Clave nueva').fill('una-clave-larga');
  await page.getByLabel('Repite la clave').fill('una-clave-larga');
  await page.getByRole('button', { name: 'Guardar clave' }).click();
  await expect(page.getByRole('alert')).toContainText('Enlace no válido o vencido');
  await expect(page.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeVisible();
});
