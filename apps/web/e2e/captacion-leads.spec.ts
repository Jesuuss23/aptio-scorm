// HU-1601 · Leads con origen y UTM (REQ-074, PNT-34, RN-17-1). En el sitio público, el bloque «Formulario de contacto»:
// con JavaScript, el script propio guarda la primera visita (página de entrada y UTM) en sessionStorage y la manda con el
// formulario, sin que la CSP lo bloquee; sin JavaScript, el formulario se envía igual (con la página del formulario como
// entrada). En el panel, Captación › Leads y CRM: filtros por origen y etapa, la etapa editable en la fila y «Exportar
// CSV» con los filtros aplicados. axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { CLAVE_SESION } from '@aptio/sitio';
import { type LeadSim, simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000010${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios'), pagina(2, '/contacto', 'Contacto')];
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000010${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const BLOQUES = [bloque(0, PAGINAS[0]!.id, 'cta'), bloque(1, PAGINAS[1]!.id, 'cta'), bloque(2, PAGINAS[2]!.id, 'formulario_contacto')];
const SITIO = { conSesion: true, rol: 'SUPERADMIN', versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES };

const lead = (n: number, d: Partial<LeadSim>): LeadSim => ({
  id: `00000000-0000-4000-9800-00000000000${n}`, correo: `lead${n}@empresa.example`, nombre: `Lead ${n}`, empresa: null, mensaje: null, origen: 'formulario', via: 'formulario',
  paginaEntrada: '/', paginaFormulario: '/contacto', utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null, referente: null, idioma: 'es',
  etapa: 'NUEVO', consentimiento: true, consentimientoEn: F, totalContactos: 1, historialContactos: [], creadoEn: `2026-11-0${n}T15:00:00.000Z`, actualizadoEn: F, ...d,
});
const LEADS = [
  lead(1, { nombre: 'Rocío Mendoza', correo: 'rmendoza@nuevohorizonte.example', empresa: 'Colegio Nuevo Horizonte', origen: 'popup', via: 'popup', utmSource: 'linkedin', utmMedium: 'social', etapa: 'CONTACTADO' }),
  lead(2, { nombre: 'Elena Soto', correo: 'esoto@retailpacifico.example', origen: 'asistente_ia', via: 'formulario', referente: 'https://www.perplexity.ai/search', totalContactos: 3 }),
  lead(3, { nombre: '=HYPERLINK("http://malo.example")', correo: 'formula@empresa.example', origen: 'popup', via: 'popup' }),
];

const sinViolaciones = async (page: Page, soloMain = true) => {
  const b = new AxeBuilder({ page }).withTags(REGLAS);
  const axe = await (soloMain ? b.include('main') : b).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const tabla = (page: Page) => page.getByRole('table', { name: 'Leads del sitio' });
// Playwright no intercepta el pedido que sigue a una redirección (iría al servidor de desarrollo): se mira el 303 con su
// Location y después se abre la página de gracias.
const enviarFormulario = async (page: Page) => {
  const [r] = await Promise.all([page.waitForResponse((x) => new URL(x.url()).pathname === '/s/_lead'), page.getByRole('button', { name: 'Enviar' }).click()]);
  expect([r.status(), r.headers().location]).toEqual([303, '/s/_gracias']);
  await page.goto('/s/_gracias');
};
const fila = (page: Page, nombre: string) => tabla(page).getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${nombre.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) }) });

for (const ancho of [390, 1280]) {
  test(`a ${ancho} px el formulario con JavaScript guarda la entrada y el UTM de la primera visita, y el lead llega a Leads y CRM`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    const csp: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
    await simularApi(page, SITIO);
    // La visita entra por /precios desde una campaña de LinkedIn…
    await page.goto('/s/precios?utm_source=LinkedIn&utm_medium=social&utm_campaign=lanzamiento');
    await expect.poll(() => page.evaluate((k) => sessionStorage.getItem(k), CLAVE_SESION)).toContain('"paginaEntrada":"/precios"');
    // …y deja sus datos después, en /contacto.
    await page.goto('/s/contacto');
    const form = page.locator('form.fcontacto');
    await expect(form.locator('input[name="utm_source"]')).toHaveValue('LinkedIn');
    await expect(form.locator('input[name="paginaEntrada"]')).toHaveValue('/precios');
    await sinViolaciones(page);
    await page.getByLabel('Nombre').fill('Gabriela Ponce');
    await page.getByLabel('Correo de trabajo').fill('GPonce@CostaVerde.example');
    await page.getByLabel('Empresa (opcional)').fill('Energía Costa Verde');
    await page.getByLabel('Mensaje (opcional)').fill('Queremos una demo para el área de seguridad.');
    await page.getByLabel(/Acepto el tratamiento de mis datos personales/).check();
    await enviarFormulario(page);
    await expect(page.getByRole('heading', { level: 1, name: 'Recibimos tus datos' })).toBeVisible();
    expect(csp).toEqual([]);

    await page.goto('/captacion/leads');
    await expect(page.getByRole('heading', { level: 1, name: 'Leads y CRM' })).toBeVisible();
    const f = fila(page, 'Gabriela Ponce');
    await expect(f).toContainText('Energía Costa Verde · gponce@costaverde.example');
    await expect(f.getByRole('cell').nth(0)).toHaveText('Formulario');
    await expect(f).toContainText('/precios');
    await expect(f).toContainText('linkedin / social');
    await expect(f.getByRole('list', { name: 'UTM de Gabriela Ponce' }).getByRole('listitem')).toHaveText(['utm_source: linkedin', 'utm_medium: social', 'utm_campaign: lanzamiento']);
    await expect(f.getByLabel('Etapa de Gabriela Ponce')).toHaveValue('NUEVO');
    await sinViolaciones(page);
  });
}

test('sin JavaScript el formulario se envía igual: el lead queda con la página del formulario como entrada y sin UTM', async ({ browser }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false });
  const page = await contexto.newPage();
  await simularApi(page, SITIO);
  await page.goto('/s/contacto?utm_source=google');
  await expect(page.locator('script[src="/s/_captacion.js"]')).toHaveCount(1);
  await page.getByLabel('Nombre').fill('Luis Gamarra');
  await page.getByLabel('Correo de trabajo').fill('lgamarra@kallpa.example');
  await page.getByLabel(/Acepto el tratamiento/).check();
  await enviarFormulario(page);
  await expect(page.getByRole('status')).toHaveText('Gracias por escribirnos. Te contactaremos pronto al correo que nos dejaste.');
  const res = await page.goto('/api/v1/captacion/leads');
  const { leads } = (await res!.json()) as { leads: LeadSim[] };
  expect(leads).toMatchObject([{ correo: 'lgamarra@kallpa.example', origen: 'formulario', via: 'formulario', paginaEntrada: '/contacto', paginaFormulario: '/contacto', utmSource: null }]);
  await contexto.close();
});

for (const ancho of [390, 1280]) {
  test(`PNT-34 a ${ancho} px: filtros por origen y etapa, la etapa se cambia en la fila y el CSV sale con los filtros`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { ...SITIO, leadsSitio: LEADS });
    await page.goto('/captacion/leads');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Leads y CRM' })).toHaveAttribute('aria-current', 'page');
    await expect(tabla(page).getByRole('row')).toHaveCount(4);
    await expect(page.getByRole('status').filter({ hasText: /leads?$/ })).toHaveText('3 leads');
    // El que llegó de un asistente de IA muestra el canal por el que entró, y el recurrente su contador.
    const ia = fila(page, 'Elena Soto');
    await expect(ia).toContainText('Asistente IA');
    await expect(ia).toContainText('vía Formulario');
    await expect(ia).toContainText('3 contactos');
    await sinViolaciones(page);

    const filtros = page.getByRole('form', { name: 'Filtrar leads' });
    await filtros.getByLabel('Origen').selectOption({ label: 'Popup' });
    await expect(tabla(page).getByRole('row')).toHaveCount(3);
    await filtros.getByLabel('Etapa').selectOption({ label: 'Contactado' });
    await expect(tabla(page).getByRole('row')).toHaveCount(2);
    await expect(page.getByRole('status').filter({ hasText: /con estos filtros/ })).toHaveText('1 lead con estos filtros');

    await filtros.getByLabel('Etapa').selectOption({ label: 'Todas' });
    await fila(page, '=HYPERLINK').getByLabel(/^Etapa de/).selectOption({ label: 'Demo' });
    await expect(page.getByRole('status').filter({ hasText: 'pasó a la etapa' })).toHaveText('=HYPERLINK("http://malo.example") pasó a la etapa «Demo».');

    const descarga = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Exportar CSV' }).click();
    const archivo = await descarga;
    expect(archivo.suggestedFilename()).toBe('leads-2026-11-16.csv');
    const csv = await (await archivo.createReadStream()).toArray().then((p) => Buffer.concat(p as Buffer[]).toString('utf8'));
    const filas = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(filas).toHaveLength(3);
    expect(csv).toContain('"\'=HYPERLINK(""http://malo.example"")"');
    expect(csv).toContain('"Demo"');
    expect(csv).not.toContain('esoto@retailpacifico.example');
    await expect(page.getByRole('status').filter({ hasText: 'Se descargó' })).toHaveText('Se descargó leads-2026-11-16.csv con 2 leads.');

    await filtros.getByLabel('Origen').selectOption({ label: 'Chatbot' });
    await expect(page.getByText('No hay leads con estos filtros.')).toBeVisible();
    await sinViolaciones(page);
  });
}

test('sin leads la vista dice cómo empezar a recibirlos', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/captacion/leads');
  await expect(page.getByText('Aún no llegan leads. Agrega el bloque «Formulario de contacto» a una página del sitio y publícala.')).toBeVisible();
});

test('SUP-237 · borrar los datos de una persona a su pedido, con confirmación, solo con teclado y axe sin violaciones', async ({ page }) => {
  await simularApi(page, { ...SITIO, leadsSitio: LEADS });
  await page.goto('/captacion/leads');
  await expect(fila(page, 'Elena Soto')).toBeVisible();
  const tarjeta = page.getByRole('region', { name: 'Borrar datos a pedido del titular' });
  const boton = tarjeta.getByRole('button', { name: 'Borrar sus datos' });
  await expect(boton).toBeDisabled();
  await tarjeta.getByLabel('Correo del titular').fill('ESoto@RetailPacifico.example');
  await tarjeta.getByLabel('Motivo del pedido').fill('Pidió por correo que borremos sus datos');
  await tarjeta.getByLabel('Motivo del pedido').press('Enter');
  await expect(tarjeta.getByRole('alert')).toContainText('¿Borrar los datos de ESoto@RetailPacifico.example? No se puede deshacer.');
  await sinViolaciones(page);
  await tarjeta.getByRole('button', { name: 'Cancelar' }).click();
  await expect(tarjeta.getByRole('alert')).toHaveCount(0);
  await boton.click();
  await tarjeta.getByRole('button', { name: 'Sí, borrar' }).focus();
  await page.keyboard.press('Enter');
  await expect(tarjeta.getByRole('status')).toContainText('Se borró el lead de ESoto@RetailPacifico.example; 1 cita quedó sin sus datos.');
  await expect(tarjeta.getByRole('status')).toContainText('También está en HubSpot (id 901): pide allí que lo borren.');
  await expect(fila(page, 'Elena Soto')).toHaveCount(0);
  await expect(tarjeta.getByLabel('Correo del titular')).toHaveValue('');
  await sinViolaciones(page);
});
