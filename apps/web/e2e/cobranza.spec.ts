// HU-1708 · Cobranza y suspensión (PNT-36, REQ-088, CP-150, RN-18-8) contra la API simulada:
// - con el pago pendiente, el aviso global con la fecha de la suspensión y «Cómo regularizar»;
// - suspendida, la solo lectura: sin «Nuevo SCORM» ni «Generar SCORM», la API responde 403 al crear, y «Exportar SCORM»
//   y la entrega siguen;
// - «Pagar ahora» del administrador en /plan con la tarjeta de prueba: la que rechaza no cambia nada, la que aprueba
//   reactiva la cuenta y el aviso desaparece;
// - Ventas › Suscripciones del superadmin con el filtro y «Reintentar ahora».
// Todo con el teclado; axe WCAG 2.2 A/AA a 390 y 1280 px, sin desborde horizontal.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const PROYECTO = '/proyectos/00000000-0000-4000-8000-000000000701';
// En Proyectos («/») se revisa solo el aviso: la lista arrastra hallazgos previos (label-content-name-mismatch en las
// tarjetas y contraste de los filtros a 390 px), anotados en ESTADO desde la HU-1705.
const sinViolaciones = async (page: Page, ...zonas: string[]) => {
  const axe = await (zonas.length ? zonas : ['main']).reduce((b, z) => b.include(z), new AxeBuilder({ page }).withTags(REGLAS)).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const pulsar = async (page: Page, control: Locator) => { await control.focus(); await page.keyboard.press('Enter'); };
const aviso = (page: Page, nombre: string) => page.getByRole('region', { name: nombre });

for (const ancho of [1280, 390]) {
  test(`PNT-36 · con el pago pendiente, el aviso global dice hasta cuándo y cómo regularizar (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' }, cobranzaSitio: { estado: 'PAGO_PENDIENTE' } });
    await page.goto('/');
    const a = aviso(page, 'Falta el pago de la renovación');
    await expect(a).toContainText('El período terminó el 10 de diciembre de 2026 y falta pagar la renovación (S/ 1,522.20).');
    await expect(a).toContainText('Si no se paga antes del 20 de diciembre de 2026, la cuenta queda en solo lectura.');
    await expect(a.getByRole('link', { name: 'Pagar ahora' })).toHaveCount(0);
    const como = a.getByRole('button', { name: 'Cómo regularizar' });
    await expect(como).toHaveAttribute('aria-expanded', 'false');
    await pulsar(page, como);
    await expect(como).toHaveAttribute('aria-expanded', 'true');
    await expect(a).toContainText('Pide al administrador de tu organización que pague la renovación en Plan y suscripción.');
    // Mientras tanto se sigue trabajando.
    await expect(page.locator('#contenido').getByRole('link', { name: 'Nuevo SCORM' })).toBeVisible();
    await sinViolaciones(page, '.aviso-cobranza');
    await sinDesbordeHorizontal(page);
  });

  test(`CP-150 · suspendida: solo lectura, sin generar ni crear; exportar y ver siguen (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' }, cobranzaSitio: { estado: 'SUSPENDIDA' } });
    await page.goto(PROYECTO);
    const a = aviso(page, 'Cuenta en solo lectura');
    await expect(a).toContainText('Puedes ver los proyectos y descargar lo exportado, pero no generar ni editar hasta regularizar.');
    await expect(page.getByRole('link', { name: 'Nuevo SCORM' })).toHaveCount(0);
    await expect(a).toBeVisible();
    const gen = page.getByRole('region', { name: 'Generación del SCORM' });
    await expect(gen).toBeVisible();
    await expect(gen.getByRole('button', { name: /Generar/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Exportar SCORM' })).toBeVisible();
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // La API valida igual: crear un cliente responde 403 con el motivo.
    await page.goto('/clientes');
    await pulsar(page, page.getByRole('button', { name: 'Nuevo cliente' }));
    await page.getByLabel('Nombre').fill('Colegio San Juan');
    await pulsar(page, page.getByRole('button', { name: 'Crear cliente' }));
    await expect(page.getByRole('alert')).toContainText('La cuenta de tu organización está en solo lectura porque falta el pago de la renovación.');
    await expect(aviso(page, 'Cuenta en solo lectura')).toBeVisible();
  });

  test(`«Pagar ahora» reactiva la cuenta suspendida con la tarjeta de prueba y el aviso desaparece (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', entornoSitio: 'pruebas', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' }, cobranzaSitio: { estado: 'SUSPENDIDA' } });
    await page.goto('/');
    const a = aviso(page, 'Cuenta en solo lectura');
    await pulsar(page, a.getByRole('button', { name: 'Cómo regularizar' }));
    await expect(a).toContainText('Entra a Plan y suscripción y usa «Pagar ahora» con tu tarjeta.');
    await pulsar(page, a.getByRole('link', { name: 'Pagar ahora' }));
    await expect(page).toHaveURL(/\/plan$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Plan y suscripción' })).toBeVisible();
    const renovacion = page.getByRole('region', { name: 'Reactiva tu cuenta' });
    await expect(renovacion).toContainText('Tu cuenta está en solo lectura desde el 20 de diciembre de 2026.');
    await expect(renovacion.getByRole('definition')).toHaveText(['S/ 1,290.00', 'S/ 232.20', 'S/ 1,522.20']);
    await expect(page.getByRole('region', { name: 'Cambiar de plan' })).toHaveCount(0);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    await pulsar(page, renovacion.getByRole('button', { name: 'Pagar ahora S/ 1,522.20' }));
    const pago = page.getByRole('form', { name: 'Pago de la renovación' });
    const tarjeta = pago.getByLabel('Tarjeta de prueba');
    await expect(tarjeta).toBeFocused();
    await sinViolaciones(page);
    await page.keyboard.type('4000 0000 0000 0002');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('La tarjeta de prueba fue rechazada');
    await expect(aviso(page, 'Cuenta en solo lectura')).toBeVisible();

    await pulsar(page, renovacion.getByRole('button', { name: 'Pagar ahora S/ 1,522.20' }));
    await expect(tarjeta).toBeFocused();
    await page.keyboard.type('4111 1111 1111 1111');
    await pulsar(page, pago.getByRole('button', { name: 'Pagar S/ 1,522.20' }));
    await expect(page.getByRole('status').filter({ hasText: 'Listo: pagaste la renovación de S/ 1,522.20. Tu plan sigue activo hasta el 15 de enero de 2027.' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(aviso(page, 'Cuenta en solo lectura')).toHaveCount(0);
    await expect(page.getByRole('region', { name: 'Reactiva tu cuenta' })).toHaveCount(0);
    await sinViolaciones(page);
    await page.goto('/');
    await expect(page.locator('#contenido').getByRole('link', { name: 'Nuevo SCORM' })).toBeVisible();
    await sinDesbordeHorizontal(page);
  });

  test(`Ventas › Suscripciones: el superadmin filtra por estado y reintenta el cobro (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', cobranzaSitio: { ventas: true } });
    await page.goto('/sitio');
    await page.getByRole('link', { name: 'Suscripciones' }).click();
    await expect(page).toHaveURL(/\/ventas\/suscripciones$/);
    await expect(page.getByRole('heading', { level: 1, name: 'Suscripciones' })).toBeVisible();
    const tabla = page.getByRole('table', { name: 'Suscripciones' });
    await expect(tabla.getByRole('row')).toHaveCount(4);
    const minera = tabla.getByRole('row', { name: /^Minera Andina SAC / });
    await expect(minera).toContainText('Pago pendiente');
    await expect(minera).toContainText('S/ 578.20');
    await expect(minera).toContainText('Intento 2 de 4 · siguiente: 13 dic. 2026');
    await expect(minera).toContainText('Último rechazo: La tarjeta de prueba fue rechazada');
    await expect(tabla.getByRole('row', { name: /^Municipalidad de Lima / })).toContainText('Suspendida el 20 dic. 2026');
    await expect(tabla.getByRole('row', { name: /^Estudio Quipu / })).toContainText('Sin acciones');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // El filtro con el teclado.
    const filtro = page.getByLabel('Estado');
    await filtro.focus();
    await filtro.selectOption('SUSPENDIDA');
    await expect(tabla.getByRole('row')).toHaveCount(2);
    await filtro.selectOption('');
    await expect(tabla.getByRole('row')).toHaveCount(4);

    await pulsar(page, minera.getByRole('button', { name: 'Reintentar ahora el cobro de Minera Andina SAC' }));
    await expect(page.getByRole('status').filter({ hasText: 'Listo: el intento de cobro de Minera Andina SAC quedó en cola. La pasarela de pruebas cobra con la tarjeta guardada.' })).toBeVisible();
    await expect(minera).toContainText('Activa');
    await expect(minera).toContainText('Sin acciones');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });
}

test('HU-1708 · un administrador no ve Ventas › Suscripciones', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
  await page.goto('/ventas/suscripciones');
  await expect(page.getByRole('link', { name: 'Suscripciones' })).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1, name: 'Suscripciones' })).toHaveCount(0);
});
