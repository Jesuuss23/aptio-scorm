// HU-1403 · Empresa › Operación (M15): las 4 tarjetas (errores por proveedor en 24 h y 7 días, colas, tiempo y costo por
// etapa y copias de seguridad), «Respaldar ahora» con la copia en curso, y solo administración ve la entrada del menú.
// axe WCAG 2.2 A/AA sin violaciones en la vista.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });
const fila = (page: Page, tabla: string, cabecera: string | RegExp) =>
  page.getByRole('table', { name: tabla }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: cabecera, exact: typeof cabecera === 'string' }) });
const violaciones = (page: Page) => new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze()
  .then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));

test('administración ve las 4 tarjetas y pide una copia con «Respaldar ahora»', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
  await page.goto('/');
  await menu(page).getByRole('link', { name: 'Operación' }).click();
  await expect(page).toHaveURL('/operacion');
  await expect(page.getByRole('heading', { level: 1, name: 'Operación' })).toBeVisible();

  // 1 · Errores por proveedor: 24 h, 7 días, el último error y los detenidos por el límite aparte.
  const claude = fila(page, 'Errores por proveedor', 'Claude (Anthropic)');
  await expect(claude.getByRole('cell')).toHaveText([/^1$/, /^3$/, /^142$/, /Salida no válida tras 3 intentos.*2 detenidos por el límite/]);
  await expect(fila(page, 'Errores por proveedor', 'Plataforma (cola export)')).toContainText('ENOSPC');
  await expect(fila(page, 'Errores por proveedor', 'Google').getByRole('cell').nth(1)).toHaveText('0');

  // 2 · Colas.
  await expect(fila(page, 'Colas de trabajo', 'ia').getByRole('cell')).toHaveText(['2', '1', '3']);
  await expect(page.getByRole('table', { name: 'Colas de trabajo' }).locator('tbody tr')).toHaveCount(5);

  // 3 · Tiempo y costo por etapa: las 11 etapas.
  await expect(page.getByRole('table', { name: 'Tiempo y costo por etapa' }).locator('tbody tr')).toHaveCount(11);
  await expect(fila(page, 'Tiempo y costo por etapa', /Pantallas con el kit/).getByRole('cell')).toHaveText(['4', '6 min 50 s', 'US$ 1.60', 'US$ 6.40']);
  await expect(fila(page, 'Tiempo y costo por etapa', /Ilustraciones/).getByRole('cell')).toHaveText(['0', '—', '—', 'US$ 0.00']);

  // 4 · Copias de seguridad.
  const copias = page.getByRole('region', { name: 'Copias de seguridad' });
  await expect(copias).toContainText('Se guardan 14 días');
  await expect(copias).toContainText('Última copia exitosa');
  const tabla = page.getByRole('table', { name: 'Copias de seguridad' });
  await expect(tabla.locator('tbody tr')).toHaveCount(2);
  await expect(tabla.locator('tbody tr').first()).toContainText('Exitosa');
  await expect(tabla.locator('tbody tr').first()).toContainText('700 MB');
  await expect(tabla.locator('tbody tr').first()).toContainText('3 min 5 s');
  await expect(tabla.locator('tbody tr').nth(1)).toContainText('Fallida');
  await expect(tabla.locator('tbody tr').nth(1)).toContainText('connection refused');
  expect(await violaciones(page)).toEqual([]);

  const pedido = page.waitForRequest((r) => r.method() === 'POST' && r.url().endsWith('/operacion/respaldar'));
  await copias.getByRole('button', { name: 'Respaldar ahora' }).click();
  await pedido;
  await expect(copias.getByRole('status')).toHaveText('Copia de seguridad en cola: aparece aquí en unos minutos.');
  await expect(tabla.locator('tbody tr')).toHaveCount(3);
  await expect(tabla.locator('tbody tr').first()).toContainText('En curso');
  await expect(tabla.locator('tbody tr').first()).toContainText('Manual');
  // Con una copia en curso no se pide otra.
  await expect(copias.getByRole('button', { name: 'Respaldar ahora' })).toBeDisabled();
  await expect(fila(page, 'Colas de trabajo', 'mantenimiento').getByRole('cell').first()).toHaveText('1');
  expect(await violaciones(page)).toEqual([]);
});

for (const rol of ['DISENADOR_INSTRUCCIONAL', 'PRODUCTOR', 'REVISOR_CLIENTE']) {
  test(`${rol} no ve Operación en el menú ni puede abrirla`, async ({ page }) => {
    await simularApi(page, { conSesion: true, rol });
    await page.goto('/');
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByRole('link', { name: 'Operación' })).toHaveCount(0);
    await page.goto('/operacion');
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });
}
