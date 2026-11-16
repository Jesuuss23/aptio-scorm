// HU-1602 · Integración con CRM (REQ-075, PNT-34, RN-17-2). En Captación › Leads y CRM: la columna «CRM» con su estado y
// «Reintentar» (CP-129: el lead que no entró queda con el error visible), y las tarjetas de Conexiones (interruptor por
// CRM con «Clave configurada» o «Falta la clave»), Mapeo de campos (por CRM) y Webhook (URL, clave con «Copiar» y
// «Regenerar», «Enviar prueba» y cómo verificar la firma, CP-130). axe WCAG 2.2 A/AA en 0 violaciones a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { type LeadSim, simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const lead = (n: number, d: Partial<LeadSim>): LeadSim => ({
  id: `00000000-0000-4000-9800-00000000000${n}`, correo: `lead${n}@empresa.example`, nombre: `Lead ${n}`, empresa: null, mensaje: null, origen: 'formulario', via: 'formulario',
  paginaEntrada: '/', paginaFormulario: '/contacto', utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null, referente: null, idioma: 'es',
  etapa: 'NUEVO', consentimiento: true, consentimientoEn: F, totalContactos: 1, historialContactos: [], creadoEn: `2026-11-0${n}T15:00:00.000Z`, actualizadoEn: F, ...d,
});
const LEADS = [
  lead(1, { nombre: 'Rocío Mendoza', correo: 'rmendoza@nuevohorizonte.example', empresa: 'Colegio Nuevo Horizonte', origen: 'popup', via: 'popup' }),
  lead(2, { nombre: 'Elena Soto', correo: 'esoto@retailpacifico.example', origen: 'asistente_ia', via: 'formulario' }),
];
const enviado = (tipo: 'hubspot' | 'webhook') => ({ tipo, estado: 'enviado' as const, intentos: 1, motivo: null, enviadoEn: F });
const CRM = {
  claves: ['hubspot' as const],
  conexiones: { hubspot: { activa: true }, webhook: { activa: true, url: 'https://hooks.ventas.pe/aptio', secreto: 'whsec_simulado000000000000000000000000000000' } },
  envios: {
    [LEADS[0]!.id]: [{ tipo: 'hubspot' as const, estado: 'error' as const, intentos: 4, motivo: 'HubSpot respondió 500: Service unavailable', enviadoEn: null }, enviado('webhook')],
    [LEADS[1]!.id]: [enviado('hubspot'), enviado('webhook')],
  },
};
const tabla = (page: Page) => page.getByRole('table', { name: 'Leads del sitio' });
const fila = (page: Page, nombre: string) => tabla(page).getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${nombre}`) }) });
const estado = (page: Page, texto: string | RegExp) => page.getByRole('status').filter({ hasText: texto });

for (const ancho of [390, 1280]) {
  test(`PNT-34 a ${ancho} px: la columna CRM con «Reintentar» y las tarjetas de Conexiones, Mapeo de campos y Webhook`, async ({ page, context }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', leadsSitio: LEADS, crmSitio: CRM });
    await page.goto('/captacion/leads');
    await expect(tabla(page).getByRole('columnheader')).toHaveText(['Contacto', 'Origen', 'Entrada', 'Etapa', 'CRM', 'Fecha']);

    // CP-129 · El lead que no entró muestra el motivo y se reintenta; el sincronizado no ofrece «Reintentar».
    const rocio = fila(page, 'Rocío Mendoza');
    await expect(rocio).toContainText('Error: HubSpot respondió 500: Service unavailable');
    await expect(fila(page, 'Elena Soto')).toContainText('Sincronizado');
    await expect(fila(page, 'Elena Soto').getByRole('button', { name: /^Reintentar/ })).toHaveCount(0);
    await expect(page.getByRole('switch', { name: 'Activar HubSpot' })).toHaveAttribute('aria-checked', 'true');
    await sinViolaciones(page);
    await rocio.getByRole('button', { name: 'Reintentar el envío de Rocío Mendoza' }).click();
    await expect(estado(page, 'volvió a la cola')).toHaveText('Rocío Mendoza volvió a la cola de envío.');
    await expect(rocio).toContainText('Pendiente');

    // Conexiones: sin la clave en el entorno no se activa, y se dice qué variable falta.
    const conexiones = page.getByRole('list', { name: 'Conexiones de CRM' });
    const pipedrive = conexiones.getByRole('listitem').filter({ hasText: 'Pipedrive' });
    await expect(pipedrive).toContainText('Falta la clave');
    await expect(pipedrive).toContainText('Define PIPEDRIVE_TOKEN en el entorno del servidor');
    await expect(conexiones.getByRole('listitem').filter({ hasText: 'HubSpot' })).toContainText('Clave configurada');
    await page.getByRole('switch', { name: 'Activar Pipedrive' }).click();
    await expect(page.getByRole('alert')).toHaveText('No se pudo activar Pipedrive: No se puede activar Pipedrive: define PIPEDRIVE_TOKEN en el entorno del servidor');
    await expect(page.getByRole('switch', { name: 'Activar Pipedrive' })).toHaveAttribute('aria-checked', 'false');

    // Mapeo de campos: el correo es fijo; una propiedad no válida se rechaza; otra válida se guarda.
    const mapeo = page.getByRole('form', { name: 'Mapeo de campos de HubSpot' });
    await expect(mapeo.getByLabel('Propiedad de Correo en HubSpot')).toHaveValue('email');
    await expect(mapeo.getByLabel('Propiedad de Correo en HubSpot')).toHaveAttribute('readonly', '');
    await mapeo.getByLabel('Propiedad de Etapa en HubSpot').fill('mi etapa');
    await mapeo.getByRole('button', { name: 'Guardar mapeo' }).click();
    await expect(page.getByRole('alert')).toContainText('No se guardó el mapeo: La propiedad de Etapa lleva letras');
    await mapeo.getByLabel('Propiedad de Etapa en HubSpot').fill('aptio_etapa');
    await mapeo.getByRole('button', { name: 'Guardar mapeo' }).click();
    await expect(estado(page, 'mapeo')).toHaveText('Se guardó el mapeo de HubSpot.');
    await expect(page.getByRole('form', { name: 'Mapeo de campos de HubSpot' }).getByLabel('Propiedad de Etapa en HubSpot')).toHaveValue('aptio_etapa');
    await page.getByRole('combobox', { name: 'CRM', exact: true }).selectOption({ label: 'Zoho CRM' });
    await expect(page.getByRole('heading', { level: 2, name: 'Mapeo de campos · Zoho CRM' })).toBeVisible();
    await expect(page.getByRole('form', { name: 'Mapeo de campos de Zoho CRM' }).getByLabel('Propiedad de Nombre en Zoho CRM')).toHaveValue('Last_Name');

    // Webhook (CP-130): la clave se copia y se regenera con confirmación; «Enviar prueba» manda lead.prueba firmado.
    const webhook = page.getByRole('region', { name: 'Webhook' });
    await expect(webhook.getByLabel('URL del webhook', { exact: true })).toHaveValue('https://hooks.ventas.pe/aptio');
    await expect(webhook.locator('code.crm-secreto')).toHaveText('whsec_simulado000000000000000000000000000000');
    await webhook.getByRole('button', { name: 'Copiar' }).click();
    await expect(estado(page, 'Se copió')).toHaveText('Se copió la clave del webhook.');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('whsec_simulado000000000000000000000000000000');
    await webhook.getByRole('button', { name: 'Regenerar' }).click();
    await expect(webhook.getByRole('status')).toHaveText('La clave anterior deja de valer en el siguiente envío: actualízala en tu sistema.');
    await sinViolaciones(page);
    await webhook.getByRole('button', { name: 'Sí, regenerar' }).click();
    await expect(estado(page, 'clave nueva')).toHaveText('Se generó una clave nueva: actualízala en el receptor. La anterior ya no vale.');
    await expect(webhook.locator('code.crm-secreto')).toHaveText('whsec_simulado000000000000000000000000000001');
    await webhook.getByRole('button', { name: 'Enviar prueba' }).click();
    await expect(estado(page, 'El webhook respondió')).toHaveText('El webhook respondió 200 a la entrega 6f1c2a90-5b7e-4d1a-9c3f-2e8b7a6d5c41.');
    await expect(webhook.getByRole('heading', { level: 3, name: 'Cómo verificar la firma' })).toBeVisible();
    await expect(webhook.getByRole('listitem')).toHaveCount(3);
    await expect(webhook).toContainText('X-Aptio-Firma');
    // Una URL que no es https se rechaza.
    await webhook.getByLabel('URL del webhook', { exact: true }).fill('http://hooks.ventas.pe/aptio');
    await webhook.getByRole('button', { name: 'Guardar URL' }).click();
    await expect(page.getByRole('alert')).toHaveText('No se guardó la URL: La URL del webhook empieza con https://');
    await sinViolaciones(page);
  });
}

test('sin conexiones activas el lead dice «Sin enviar» y activar el webhook pide su URL', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', leadsSitio: LEADS.slice(0, 1) });
  await page.goto('/captacion/leads');
  const rocio = fila(page, 'Rocío Mendoza');
  await expect(rocio).toContainText('Sin enviar');
  await expect(rocio.getByRole('button', { name: /^Reintentar/ })).toHaveCount(0);
  await page.getByRole('switch', { name: 'Activar Webhook' }).click();
  await expect(page.getByRole('alert')).toHaveText('No se pudo activar Webhook: Para activar el webhook, escribe su URL https://');
  const webhook = page.getByRole('region', { name: 'Webhook' });
  await expect(webhook.getByRole('button', { name: 'Enviar prueba' })).toBeDisabled();
  await webhook.getByLabel('URL del webhook', { exact: true }).fill('https://hooks.ventas.pe/aptio');
  await webhook.getByRole('button', { name: 'Guardar URL' }).click();
  await expect(estado(page, 'URL')).toHaveText('Se guardó la URL del webhook.');
  await page.getByRole('switch', { name: 'Activar Webhook' }).click();
  await expect(estado(page, 'activado')).toHaveText('Webhook quedó activado.');
  await expect(webhook.locator('code.crm-secreto')).toHaveText(/^whsec_/);
  await expect(page.getByRole('list', { name: 'Conexiones de CRM' }).getByRole('listitem').filter({ hasText: 'Webhook' })).toContainText('Con URL y clave');
});
