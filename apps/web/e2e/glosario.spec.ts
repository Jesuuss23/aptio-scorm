// HU-0205 · Glosario y pronunciación en la web (CP-027) contra la API simulada.
import { expect, test } from '@playwright/test';
import { CLIENTE_ID, simularApi } from './api-simulada';

test('CP-027 · «LOTO» → «lo-to»: la muestra dice «lo-to»', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'PRODUCTOR' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const pron = page.getByRole('region', { name: 'Pronunciación', exact: true });
  await pron.getByRole('button', { name: 'Agregar término' }).click();
  await pron.getByLabel('Se escribe, fila 1').fill('LOTO');
  await pron.getByLabel('Se pronuncia, fila 1').fill('lo-to');
  await expect(pron.getByText('guarda tus cambios para escucharlos', { exact: false })).toBeVisible();
  await pron.getByRole('button', { name: 'Guardar pronunciación' }).click();
  await expect(pron.getByRole('status').filter({ hasText: 'Diccionario guardado' })).toBeVisible();

  await pron.getByLabel('Frase de prueba').fill('Aplica el LOTO antes de abrir el tablero.');
  await pron.getByRole('button', { name: 'Escuchar muestra' }).click();
  const muestra = pron.getByRole('status', { name: 'Muestra de voz' });
  await expect(muestra.getByText('La voz dirá: «Aplica el lo-to antes de abrir el tablero.»')).toBeVisible();
  await expect(muestra.getByText('aplica LOTO', { exact: false })).toBeVisible();
  await expect(muestra.locator('audio')).toHaveAttribute('src', /^data:audio\/wav/);
});

test('glosario: un término sin traducción se rechaza y «no traducir» lo deja igual', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'PRODUCTOR' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const glosario = page.getByRole('region', { name: 'Glosario', exact: true });
  await glosario.getByRole('button', { name: 'Agregar término' }).click();
  await glosario.getByLabel('Término, fila 1').fill('LOTO');
  await glosario.getByRole('button', { name: 'Guardar glosario' }).click();
  await expect(glosario.getByRole('alert')).toContainText('«LOTO»: indica la traducción o marca «no traducir»');

  await glosario.getByLabel('No traducir, fila 1').check();
  await expect(glosario.getByLabel('En inglés, fila 1')).toHaveValue('LOTO');
  await expect(glosario.getByLabel('En inglés, fila 1')).toBeDisabled();
  await glosario.getByRole('button', { name: 'Guardar glosario' }).click();
  await expect(glosario.getByRole('status')).toContainText('Glosario guardado');
});
