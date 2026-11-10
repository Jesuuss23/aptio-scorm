// HU-0304, HU-0305 y HU-1402 · Material del cliente en la web (CP-033, CP-034, CP-035 y el aviso de CP-102) contra la API simulada.
import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const PROYECTO = '/proyectos/00000000-0000-4000-8000-000000000701';
const pdf = (name: string) => ({ name, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7 prueba') });

test('CP-033 · el manual de 84 páginas muestra el texto de cada página y marca la escaneada', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('Archivos del material').setInputFiles(pdf('Manual_bloqueo_y_etiquetado.pdf'));
  const fila = material.getByRole('listitem').filter({ hasText: 'Manual_bloqueo_y_etiquetado.pdf' });
  await expect(fila.getByText('84 páginas · 1 con OCR')).toBeVisible({ timeout: 10_000 });
  await fila.getByRole('button', { name: 'Ver texto' }).click();
  const texto = material.getByRole('region', { name: 'Texto de Manual_bloqueo_y_etiquetado.pdf' });
  await expect(texto.getByRole('article')).toHaveCount(84);
  const escaneada = texto.getByRole('article', { name: 'Página 42' });
  await expect(escaneada.getByText('Escaneada (OCR)')).toBeVisible();
  await expect(escaneada).toContainText('BLOQUEO Y ETIQUETADO');
  await expect(texto.getByText('Escaneada (OCR)')).toHaveCount(1);
});

test('CP-034 · un .exe renombrado a .pdf se rechaza por su tipo real', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('Archivos del material').setInputFiles(pdf('instalador-renombrado.pdf'));
  await expect(material.getByRole('alert')).toHaveText('«instalador-renombrado.pdf» no se agregó: El contenido es application/x-msdownload, no application/pdf');
  await expect(material.getByText('Aún no hay material', { exact: false })).toBeVisible();
});

test('CP-102 · la página con una orden para la IA se marca y se explica que no se obedece', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('Archivos del material').setInputFiles(pdf('manual-inyeccion.pdf'));
  const fila = material.getByRole('listitem').filter({ hasText: 'manual-inyeccion.pdf' });
  await expect(fila.getByText('1 página con posible instrucción')).toBeVisible({ timeout: 10_000 });
  await fila.getByRole('button', { name: 'Ver texto' }).click();
  const pagina = material.getByRole('article', { name: 'Página 2' });
  await expect(pagina.getByText('Posible instrucción', { exact: true })).toBeVisible();
  await expect(pagina.getByText('la IA no lo obedece', { exact: false })).toBeVisible();
});

test('CP-035 · un video de 2:30 muestra su transcripción con marcas de tiempo', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('Archivos del material').setInputFiles({ name: 'Charla de seguridad.mp4', mimeType: 'video/mp4', buffer: Buffer.from('video de prueba') });
  const fila = material.getByRole('listitem').filter({ hasText: 'Charla de seguridad.mp4' });
  await expect(fila.getByText('Video', { exact: true })).toBeVisible();
  await expect(fila.getByText('Transcripción de 2:30 · 5 fragmentos con marca de tiempo')).toBeVisible({ timeout: 10_000 });
  await fila.getByRole('button', { name: 'Ver transcripción' }).click();
  const t = material.getByRole('region', { name: 'Transcripción de Charla de seguridad.mp4' });
  await expect(t.getByRole('listitem')).toHaveCount(5);
  await expect(t.getByRole('listitem').first()).toContainText('0:00–0:30Hola, soy Ana, supervisora de seguridad.');
  await expect(t.getByRole('listitem', { name: 'Desde 2:00' })).toContainText('2:00–2:30Verifica la energía cero antes de empezar.');
});

test('CP-102 · en un audio, el fragmento con una orden para la IA se marca', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('Archivos del material').setInputFiles({ name: 'charla-inyeccion.mp3', mimeType: 'audio/mpeg', buffer: Buffer.from('audio de prueba') });
  const fila = material.getByRole('listitem').filter({ hasText: 'charla-inyeccion.mp3' });
  await expect(fila.getByText('1 fragmento con posible instrucción')).toBeVisible({ timeout: 10_000 });
  await fila.getByRole('button', { name: 'Ver transcripción' }).click();
  await expect(material.getByRole('listitem', { name: 'Desde 1:15' })).toContainText('la IA no la obedece');
});

test('sin archivo, basta con el tema', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('O escribe solo el tema', { exact: false }).fill('Uso correcto de extintores');
  await material.getByRole('button', { name: 'Agregar tema' }).click();
  await expect(material.getByRole('listitem').filter({ hasText: 'Uso correcto de extintores' })).toContainText('Sin archivo: la IA parte del tema');
});

test('el diseñador gráfico ve el material pero no sube', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await expect(material.getByText('Aún no hay material', { exact: false })).toBeVisible();
  await expect(material.getByLabel('Archivos del material')).toHaveCount(0);
});
