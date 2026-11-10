// HU-0201 · Clientes en la web (CP-019) contra la API simulada.
import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada';

test('CP-019 · crear un cliente solo con el nombre y verlo en la lista', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto('/');
  await page.getByRole('link', { name: 'Clientes y kits' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Clientes y kits');
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Empresa/Clientes y kits');

  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  const crear = page.getByRole('button', { name: 'Crear cliente' });
  await expect(crear).toBeDisabled();
  await page.getByLabel('Nombre').fill('Colegio San Juan');
  await crear.click();

  const lista = page.getByRole('list', { name: 'Clientes' });
  await expect(lista.getByRole('link', { name: /Colegio San Juan/ })).toContainText('Sin kit');
  await expect(lista.getByRole('link', { name: /Colegio San Juan/ })).toContainText('LMS por definir');
});

test('avisa si el nombre ya existe', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto('/clientes');
  await page.getByRole('button', { name: 'Nuevo cliente' }).click();
  await page.getByLabel('Nombre').fill('minera andina');
  await page.getByRole('button', { name: 'Crear cliente' }).click();
  await expect(page.getByRole('alert')).toHaveText('Ya existe un cliente llamado «minera andina»');
});

test('buscar filtra la lista y abrir un cliente muestra su nombre en la ruta', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto('/clientes');
  await page.getByLabel('Buscar').fill('munic');
  const lista = page.getByRole('list', { name: 'Clientes' });
  await expect(lista.getByRole('link')).toHaveCount(1);
  await page.getByLabel('Buscar').fill('');
  await lista.getByRole('link', { name: /Minera Andina/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minera Andina');
  await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Empresa/Clientes y kits/Minera Andina');
  await expect(page.getByRole('link', { name: 'Clientes y kits' })).toHaveAttribute('aria-current', 'page');

  await page.getByLabel('Notas').fill('Cliente desde 2024');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Cambios guardados');
});

test('el diseñador gráfico ve los clientes pero no el botón de crear ni el de guardar', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto('/clientes');
  await expect(page.getByRole('list', { name: 'Clientes' }).getByRole('link')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Nuevo cliente' })).toHaveCount(0);
  await page.getByRole('link', { name: /Minera Andina/ }).click();
  await expect(page.getByLabel('Nombre')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(0);
});
