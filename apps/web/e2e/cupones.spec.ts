// HU-1709 · Cupones y convenios (REQ-089, CP-151, PNT-37). En /pago, el «Código de cupón» del paso 2 con «Aplicar»:
// un cupón vigente descuenta al céntimo sobre el precio de lista, con el IGV sobre la base descontada, y llega al
// checkout; uno vencido, o un convenio con un correo de otro dominio, se rechaza con el motivo en la región aria-live y
// el total no cambia. En Ventas › Facturación, la pestaña Cupones crea, edita, oculta y activa (sin borrar) y muestra los
// usos. Todo con el teclado; axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import { checkoutsSim } from './suscripciones-simuladas';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000030${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000030${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const SITIO = { conSesion: false, versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[1]!.id, 'precios')], planesSitio: { ejemplo: true }, entornoSitio: 'pruebas' as const };

const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const escribir = async (page: Page, campo: Locator, texto: string) => {
  await campo.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type(texto);
};
const pulsar = async (page: Page, control: Locator, tecla: 'Enter' | 'Space' = 'Enter') => {
  await expect(control).toBeEnabled();
  await control.focus();
  await page.keyboard.press(tecla);
};
const titulo = (page: Page, nombre: string) => page.getByRole('heading', { level: 2, name: nombre });

const empresa = async (page: Page, correo: string) => {
  await escribir(page, page.getByLabel('Razón social o nombre', { exact: true }), 'Minera Andina SAC');
  await escribir(page, page.getByLabel('Nombre de quien administrará la cuenta', { exact: true }), 'Ana Quispe');
  await escribir(page, page.getByLabel('Correo de quien administrará la cuenta', { exact: true }), correo);
  await page.getByLabel(/Acepto los términos/).focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(titulo(page, 'Resumen de tu suscripción')).toBeFocused();
};

for (const ancho of [1280, 390]) {
  test(`CP-151 · en /pago: un cupón vencido no cambia el total; uno vigente descuenta con IGV sobre la base y llega al pago (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    checkoutsSim.length = 0;
    await page.goto('/s/pago?plan=productora');
    await empresa(page, 'ana@minera.pe');

    const resumen = page.locator('.pg dl');
    const cupon = page.getByLabel('Código de cupón (opcional)', { exact: true });
    const mensaje = page.locator('#pg-cupon-m');
    await expect(mensaje).toHaveAttribute('aria-live', 'polite');
    await expect(resumen).toContainText('S/ 1,522.20');
    await sinViolaciones(page);

    // Vacío: pide el código.
    await cupon.focus();
    await page.keyboard.press('Enter');
    await expect(mensaje).toHaveText('Escribe el código del cupón');

    // Vencido: el motivo con la fecha y el total intacto.
    await escribir(page, cupon, 'verano26');
    await page.keyboard.press('Enter');
    await expect(mensaje).toHaveText('Este cupón venció el 31 de marzo de 2026. El total no cambia.');
    await expect(cupon).toBeFocused();
    await expect(cupon).toHaveAttribute('aria-invalid', 'true');
    await expect(resumen).not.toContainText('Descuento');
    await expect(resumen).toContainText('S/ 1,522.20');
    await sinViolaciones(page);

    // Un convenio con un correo de otro dominio.
    await escribir(page, cupon, 'CONVENIO-EDU');
    await page.keyboard.press('Enter');
    await expect(mensaje).toContainText('Este convenio es para correos institucionales');
    await expect(resumen).toContainText('S/ 1,522.20');

    // Vigente: −20 % sobre S/ 1,290.00 = S/ 258.00; base S/ 1,032.00; IGV S/ 185.76; total S/ 1,217.76.
    await escribir(page, cupon, 'lanzamiento26');
    await pulsar(page, page.getByRole('button', { name: 'Aplicar', exact: true }));
    await expect(mensaje).toHaveText('Cupón LANZAMIENTO26 aplicado: −20 % en los primeros 3 pagos.');
    await expect(page.getByRole('button', { name: 'Quitar el cupón' })).toBeFocused();
    await expect(resumen).toContainText('Descuento LANZAMIENTO26 (−20 %)');
    await expect(resumen).toContainText('−S/ 258.00');
    await expect(resumen).toContainText('S/ 185.76');
    await expect(resumen).toContainText('S/ 1,217.76');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // Quitar y volver a aplicar.
    await page.keyboard.press('Enter');
    await expect(mensaje).toHaveText('Quitaste el cupón: el total vuelve al precio del plan.');
    await expect(resumen).toContainText('S/ 1,522.20');
    await escribir(page, cupon, 'LANZAMIENTO26');
    await page.keyboard.press('Enter');
    await expect(resumen).toContainText('S/ 1,217.76');

    await pulsar(page, page.getByRole('button', { name: 'Continuar al pago' }));
    await expect(titulo(page, 'Pago')).toBeFocused();
    await escribir(page, page.getByLabel('Número de tarjeta', { exact: true }), '4111 1111 1111 1111');
    await pulsar(page, page.getByRole('button', { name: 'Pagar S/ 1,217.76' }));
    await expect(titulo(page, 'Tu suscripción está activa')).toBeFocused();
    await expect(page.getByRole('status').filter({ hasText: 'Productora' })).toContainText('S/ 1,217.76');
    await sinViolaciones(page);
    expect(checkoutsSim.map((c) => c.estado)).toEqual(['APROBADA']);
    expect(checkoutsSim[0]!.cuerpo).toMatchObject({ plan: 'productora', ciclo: 'MENSUAL', cupon: 'LANZAMIENTO26' });
  });
}

test('CP-151 · un convenio con el correo de su dominio se aplica también en anual', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  await page.goto('/s/pago?plan=productora');
  await empresa(page, 'ana@pucp.edu.pe');
  await page.getByRole('radio', { name: /Mensual/ }).focus();
  await page.keyboard.press('ArrowDown');
  await escribir(page, page.getByLabel('Código de cupón (opcional)', { exact: true }), 'convenio-edu');
  await page.keyboard.press('Enter');
  // −15 % sobre S/ 12,384.00 = S/ 1,857.60; base S/ 10,526.40; IGV S/ 1,894.75; total S/ 12,421.15.
  await expect(page.locator('#pg-cupon-m')).toHaveText('Cupón CONVENIO-EDU aplicado: −15 % en cada pago.');
  const resumen = page.locator('.pg dl');
  await expect(resumen).toContainText('−S/ 1,857.60');
  await expect(resumen).toContainText('S/ 1,894.75');
  await expect(resumen).toContainText('S/ 12,421.15');
});

for (const ancho of [1280, 390]) {
  test(`PNT-37 · pestaña Cupones: crea un convenio, edita, oculta sin borrar y vuelve a activar, con el teclado (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' });
    await page.goto('/ventas/facturacion');
    await page.getByRole('tab', { name: 'Comprobantes' }).focus();
    await page.keyboard.press('End');
    const pestana = page.getByRole('tab', { name: 'Cupones' });
    await expect(pestana).toBeFocused();
    await expect(pestana).toHaveAttribute('aria-selected', 'true');

    const tabla = page.getByRole('table', { name: 'Cupones' });
    await expect(tabla.getByRole('rowheader')).toHaveCount(4);
    const lanzamiento = tabla.getByRole('row', { name: /^LANZAMIENTO26 / });
    await expect(lanzamiento).toContainText('−20 % en los primeros 3 pagos');
    await expect(lanzamiento).toContainText('18 / 50');
    await expect(lanzamiento).toContainText('Activo');
    await expect(tabla.getByRole('row', { name: /^VERANO26 / })).toContainText('Vencido');
    await expect(tabla.getByRole('row', { name: /^PILOTO-30 / })).toContainText('Oculto');
    await expect(tabla.getByRole('row', { name: /^CONVENIO-EDU / })).toContainText('Convenio: pucp.edu.pe, uni.edu.pe');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // Nuevo: un convenio sin dominios no se guarda; con dominio, sí.
    await pulsar(page, page.getByRole('button', { name: 'Nuevo cupón' }));
    const form = page.getByRole('region', { name: 'Nuevo cupón' });
    await expect(form.getByRole('heading', { name: 'Nuevo cupón' })).toBeFocused();
    await escribir(page, form.getByLabel('Código', { exact: true }), 'convenio-colegio');
    await escribir(page, form.getByLabel('Nombre', { exact: true }), 'Convenio colegio de ingenieros');
    await form.getByLabel('Tipo', { exact: true }).selectOption('CONVENIO');
    await escribir(page, form.getByLabel('Descuento (%)', { exact: true }), '12');
    await pulsar(page, form.getByRole('button', { name: 'Crear el cupón' }));
    await expect(form.getByRole('alert')).toBeFocused();
    await expect(form.getByRole('alert')).toContainText(/dominio/i);
    await sinViolaciones(page);
    await escribir(page, form.getByLabel('Dominios de correo', { exact: true }), 'cip.org.pe');
    await pulsar(page, form.getByRole('button', { name: 'Crear el cupón' }));
    await expect(page.getByRole('status').filter({ hasText: 'Se creó el cupón CONVENIO-COLEGIO.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nuevo cupón' })).toBeFocused();
    const colegio = tabla.getByRole('row', { name: /^CONVENIO-COLEGIO / });
    await expect(colegio).toContainText('−12 % permanente');
    await expect(colegio).toContainText('0 / —');

    // Editar: el aviso de usos y el nuevo límite.
    await pulsar(page, lanzamiento.getByRole('button', { name: 'Editar LANZAMIENTO26' }));
    const edicion = page.getByRole('region', { name: 'Editar LANZAMIENTO26' });
    await expect(edicion.getByRole('heading', { name: 'Editar LANZAMIENTO26' })).toBeFocused();
    await expect(edicion).toContainText('Ya se usó 18 veces');
    await escribir(page, edicion.getByLabel('Límite de usos', { exact: true }), '60');
    await pulsar(page, edicion.getByRole('button', { name: 'Guardar el cupón' }));
    await expect(page.getByRole('status').filter({ hasText: 'Se guardó el cupón LANZAMIENTO26.' })).toBeVisible();
    await expect(lanzamiento).toContainText('18 / 60');

    // Ocultar no borra: conserva los usos; activar lo devuelve al pago.
    await pulsar(page, lanzamiento.getByRole('button', { name: 'Ocultar LANZAMIENTO26' }));
    await expect(page.getByRole('status').filter({ hasText: 'LANZAMIENTO26 quedó oculto: ya no se acepta en el pago y conserva sus 18 usos.' })).toBeVisible();
    await expect(lanzamiento).toContainText('Oculto');
    await expect(tabla.getByRole('rowheader')).toHaveCount(5);
    await pulsar(page, lanzamiento.getByRole('button', { name: 'Activar LANZAMIENTO26' }));
    await expect(page.getByRole('status').filter({ hasText: 'LANZAMIENTO26 vuelve a aceptarse en el pago.' })).toBeVisible();
    await expect(lanzamiento).toContainText('Activo');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });
}

test('PNT-37 · un código repetido muestra el aviso y no crea otro cupón', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' });
  await page.goto('/ventas/facturacion');
  await page.getByRole('tab', { name: 'Cupones' }).click();
  await page.getByRole('button', { name: 'Nuevo cupón' }).click();
  const form = page.getByRole('region', { name: 'Nuevo cupón' });
  await form.getByLabel('Código', { exact: true }).fill('lanzamiento26');
  await form.getByLabel('Nombre', { exact: true }).fill('Otro');
  await form.getByLabel('Descuento (%)', { exact: true }).fill('5');
  await form.getByRole('button', { name: 'Crear el cupón' }).click();
  await expect(form.getByRole('alert')).toContainText('Ya hay un cupón con ese código');
  await expect(page.getByRole('table', { name: 'Cupones' }).getByRole('rowheader')).toHaveCount(4);
});
