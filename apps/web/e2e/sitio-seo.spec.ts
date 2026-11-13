// HU-1512 · SEO técnico (REQ-071). PNT-26: la pestaña «SEO» del Editor de página con sus contadores 0/60 y 0/160, la
// vista previa en Google en vivo, «Indexar en buscadores» y los datos estructurados; CP-125: al publicar, la página sin
// indexar lleva noindex, sale del sitemap y pierde sus hreflang. PNT-29: Sitio web › SEO con la revisión de problemas y
// su «Corregir», las redirecciones 301 (agregar, rechazar, activar, borrar con confirmación) y robots.txt; CP-124: al
// publicar, la ruta vieja responde 301 a la nueva. axe WCAG 2.2 A/AA en 0 violaciones a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string, extra: object = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, ruta, idioma: 'es' as 'es' | 'en', titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F, ...extra,
});
const INICIO = pagina(1, '/', 'Inicio', { metaDescripcion: 'Cápsulas SCORM de 3 a 10 minutos con IA.' });
const PRECIOS = pagina(2, '/precios', 'Precios');
const PRICING = pagina(3, '/precios', 'Pricing', { idioma: 'en', metaDescripcion: 'Plans and pricing.' });
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-0000000000${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const SITIO = {
  conSesion: true, rol: 'SUPERADMIN', versionSitio: true,
  paginasSitio: [INICIO, PRECIOS, PRICING],
  bloquesSitio: [bloque(10, INICIO.id, 'hero'), bloque(20, PRECIOS.id, 'cta'), bloque(30, PRICING.id, 'cta')],
};

const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const publicar = async (page: Page) => {
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Se publicó la versión \d+/ })).toBeVisible();
};

for (const ancho of [390, 1280]) {
  test(`PNT-26 y CP-125 a ${ancho} px: la pestaña SEO valida 60/160, la vista previa de Google cambia en vivo y «Indexar» apagado saca la página del sitemap y de hreflang`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    // Antes: la página en español tiene su alterna en inglés.
    await page.goto('/s/precios');
    await expect(page.locator('link[rel="alternate"][hreflang="en"]')).toHaveAttribute('href', 'https://aptioscorm.com/en/precios');

    await page.goto(`/sitio/paginas/${PRECIOS.id}`);
    const pestanas = page.getByRole('tablist', { name: 'Datos de la página' });
    await expect(pestanas.getByRole('tab', { name: 'Página' })).toHaveAttribute('aria-selected', 'true');
    await pestanas.getByRole('tab', { name: 'Página' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(pestanas.getByRole('tab', { name: 'SEO' })).toHaveAttribute('aria-selected', 'true');
    const panel = page.getByRole('tabpanel', { name: 'SEO' });
    const serp = panel.getByRole('group', { name: 'Vista previa en Google' });
    await expect(panel.locator('#seo-titulo-cuenta')).toHaveText('0 / 60');
    await expect(panel.locator('#seo-descripcion-cuenta')).toHaveText('0 / 160');
    await expect(serp).toContainText('aptioscorm.com/precios');
    await expect(serp).toContainText('Precios · Aptio SCORM');

    await panel.getByLabel('Meta título').fill('Planes y precios en soles');
    await expect(panel.locator('#seo-titulo-cuenta')).toHaveText('25 / 60');
    await expect(serp).toContainText('Planes y precios en soles');
    await panel.getByLabel('Meta descripción').fill('d'.repeat(170));
    await expect(panel.locator('#seo-descripcion-cuenta')).toHaveText('170 / 160 · 10 de más');
    await panel.getByRole('button', { name: 'Guardar SEO' }).click();
    await expect(page.getByRole('alert')).toContainText('La meta descripción admite hasta 160 caracteres (tiene 170)');

    await panel.getByLabel('Meta descripción').fill('Planes mensuales y anuales en soles, con factura electrónica.');
    await expect(serp).toContainText('Planes mensuales y anuales en soles, con factura electrónica.');
    const indexar = panel.getByRole('switch', { name: 'Indexar en buscadores' });
    await expect(indexar).toHaveAttribute('aria-checked', 'true');
    await indexar.click();
    await expect(indexar).toHaveAttribute('aria-checked', 'false');
    await expect(serp).toContainText('No se indexa');
    await panel.getByLabel('Datos estructurados').selectOption('Product');
    await panel.getByRole('button', { name: 'Guardar SEO' }).click();
    await expect(panel.getByRole('status').filter({ hasText: 'Se guardó el SEO de la página. Llega al sitio con «Publicar cambios».' })).toBeVisible();
    await expect(page.getByText('Cambios sin publicar')).toBeVisible();
    await sinViolaciones(page);

    await publicar(page);
    // CP-125 · noindex, sin hreflang en ninguno de los dos idiomas y fuera del sitemap.
    await page.goto('/s/precios');
    await expect(page).toHaveTitle('Planes y precios en soles');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Planes mensuales y anuales en soles, con factura electrónica.');
    await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', 'Planes y precios en soles');
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
    expect(JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!)).toMatchObject({ '@type': 'Product', name: 'Planes y precios en soles' });
    await page.goto('/s/en/precios');
    await expect(page.locator('link[rel="alternate"]')).toHaveCount(0);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index, follow');
    const mapa = await page.evaluate(() => fetch('/s/sitemap.xml').then((r) => r.text()));
    expect(mapa).toContain('<loc>https://aptioscorm.com/en/precios</loc>');
    expect(mapa).not.toContain('<loc>https://aptioscorm.com/precios</loc>');
  });

  test(`PNT-29 y CP-124 a ${ancho} px: Sitio web › SEO lista los problemas con «Corregir», maneja las redirecciones 301 y robots.txt, y al publicar la ruta vieja responde 301`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { ...SITIO, redireccionesSitio: [{ id: '00000000-0000-4000-a000-000000000901', desde: '/promo', hacia: '/no-existe', activa: true }] });
    if (ancho < 900) await page.goto('/sitio/seo');
    else {
      await page.goto('/sitio');
      await page.getByRole('link', { name: 'SEO', exact: true }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'SEO' })).toBeVisible();

    const problemas = page.getByRole('list', { name: 'Problemas de SEO' });
    await expect(problemas.getByRole('listitem')).toHaveCount(2);
    await expect(problemas.getByRole('listitem').nth(0)).toContainText('Falta la meta descripción');
    await expect(problemas.getByRole('listitem').nth(0)).toContainText('Precios (/precios)');
    await expect(problemas.getByRole('listitem').nth(1)).toContainText('Redirección a una página que no existe');
    // «Corregir» de una redirección lleva a su fila; el de una página abre su pestaña SEO.
    await problemas.getByRole('listitem').nth(1).getByRole('button', { name: /^Corregir/ }).click();
    await expect(page.getByRole('switch', { name: 'Activar redirección /promo a /no-existe' })).toBeFocused();
    await sinViolaciones(page);

    // Agregar: el panel rechaza lo que la API rechaza y la API, lo que pisa una página publicada.
    const form = page.getByRole('form', { name: 'Agregar redirección' });
    await form.getByLabel('Desde').fill('/precios-2025');
    await form.getByLabel('Hacia').fill('/precios-2025');
    await form.getByRole('button', { name: 'Agregar redirección' }).click();
    await expect(form.getByRole('alert')).toHaveText('El destino es igual al origen');
    await form.getByLabel('Desde').fill('/precios');
    await form.getByLabel('Hacia').fill('/planes');
    await form.getByRole('button', { name: 'Agregar redirección' }).click();
    await expect(page.getByRole('alert')).toContainText('/precios es una página publicada');
    await form.getByLabel('Desde').fill('/precios-2025/');
    await form.getByLabel('Hacia').fill('/precios');
    await form.getByRole('button', { name: 'Agregar redirección' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se agregó la redirección /precios-2025 → /precios.' })).toBeVisible();
    const interruptor = page.getByRole('switch', { name: 'Activar redirección /precios-2025 a /precios' });
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');
    await interruptor.click();
    await expect(interruptor).toHaveAttribute('aria-checked', 'false');
    await interruptor.click();
    await expect(interruptor).toHaveAttribute('aria-checked', 'true');

    // Borrar con confirmación: la redirección rota desaparece y con ella su problema.
    await page.getByRole('button', { name: 'Borrar redirección /promo' }).click();
    await page.getByRole('group', { name: 'Confirmar el borrado de /promo' }).getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByRole('switch', { name: /\/promo a/ })).toHaveCount(0);
    await expect(problemas.getByRole('listitem')).toHaveCount(1);

    // robots.txt: las reglas extra se validan línea por línea.
    const reglas = page.getByRole('textbox', { name: 'Reglas extra' });
    await reglas.fill('Disallow: /');
    await page.getByRole('button', { name: 'Guardar reglas' }).click();
    await expect(page.getByRole('alert')).toHaveText('Línea 1: no se bloquea el sitio entero desde aquí');
    await reglas.fill('# Panel interno\ndisallow: /panel');
    await page.getByRole('button', { name: 'Guardar reglas' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se guardaron las reglas de robots.txt.' })).toBeVisible();
    await expect(page.getByLabel('Vista previa (con las reglas guardadas)')).toContainText('Allow: /\n# Panel interno\nDisallow: /panel');
    await sinViolaciones(page);

    await problemas.getByRole('listitem').nth(0).getByRole('button', { name: /^Corregir/ }).click();
    await expect(page).toHaveURL(new RegExp(`/sitio/paginas/${PRECIOS.id}\\?seo$`));
    await expect(page.getByRole('tab', { name: 'SEO' })).toHaveAttribute('aria-selected', 'true');
    await publicar(page);

    // CP-124 · La ruta vieja responde 301 con la nueva en Location. Playwright no intercepta el pedido que sigue a la
    // redirección (va al servidor de desarrollo), así que se mira la respuesta 301 y después se abre la nueva.
    const [r301] = await Promise.all([page.waitForResponse((r) => new URL(r.url()).pathname === '/s/precios-2025'), page.goto('/s/precios-2025').catch(() => null)]);
    expect([r301.status(), r301.headers().location]).toEqual([301, '/s/precios']);
    await page.goto('/s/precios');
    await expect(page).toHaveTitle('Precios · Aptio SCORM');
    const robots = await page.evaluate(() => fetch('/s/robots.txt').then((r) => r.text()));
    expect(robots).toContain('Allow: /\n# Panel interno\nDisallow: /panel\n');
  });
}
