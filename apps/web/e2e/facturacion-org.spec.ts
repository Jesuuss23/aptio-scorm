// HU-1711 · Facturación de la organización (PNT-40, REQ-091, CP-153). El administrador ve las 4 secciones (plan y
// consumo, comprobantes, medio de pago y datos de facturación), descarga el PDF y el XML, cambia la tarjeta de prueba
// (solo los 4 últimos dígitos, sin CVV) y edita sus datos fiscales (la factura exige RUC; la boleta no, pero pide el DNI
// si el plan supera S/ 700 con IGV, HU-1712). Con Stripe ve el
// aviso del cobro por enlace. Todo con el teclado; axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import type { ComprobanteOrgSim } from './facturacion-org-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).include('main').withTags(REGLAS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const pulsar = async (page: Page, control: Locator) => { await expect(control).toBeEnabled(); await control.focus(); await page.keyboard.press('Enter'); };
const escribir = async (page: Page, campo: Locator, texto: string) => { await campo.focus(); await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Delete'); if (texto) await page.keyboard.type(texto); };

const COMPROBANTES: ComprobanteOrgSim[] = [
  { id: '00000000-0000-4000-8000-000000000903', tipo: 'NOTA_CREDITO', numeroCompleto: 'FC01-00000001', referencia: 'F001-00000007', emitidoEn: '2026-11-12T15:00:00Z', total: 1522.2 },
  { id: '00000000-0000-4000-8000-000000000902', tipo: 'FACTURA', numeroCompleto: 'F001-00000007', emitidoEn: '2026-11-10T15:00:00Z', total: 1522.2 },
  { id: '00000000-0000-4000-8000-000000000901', tipo: 'BOLETA', numeroCompleto: 'B001-00000003', emitidoEn: '2026-10-10T15:00:00Z', total: 578.2, estado: 'OBSERVADO', conPdf: false, conXml: false },
];

for (const ancho of [1280, 390]) {
  test(`PNT-40 · las 4 secciones, la descarga, el cambio de tarjeta y los datos de facturación con el teclado (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' }, facturacionOrgSitio: { comprobantes: COMPROBANTES } });
    await page.goto('/facturacion');
    await expect(page.getByRole('heading', { level: 1, name: 'Facturación' })).toBeVisible();

    // 1. Plan y consumo, con el enlace a Plan y suscripción.
    const plan = page.getByRole('region', { name: 'Plan y consumo' });
    await expect(plan).toContainText('Productora');
    await expect(plan).toContainText('S/ 1,290.00 al mes sin IGV');
    await expect(plan).toContainText('10 de diciembre de 2026');
    await expect(plan.getByRole('region', { name: 'Cuota de cápsulas' })).toContainText('Cápsulas del mes: 3 de 20');
    await expect(plan.getByRole('link', { name: /Plan y suscripción/ })).toHaveAttribute('href', '/plan');

    // 2. Comprobantes: tipo, serie-número, fecha, monto, estado y descargas cuando existen.
    const comprobantes = page.getByRole('region', { name: 'Comprobantes' });
    await expect(comprobantes.getByRole('row')).toHaveCount(4);
    const nota = comprobantes.getByRole('row').filter({ hasText: 'FC01-00000001' });
    await expect(nota).toContainText('Nota de crédito · corrige F001-00000007');
    await expect(nota).toContainText('S/ 1,522.20');
    await expect(nota).toContainText('Aceptado');
    const boleta = comprobantes.getByRole('row').filter({ hasText: 'B001-00000003' });
    await expect(boleta).toContainText('Observado');
    await expect(boleta.getByRole('button', { name: 'PDF de B001-00000003' })).toBeDisabled();
    await expect(boleta).toContainText('Archivos en preparación');
    for (const formato of ['PDF', 'XML']) {
      const descarga = page.waitForEvent('download');
      await pulsar(page, comprobantes.getByRole('button', { name: `${formato} de F001-00000007` }));
      expect((await descarga).suggestedFilename()).toBe(`20000000001-01-F001-00000007.${formato.toLowerCase()}`);
    }
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // 3. Medio de pago: con la pasarela de pruebas se cambia la tarjeta; solo quedan los 4 últimos dígitos.
    const medio = page.getByRole('region', { name: 'Medio de pago' });
    await expect(medio).toContainText('Pasarela de pruebas');
    await expect(medio).toContainText('Terminada en 1111');
    await expect(medio.getByLabel(/código de seguridad|CVV/i)).toHaveCount(0);
    const tarjeta = medio.getByLabel('Tarjeta de prueba nueva');
    await escribir(page, tarjeta, '5555 5555 5555 4444');
    await page.keyboard.press('Enter');
    await expect(medio.getByRole('alert')).toContainText('Usa una tarjeta de prueba');
    await expect(tarjeta).toHaveAttribute('aria-invalid', 'true');
    await escribir(page, tarjeta, '4000 0000 0000 0002');
    await page.keyboard.press('Enter');
    await expect(medio.getByRole('status')).toHaveText('Listo: los próximos cobros usan la tarjeta terminada en 0002.');
    await expect(medio).toContainText('Terminada en 0002');
    await expect(tarjeta).toHaveValue('');

    // 4. Datos de facturación: los del alta; la factura exige RUC; la boleta no.
    const datos = page.getByRole('region', { name: 'Datos de facturación' });
    await expect(datos).toContainText('Son los datos de tu alta');
    await expect(datos.getByRole('radio', { name: 'Factura (con RUC)' })).toBeChecked();
    const ruc = datos.getByLabel('RUC', { exact: true });
    await expect(ruc).toHaveValue('20100070970');
    await escribir(page, ruc, '');
    await escribir(page, datos.getByLabel('Correo de facturación'), 'no-es-correo');
    await pulsar(page, datos.getByRole('button', { name: 'Guardar los datos' }));
    await expect(datos.getByRole('alert')).toHaveText('Revisa los 2 campos marcados.');
    await expect(ruc).toBeFocused();
    await expect(datos).toContainText('Para recibir factura escribe el RUC');
    await expect(ruc).toHaveAttribute('aria-invalid', 'true');
    await escribir(page, ruc, '20100070971');
    await escribir(page, datos.getByLabel('Correo de facturación'), 'Facturas@Minera.pe');
    await escribir(page, datos.getByLabel('Dirección (opcional)'), 'Av. Javier Prado 123, Lima');
    await pulsar(page, datos.getByRole('button', { name: 'Guardar los datos' }));
    await expect(datos).toContainText('Revisa el RUC: el dígito verificador no coincide');
    await escribir(page, ruc, '20100070970');
    await pulsar(page, datos.getByRole('button', { name: 'Guardar los datos' }));
    await expect(datos.getByRole('status')).toContainText('Se guardaron tus datos de facturación: rigen para los próximos comprobantes');
    await expect(datos.getByLabel('Correo de facturación')).toHaveValue('facturas@minera.pe');
    await expect(datos).not.toContainText('Son los datos de tu alta');

    // La boleta admite el RUC vacío: se elige con las flechas del grupo de opciones.
    await datos.getByRole('radio', { name: 'Factura (con RUC)' }).focus();
    await page.keyboard.press('ArrowDown');
    await expect(datos.getByRole('radio', { name: 'Boleta' })).toBeChecked();
    const rucOpcional = datos.getByLabel('RUC (opcional)');
    await escribir(page, rucOpcional, '');
    // HU-1712 · El plan supera S/ 700 con IGV: la boleta pide el DNI del comprador.
    const dni = datos.getByLabel('DNI del comprador', { exact: true });
    await expect(dni).toHaveAccessibleDescription(/Tu plan supera S\/ 700 con IGV/);
    await pulsar(page, datos.getByRole('button', { name: 'Guardar los datos' }));
    await expect(dni).toBeFocused();
    await expect(dni).toHaveAttribute('aria-invalid', 'true');
    await expect(datos).toContainText('Las boletas de más de S/ 700 necesitan el DNI del comprador');
    await sinViolaciones(page);
    await escribir(page, dni, '4050 6089');
    await pulsar(page, datos.getByRole('button', { name: 'Guardar los datos' }));
    await expect(datos.getByRole('status')).toContainText('Se guardaron tus datos de facturación');
    await expect(rucOpcional).toHaveValue('');
    await expect(dni).toHaveValue('40506089');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // Y el enlace lleva a Plan y suscripción.
    await pulsar(page, plan.getByRole('link', { name: /Plan y suscripción/ }));
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Plan y suscripción' })).toBeVisible();
  });
}

test('SUP-319 · con Stripe no hay formulario de tarjeta: el cobro sigue por el enlace del correo', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' }, facturacionOrgSitio: { pasarela: 'stripe', ultimos4Digitos: null } });
  await page.goto('/facturacion');
  const medio = page.getByRole('region', { name: 'Medio de pago' });
  await expect(medio).toContainText('Stripe');
  await expect(medio).toContainText('No se guarda en Aptio SCORM');
  await expect(medio).toContainText('cada renovación te llega por correo con el enlace para pagar');
  await expect(medio.getByRole('textbox')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Comprobantes' })).toContainText('Aún no tienes comprobantes.');
  await sinViolaciones(page);
});

test('HU-1711 · «Facturación» solo aparece en el menú del administrador y lleva a la vista', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' } });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Facturación' })).toHaveCount(0);
});

test('HU-1711 · el administrador llega a «Facturación» desde el menú', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' } });
  await page.goto('/');
  await page.getByRole('link', { name: 'Facturación' }).click();
  await expect(page).toHaveURL(/\/facturacion$/);
  await expect(page.getByRole('region', { name: 'Datos de facturación' })).toBeVisible();
});
