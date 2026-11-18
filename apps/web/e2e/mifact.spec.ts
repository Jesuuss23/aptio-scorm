// HU-1712 · Integración con Mifact (DA-09, CP-162, CP-163) en la interfaz, contra la API simulada:
// - Ventas › Facturación › Datos fiscales: elegir Mifact pide el ubigeo; con la detracción, la cuenta y el código SPOT;
// - Comprobantes: el CDR de SUNAT de un comprobante de Mifact, su observado (aceptado con observaciones) sin reenvío y la
//   boleta pendiente de más de S/ 700 que pide el DNI al corregir;
// - /pago: la boleta de más de S/ 700 sin DNI vuelve al paso 1 con el foco en el DNI y, con él, el pedido lo lleva.
// Todo con el teclado; axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import type { ComprobanteSim } from './comprobantes-simulados';
import { checkoutsSim } from './suscripciones-simuladas';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const pulsar = async (page: Page, control: Locator, tecla: 'Enter' | 'Space' = 'Enter') => { await expect(control).toBeEnabled(); await control.focus(); await page.keyboard.press(tecla); };
const escribir = async (page: Page, campo: Locator, texto: string) => { await campo.focus(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Delete'); if (texto) await page.keyboard.type(texto); };

const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000030${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000030${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const SITIO = { conSesion: false, versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[1]!.id, 'precios')], planesSitio: { ejemplo: true } };

const COMPROBANTES: ComprobanteSim[] = [
  { id: 'm1', proveedor: 'mifact', tipo: 'FACTURA', serie: 'F001', numero: 11, ruc: '20131312955', razonSocial: 'Minera Andina SAC', correoFacturacion: 'pagos@minera.example', moneda: 'PEN', total: 1522.2, estado: 'ACEPTADO', motivo: 'Aceptado por SUNAT: 0 · La Factura numero F001-00000011, ha sido aceptada', emitidoEn: '2026-11-18T15:00:00.000Z' },
  { id: 'm2', proveedor: 'mifact', tipo: 'FACTURA', serie: 'F001', numero: 12, ruc: '20101010105', razonSocial: 'Andes Learning SAC', correoFacturacion: 'conta@andes.example', moneda: 'PEN', total: 472, estado: 'OBSERVADO', motivo: 'Aceptado con observaciones: 4332 - La dirección no es válida', emitidoEn: '2026-11-18T16:00:00.000Z' },
  { id: 'm3', proveedor: 'mifact', tipo: 'BOLETA', serie: 'B001', numero: 5, ruc: null, razonSocial: 'Ana Quispe', correoFacturacion: 'ana@correo.example', moneda: 'PEN', total: 1522.2, estado: 'PENDIENTE', motivo: 'Mifact no lo emitió: falta el DNI del comprador', emitidoEn: '2026-11-18T17:00:00.000Z' },
];

for (const ancho of [1280, 390]) {
  test(`CP-162 · datos fiscales con Mifact: ubigeo, anexo, cuenta de detracciones y código SPOT (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', facturacionSitio: { comprobantes: COMPROBANTES } });
    await page.goto('/ventas/facturacion');
    await page.getByRole('tab', { name: 'Comprobantes' }).focus();
    await page.keyboard.press('ArrowRight');
    const form = page.getByRole('form', { name: 'Datos fiscales' });
    await expect(form.getByLabel('Código de anexo SUNAT')).toHaveValue('0000');
    await form.getByLabel('Proveedor').focus();
    await form.getByLabel('Proveedor').selectOption('mifact');
    await expect(form).toContainText('El RUC del emisor debe ser el mismo del token de Mifact.');
    await expect(form.getByLabel('Ubigeo del domicilio fiscal', { exact: true })).toBeVisible();
    await pulsar(page, form.getByLabel('Aplicar la detracción en las facturas en soles desde el umbral'), 'Space');
    await pulsar(page, form.getByRole('button', { name: 'Guardar los datos fiscales' }));
    const alerta = form.getByRole('alert');
    await expect(alerta).toContainText('El ubigeo INEI tiene 6 dígitos');
    await expect(alerta).toContainText('Escribe la cuenta de detracciones del Banco de la Nación');
    await expect(alerta).toContainText('El código SPOT tiene 3 dígitos');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    await escribir(page, form.getByLabel('Ubigeo del domicilio fiscal', { exact: true }), '150101');
    await escribir(page, form.getByLabel('Cuenta de detracciones (Banco de la Nación)'), '00-000-123456');
    await escribir(page, form.getByLabel('Código del servicio (SPOT)'), '022');
    await pulsar(page, form.getByRole('button', { name: 'Guardar los datos fiscales' }));
    await expect(page.getByRole('status').filter({ hasText: 'Se guardaron los datos fiscales.' })).toBeVisible();
    await expect(form.getByLabel('Proveedor')).toHaveValue('mifact');
    await expect(form.getByLabel('Ubigeo del domicilio fiscal', { exact: true })).toHaveValue('150101');
    await expect(form.getByLabel('Código del servicio (SPOT)')).toHaveValue('022');
    await sinViolaciones(page);
  });

  test(`CP-163 · comprobantes de Mifact: CDR, observado sin reenvío y la boleta que pide el DNI (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', facturacionSitio: { comprobantes: COMPROBANTES } });
    await page.goto('/ventas/facturacion');
    const tabla = page.getByRole('table', { name: 'Comprobantes' });
    await expect(tabla.getByRole('rowheader')).toHaveCount(3);
    const aceptado = tabla.getByRole('row', { name: /^F001-00000011 / });
    const [cdr] = await Promise.all([page.waitForEvent('download'), pulsar(page, aceptado.getByRole('button', { name: 'CDR de SUNAT de F001-00000011' }))]);
    expect(cdr.suggestedFilename()).toBe('R-20000000001-01-F001-00000011.xml');
    const observado = tabla.getByRole('row', { name: /^F001-00000012 / });
    await expect(observado).toContainText('Aceptado con observaciones: 4332');
    await expect(observado.getByRole('button', { name: /Corregir y reenviar/ })).toHaveCount(0);
    await expect(observado.getByRole('button', { name: 'CDR de SUNAT de F001-00000012' })).toBeVisible();
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    const boleta = tabla.getByRole('row', { name: /^B001-00000005 / });
    await expect(boleta).toContainText('Sin documento');
    await pulsar(page, boleta.getByRole('button', { name: 'Corregir y reenviar B001-00000005' }));
    const corregir = page.getByRole('region', { name: 'Corregir y reenviar B001-00000005' });
    await expect(corregir.getByRole('heading', { name: 'Corregir y reenviar B001-00000005' })).toBeFocused();
    const dni = corregir.getByLabel('DNI del comprador', { exact: true });
    await pulsar(page, corregir.getByRole('button', { name: 'Reenviar al OSE' }));
    await expect(corregir.getByRole('alert')).toHaveText('Las boletas de más de S/ 700 necesitan el DNI del comprador');
    await sinViolaciones(page);
    await escribir(page, dni, '123');
    await pulsar(page, corregir.getByRole('button', { name: 'Reenviar al OSE' }));
    await expect(corregir.getByRole('alert')).toHaveText('El DNI tiene 8 dígitos');
    await escribir(page, dni, '40506089');
    await pulsar(page, corregir.getByRole('button', { name: 'Reenviar al OSE' }));
    await expect(page.getByRole('status').filter({ hasText: 'Se reenvió B001-00000005: queda pendiente hasta que responda el OSE.' })).toBeVisible();
    await expect(tabla.getByRole('row', { name: /^B001-00000005 / })).toContainText('DNI 40506089');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });

  test(`/pago · la boleta de más de S/ 700 pide el DNI antes de pagar y lo envía (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { ...SITIO, entornoSitio: 'pruebas' });
    checkoutsSim.length = 0;
    await page.goto('/s/pago?plan=productora');
    const campo = (n: string) => page.getByLabel(n, { exact: true });
    await escribir(page, campo('Razón social o nombre'), 'Ana Quispe');
    await expect(campo('DNI (para la boleta)')).toHaveAccessibleDescription('Sin RUC, las boletas de más de S/ 700 llevan tu DNI de 8 dígitos.');
    await escribir(page, campo('DNI (para la boleta)'), '1234');
    await escribir(page, campo('Nombre de quien administrará la cuenta'), 'Ana Quispe');
    await escribir(page, campo('Correo de quien administrará la cuenta'), 'ana@quispe.pe');
    await page.getByLabel(/Acepto los términos/).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('Enter');
    await expect(campo('DNI (para la boleta)')).toBeFocused();
    await expect(campo('DNI (para la boleta)')).toHaveAccessibleDescription(/El DNI tiene 8 dígitos/);
    await sinViolaciones(page);
    // Sin DNI pasa al resumen, pero al pagar (S/ 1,522.20 con IGV) vuelve al paso 1 con el foco en el DNI.
    await escribir(page, campo('DNI (para la boleta)'), '');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('heading', { level: 2, name: 'Resumen de tu suscripción' })).toBeFocused();
    await expect(page.locator('.pg dl')).toContainText('Boleta de venta');
    await pulsar(page, page.getByRole('button', { name: 'Continuar al pago' }));
    await expect(campo('DNI (para la boleta)')).toBeFocused();
    await expect(page.getByRole('alert')).toContainText('Las boletas de más de S/ 700 necesitan el DNI del comprador');
    expect(checkoutsSim).toHaveLength(0);
    await sinViolaciones(page);
    await escribir(page, campo('DNI (para la boleta)'), '40506089');
    await page.keyboard.press('Enter');
    await expect(page.locator('.pg dl')).toContainText('Boleta de venta · DNI 40506089');
    await pulsar(page, page.getByRole('button', { name: 'Continuar al pago' }));
    await expect(page.getByRole('heading', { level: 2, name: 'Pago' })).toBeFocused();
    expect(checkoutsSim[0]!.cuerpo).toMatchObject({ ruc: '', dni: '40506089' });
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });
}
