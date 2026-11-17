// HU-1706 · Plan y suscripción (REQ-086, CP-147, RN-18-7). El administrador ve su plan y la cuota, revisa el prorrateo
// antes de confirmar, sube de Inicial a Productora pagando la diferencia (S/ 400 + IGV = S/ 472 con 15 de 30 días) y la
// cuota sube de inmediato; programa una bajada para la renovación; cancela al fin del período con confirmación y la
// reanuda con «Seguir con mi plan». Todo con el teclado; axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).include('main').withTags(REGLAS).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const pulsar = async (page: Page, control: Locator) => { await control.focus(); await page.keyboard.press('Enter'); };

for (const ancho of [1280, 390]) {
  test(`CP-147 · sube de Inicial a Productora pagando el prorrateo y la cuota sube de inmediato (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', entornoSitio: 'pruebas', cuotaSitio: { incluidas: 8, usadas: 8, plan: 'inicial' } });
    await page.goto('/plan');
    await expect(page.getByRole('heading', { level: 1, name: 'Plan y suscripción' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tu plan: Inicial' })).toBeVisible();
    await expect(page.getByText('Se renueva el 10 de diciembre de 2026.')).toBeVisible();
    const cuota = page.getByRole('region', { name: 'Cuota de cápsulas' });
    await expect(cuota).toContainText('Cápsulas del mes: 8 de 8');
    const planes = page.getByRole('region', { name: 'Cambiar de plan' });
    await expect(planes.getByRole('listitem')).toHaveCount(4);
    await expect(planes.getByRole('listitem').filter({ hasText: 'Inicial' })).toContainText('Tu plan');
    await expect(planes.getByRole('listitem').filter({ hasText: 'Corporativo' })).toContainText('Con una demo');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // Vista previa: el desglose antes de confirmar, con el foco en su título.
    await pulsar(page, planes.getByRole('button', { name: 'Cambiar a Productora' }));
    const resumen = page.getByRole('region', { name: 'Cambiar a Productora' });
    await expect(resumen.getByRole('heading', { name: 'Cambiar a Productora' })).toBeFocused();
    await expect(resumen).toContainText('Pasas de Inicial a Productora hoy y tu cuota sube a 20 cápsulas al mes.');
    const desglose = resumen.getByRole('definition');
    await expect(desglose).toHaveText(['15 de 30', 'S/ 400.00', 'S/ 72.00', 'S/ 472.00']);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // «Volver» no cambia nada.
    await pulsar(page, resumen.getByRole('button', { name: 'Volver' }));
    await expect(page.getByRole('heading', { name: 'Tu plan: Inicial' })).toBeVisible();

    // Confirmar y pagar: primero una tarjeta rechazada, después la que aprueba.
    await pulsar(page, planes.getByRole('button', { name: 'Cambiar a Productora' }));
    await pulsar(page, resumen.getByRole('button', { name: 'Confirmar y pagar S/ 472.00' }));
    const pago = page.getByRole('form', { name: 'Pago del cambio de plan' });
    const tarjeta = pago.getByLabel('Tarjeta de prueba');
    await expect(tarjeta).toBeFocused();
    await sinViolaciones(page);
    await page.keyboard.type('4000 0000 0000 0002');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('La tarjeta de prueba fue rechazada');
    await expect(page.getByRole('heading', { name: 'Tu plan: Inicial' })).toBeVisible();

    await pulsar(page, planes.getByRole('button', { name: 'Cambiar a Productora' }));
    await pulsar(page, resumen.getByRole('button', { name: 'Confirmar y pagar S/ 472.00' }));
    await expect(tarjeta).toBeFocused();
    await page.keyboard.type('4111 1111 1111 1111');
    await pulsar(page, pago.getByRole('button', { name: 'Pagar S/ 472.00' }));
    await expect(page.getByRole('status').filter({ hasText: 'Listo: ya tienes el plan Productora. Tu cuota es de 20 cápsulas al mes desde ahora.' })).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Tu plan: Productora' })).toBeVisible();
    await expect(cuota).toContainText('Cápsulas del mes: 8 de 20');
    await expect(planes.getByRole('listitem').filter({ hasText: 'Productora' })).toContainText('Tu plan');
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });

  test(`CP-147 · programa una bajada para la renovación, cancela al fin del período y sigue con su plan (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', entornoSitio: 'pruebas', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' } });
    await page.goto('/plan');
    const planes = page.getByRole('region', { name: 'Cambiar de plan' });

    // Bajada: sin cobro, rige al renovar.
    await pulsar(page, planes.getByRole('button', { name: 'Cambiar a Inicial' }));
    const resumen = page.getByRole('region', { name: 'Cambiar a Inicial' });
    await expect(resumen.getByRole('heading', { name: 'Cambiar a Inicial' })).toBeFocused();
    await expect(resumen).toContainText('Desde el 10 de diciembre de 2026 pasas a Inicial');
    await expect(resumen).toContainText('No se cobra nada ahora ni se devuelve la diferencia.');
    await sinViolaciones(page);
    await pulsar(page, resumen.getByRole('button', { name: 'Confirmar el cambio' }));
    await expect(page.getByRole('status').filter({ hasText: 'Listo: desde el 10 de diciembre de 2026 pasas a Inicial.' })).toBeVisible();
    await expect(page.getByText('El 10 de diciembre de 2026 pasas a Inicial (8 cápsulas al mes).')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Tu plan: Productora' })).toBeVisible();
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // «Seguir con mi plan» quita la bajada programada.
    await pulsar(page, page.getByRole('button', { name: 'Seguir con mi plan' }));
    await expect(page.getByRole('status').filter({ hasText: 'Listo: sigues con Productora.' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Seguir con mi plan' })).toHaveCount(0);

    // Cancelar al fin del período, con confirmación; «No, seguir» no cancela.
    const cancelar = page.getByRole('region', { name: 'Cancelar la suscripción' });
    await pulsar(page, cancelar.getByRole('button', { name: 'Cancelar al fin del período' }));
    const confirmar = cancelar.getByRole('group', { name: 'Confirmar la cancelación' });
    await expect(confirmar).toContainText('Sigues con tu plan hasta el 10 de diciembre de 2026');
    await expect(confirmar).toContainText('No se devuelve lo pagado.');
    await sinViolaciones(page);
    await pulsar(page, confirmar.getByRole('button', { name: 'No, seguir' }));
    await expect(confirmar).toHaveCount(0);
    await pulsar(page, cancelar.getByRole('button', { name: 'Cancelar al fin del período' }));
    await pulsar(page, confirmar.getByRole('button', { name: 'Sí, cancelar al fin del período' }));
    await expect(page.getByRole('status').filter({ hasText: 'Listo: tu suscripción termina el 10 de diciembre de 2026.' })).toBeVisible();
    await expect(page.getByText('Tu suscripción termina el 10 de diciembre de 2026.', { exact: true })).toBeVisible();
    await expect(page.getByText('Pediste cancelar: hasta el 10 de diciembre de 2026 sigues con Productora')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cancelar la suscripción' })).toHaveCount(0);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    await pulsar(page, page.getByRole('button', { name: 'Seguir con mi plan' }));
    await expect(page.getByRole('status').filter({ hasText: 'Listo: sigues con Productora.' })).toBeVisible();
    await expect(page.getByText('Se renueva el 10 de diciembre de 2026.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Cancelar la suscripción' })).toBeVisible();
  });
}

test('HU-1706 · «Plan y suscripción» solo aparece en el menú del administrador', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' } });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Plan y suscripción' })).toHaveCount(0);
});

test('HU-1706 · el administrador llega a «Plan y suscripción» desde el menú', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: { incluidas: 20, usadas: 3, plan: 'productora' } });
  await page.goto('/');
  await page.getByRole('link', { name: 'Plan y suscripción' }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole('heading', { name: 'Tu plan: Productora' })).toBeVisible();
});

test('HU-1706 · con Stripe, la subida va a la página alojada y vuelve a /plan con el plan nuevo', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: { incluidas: 8, usadas: 2, plan: 'inicial', pago: 'redireccion' } });
  await page.goto('/plan');
  await page.getByRole('region', { name: 'Cambiar de plan' }).getByRole('button', { name: 'Cambiar a Productora' }).click();
  await page.getByRole('button', { name: 'Confirmar y pagar S/ 472.00' }).click();
  await expect(page.getByRole('heading', { name: 'Stripe Checkout (simulado)' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a Aptio SCORM' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Listo: ya tienes el plan Productora.' })).toBeVisible();
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole('heading', { name: 'Tu plan: Productora' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cuota de cápsulas' })).toContainText('Cápsulas del mes: 2 de 20');
});
