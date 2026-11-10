// HU-0304 y HU-1402 · Material del cliente en la web (CP-033, CP-034 y el aviso de CP-102) contra la API simulada.
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
