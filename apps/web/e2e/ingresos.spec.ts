// HU-1710 · Panel de ingresos de Ventas › Planes (REQ-090, CP-152, PNT-35): los 4 indicadores del mes (ingreso mensual
// recurrente con los dólares aparte y el ingreso en riesgo, suscripciones activas, cancelación mensual con su variación
// e ingreso promedio por cliente) y el cambio de mes con el teclado. axe WCAG 2.2 A/AA a 390 y 1280 px. Solo el
// superadmin. El reloj del navegador y el de la simulación quedan en el 17 de noviembre de 2026 (hora de Lima).
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import type { SuscripcionIngresoSim } from './ingresos-simulados';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const AHORA = '2026-11-17T20:00:00.000Z';
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const pulsar = async (page: Page, control: Locator) => { await expect(control).toBeEnabled(); await control.focus(); await page.keyboard.press('Enter'); };

let n = 0;
const sus = (x: Partial<SuscripcionIngresoSim> = {}): SuscripcionIngresoSim => ({
  organizacionId: `org-${++n}`, estado: 'ACTIVA', ciclo: 'MENSUAL', precioPactadoSinIgv: 1290, moneda: 'PEN', cancelarAlFin: false, canceladaEn: null, creadoEn: '2026-09-01T15:00:00Z',
  porcentajeDescuento: null, ciclosDescuentoRestantes: null, ...x,
});
/** CP-152: S/ 13,834 al mes vigentes, más una cancelada en noviembre y una suspendida que no cuentan, y una en dólares. */
const SUSCRIPCIONES = [
  sus({ precioPactadoSinIgv: 490 }),
  sus({ precioPactadoSinIgv: 1290 }),
  sus({ precioPactadoSinIgv: 1290, estado: 'PAGO_PENDIENTE' }),
  sus({ precioPactadoSinIgv: 2990 }),
  sus({ precioPactadoSinIgv: 2990, cancelarAlFin: true }),
  sus({ ciclo: 'ANUAL', precioPactadoSinIgv: 28704 }),
  sus({ ciclo: 'ANUAL', precioPactadoSinIgv: 28704 }),
  sus({ precioPactadoSinIgv: 2990, estado: 'CANCELADA', canceladaEn: '2026-11-10T15:00:00Z' }),
  sus({ precioPactadoSinIgv: 1290, estado: 'SUSPENDIDA' }),
  sus({ precioPactadoSinIgv: 349, moneda: 'USD' }),
];
const indicador = (page: Page, nombre: string) => page.locator('.ingresos .res-indicadores > div').filter({ has: page.getByRole('term').filter({ hasText: nombre }) });

for (const ancho of [1280, 390]) {
  test(`CP-152 · el ingreso recurrente muestra S/ 13,834 sin las canceladas ni las suspendidas; cambio de mes con el teclado (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await page.clock.setFixedTime(new Date(AHORA));
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', planesSitio: { ejemplo: true }, ingresosSitio: { suscripciones: SUSCRIPCIONES, ahora: AHORA } });
    await page.goto('/ventas/planes');
    const panel = page.getByRole('region', { name: 'Ingresos de noviembre de 2026' });
    await expect(panel).toBeVisible();
    const mrr = indicador(page, 'Ingreso mensual recurrente');
    await expect(mrr).toContainText('S/ 13,834');
    await expect(mrr).toContainText('y US$ 349 en dólares');
    await expect(mrr).toContainText('En riesgo: S/ 2,990 de las que cancelan al fin del período');
    const activas = indicador(page, 'Suscripciones activas');
    await expect(activas).toContainText('8');
    await expect(activas).toContainText('7 en soles y 1 en dólares');
    const cancelacion = indicador(page, 'Cancelación mensual');
    await expect(cancelacion).toContainText('11.1 %');
    await expect(cancelacion).toContainText('11.1 puntos más que octubre de 2026');
    await expect(cancelacion).toContainText('1 de 9 vigentes al empezar el mes');
    const arpu = indicador(page, 'Ingreso promedio por cliente');
    await expect(arpu).toContainText('S/ 1,976.29');
    await expect(arpu).toContainText('y US$ 349 en dólares');
    await expect(page.getByRole('status').filter({ hasText: 'Ingresos de noviembre de 2026: S/ 13,834 al mes y US$ 349.' })).toBeAttached();
    await expect(panel.getByRole('button', { name: /^Mes siguiente/ })).toBeDisabled();
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // Octubre: la cancelada en noviembre todavía cuenta y nadie canceló.
    await pulsar(page, panel.getByRole('button', { name: 'Mes anterior: octubre de 2026' }));
    const octubre = page.getByRole('region', { name: 'Ingresos de octubre de 2026' });
    await expect(octubre).toBeVisible();
    await expect(octubre.getByRole('button', { name: 'Mes anterior: setiembre de 2026' })).toBeFocused();
    await expect(indicador(page, 'Ingreso mensual recurrente')).toContainText('S/ 16,824');
    await expect(indicador(page, 'Suscripciones activas')).toContainText('9');
    await expect(indicador(page, 'Cancelación mensual')).toContainText('0.0 %');
    await expect(indicador(page, 'Cancelación mensual')).toContainText('Igual que setiembre de 2026');
    // `cancelarAlFin` es el de hoy (SUP-330): también se ve en riesgo en octubre.
    await expect(indicador(page, 'Ingreso mensual recurrente')).toContainText('En riesgo: S/ 2,990');
    await sinViolaciones(page);

    // Y de vuelta a noviembre con «Mes siguiente».
    await pulsar(page, octubre.getByRole('button', { name: 'Mes siguiente: noviembre de 2026' }));
    await expect(page.getByRole('region', { name: 'Ingresos de noviembre de 2026' })).toBeVisible();
    await expect(indicador(page, 'Ingreso mensual recurrente')).toContainText('S/ 13,834');
  });
}

test('HU-1710 · sin suscripciones, los indicadores quedan en 0 sin dividir entre 0', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.setFixedTime(new Date(AHORA));
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', planesSitio: { ejemplo: true }, ingresosSitio: { suscripciones: [], ahora: AHORA } });
  await page.goto('/ventas/planes');
  await expect(indicador(page, 'Ingreso mensual recurrente')).toContainText('S/ 0');
  await expect(indicador(page, 'Ingreso mensual recurrente')).not.toContainText('dólares');
  await expect(indicador(page, 'Cancelación mensual')).toContainText('0.0 %');
  await expect(indicador(page, 'Ingreso promedio por cliente')).toContainText('S/ 0');
});
