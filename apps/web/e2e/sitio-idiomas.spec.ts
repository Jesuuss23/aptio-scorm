// HU-1510 · Sitio en español e inglés (REQ-069, CP-122). /precios está publicada en español y en borrador en inglés: el
// selector ES · EN de la cabecera y del menú de celular lleva a /en y la página no emite hreflang="en"; al publicar
// /en/precios, lleva a /en/precios y emite hreflang es, en y x-default. En la consola, Contenido, Menú principal y Pie de
// página tienen el selector «Español / Inglés», y Ajustes del sitio la tarjeta «Idiomas» con «Mostrar selector ES/EN».
// axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, idioma: 'es' | 'en', titulo: string, estado: 'PUBLICADA' | 'BORRADOR') => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, ruta, idioma, titulo, estado, publicarEn: null, publicadaEn: estado === 'PUBLICADA' ? F : null, creadoEn: F, actualizadoEn: F,
});
const PAGINAS = [pagina(1, '/', 'es', 'Inicio', 'PUBLICADA'), pagina(2, '/', 'en', 'Home', 'PUBLICADA'), pagina(3, '/precios', 'es', 'Precios', 'PUBLICADA'), pagina(4, '/precios', 'en', 'Pricing', 'BORRADOR')];
const hero = (n: number) => ({ id: `00000000-0000-4000-9100-00000000000${n}`, paginaId: PAGINAS[n - 1]!.id, tipo: 'hero', orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const enlace = (n: number, idioma: 'es' | 'en', texto: string, ruta: string) => ({ id: `00000000-0000-4000-9400-10000000000${n}`, zona: 'menu' as const, padreId: null, idioma, texto, ruta, orden: 0, visible: true });
const SITIO = {
  conSesion: true, rol: 'SUPERADMIN', versionSitio: true, entornoSitio: 'pruebas' as const,
  paginasSitio: PAGINAS, bloquesSitio: [1, 2, 3, 4].map(hero),
  enlacesSitio: [enlace(1, 'es', 'Precios', '/precios'), enlace(2, 'en', 'Pricing', '/en/precios')],
};
const sinViolaciones = async (page: Page, soloMain = true) => {
  const b = new AxeBuilder({ page }).withTags(REGLAS);
  const axe = await (soloMain ? b.include('main') : b).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const fila = (page: Page, titulo: string) => page.getByRole('table', { name: 'Páginas del sitio' }).getByRole('row')
  .filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${titulo}`) }) });

/** El selector visible a ese ancho: en la cabecera (escritorio) o dentro del menú de celular, que se abre con el teclado. */
async function selector(page: Page, ancho: number, nombre = 'Idioma') {
  if (ancho < 980) {
    await expect(page.locator('nav.idiomas-escritorio')).toBeHidden();
    await page.locator('details.menu-celular > summary').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.menu-celular')).toHaveAttribute('open', '');
  }
  return page.getByRole('navigation', { name: nombre, exact: true });
}

for (const ancho of [390, 1280]) {
  test(`CP-122 a ${ancho} px: el selector lleva a /en mientras /en/precios es borrador y a /en/precios al publicarla, con hreflang, sin violaciones de axe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);

    // /en/precios en borrador: el selector cae al inicio en inglés y no hay hreflang.
    await page.goto('/s/precios');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(0);
    let idiomas = await selector(page, ancho);
    await expect(idiomas.locator('[aria-current="true"]')).toHaveText('ES (Español)');
    await expect(idiomas.getByRole('link', { name: 'EN (English)' })).toHaveAttribute('href', '/s/en');
    await expect(idiomas.getByRole('link', { name: 'EN (English)' })).toHaveAttribute('hreflang', 'en');
    await sinViolaciones(page, false);
    await idiomas.getByRole('link', { name: 'EN (English)' }).click();
    await expect(page).toHaveURL('/s/en');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    // Se publica /en/precios.
    await page.goto('/sitio/paginas');
    await fila(page, 'Pricing').getByRole('button', { name: 'Publicar Pricing' }).click();
    await expect(fila(page, 'Pricing')).toContainText('Publicada');

    await page.goto('/s/precios');
    const alternas = page.locator('link[rel="alternate"][hreflang]');
    await expect(alternas).toHaveCount(3);
    await expect(page.locator('link[hreflang="es"]')).toHaveAttribute('href', 'https://aptioscorm.com/precios');
    await expect(page.locator('link[hreflang="en"]')).toHaveAttribute('href', 'https://aptioscorm.com/en/precios');
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute('href', 'https://aptioscorm.com/precios');
    idiomas = await selector(page, ancho);
    await expect(idiomas.getByRole('link', { name: 'EN (English)' })).toHaveAttribute('href', '/s/en/precios');
    await idiomas.getByRole('link', { name: 'EN (English)' }).click();

    // La página en inglés: su menú, el pie y el selector de vuelta al español, también sin violaciones.
    await expect(page).toHaveURL('/s/en/precios');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(3);
    const vuelta = await selector(page, ancho, 'Language');
    await expect(vuelta.locator('[aria-current="true"]')).toHaveText('EN (English)');
    await expect(vuelta.getByRole('link', { name: 'ES (Español)' })).toHaveAttribute('href', '/s/precios');
    await expect(page.locator('header').getByRole('link', { name: 'Pricing' }).first()).toHaveAttribute('href', '/s/en/precios');
    await expect(page.locator('header').getByRole('link', { name: 'Precios', exact: true })).toHaveCount(0);
    await sinViolaciones(page, false);

    // El sitemap enlaza las dos versiones.
    const sitemap = await page.evaluate(() => fetch('/s/sitemap.xml').then((r) => r.text()));
    expect(sitemap).toContain('<xhtml:link rel="alternate" hreflang="en" href="https://aptioscorm.com/en/precios"/>');
  });

  test(`a ${ancho} px Contenido, Menú principal y Pie de página administran cada idioma por su cuenta, sin violaciones de axe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);

    await page.goto('/sitio/contenido');
    const idioma = page.getByRole('group', { name: 'Idioma del contenido' });
    await expect(idioma.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');
    await idioma.getByRole('button', { name: 'Inglés' }).click();
    await expect(idioma.getByRole('button', { name: 'Inglés' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByRole('heading', { level: 2, name: 'Cifras · Inglés' })).toBeVisible();
    await page.getByRole('button', { name: 'Agregar', exact: true }).click();
    const nueva = page.getByRole('form', { name: 'Nuevo elemento de Cifras' });
    await nueva.getByLabel('Valor').fill('4 days');
    await nueva.getByLabel('Etiqueta').fill('from document to package');
    await nueva.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('form', { name: 'Editar 4 days' })).toBeVisible();
    await sinViolaciones(page);
    await idioma.getByRole('button', { name: 'Español' }).click();
    await expect(page.getByRole('heading', { level: 2, name: 'Cifras', exact: true })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Editar 4 days' })).toHaveCount(0);

    await page.goto('/sitio/paginas');
    const nav = page.getByRole('group', { name: 'Idioma del menú y el pie' });
    await expect(page.getByRole('region', { name: 'Menú principal', exact: true }).getByRole('switch', { name: 'Mostrar Precios' })).toBeVisible();
    await nav.getByRole('button', { name: 'Inglés' }).click();
    const menuEn = page.getByRole('region', { name: 'Menú principal · Inglés' });
    await expect(menuEn.getByRole('switch', { name: 'Mostrar Pricing' })).toHaveAttribute('aria-checked', 'true');
    await expect(menuEn.getByRole('switch', { name: 'Mostrar Precios' })).toHaveCount(0);
    const pieEn = page.getByRole('region', { name: 'Pie de página · Inglés' });
    await pieEn.getByRole('button', { name: 'Agregar columna al pie' }).click();
    const columna = page.getByRole('form', { name: 'Nueva columna del pie' });
    await columna.getByLabel('Título').fill('Company');
    await columna.getByRole('button', { name: 'Agregar' }).click();
    await expect(page.getByRole('status').filter({ hasText: '«Company» se agregó al final, oculto.' })).toBeVisible();
    await expect(pieEn.getByRole('switch', { name: 'Mostrar columna Company' })).toHaveAttribute('aria-checked', 'false');
    await sinViolaciones(page);
    await nav.getByRole('button', { name: 'Español' }).click();
    await expect(page.getByRole('region', { name: 'Pie de página', exact: true }).getByRole('switch', { name: 'Mostrar columna Company' })).toHaveCount(0);
  });
}

test('«Idiomas» en Ajustes: «Mostrar selector ES/EN» viene activo y, al apagarlo y publicar, el sitio deja de mostrar el selector', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/s/');
  await expect(page.getByRole('navigation', { name: 'Idioma', exact: true })).toBeVisible();

  await page.goto('/sitio/ajustes');
  const tarjeta = page.getByRole('region', { name: 'Idiomas' });
  const interruptor = tarjeta.getByRole('switch', { name: 'Mostrar selector ES/EN' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await expect(tarjeta.getByRole('status')).toHaveText('El selector ES · EN quedará oculto. Llega al sitio con «Publicar cambios» (Sitio web › Páginas).');
  await sinViolaciones(page);

  // Hasta publicar, el sitio sigue con el selector.
  await page.goto('/s/');
  await expect(page.getByRole('navigation', { name: 'Idioma', exact: true })).toBeVisible();
  await page.goto('/sitio/paginas');
  await expect(page.getByText('Cambios sin publicar')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó la versión 2' })).toBeVisible();
  await page.goto('/s/');
  await expect(page.getByRole('navigation', { name: 'Idioma', exact: true })).toHaveCount(0);
  await page.goto('/s/en');
  await expect(page.getByRole('navigation', { name: 'Language', exact: true })).toHaveCount(0);
});
