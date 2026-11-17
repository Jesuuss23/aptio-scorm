// HU-1705 · Cuotas de cápsulas (REQ-085, CP-146, RN-18-6). «Cápsulas del mes: 20 de 20» en Proyectos; al generar una
// cápsula nueva sin cuota, el aviso: el administrador compra de 1 a 10 adicionales (pasarela de pruebas o la página
// alojada de Stripe, que vuelve a Proyectos) o ve los planes; los demás roles saben que deben pedírselo. Todo con
// teclado; axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const PROYECTO = '/proyectos/00000000-0000-4000-8000-000000000702';
// En Proyectos («/») se revisa solo la interfaz de la cuota: la lista de proyectos arrastra hallazgos previos a la
// HU-1705 (label-content-name-mismatch en las tarjetas y contraste de los filtros a 390 px), anotados en ESTADO.
const sinViolaciones = async (page: Page, ...zonas: string[]) => {
  const axe = await (zonas.length ? zonas : ['main']).reduce((b, z) => b.include(z), new AxeBuilder({ page }).withTags(REGLAS)).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const pulsar = async (page: Page, control: ReturnType<Page['getByRole']>) => { await control.focus(); await page.keyboard.press('Enter'); };

async function conTema(page: Page) {
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('O escribe solo el tema', { exact: false }).fill('Trabajo seguro en altura');
  await material.getByRole('button', { name: 'Agregar tema' }).click();
  const gen = page.getByRole('region', { name: 'Generación del SCORM' });
  // Con el teclado, Enter sobre el botón aún desactivado no hace nada: se espera a que el tema quede listo.
  await expect(gen.getByRole('button', { name: 'Generar SCORM' })).toBeEnabled();
  return gen;
}

for (const ancho of [1280, 390]) {
  test(`CP-146 · con 20 de 20, el administrador compra una adicional con el teclado y genera (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', entornoSitio: 'pruebas', cuotaSitio: { incluidas: 20, usadas: 20, plan: 'productora' } });
    await page.goto('/');
    const cuota = page.getByRole('region', { name: 'Cuota de cápsulas' });
    await expect(cuota).toContainText('Cápsulas del mes: 20 de 20');
    await expect(cuota.getByRole('progressbar', { name: 'Cápsulas usadas este mes' })).toHaveAttribute('aria-valuetext', '20 de 20');
    await expect(cuota).toContainText('No quedan cápsulas nuevas este mes. Se renueva el 10 de diciembre.');
    await expect(page.getByRole('region', { name: 'Cápsulas adicionales' })).toBeVisible();
    await sinViolaciones(page, '.cuota-capsulas', '.compra-adicionales');
    await sinDesbordeHorizontal(page);

    const gen = await conTema(page);
    await gen.getByRole('button', { name: 'Generar SCORM' }).click();
    const aviso = gen.getByRole('alert').filter({ hasText: 'Se agotaron las cápsulas de este mes' });
    await expect(aviso).toContainText('(20 de 20). Compra una cápsula adicional o sube de plan para generar esta. Las cápsulas en revisión siguen editables.');
    // HU-1706 · El administrador cambia de plan en la consola.
    await expect(aviso.getByRole('link', { name: 'Ver planes' })).toHaveAttribute('href', '/plan');
    await expect(gen.getByRole('list', { name: 'Etapas de la generación' })).toHaveCount(0);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);

    // Dos con el teclado: el botón dice cuántas y el total con IGV.
    await aviso.getByLabel('Cantidad').focus();
    await page.keyboard.press('ArrowDown');
    await expect(aviso.getByRole('button', { name: 'Comprar 2 cápsulas adicionales (S/ 162.84)' })).toBeVisible();
    await page.keyboard.press('ArrowUp');
    await pulsar(page, aviso.getByRole('button', { name: 'Comprar 1 cápsula adicional (S/ 81.42)' }));
    const tarjeta = aviso.getByLabel('Tarjeta de prueba');
    await expect(tarjeta).toBeFocused();
    await sinViolaciones(page);
    await page.keyboard.type('4000 0000 0000 0002');
    await page.keyboard.press('Enter');
    await expect(aviso.getByRole('alert')).toHaveText('La tarjeta de prueba fue rechazada');

    await pulsar(page, aviso.getByRole('button', { name: 'Comprar 1 cápsula adicional (S/ 81.42)' }));
    await expect(tarjeta).toBeFocused();
    await page.keyboard.type('4111 1111 1111 1111');
    await pulsar(page, aviso.getByRole('button', { name: 'Pagar S/ 81.42' }));
    await expect(gen.getByRole('status').filter({ hasText: 'Listo: se sumó 1 cápsula adicional. Ya puedes generar.' })).toBeVisible();
    await expect(gen.getByRole('alert')).toHaveCount(0);
    await pulsar(page, gen.getByRole('button', { name: 'Generar SCORM' }));
    await expect(gen.getByRole('list', { name: 'Etapas de la generación' }).getByRole('listitem')).toHaveCount(11);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });

  test(`CP-146 · otro rol ve que debe pedírselo al administrador, sin botón de compra (${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', cuotaSitio: { incluidas: 20, usadas: 20 } });
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Cuota de cápsulas' })).toContainText('Cápsulas del mes: 20 de 20');
    await expect(page.getByRole('region', { name: 'Cápsulas adicionales' })).toHaveCount(0);
    const gen = await conTema(page);
    await pulsar(page, gen.getByRole('button', { name: 'Generar SCORM' }));
    const aviso = gen.getByRole('alert').filter({ hasText: 'Se agotaron las cápsulas de este mes' });
    await expect(aviso).toContainText('Pide al administrador de tu organización que compre una cápsula adicional o suba de plan. Las cápsulas en revisión siguen editables.');
    await expect(aviso.getByRole('button')).toHaveCount(0);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
  });
}

test('con Stripe, la compra va a la página alojada y vuelve a Proyectos con la cuota actualizada', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: { incluidas: 20, usadas: 20, pago: 'redireccion' } });
  await page.goto('/');
  const adicionales = page.getByRole('region', { name: 'Cápsulas adicionales' });
  await pulsar(page, adicionales.getByRole('button', { name: 'Comprar 1 cápsula adicional (S/ 81.42)' }));
  await expect(page.getByRole('heading', { name: 'Stripe Checkout (simulado)' })).toBeVisible();
  await page.getByRole('link', { name: 'Volver a Aptio SCORM' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Listo: se sumó 1 cápsula adicional. Ya puedes generar.' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Cuota de cápsulas' })).toContainText('Cápsulas del mes: 20 de 21 · incluye 1 cápsula adicional');
  await expect(page.getByRole('region', { name: 'Cápsulas adicionales' })).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
  await sinViolaciones(page, '.cuota-capsulas', '[role="status"]');
});

test('un plan sin límite muestra lo usado en el mes, sin barra ni compra', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: { incluidas: null, usadas: 3 } });
  await page.goto('/');
  const cuota = page.getByRole('region', { name: 'Cuota de cápsulas' });
  await expect(cuota).toHaveText('Cápsulas del mes: 3 · sin límite');
  await expect(cuota.getByRole('progressbar')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Cápsulas adicionales' })).toHaveCount(0);
});
