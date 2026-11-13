// HU-1514 · Landings por sector (REQ-092, PNT-25, RN-16-9). «Nueva landing de sector» la crea en borrador en
// /sectores/{sector} con la plantilla oculta; sin portada ni meta título no se publica. CP-157: muestra los testimonios
// de su sector. CP-158: una landing en borrador no sale en el bloque «Sectores» ni en el pie y su ruta da 404.
// axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const INICIO_ID = '00000000-0000-4000-8000-000000000001';
const INICIO = { id: INICIO_ID, ruta: '/', idioma: 'es' as const, titulo: 'Inicio', estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F };
const bloque = (n: number, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000000${n}`, paginaId: INICIO_ID, tipo, orden: n, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const testimonio = (n: number, nombre: string, sector: string) => ({
  id: `00000000-0000-4000-9300-00000000000${n}`, coleccion: 'testimonios', orden: n, visible: true,
  datos: { nombre, cargo: 'Jefatura', empresa: 'Empresa', sector, texto: 'Muy útil.', estrellas: 5 }, creadoEn: F, actualizadoEn: F,
});
const SITIO = {
  conSesion: true, rol: 'SUPERADMIN', versionSitio: true,
  paginasSitio: [INICIO], bloquesSitio: [bloque(0, 'hero'), bloque(1, 'sectores'), bloque(2, 'cta')],
  elementosSitio: [testimonio(0, 'Mariana Paredes', 'Minería y energía'), testimonio(1, 'Carlos Alarcón', 'Banca y seguros')],
};
const sinViolaciones = async (page: Page, soloMain = true) => {
  const b = new AxeBuilder({ page }).withTags(REGLAS);
  const axe = await (soloMain ? b.include('main') : b).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const tabla = (page: Page) => page.getByRole('table', { name: 'Páginas del sitio' });
const fila = (page: Page, titulo: string) => tabla(page).getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${titulo}`) }) });

async function crearLanding(page: Page, sector: string) {
  await page.goto('/sitio/paginas');
  await page.getByRole('button', { name: 'Nueva landing de sector' }).click();
  const form = page.getByRole('form', { name: 'Nueva landing de sector' });
  await form.getByLabel('Sector').fill(sector);
  await form.getByRole('button', { name: 'Crear landing' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Editor de página' })).toBeVisible();
}

for (const ancho of [390, 1280]) {
  test(`a ${ancho} px «Nueva landing de sector» la crea en borrador con la plantilla oculta, sin violaciones de axe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    await page.goto('/sitio/paginas');
    await expect(fila(page, 'Inicio')).toContainText('General');

    await page.getByRole('button', { name: 'Nueva landing de sector' }).click();
    const form = page.getByRole('form', { name: 'Nueva landing de sector' });
    await expect(form.getByLabel('Sector')).toBeFocused();
    await form.getByRole('button', { name: 'Crear landing' }).click();
    await expect(page.getByRole('alert')).toHaveText('Escribe el nombre del sector.');
    await form.getByLabel('Sector').fill('Minería y energía');
    await expect(page.getByText('Ruta: /sectores/mineria-y-energia')).toBeVisible();
    await sinViolaciones(page);
    await form.getByRole('button', { name: 'Crear landing' }).click();

    await expect(page).toHaveURL(/\/sitio\/paginas\/[0-9a-f-]+\?nueva=1$/);
    await expect(page.getByRole('status').filter({ hasText: 'La landing se creó como borrador con los bloques de la plantilla, ocultos.' })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Bloques de la página' }).getByRole('listitem')).toHaveCount(7);
    await expect(page.getByText('0 visibles')).toBeVisible();
    for (const nombre of ['Portada', 'Testimonios', 'Preguntas frecuentes']) {
      await expect(page.getByRole('switch', { name: `Mostrar bloque ${nombre}` })).toHaveAttribute('aria-checked', 'false');
    }
    const ficha = page.getByRole('region', { name: 'Landing de sector' });
    await expect(ficha).toContainText('Para publicarla falta: el título de la portada, el texto de la portada, el meta título.');
    await expect(ficha.getByLabel('Sector', { exact: true })).toHaveValue('Minería y energía');
    await expect(ficha).toContainText('1 testimonio de este sector en Contenido › Testimonios.');
    await sinViolaciones(page);

    await page.goto('/sitio/paginas');
    await expect(fila(page, 'Minería y energía')).toContainText('Sector');
    await expect(fila(page, 'Minería y energía')).toContainText('/sectores/mineria-y-energia');
    await expect(fila(page, 'Minería y energía')).toContainText('Borrador');
  });
}

test('RN-16-9 · CP-157 · CP-158: la landing se publica con portada y meta título y sale en «Sectores» y el pie; el borrador no', async ({ page }) => {
  await simularApi(page, SITIO);
  await crearLanding(page, 'Sector público');
  await crearLanding(page, 'Minería y energía');

  // Sin portada ni meta título, «Publicar» se rechaza con lo que falta.
  await page.goto('/sitio/paginas');
  await fila(page, 'Minería y energía').getByRole('button', { name: 'Publicar Minería y energía' }).click();
  await expect(page.getByRole('alert')).toContainText('La landing no se puede publicar ni programar todavía: falta el título de la portada');
  await expect(fila(page, 'Minería y energía')).toContainText('Borrador');

  // La ficha valida, guarda y avisa de los testimonios al cambiar el sector.
  await page.getByRole('button', { name: 'Editar Minería y energía' }).click();
  const ficha = page.getByRole('region', { name: 'Landing de sector' });
  await ficha.getByLabel('Título de la portada').fill('Cápsulas de <b>seguridad</b>');
  await ficha.getByRole('button', { name: 'Guardar landing' }).click();
  await expect(ficha.getByRole('alert')).toHaveText('El título de la portada solo admite texto, sin etiquetas HTML');
  await ficha.getByLabel('Sector', { exact: true }).fill('Banca');
  await expect(ficha).toContainText('Al cambiar el sector, 1 testimonio de «Minería y energía» deja de coincidir.');
  await ficha.getByLabel('Sector', { exact: true }).fill('Minería y energía');
  await ficha.getByLabel('Título de la portada').fill('Cápsulas de seguridad para operaciones mineras');
  await ficha.getByLabel('Texto de la portada').fill('Bloqueo y etiquetado en cápsulas de 5 minutos para el celular.');
  await ficha.getByLabel('Meta título').fill('Capacitación minera con cápsulas SCORM');
  await ficha.getByLabel('Categoría inicial del blog (opcional)').fill('Casos');
  await ficha.getByRole('button', { name: 'Guardar landing' }).click();
  await expect(ficha.getByRole('status')).toHaveText('Se guardó la landing.');
  await expect(ficha).toContainText('Tiene portada y meta título: se puede publicar.');
  for (const nombre of ['Portada', 'Testimonios']) await page.getByRole('switch', { name: `Mostrar bloque ${nombre}` }).click();
  await expect(page.getByText('2 visibles')).toBeVisible();

  await page.getByRole('button', { name: 'Volver a Páginas' }).click();
  await fila(page, 'Minería y energía').getByRole('button', { name: 'Publicar Minería y energía' }).click();
  await expect(fila(page, 'Minería y energía')).toContainText('Publicada');
  await expect(fila(page, 'Sector público')).toContainText('Borrador');

  // El inicio: el bloque «Sectores» y la columna del pie llevan solo a la landing publicada.
  await page.goto('/s/');
  const sectores = page.getByRole('region', { name: 'Pensado para cómo capacita tu sector' });
  await expect(sectores.getByRole('link')).toHaveCount(1);
  await expect(sectores.getByRole('link', { name: /Minería y energía/ })).toHaveAttribute('href', '/s/sectores/mineria-y-energia');
  await expect(sectores).toContainText('Cápsulas de seguridad para operaciones mineras');
  const pie = page.getByRole('contentinfo');
  await expect(pie.getByRole('heading', { name: 'Sectores' })).toBeVisible();
  await expect(pie.getByRole('link', { name: 'Minería y energía' })).toBeVisible();
  await expect(page.getByText('Sector público')).toHaveCount(0);
  await sinViolaciones(page, false);

  // La landing: su meta título, su portada y solo los testimonios de su sector (CP-157).
  await sectores.getByRole('link', { name: /Minería y energía/ }).click();
  await expect(page).toHaveURL('/s/sectores/mineria-y-energia');
  await expect(page).toHaveTitle('Capacitación minera con cápsulas SCORM');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Cápsulas de seguridad para operaciones mineras');
  await expect(page.getByText('Mariana Paredes')).toBeVisible();
  await expect(page.getByText('Carlos Alarcón')).toHaveCount(0);
  await sinViolaciones(page, false);

  // CP-158 · La landing en borrador no existe en el sitio.
  const res = await page.goto('/s/sectores/sector-publico');
  expect(res?.status()).toBe(404);
});

test('CP-157: el sector del testimonio se elige entre «General» y los sectores de las landings', async ({ page }) => {
  await simularApi(page, SITIO);
  await crearLanding(page, 'Minería y energía');
  await page.goto('/sitio/contenido');
  await page.getByRole('tablist', { name: 'Colecciones de contenido' }).getByRole('tab', { name: 'Testimonios' }).click();
  const carlos = page.getByRole('form', { name: 'Editar Carlos Alarcón' });
  const sector = carlos.getByLabel('Sector');
  await expect(sector.getByRole('option')).toHaveText(['General', 'Minería y energía', 'Banca y seguros']);
  await expect(sector).toHaveValue('Banca y seguros');
  await sector.selectOption({ label: 'Minería y energía' });
  await carlos.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se guardó' })).toBeVisible();
  await sinViolaciones(page);
});
