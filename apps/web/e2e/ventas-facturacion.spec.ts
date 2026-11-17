// HU-1707 · Ventas › Facturación (REQ-087, CP-148, CP-149, PNT-37). La pestaña Comprobantes filtra por estado SUNAT,
// descarga el PDF y el XML y corrige y reenvía un observado hasta que el OSE (simulado) lo acepta; la pestaña Datos
// fiscales guarda el emisor, las series, el proveedor, el ambiente y la detracción con su aviso «por validar con el
// contador». Todo con el teclado; axe WCAG 2.2 A/AA a 390 y 1280 px. Solo el superadmin.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import type { ComprobanteSim } from './comprobantes-simulados';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const pulsar = async (page: Page, control: Locator, tecla: 'Enter' | 'Space' = 'Enter') => { await control.focus(); await page.keyboard.press(tecla); };

const COMPROBANTES: ComprobanteSim[] = [
  { id: 'c1', tipo: 'FACTURA', serie: 'F001', numero: 1, ruc: '20131312955', razonSocial: 'Minera Andina SAC', correoFacturacion: 'pagos@minera.example', moneda: 'PEN', total: 1522.2, detraccion: 182.66, estado: 'ACEPTADO', motivo: 'F001-00000001 aceptado por el OSE de pruebas (simulado, sin envío a SUNAT)', emitidoEn: '2026-11-17T15:00:00.000Z' },
  { id: 'c2', tipo: 'FACTURA', serie: 'F001', numero: 2, ruc: '20999999990', razonSocial: 'Andes Learning SAC', correoFacturacion: 'conta@andes.example', moneda: 'PEN', total: 472, estado: 'OBSERVADO', motivo: 'El RUC del receptor no figura como activo en el padrón (OSE simulado)', emitidoEn: '2026-11-17T16:00:00.000Z' },
  { id: 'c3', tipo: 'BOLETA', serie: 'B001', numero: 1, ruc: null, razonSocial: 'Ana Quispe', correoFacturacion: 'ana@correo.example', moneda: 'USD', total: 129.8, estado: 'ACEPTADO', emitidoEn: '2026-11-17T17:00:00.000Z' },
  { id: 'c4', tipo: 'NOTA_CREDITO', serie: 'FC01', numero: 1, referencia: 'F001-00000001', ruc: '20131312955', razonSocial: 'Minera Andina SAC', correoFacturacion: 'pagos@minera.example', moneda: 'PEN', total: 1522.2, estado: 'PENDIENTE', emitidoEn: '2026-11-17T18:00:00.000Z' },
];

for (const ancho of [1280, 390]) {
  test(`CP-149 · filtra por estado, descarga el PDF y el XML y corrige y reenvía un observado hasta aceptado (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', facturacionSitio: { comprobantes: COMPROBANTES } });
    await page.goto('/ventas/facturacion');
    await expect(page.getByRole('heading', { level: 1, name: 'Facturación' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Comprobantes' })).toHaveAttribute('aria-selected', 'true');
    const tabla = page.getByRole('table', { name: 'Comprobantes' });
    await expect(tabla.getByRole('rowheader')).toHaveCount(4);
    await expect(tabla.getByRole('row', { name: /^F001-00000001 / })).toContainText('Aceptado');
    await expect(tabla.getByRole('row', { name: /^F001-00000001 / })).toContainText('detracción S/ 182.66');
    await expect(tabla.getByRole('row', { name: /^B001-00000001 / })).toContainText('Sin documento');
    await expect(tabla.getByRole('row', { name: /^B001-00000001 / })).toContainText('US$ 129.80');
    await expect(tabla.getByRole('row', { name: /^FC01-00000001 / })).toContainText('corrige F001-00000001');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // CP-148 · PDF y XML del aceptado.
    const fila = tabla.getByRole('row', { name: /^F001-00000001 / });
    const [pdf] = await Promise.all([page.waitForEvent('download'), pulsar(page, fila.getByRole('button', { name: 'PDF de F001-00000001' }))]);
    expect(pdf.suggestedFilename()).toBe('20000000001-01-F001-00000001.pdf');
    const [xml] = await Promise.all([page.waitForEvent('download'), pulsar(page, fila.getByRole('button', { name: 'XML de F001-00000001' }))]);
    expect(xml.suggestedFilename()).toBe('20000000001-01-F001-00000001.xml');

    // Filtro por estado SUNAT.
    await page.getByLabel('Estado SUNAT').selectOption('OBSERVADO');
    await expect(tabla.getByRole('rowheader')).toHaveCount(1);
    const observado = tabla.getByRole('row', { name: /^F001-00000002 / });
    await expect(observado).toContainText('El RUC del receptor no figura como activo en el padrón');
    await expect(tabla.getByRole('row', { name: /^F001-00000001 / })).toHaveCount(0);

    // Corregir y reenviar: sin RUC no se envía; con el RUC correcto queda pendiente y luego aceptado.
    await pulsar(page, observado.getByRole('button', { name: 'Corregir y reenviar F001-00000002' }));
    const corregir = page.getByRole('region', { name: 'Corregir y reenviar F001-00000002' });
    await expect(corregir.getByRole('heading', { name: 'Corregir y reenviar F001-00000002' })).toBeFocused();
    await expect(corregir).toContainText('El OSE respondió: El RUC del receptor no figura como activo');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
    await corregir.getByLabel('RUC').fill('');
    await pulsar(page, corregir.getByRole('button', { name: 'Reenviar al OSE' }));
    await expect(corregir.getByRole('alert')).toHaveText('Una factura necesita un RUC válido');
    await corregir.getByLabel('RUC').fill('20101010105');
    await corregir.getByLabel('Correo de facturación').fill('facturas@andes.example');
    await pulsar(page, corregir.getByRole('button', { name: 'Reenviar al OSE' }));
    await expect(page.getByRole('status').filter({ hasText: 'Se reenvió F001-00000002: queda pendiente hasta que responda el OSE.' })).toBeVisible();
    await expect(corregir).toHaveCount(0);
    await page.getByLabel('Estado SUNAT').selectOption('');
    const reenviado = tabla.getByRole('row', { name: /^F001-00000002 / });
    await expect(reenviado).toContainText('Aceptado');
    await expect(reenviado).toContainText('RUC 20101010105 · facturas@andes.example');
    await expect(reenviado.getByRole('button', { name: /Corregir y reenviar/ })).toHaveCount(0);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });

  test(`Datos fiscales: emisor, series, proveedor, ambiente y detracción con su aviso, validados (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', facturacionSitio: { comprobantes: COMPROBANTES } });
    await page.goto('/ventas/facturacion');
    // Con las flechas del teclado a la segunda pestaña.
    await page.getByRole('tab', { name: 'Comprobantes' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Datos fiscales' })).toBeFocused();
    await expect(page.getByRole('tab', { name: 'Datos fiscales' })).toHaveAttribute('aria-selected', 'true');
    const form = page.getByRole('form', { name: 'Datos fiscales' });
    await expect(form.getByLabel('RUC del emisor')).toHaveValue('20000000001');
    await expect(form.getByLabel('Serie de facturas')).toHaveValue('F001');
    await expect(form.getByLabel('Proveedor')).toHaveValue('pruebas');
    await expect(form).toContainText('Disponible en este entorno. Sus credenciales van en variables de entorno, nunca aquí.');
    await expect(form.getByRole('group', { name: 'Detracción' })).toContainText('Por validar con el contador.');
    await expect(form.getByLabel('Aplicar la detracción en las facturas en soles desde el umbral')).not.toBeChecked();
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // Errores: serie sin su letra, serie repetida y producción con el OSE de pruebas.
    await form.getByLabel('Serie de boletas').fill('F002');
    await form.getByLabel('Notas de crédito de boletas').fill('FC01');
    await pulsar(page, form.getByRole('button', { name: 'Guardar los datos fiscales' }));
    await expect(form.getByRole('alert')).toContainText('Una serie de boleta empieza con B y tiene 4 caracteres');
    await expect(form.getByRole('alert')).toContainText('Cada serie debe ser distinta');
    await sinViolaciones(page);
    await form.getByLabel('Serie de boletas').fill('B002');
    await form.getByLabel('Notas de crédito de boletas').fill('BC02');
    await form.getByLabel('Ambiente').selectOption('produccion');
    await pulsar(page, form.getByRole('button', { name: 'Guardar los datos fiscales' }));
    await expect(form.getByRole('alert')).toHaveText('El OSE de pruebas solo emite en el ambiente de pruebas');

    await form.getByLabel('Ambiente').selectOption('pruebas');
    await pulsar(page, form.getByLabel('Aplicar la detracción en las facturas en soles desde el umbral'), 'Space');
    await form.getByLabel('Tasa (%)').fill('12');
    await form.getByLabel('Umbral en soles (con IGV)').fill('700');
    await pulsar(page, form.getByRole('button', { name: 'Guardar los datos fiscales' }));
    await expect(page.getByRole('status').filter({ hasText: 'Se guardaron los datos fiscales.' })).toBeVisible();
    await expect(form.getByLabel('Serie de boletas')).toHaveValue('B002');
    await expect(form.getByLabel('Aplicar la detracción en las facturas en soles desde el umbral')).toBeChecked();
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });
}

test('HU-1707 · «Facturación» está en el menú Ventas del superadmin y no en el de un administrador', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', facturacionSitio: { comprobantes: COMPROBANTES } });
  await page.goto('/ventas/pasarelas');
  await page.getByRole('link', { name: 'Facturación' }).click();
  await expect(page).toHaveURL(/\/ventas\/facturacion$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Facturación' })).toBeVisible();
});

test('HU-1707 · un administrador no ve Ventas › Facturación', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // HU-1711: el administrador sí tiene «Facturación» en Empresa (/facturacion), pero nunca la de Ventas.
  await expect(page.locator('a[href="/ventas/facturacion"]')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Facturación' })).toHaveAttribute('href', '/facturacion');
  await page.goto('/ventas/facturacion');
  await expect(page.getByRole('heading', { level: 1, name: 'Facturación' })).toHaveCount(0);
});
