// HU-1704 · Ventas › Pasarelas (REQ-084, REQ-110, PNT-37, SUP-291). Una tarjeta por pasarela con «Mostrar en el pago»,
// el nombre, el modo y el orden; las llaves nunca se ven, solo los nombres de las variables que faltan. Los pagos
// aprobados sin cuenta se reembolsan con confirmación (si la pasarela falla, el aviso de error). Todo con teclado; axe
// WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import type { CobroSim } from './pasarelas-simuladas';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const COBRO: CobroSim = {
  id: '00000000-0000-4000-9700-000000000001', solicitudId: '00000000-0000-4000-9900-000000000001', suscripcionId: null, razonSocial: 'Global Learning LLC', correoAdmin: 'sam@global.example',
  nombrePlan: 'Productora', monto: 411.82, moneda: 'USD', pasarela: 'stripe', ultimos4Digitos: null, estado: 'APROBADO',
  motivoSinAlta: 'CORREO_EN_USO: el pago se aprobó pero el correo ya tenía una cuenta', reembolsoId: null, reembolsadoEn: null, creadoEn: '2026-11-17T15:00:00.000Z',
};
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const tarjeta = (page: Page, nombre: string) => page.getByRole('article', { name: nombre, exact: true });
const pulsar = async (page: Page, control: ReturnType<Page['getByRole']>, tecla: 'Space' | 'Enter' = 'Enter') => { await control.focus(); await page.keyboard.press(tecla); };

for (const ancho of [1280, 390]) {
  test(`mostrar, nombrar, cambiar de modo y ordenar las pasarelas con el teclado, sin ver secretos (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', pasarelasSitio: { stripe: true } });
    await page.goto('/ventas/pasarelas');
    await expect(page.getByRole('heading', { level: 1, name: 'Pasarelas' })).toBeVisible();
    const lista = page.getByRole('list', { name: 'Pasarelas' });
    await expect(lista.getByRole('heading', { level: 2 })).toHaveText(['Pasarela de pruebas', 'Culqi', 'Stripe']);
    await expect(tarjeta(page, 'Culqi')).toContainText('Sin llaves');
    await expect(tarjeta(page, 'Culqi')).toContainText('CULQI_LLAVE_PUBLICA_PRUEBAS, CULQI_LLAVE_SECRETA_PRUEBAS, CULQI_SECRETO_WEBHOOK_PRUEBAS');
    await expect(tarjeta(page, 'Stripe')).toContainText('Activa');
    await expect(tarjeta(page, 'Stripe')).toContainText('Cobra en dólares · Página de pago alojada por la pasarela');
    await expect(tarjeta(page, 'Pasarela de pruebas').getByLabel('Modo')).toBeDisabled();
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    const mostrar = page.getByRole('switch', { name: 'Mostrar Stripe en el pago' });
    await expect(mostrar).toHaveAttribute('aria-checked', 'false');
    await pulsar(page, mostrar, 'Space');
    await expect(page.getByRole('status')).toHaveText('«Stripe» quedó visible en el pago.');
    await expect(page.getByRole('switch', { name: 'Mostrar Stripe en el pago' })).toHaveAttribute('aria-checked', 'true');

    // Modo producción sin sus llaves: deja de estar activa y dice qué variables faltan.
    const stripe = tarjeta(page, 'Stripe');
    await stripe.getByLabel('Nombre visible').fill('Tarjeta internacional');
    await stripe.getByLabel('Modo').selectOption('produccion');
    await pulsar(page, stripe.getByRole('button', { name: 'Guardar' }));
    await expect(page.getByRole('status')).toHaveText('Se guardó «Tarjeta internacional».');
    const ti = tarjeta(page, 'Tarjeta internacional');
    await expect(ti).toContainText('Sin llaves');
    await expect(ti).toContainText('STRIPE_LLAVE_SECRETA_PRODUCCION');

    await pulsar(page, ti.getByRole('button', { name: 'Subir Tarjeta internacional' }));
    await expect(page.getByRole('status')).toHaveText('«Tarjeta internacional» quedó en la posición 2.');
    await expect(lista.getByRole('heading', { level: 2 })).toHaveText(['Pasarela de pruebas', 'Tarjeta internacional', 'Culqi']);
    await expect(page.locator('main')).not.toContainText(/\b(sk|pk|whsec)_(test|live)_/);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });
}

test('SUP-291 · reembolsar un pago aprobado sin cuenta, con confirmación; si la pasarela falla, el aviso de error', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', pasarelasSitio: { stripe: true, cobros: [COBRO], reembolsoFalla: true } });
  await page.goto('/ventas/pasarelas');
  const tabla = page.getByRole('table', { name: 'Pagos aprobados sin cuenta' });
  const fila = tabla.getByRole('row', { name: /Global Learning LLC/ });
  await expect(fila).toContainText('US$ 411.82');
  await expect(fila).toContainText('el pago se aprobó pero el correo ya tenía una cuenta');
  await sinViolaciones(page);

  await pulsar(page, fila.getByRole('button', { name: 'Reembolsar US$ 411.82 a Global Learning LLC' }));
  const confirmar = page.getByRole('group', { name: 'Confirmar el reembolso a Global Learning LLC' });
  await expect(confirmar).toContainText('¿Reembolsar US$ 411.82?');
  await sinViolaciones(page);
  await pulsar(page, confirmar.getByRole('button', { name: 'Sí, reembolsar' }));
  await expect(page.getByRole('alert')).toHaveText('No se reembolsó: La pasarela no completó el reembolso: intenta de nuevo en unos minutos');

  await pulsar(page, fila.getByRole('button', { name: 'Reembolsar US$ 411.82 a Global Learning LLC' }));
  await pulsar(page, page.getByRole('button', { name: 'Sí, reembolsar' }));
  await expect(page.getByRole('status')).toHaveText('Se reembolsaron US$ 411.82 a Global Learning LLC.');
  await expect(fila).toContainText('Reembolsado');
  await expect(fila.getByRole('button')).toHaveCount(0);
  await sinViolaciones(page);
});

test('sin pagos aprobados sin cuenta, lo dice; solo el superadmin ve Ventas › Pasarelas en el menú', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' });
  await page.goto('/ventas/pasarelas');
  await expect(page.getByText('No hay pagos aprobados sin cuenta.')).toBeVisible();
  await sinViolaciones(page);
});
