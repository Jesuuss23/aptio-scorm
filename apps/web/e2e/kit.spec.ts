// HU-0202 · Kit de marca en la web (CP-020, CP-021, CP-022) contra la API simulada.
import { expect, test } from '@playwright/test';
import { CLIENTE_ID, simularApi } from './api-simulada';

const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;

test('CP-020 · cambiar el color primario actualiza la vista previa sin recargar', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const kit = page.getByRole('region', { name: 'Kit de marca' });
  await expect(kit.getByText('Versión 3')).toBeVisible();
  const portada = page.locator('[data-pantalla="portada"]');
  await expect(portada).toHaveCSS('background-color', rgb('#12355B'));

  let recargas = 0;
  page.on('framenavigated', () => recargas++);
  await kit.getByLabel('Color primario').fill('#8a1538');
  await expect(portada).toHaveCSS('background-color', rgb('#8A1538'));
  await expect(page.locator('[data-pantalla="idea"] .kp-titulo')).toHaveCSS('color', rgb('#8A1538'));
  expect(recargas).toBe(0);

  await kit.getByLabel('Títulos').selectOption('Montserrat');
  await expect(portada.locator('.kp-titulo')).toHaveCSS('font-family', /Montserrat/);
  await kit.getByRole('button', { name: 'Guardar kit' }).click();
  await expect(kit.getByRole('status')).toHaveText('Kit guardado');
  await expect(kit.getByText('Versión 4')).toBeVisible();
});

test('CP-021 · texto #9AA0A6 sobre blanco advierte y deja guardar', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const kit = page.getByRole('region', { name: 'Kit de marca' });
  await expect(kit.getByText('✓ AA')).toBeVisible();
  await kit.getByLabel('Color texto').fill('#9aa0a6');
  await kit.getByLabel('Color fondo').fill('#ffffff');
  await expect(kit.getByText('menor a 4,5:1', { exact: true })).toBeVisible();
  await expect(kit.getByText(/2,6:1/).first()).toBeVisible();
  const guardar = kit.getByRole('button', { name: 'Guardar kit' });
  await expect(guardar).toBeEnabled();
  await guardar.click();
  await expect(kit.getByRole('status')).toHaveText('Kit guardado con advertencias');
});

test('CP-022 · si otra persona guardó antes, avisa y permite recargar', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO', kitEnConflicto: true });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const kit = page.getByRole('region', { name: 'Kit de marca' });
  await kit.getByRole('button', { name: 'Corporativo' }).click();
  await kit.getByRole('button', { name: 'Guardar kit' }).click();
  await expect(kit.getByRole('alert')).toContainText('Otra persona guardó el kit');
  await kit.getByRole('button', { name: 'Recargar' }).click();
  await expect(kit.getByRole('alert')).toHaveCount(0);
  await expect(kit.getByText('Versión 4')).toBeVisible();
  await expect(kit.getByRole('button', { name: 'Industrial' })).toHaveAttribute('aria-pressed', 'true');
});

test('un cliente sin kit parte de la propuesta inicial y se crea', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto('/clientes/00000000-0000-4000-8000-0000000000c2');
  const kit = page.getByRole('region', { name: 'Kit de marca' });
  await expect(kit.getByText('Sin kit: propuesta inicial')).toBeVisible();
  await kit.getByRole('button', { name: 'Crear kit' }).click();
  await expect(kit.getByText('Versión 1')).toBeVisible();
});

test('el productor ve el kit sin poder editarlo; el revisor no lo ve', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'PRODUCTOR' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const kit = page.getByRole('region', { name: 'Kit de marca' });
  await expect(kit.getByLabel('Color primario')).toBeDisabled();
  await expect(kit.getByRole('button', { name: 'Guardar kit' })).toHaveCount(0);
});

test('el revisor del cliente no ve el kit', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'REVISOR_CLIENTE' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Minera Andina');
  await expect(page.getByRole('region', { name: 'Kit de marca' })).toHaveCount(0);
});

test('CP-023 · al subir el personaje sin la boca G se marca «G falta» y se reemplaza por B', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const personaje = page.getByRole('group', { name: 'Personaje' });
  await expect(personaje.getByText('Sin personaje')).toBeVisible();
  await personaje.getByLabel('Archivo del personaje').setInputFiles({
    name: 'Ana peligrosa.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  const bocas = personaje.getByRole('list', { name: 'Bocas' });
  await expect(bocas.getByText('G falta')).toBeVisible();
  await expect(bocas.getByText('B ✓')).toBeVisible();
  await expect(personaje.getByText('G falta: se usa la B hasta que se agregue')).toBeVisible();
  await expect(personaje.getByText('Se quitó del SVG por seguridad: script, atributos on*.')).toBeVisible();
  await expect(page.getByText('Versión 4')).toBeVisible();
});

test('un personaje sin capas obligatorias muestra qué falta', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const personaje = page.getByRole('group', { name: 'Personaje' });
  await personaje.getByLabel('Archivo del personaje').setInputFiles({
    name: 'boceto.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(personaje.getByRole('alert')).toContainText('Falta la capa obligatoria «cabeza»');
});
