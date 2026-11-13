// HU-1509 · Configuración › Ajustes del sitio (PNT-38, REQ-073): dominio con «Comprobar», nombre, logo, WhatsApp,
// correo de leads, analítica y modo mantenimiento. CP-121: con el mantenimiento activo el visitante recibe la página
// «Volvemos pronto» con 503 y el superadmin sigue viendo el sitio. axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { AVISO_MANTENIMIENTO, simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const INICIO_ID = '00000000-0000-4000-8000-000000000001';
const SITIO = {
  conSesion: true, rol: 'SUPERADMIN', versionSitio: true,
  paginasSitio: [{ id: INICIO_ID, ruta: '/', idioma: 'es' as const, titulo: 'Inicio', estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F }],
  bloquesSitio: [{ id: '00000000-0000-4000-9100-000000000000', paginaId: INICIO_ID, tipo: 'hero', orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F }],
};
const LOGO = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#1F7A4D"/></svg>');
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });
const tarjeta = (page: Page, nombre: string) => page.getByRole('region', { name: nombre });
const sinViolaciones = async (page: Page, soloMain = true) => {
  const b = new AxeBuilder({ page }).withTags(REGLAS);
  const axe = await (soloMain ? b.include('main') : b).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

for (const ancho of [390, 1280]) {
  test(`la vista Ajustes del sitio a ${ancho} px muestra sus cuatro tarjetas sin violaciones de axe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    await page.goto('/sitio/ajustes');
    await expect(page.getByRole('heading', { level: 1, name: 'Ajustes del sitio' })).toBeVisible();
    for (const t of ['Dominio e identidad', 'Contacto', 'Analítica', 'Mantenimiento']) await expect(tarjeta(page, t)).toBeVisible();
    await expect(tarjeta(page, 'Mantenimiento').getByText('Sitio en línea')).toBeVisible();
    await expect(tarjeta(page, 'Dominio e identidad').getByLabel('Nombre del sitio')).toHaveValue('Aptio SCORM');
    await expect(tarjeta(page, 'Analítica')).toContainText('se activarán en el sitio con el banner de cookies');
    await sinViolaciones(page);
  });
}

test('el grupo «Configuración» del menú lleva a Ajustes del sitio y es solo del superadmin', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio');
  await expect(menu(page).getByText('Configuración')).toBeVisible();
  await menu(page).getByRole('link', { name: 'Ajustes del sitio' }).click();
  await expect(page).toHaveURL('/sitio/ajustes');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes del sitio' })).toBeVisible();
});

test('un administrador de organización no ve «Configuración» ni puede abrir los ajustes', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
  await page.goto('/');
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Ajustes del sitio' })).toHaveCount(0);
  await page.goto('/sitio/ajustes');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

test('dominio, nombre y logo se validan, se comprueban y llegan al sitio al publicar', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio/ajustes');
  const identidad = tarjeta(page, 'Dominio e identidad');
  await expect(identidad.getByRole('button', { name: 'Comprobar el dominio' })).toBeDisabled();

  // Un dominio con https:// se rechaza antes de enviarlo.
  await identidad.getByLabel('Dominio', { exact: true }).fill('https://aptioscorm.com/inicio');
  await identidad.getByRole('button', { name: 'Guardar' }).click();
  await expect(identidad.getByRole('alert')).toContainText('Escribe solo el dominio, sin https:// ni rutas');

  await identidad.getByLabel('Dominio', { exact: true }).fill('AptioScorm.com');
  await identidad.getByLabel('Nombre del sitio').fill('Aulas Demo');
  await identidad.getByRole('button', { name: 'Guardar' }).click();
  await expect(identidad.getByRole('status')).toContainText('Se guardó. Llega al sitio con «Publicar cambios»');
  await expect(identidad.getByLabel('Dominio', { exact: true })).toHaveValue('AptioScorm.com');

  await identidad.getByRole('button', { name: 'Comprobar el dominio' }).click();
  await expect(identidad.getByText(/^SSL activo · vence /)).toBeVisible();
  await expect(identidad.getByRole('status')).toContainText("aptioscorm.com responde por HTTPS con un certificado válido de Let's Encrypt");

  await identidad.getByLabel('Archivo del logo').setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: LOGO });
  await expect(identidad.getByRole('img', { name: 'Logo actual' })).toHaveAttribute('src', /^\/s\/_marca\/logo-[0-9a-f]{8}\.svg$/);
  await expect(identidad.getByRole('button', { name: 'Quitar logo' })).toBeVisible();
  await sinViolaciones(page);

  // El sitio sigue con la versión 1 hasta publicar; después muestra el nombre y el logo nuevos.
  await page.goto('/s/');
  await expect(page).toHaveTitle('Aptio SCORM · Inicio');
  await page.goto('/sitio/paginas');
  await expect(page.getByText('Cambios sin publicar')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó la versión 2' })).toBeVisible();
  await page.goto('/s/');
  await expect(page).toHaveTitle('Aulas Demo · Inicio');
  await expect(page.locator('img.logo-img')).toHaveAttribute('src', /^\/s\/_marca\/logo-[0-9a-f]{8}\.svg$/);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://aptioscorm.com/');
});

test('WhatsApp exige el número para mostrarse y el correo de leads recibe una prueba', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio/ajustes');
  const contacto = tarjeta(page, 'Contacto');
  await expect(contacto.getByRole('button', { name: 'Enviar correo de prueba' })).toBeDisabled();
  await contacto.getByRole('switch', { name: 'Botón de WhatsApp' }).click();
  await expect(contacto.getByRole('switch', { name: 'Botón de WhatsApp' })).toHaveAttribute('aria-checked', 'true');
  await contacto.getByRole('button', { name: 'Guardar' }).click();
  await expect(contacto.getByRole('alert')).toContainText('Para mostrar el botón de WhatsApp, escribe el número');

  await contacto.getByLabel('Número de WhatsApp').fill('+51 987 654 321');
  await contacto.getByLabel('Mensaje inicial (opcional)').fill('Hola, quiero agendar una demo');
  await contacto.getByLabel('Correo que recibe los leads').fill('Ventas@AulasEducativas.com');
  await contacto.getByRole('button', { name: 'Guardar' }).click();
  await expect(contacto.getByRole('status')).toContainText('El correo de leads vale desde ahora');
  await contacto.getByRole('button', { name: 'Enviar correo de prueba' }).click();
  await expect(contacto.getByRole('status')).toContainText('Se envió un correo de prueba a ventas@aulaseducativas.com.');

  // Al publicar, el sitio muestra el botón flotante, que abre WhatsApp en otra pestaña.
  await page.goto('/sitio/paginas');
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó la versión 2' })).toBeVisible();
  await page.goto('/s/');
  const boton = page.getByRole('link', { name: 'Escríbenos por WhatsApp (se abre en una pestaña nueva)' });
  await expect(boton).toHaveAttribute('href', 'https://wa.me/51987654321?text=Hola%2C%20quiero%20agendar%20una%20demo');
  await expect(boton).toHaveAttribute('target', '_blank');
  await expect(boton).toHaveAttribute('rel', 'noopener');
  await sinViolaciones(page, false);
});

test('los identificadores de analítica se validan y se guardan en mayúsculas', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio/ajustes');
  const analitica = tarjeta(page, 'Analítica');
  await analitica.getByLabel('Google Analytics 4').fill('UA-1234');
  await analitica.getByRole('button', { name: 'Guardar' }).click();
  await expect(analitica.getByRole('alert')).toContainText('Google Analytics 4 empieza con G-');
  await analitica.getByLabel('Google Analytics 4').fill('g-ab12cd34ef');
  await analitica.getByLabel('Meta Pixel').fill('123456789012345');
  await analitica.getByRole('button', { name: 'Guardar' }).click();
  await expect(analitica.getByRole('status')).toContainText('Se guardaron los identificadores.');
  await page.reload();
  await expect(tarjeta(page, 'Analítica').getByLabel('Google Analytics 4')).toHaveValue('G-AB12CD34EF');
});

test('CP-121: con el mantenimiento activo el visitante ve «Volvemos pronto» (503) y el superadmin sigue viendo el sitio', async ({ page, browser }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio/ajustes');
  const mantenimiento = tarjeta(page, 'Mantenimiento');
  await mantenimiento.getByLabel('Mensaje para los visitantes (opcional)').fill('Volvemos hoy a las 3 p. m.');
  const interruptor = mantenimiento.getByRole('switch', { name: 'Modo mantenimiento' });
  await interruptor.click();
  const confirmar = mantenimiento.getByRole('group', { name: 'Confirmar el modo mantenimiento' });
  await expect(confirmar).toContainText('todos los visitantes verán el aviso «Volvemos pronto»');
  await sinViolaciones(page);
  await confirmar.getByRole('button', { name: 'Sí, activar' }).click();
  await expect(mantenimiento.getByRole('status')).toContainText('Modo mantenimiento activo');
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await expect(mantenimiento.getByText('Sitio en mantenimiento')).toBeVisible();
  await expect(mantenimiento.getByText(/^Activo desde /)).toBeVisible();

  // El superadmin con sesión ve el sitio, sin caché compartida y con el aviso arriba.
  const propia = await page.goto('/s/');
  expect(propia?.status()).toBe(200);
  expect(propia?.headers()['cache-control']).toBe('private, no-store');
  await expect(page.getByRole('status')).toHaveText(AVISO_MANTENIMIENTO);

  // Un visitante sin sesión, en cualquier ruta y en el celular, recibe la página de mantenimiento con 503.
  const contexto = await browser.newContext({ viewport: { width: 390, height: 900 } });
  const visitante = await contexto.newPage();
  await simularApi(visitante, { ...SITIO, conSesion: false, ajustesSitio: { mantenimiento: { activo: true, mensaje: 'Volvemos hoy a las 3 p. m.', desde: F } } });
  for (const ruta of ['/s/', '/s/precios']) {
    const r = await visitante.goto(ruta);
    expect([ruta, r?.status()]).toEqual([ruta, 503]);
    expect(r?.headers()['retry-after']).toBe('600');
  }
  await expect(visitante.getByRole('heading', { level: 1, name: 'Volvemos pronto' })).toBeVisible();
  await expect(visitante.getByText('Volvemos hoy a las 3 p. m.')).toBeVisible();
  await expect(visitante.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  expect(await visitante.locator('script').count()).toBe(0);
  await sinViolaciones(visitante, false);
  await contexto.close();

  // Al desactivarlo el sitio vuelve a verse sin aviso.
  await page.goto('/sitio/ajustes');
  await tarjeta(page, 'Mantenimiento').getByRole('switch', { name: 'Modo mantenimiento' }).click();
  await expect(tarjeta(page, 'Mantenimiento').getByRole('status')).toContainText('Modo mantenimiento desactivado');
  const otra = await page.goto('/s/');
  expect(otra?.status()).toBe(200);
  await expect(page.getByText(AVISO_MANTENIMIENTO)).toHaveCount(0);
});
