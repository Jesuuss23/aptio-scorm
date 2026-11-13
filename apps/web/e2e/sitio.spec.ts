// HU-1501 · CP-109: el superadmin de plataforma entra directo a «Sitio web › Resumen» y solo ve ese grupo; el
// administrador de una organización (y el resto de los roles) no ve el grupo ni puede abrir la vista. axe WCAG 2.2 A/AA.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });

test('el superadmin entra a Sitio web › Resumen y solo ve ese grupo', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN' });
  const pedido = page.waitForRequest((r) => r.url().endsWith('/api/v1/sitio/paginas'));
  await page.goto('/');
  await expect(page).toHaveURL('/sitio');
  await pedido;
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible();
  await expect(page.getByText('El sitio todavía no tiene páginas.')).toBeVisible();
  await expect(menu(page).getByText('Sitio web')).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Resumen' })).toBeVisible();
  // Sin organización: no ve Proyectos, Clientes ni Empresa, y otra ruta lo devuelve al sitio.
  for (const otro of ['Proyectos', 'Clientes y kits', 'Rentabilidad', 'Operación']) await expect(menu(page).getByRole('link', { name: otro })).toHaveCount(0);
  await page.goto('/clientes');
  await expect(page).toHaveURL('/sitio');
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

for (const rol of ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR', 'REVISOR_CLIENTE']) {
  test(`CP-109: ${rol} no ve el grupo «Sitio web» ni puede abrirlo`, async ({ page }) => {
    await simularApi(page, { conSesion: true, rol });
    await page.goto('/');
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByText('Sitio web')).toHaveCount(0);
    await expect(menu(page).getByRole('link', { name: 'Resumen' })).toHaveCount(0);
    await page.goto('/sitio');
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });
}
