// HU-1606 · Consentimiento de cookies del sitio (REQ-079, RN-17-6, Ley 29733). CP-137: tras rechazar, el sitio no pide
// nada a Google ni a Meta (GA4, Tag Manager, Meta Pixel) al navegar; al aceptar, solo carga las etiquetas configuradas,
// y la CSP de la página se abre solo a sus orígenes. Aviso y diálogo solo con el teclado; axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000060${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const BLOQUES = PAGINAS.map((p, n) => ({ id: `00000000-0000-4000-9100-00000000060${n}`, paginaId: p.id, tipo: 'hero', orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F }));
const IDS = { ga4: 'G-AB12CD34EF', gtm: 'GTM-AB12CD3', metaPixel: '123456789012345' };
const SITIO = { conSesion: false, versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES, ajustesSitio: { analitica: IDS } };
const TERCEROS = /googletagmanager\.com|google-analytics\.com|analytics\.google\.com|facebook\.net|facebook\.com/;

/** Cada solicitud a Google o Meta: se responde vacía y se anota. */
async function vigilarTerceros(page: Page): Promise<string[]> {
  const pedidas: string[] = [];
  page.on('request', (r) => { if (TERCEROS.test(new URL(r.url()).hostname)) pedidas.push(r.url()); });
  await page.route(TERCEROS, (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  return pedidas;
}
const aviso = (page: Page) => page.getByRole('region', { name: 'Aviso de cookies' });
const dialogo = (page: Page) => page.getByRole('dialog', { name: 'Preferencias de cookies' });
const decision = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('aptio.cookies') ?? 'null') as Record<string, unknown> | null);
const sinViolaciones = async (page: Page, incluir: string) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include(incluir).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

test('CP-137 · tras rechazar con el teclado no se carga GA4, Tag Manager ni Meta Pixel al navegar el sitio', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  const pedidas = await vigilarTerceros(page);
  const res = await page.goto('/s/');
  // La CSP de la página solo se abre a los orígenes de las etiquetas publicadas.
  expect(res?.headers()['content-security-policy']).toContain("script-src 'self' https://www.googletagmanager.com https://connect.facebook.net;");
  await expect(aviso(page)).toContainText('Las de analítica y publicidad solo se activan si las aceptas (Ley 29733).');
  // El aviso va primero en la página: el primer Tab llega a «Rechazar».
  await page.keyboard.press('Tab');
  await expect(aviso(page).getByRole('button', { name: 'Rechazar' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(aviso(page)).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Tus preferencias de cookies quedaron guardadas.' })).toBeAttached();
  expect(await decision(page)).toMatchObject({ necesarias: true, analitica: false, publicidad: false, versionPolitica: 1, ofrecidas: ['analitica', 'publicidad'] });

  await page.goto('/s/precios');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.reload();
  await page.waitForLoadState('networkidle');
  await expect(aviso(page)).toHaveCount(0);
  expect(await page.evaluate(() => ({ dl: 'dataLayer' in window, fbq: 'fbq' in window, cookies: document.cookie }))).toEqual({ dl: false, fbq: false, cookies: '' });
  expect(pedidas).toEqual([]);
});

test('al aceptar se cargan solo las etiquetas configuradas, y en las páginas siguientes sin volver a preguntar', async ({ page }) => {
  await simularApi(page, SITIO);
  const pedidas = await vigilarTerceros(page);
  await page.goto('/s/');
  expect(pedidas).toEqual([]);
  await aviso(page).getByRole('button', { name: 'Aceptar' }).click();
  await expect(aviso(page)).toHaveCount(0);
  await expect.poll(() => pedidas.map((u) => new URL(u)).map((u) => u.hostname + u.pathname + u.search).sort()).toEqual([
    'connect.facebook.net/en_US/fbevents.js', 'www.googletagmanager.com/gtag/js?id=G-AB12CD34EF', 'www.googletagmanager.com/gtm.js?id=GTM-AB12CD3',
  ]);
  pedidas.length = 0;
  await page.goto('/s/precios');
  await expect(aviso(page)).toHaveCount(0);
  await expect.poll(() => pedidas.length).toBe(3);
});

test('«Configurar cookies» del pie abre el diálogo con el teclado: solo analítica, Escape devuelve el foco y retirar el consentimiento lo apaga', async ({ page }) => {
  await simularApi(page, SITIO);
  const pedidas = await vigilarTerceros(page);
  await page.goto('/s/');
  const enlace = page.getByRole('contentinfo').getByRole('link', { name: 'Configurar cookies' });
  await enlace.focus();
  await page.keyboard.press('Enter');
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page).getByRole('switch', { name: 'Necesarias' })).toHaveAttribute('aria-disabled', 'true');
  await expect(dialogo(page).getByRole('switch', { name: 'Analítica' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialogo(page)).toHaveCount(0);
  await expect(enlace).toBeFocused();
  expect(await decision(page)).toBeNull();

  // Desde el aviso: «Configurar», solo analítica y «Guardar preferencias».
  await aviso(page).getByRole('button', { name: 'Configurar' }).click();
  await expect(dialogo(page).getByRole('switch', { name: 'Analítica' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(dialogo(page).getByRole('switch', { name: 'Analítica' })).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Tab');
  await expect(dialogo(page).getByRole('switch', { name: 'Publicidad' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialogo(page).getByRole('button', { name: 'Guardar preferencias' })).toBeFocused();
  // El foco no sale del diálogo.
  await page.keyboard.press('Tab');
  await expect(dialogo(page).getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Enter');
  await expect(dialogo(page)).toHaveCount(0);
  await expect(aviso(page)).toHaveCount(0);
  expect(await decision(page)).toMatchObject({ analitica: true, publicidad: false });
  await expect.poll(() => pedidas.filter((u) => u.includes('googletagmanager')).length).toBe(2);
  expect(pedidas.some((u) => u.includes('facebook'))).toBe(false);

  // Retirar la analítica: la página se recarga y ya no pide nada.
  pedidas.length = 0;
  await enlace.click();
  await expect(dialogo(page).getByRole('switch', { name: 'Analítica' })).toHaveAttribute('aria-checked', 'true');
  await dialogo(page).getByRole('switch', { name: 'Analítica' }).click();
  await Promise.all([page.waitForEvent('load'), dialogo(page).getByRole('button', { name: 'Guardar preferencias' }).click()]);
  await page.waitForLoadState('networkidle');
  expect(await decision(page)).toMatchObject({ analitica: false, publicidad: false });
  expect(pedidas).toEqual([]);
});

test('vuelve a preguntar si cambió la versión de la política o venció la decisión (12 meses)', async ({ page }) => {
  await simularApi(page, { ...SITIO, ajustesSitio: { analitica: IDS, cookies: { visible: true, version: 2 } } });
  const pedidas = await vigilarTerceros(page);
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('puesto')) {
      sessionStorage.setItem('puesto', '1');
      localStorage.setItem('aptio.cookies', JSON.stringify({ necesarias: true, analitica: true, publicidad: true, fecha: new Date().toISOString(), versionPolitica: 1, ofrecidas: ['analitica', 'publicidad'] }));
    }
  });
  await page.goto('/s/');
  await expect(aviso(page)).toBeVisible();
  expect(pedidas).toEqual([]);
  await page.evaluate(() => localStorage.setItem('aptio.cookies', JSON.stringify({ necesarias: true, analitica: true, publicidad: true, fecha: '2025-01-01T00:00:00.000Z', versionPolitica: 2, ofrecidas: ['analitica', 'publicidad'] })));
  await page.reload();
  await expect(aviso(page)).toBeVisible();
  expect(pedidas).toEqual([]);
});

test('sin identificadores o con el aviso apagado no hay aviso, ni script, ni enlace, y la CSP no cambia', async ({ page }) => {
  await simularApi(page, { ...SITIO, ajustesSitio: { analitica: IDS, cookies: { visible: false, version: 1 } } });
  const pedidas = await vigilarTerceros(page);
  const res = await page.goto('/s/');
  expect(res?.headers()['content-security-policy']).toContain("script-src 'self';");
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('script[src$="_cookies.js"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Configurar cookies' })).toHaveCount(0);
  await expect(aviso(page)).toHaveCount(0);
  expect(pedidas).toEqual([]);
});

for (const ancho of [390, 1280]) {
  test(`el aviso y el diálogo pasan axe a ${ancho} px`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 844 });
    await simularApi(page, SITIO);
    await vigilarTerceros(page);
    await page.goto('/s/');
    await expect(aviso(page)).toBeVisible();
    await sinViolaciones(page, '.ck-aviso');
    await aviso(page).getByRole('button', { name: 'Configurar' }).click();
    await expect(dialogo(page)).toBeVisible();
    await sinViolaciones(page, '.ck-dlg');
    // `#cookies` en la dirección abre el diálogo al cargar.
    await page.goto('/s/precios#cookies');
    await expect(dialogo(page)).toBeVisible();
  });
}
