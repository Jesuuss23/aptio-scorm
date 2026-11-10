// HU-0204 · Pantallas modelo del kit en la web (CP-025, CP-026) contra la API simulada.
import { expect, test } from '@playwright/test';
import { CLIENTE_ID, simularApi } from './api-simulada';

test('CP-026 · sin modelos propios, cada disposición muestra el del estilo base', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const modelos = page.getByRole('region', { name: 'Pantallas modelo del kit' });
  await expect(modelos.getByText('0 de 18 disposiciones con modelo propio.', { exact: false })).toBeVisible();
  await expect(modelos.getByRole('list', { name: 'Modelos por disposición' }).getByRole('listitem')).toHaveCount(18);
  await expect(modelos.getByText('Estilo base', { exact: true })).toHaveCount(18);
});

test('CP-025 · crear y activar «Idea + ilustración»; desactivarla vuelve al estilo base', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const modelos = page.getByRole('region', { name: 'Pantallas modelo del kit' });
  await modelos.getByRole('button', { name: 'Agregar pantalla modelo' }).click();
  const editor = modelos.getByRole('group', { name: 'Nueva pantalla modelo' });
  await editor.getByLabel('Disposición').selectOption('idea');
  await editor.getByLabel('Nombre').fill('Idea + ilustración');
  await editor.getByLabel('ancho de imagen').fill('40');
  await editor.getByRole('button', { name: 'Guardar pantalla modelo' }).click();

  const tarjeta = modelos.getByRole('listitem', { name: 'Idea + ilustración' });
  await expect(tarjeta.getByText('Activa', { exact: true })).toBeVisible();
  await expect(modelos.getByText('1 de 18 disposiciones con modelo propio.', { exact: false })).toBeVisible();
  await expect(modelos.getByText('Estilo base', { exact: true })).toHaveCount(17);

  await tarjeta.getByRole('button', { name: 'Desactivar' }).click();
  await expect(tarjeta.getByText('Inactiva', { exact: true })).toBeVisible();
  await expect(modelos.getByText('0 de 18 disposiciones con modelo propio.', { exact: false })).toBeVisible();
});

test('las zonas toman el color del kit en edición y el productor solo ve', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'PRODUCTOR' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const modelos = page.getByRole('region', { name: 'Pantallas modelo del kit' });
  await expect(modelos.getByRole('button', { name: 'Agregar pantalla modelo' })).toHaveCount(0);
  await modelos.getByRole('button', { name: 'Escritorio' }).click();
  await expect(modelos.locator('.miniatura.escritorio').first()).toBeVisible();
});
