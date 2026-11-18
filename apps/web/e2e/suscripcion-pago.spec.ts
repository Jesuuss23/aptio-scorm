// HU-1703 · Alta de suscripción desde /precios (REQ-083, CP-143, RN-18-2). El botón de un plan con precio lleva a
// /pago?plan=…, que guía en tres pasos con el teclado: Empresa (RUC con dígito verificador, factura o boleta), Resumen
// (mensual o anual con IGV de 18 %) y Pago con la pasarela de pruebas (rechazo y aprobación), hasta la confirmación. En
// producción no hay pasarela y ofrece agendar una demo; un plan a medida no se paga en línea; sin JavaScript, agendar.
// Sin popups ni chat en /pago. axe WCAG 2.2 A/AA en cada paso a 390 y 1280 px.
// HU-1704 (RN-18-9): en dólares con la pasarela simulada y con la página alojada de Stripe (simulada), con regreso a /pago.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import { checkoutsSim } from './suscripciones-simuladas';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000020${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const bloque = (n: number, paginaId: string, tipo: string, orden = 0) => ({ id: `00000000-0000-4000-9100-00000000020${n}`, paginaId, tipo, orden, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const BLOQUES = [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[1]!.id, 'precios')];
const SITIO = { conSesion: false, versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES, planesSitio: { ejemplo: true } };

const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
/** Escribe en un campo con el teclado. */
const escribir = async (page: Page, etiqueta: string, texto: string) => {
  const c = page.getByLabel(etiqueta, { exact: true });
  await c.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(texto);
};
const pulsar = async (page: Page, nombre: string | RegExp, tecla: 'Enter' | 'Space' = 'Enter') => {
  const b = page.getByRole('button', { name: nombre });
  await expect(b).toBeEnabled();
  await b.focus();
  await page.keyboard.press(tecla);
};
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre });

for (const ancho of [1280, 390]) {
  test(`CP-143 · de /precios al pago con el teclado: empresa con RUC, anual con IGV, rechazo, aprobación y confirmación (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { ...SITIO, entornoSitio: 'pruebas' });
    checkoutsSim.length = 0;
    await page.goto('/s/precios?utm_source=google&utm_campaign=lanzamiento');
    const productora = page.locator('article.plan').filter({ has: page.getByRole('heading', { name: 'Productora', exact: true }) });
    await productora.getByRole('link', { name: 'Suscribirme' }).focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/s\/pago\?plan=productora$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Suscríbete a Aptio SCORM' })).toBeVisible();

    // Paso 1 · Empresa: sin datos, el resumen de errores y el foco en el primero.
    await expect(titulo(page, 'Datos de la empresa')).toBeVisible();
    await expect(page.getByText('Plan elegido: Productora · S/ 1,290.00 al mes + IGV')).toBeVisible();
    await expect(page.locator('.pg-pasos li[aria-current="step"]')).toHaveText('Empresa');
    await expect(page.locator('script[src*="_popups"], script[src*="_chat"]')).toHaveCount(0);
    await sinViolaciones(page);
    await pulsar(page, 'Continuar');
    await expect(page.getByRole('alert')).toContainText('Revisa estos datos:');
    await expect(page.getByLabel('Razón social o nombre', { exact: true })).toBeFocused();
    await expect(page.getByLabel('Razón social o nombre', { exact: true })).toHaveAttribute('aria-invalid', 'true');
    await sinViolaciones(page);

    await escribir(page, 'Razón social o nombre', 'Minera Andina SAC');
    await escribir(page, 'RUC (opcional)', '20131312956');
    await escribir(page, 'Nombre de quien administrará la cuenta', 'Ana Quispe');
    await escribir(page, 'Correo de quien administrará la cuenta', 'ana@minera.pe');
    await page.getByLabel(/Acepto los términos/).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('RUC (opcional)', { exact: true })).toBeFocused();
    await expect(page.getByLabel('RUC (opcional)', { exact: true })).toHaveAccessibleDescription(/Revisa el RUC: el dígito verificador no coincide/);
    await escribir(page, 'RUC (opcional)', '20131312955');
    await page.keyboard.press('Enter');

    // Paso 2 · Resumen: el foco va al título; Anual con las flechas.
    await expect(titulo(page, 'Resumen de tu suscripción')).toBeFocused();
    const resumen = page.locator('.pg dl');
    await expect(resumen).toContainText('S/ 1,290.00');
    await expect(resumen).toContainText('S/ 232.20');
    await expect(resumen).toContainText('S/ 1,522.20');
    await expect(resumen).toContainText('Factura con RUC 20131312955');
    await sinViolaciones(page);
    await page.getByRole('radio', { name: /Mensual/ }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: /Anual/ })).toBeChecked();
    await expect(page.getByRole('radio', { name: /Anual/ })).toBeFocused();
    await expect(resumen).toContainText('S/ 12,384.00');
    await expect(resumen).toContainText('S/ 2,229.12');
    await expect(resumen).toContainText('S/ 14,613.12');
    await pulsar(page, 'Continuar al pago');

    // Paso 3 · Pago con la pasarela de pruebas: la tarjeta que rechaza vuelve al resumen con el aviso.
    await expect(titulo(page, 'Pago')).toBeFocused();
    await expect(page.getByText(/Pasarela de pruebas: no se cobra nada/)).toBeVisible();
    await sinViolaciones(page);
    await escribir(page, 'Número de tarjeta', '4000 0000 0000 0002');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toContainText('El pago fue rechazado: La tarjeta de prueba fue rechazada');
    await expect(page.getByRole('alert')).toBeFocused();
    await expect(titulo(page, 'Resumen de tu suscripción')).toBeVisible();
    await pulsar(page, 'Continuar al pago');
    await expect(titulo(page, 'Pago')).toBeFocused();
    await escribir(page, 'Número de tarjeta', '4111 1111 1111 1111');
    await pulsar(page, 'Pagar S/ 14,613.12');

    // Confirmación.
    await expect(titulo(page, 'Tu suscripción está activa')).toBeFocused();
    await expect(page.getByRole('status')).toContainText('Te enviamos un correo a ana@minera.pe con el enlace para crear tu clave (vale 72 horas).');
    await expect(page.getByRole('status')).toContainText('Productora · Anual');
    await expect(page.getByRole('status')).toContainText('S/ 14,613.12');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    expect(checkoutsSim.map((c) => c.estado)).toEqual(['RECHAZADA', 'APROBADA']);
    expect(checkoutsSim[1]!.cuerpo).toMatchObject({ plan: 'productora', ciclo: 'ANUAL', ruc: '20131312955', consentimiento: true, utm_source: 'google', utm_campaign: 'lanzamiento', paginaEntrada: '/precios' });
  });
}

test('sin RUC emite boleta; un correo con cuenta vuelve al paso 1 con el aviso de iniciar sesión', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, entornoSitio: 'pruebas' });
  await page.goto('/s/pago?plan=inicial');
  await escribir(page, 'Razón social o nombre', 'Lucía Torres');
  await escribir(page, 'Nombre de quien administrará la cuenta', 'Lucía Torres');
  await escribir(page, 'Correo de quien administrará la cuenta', 'instruccional@aulaseducativas.test');
  await page.getByLabel(/Acepto los términos/).check();
  await pulsar(page, 'Continuar');
  await expect(page.locator('.pg dl')).toContainText('Boleta de venta');
  await expect(page.locator('.pg dl')).toContainText('S/ 578.20');
  await pulsar(page, 'Continuar al pago');
  await expect(page.getByLabel('Correo de quien administrará la cuenta', { exact: true })).toBeFocused();
  await expect(page.getByText('Ese correo ya tiene una cuenta: inicia sesión en la plataforma o usa otro correo.', { exact: true }).first()).toBeVisible();
  await expect(page.getByLabel('Razón social o nombre', { exact: true })).toHaveValue('Lucía Torres');
});

test('en producción no hay pago en línea: el paso 3 ofrece agendar una demo con el plan (390 px)', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simularApi(page, SITIO);
  await page.goto('/s/pago?plan=productora');
  await escribir(page, 'Razón social o nombre', 'Minera Andina SAC');
  await escribir(page, 'DNI (para la boleta)', '40506089');
  await escribir(page, 'Nombre de quien administrará la cuenta', 'Ana Quispe');
  await escribir(page, 'Correo de quien administrará la cuenta', 'ana@minera.pe');
  await page.getByLabel(/Acepto los términos/).check();
  await pulsar(page, 'Continuar');
  await pulsar(page, 'Continuar al pago');
  await expect(titulo(page, 'Pago')).toBeFocused();
  await expect(page.getByText('El pago en línea todavía no está disponible. Agenda una demo y te ayudamos a suscribirte.')).toBeVisible();
  await expect(page.locator('.pg').getByRole('link', { name: 'Agendar una demo' })).toHaveAttribute('href', '/s/agendar-demo?plan=productora');
  await sinViolaciones(page);
  await sinDesbordeHorizontal(page);
});

test('un plan a medida no se paga en línea: enlaces a los planes y a agendar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  await page.goto('/s/precios');
  await expect(page.locator('article.plan').filter({ has: page.getByRole('heading', { name: 'Empresa', exact: true }) }).getByRole('link')).toHaveAttribute('href', '/s/agendar-demo?plan=empresa');
  await page.goto('/s/pago?plan=empresa');
  await expect(page.getByText('Este plan no se puede contratar en línea. Elige otro plan o agenda una demo y te ayudamos.')).toBeVisible();
  await expect(page.locator('.pg').getByRole('link', { name: 'Ver los planes' })).toHaveAttribute('href', '/s/precios');
  await expect(page.locator('.pg').getByRole('link', { name: 'Agendar una demo' })).toHaveAttribute('href', '/s/agendar-demo?plan=empresa');
  await sinViolaciones(page);
});

test('sin JavaScript, /pago lleva a agendar una demo', async ({ browser }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await contexto.newPage();
  await simularApi(page, SITIO);
  await page.goto('/s/pago?plan=productora');
  const pg = page.locator('.pg');
  await expect(pg.locator('noscript > p').first()).toHaveText('Para pagar en línea necesitas JavaScript. Agenda una demo y te ayudamos a suscribirte.');
  await expect(pg.locator('noscript > p').first()).toBeVisible();
  await expect(pg.getByRole('link', { name: 'Agendar una demo' })).toHaveAttribute('href', '/s/agendar-demo');
  await expect(pg.getByText('Cargando el plan…')).toBeHidden();
  await contexto.close();
});

const SITIO_USD = { ...SITIO, planesSitio: { ejemplo: true, usd: { productora: 349 } } };
const empresaPorTeclado = async (page: Page) => {
  await escribir(page, 'Razón social o nombre', 'Global Learning LLC');
  // HU-1712 · Sin RUC es boleta y pasa de US$ 200: lleva el DNI.
  await escribir(page, 'DNI (para la boleta)', '40506089');
  await escribir(page, 'Nombre de quien administrará la cuenta', 'Sam Lee');
  await escribir(page, 'Correo de quien administrará la cuenta', 'sam@global.example');
  await page.getByLabel(/Acepto los términos/).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
};

for (const ancho of [1280, 390]) {
  test(`HU-1704 · en dólares con la pasarela simulada: moneda con el teclado, IGV y confirmación en US$ (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { ...SITIO_USD, entornoSitio: 'pruebas' });
    checkoutsSim.length = 0;
    await page.goto('/s/pago?plan=productora');
    await expect(titulo(page, 'Datos de la empresa')).toBeVisible();
    await empresaPorTeclado(page);

    await expect(titulo(page, 'Resumen de tu suscripción')).toBeFocused();
    await expect(page.getByRole('group', { name: 'Moneda' })).toBeVisible();
    await expect(page.getByRole('radio', { name: 'Soles (S/)' })).toBeChecked();
    await sinViolaciones(page);
    await page.getByRole('radio', { name: 'Soles (S/)' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('radio', { name: 'Dólares (US$)' })).toBeChecked();
    await expect(page.getByRole('radio', { name: 'Dólares (US$)' })).toBeFocused();
    const resumen = page.locator('.pg dl');
    await expect(resumen).toContainText('US$ 349.00');
    await expect(resumen).toContainText('US$ 62.82');
    await expect(resumen).toContainText('US$ 411.82');
    await expect(page.getByRole('radio', { name: /Anual · US\$ 3,350.00 al año/ })).toBeVisible();
    await sinViolaciones(page);
    await pulsar(page, 'Continuar al pago');

    await expect(titulo(page, 'Pago')).toBeFocused();
    await expect(page.getByText(/Pasarela de pruebas: no se cobra nada/)).toBeVisible();
    await escribir(page, 'Número de tarjeta', '4111 1111 1111 1111');
    await sinViolaciones(page);
    await pulsar(page, 'Pagar US$ 411.82');
    await expect(titulo(page, 'Tu suscripción está activa')).toBeFocused();
    await expect(page.getByRole('status')).toContainText('US$ 411.82');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
    expect(checkoutsSim.map((c) => [c.estado, c.pasarela, c.resumen.moneda])).toEqual([['APROBADA', 'pruebas', 'USD']]);
    expect(checkoutsSim[0]!.cuerpo).toMatchObject({ moneda: 'USD', ciclo: 'MENSUAL' });
  });
}

test('HU-1704 · con Stripe: «Pagar con Stripe» lleva a su página alojada y, al volver, /pago confirma la suscripción en dólares', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO_USD, entornoSitio: 'pruebas', pasarelasSitio: { stripe: true, visibles: { pruebas: false, stripe: true } } });
  checkoutsSim.length = 0;
  // Cancelar en la pasarela vuelve con el aviso.
  await page.goto('/s/pago?plan=productora&cancelado=1');
  await expect(page.getByRole('alert')).toContainText('Cancelaste el pago. Puedes intentarlo de nuevo cuando quieras.');
  await empresaPorTeclado(page);
  await page.getByRole('radio', { name: 'Dólares (US$)' }).check();
  await pulsar(page, 'Continuar al pago');

  await expect(titulo(page, 'Pago')).toBeFocused();
  await expect(page.getByText('Te llevaremos a la página segura de Stripe para pagar. Tu tarjeta no pasa por Aptio SCORM.')).toBeVisible();
  await expect(page.getByLabel('Número de tarjeta')).toHaveCount(0);
  const pagar = page.getByRole('link', { name: 'Pagar con Stripe · US$ 411.82' });
  await expect(pagar).toHaveAccessibleDescription(/página segura de Stripe/);
  await sinViolaciones(page);
  await pagar.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Stripe Checkout (simulado)' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a Aptio SCORM' }).click();

  await expect(page).toHaveURL(/\/s\/pago\?plan=productora&checkout=[0-9a-f-]{36}$/);
  await expect(titulo(page, 'Tu suscripción está activa')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('status')).toContainText('Te enviamos un correo a sam@global.example');
  await expect(page.getByRole('status')).toContainText('US$ 411.82');
  await sinViolaciones(page);
  expect(checkoutsSim.map((c) => [c.estado, c.pasarela, c.resumen.moneda])).toEqual([['APROBADA', 'stripe', 'USD']]);
});

test('HU-1704 · sin pasarela que cobre en dólares no se ofrece la moneda', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simularApi(page, { ...SITIO_USD, entornoSitio: 'pruebas', pasarelasSitio: { visibles: { pruebas: false, culqi: false, stripe: false } } });
  await page.goto('/s/pago?plan=productora');
  await empresaPorTeclado(page);
  await expect(titulo(page, 'Resumen de tu suscripción')).toBeFocused();
  await expect(page.getByRole('group', { name: 'Moneda' })).toHaveCount(0);
  await expect(page.locator('.pg dl')).toContainText('S/ 1,522.20');
});
