// HU-1702 · Planes administrables (REQ-082, PNT-35, CP-141, CP-142). En el panel, Ventas › Planes: una tarjeta por plan
// con «Mostrar plan» y «Destacar», sus campos, el orden y las características; la tarjeta «Página de precios». En el
// sitio, /precios sale de la versión publicada: el precio nuevo y el plan oculto se ven al publicar. En producción un
// plan ficticio visible bloquea publicar. Todo con teclado; axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000010${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const bloque = (n: number, paginaId: string, tipo: string, orden = 0) => ({ id: `00000000-0000-4000-9100-00000000010${n}`, paginaId, tipo, orden, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const BLOQUES = [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[0]!.id, 'planes', 1), bloque(2, PAGINAS[1]!.id, 'precios'), bloque(3, PAGINAS[1]!.id, 'cta', 1)];
const SITIO = { conSesion: true, rol: 'SUPERADMIN', versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES, planesSitio: { ejemplo: true } };

const sinViolaciones = async (page: Page, soloMain = true) => {
  const b = new AxeBuilder({ page }).withTags(REGLAS);
  const axe = await (soloMain ? b.include('main') : b).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const sinDesbordeHorizontal = async (page: Page) => expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
const tarjeta = (page: Page, nombre: string) => page.getByRole('article', { name: nombre, exact: true });
const tarjetaSitio = (page: Page, nombre: string) => page.locator('article.plan').filter({ has: page.getByRole('heading', { name: nombre, exact: true }) });
/** Activa un control con el teclado: foco y Espacio (o Enter). */
const pulsar = async (page: Page, control: ReturnType<Page['getByRole']>, tecla: 'Space' | 'Enter' = 'Space') => { await control.focus(); await page.keyboard.press(tecla); };
/** «Publicar cambios» se habilita cuando el panel ya leyó que hay cambios sin publicar. */
const publicar = async (page: Page) => {
  const boton = page.getByRole('button', { name: 'Publicar cambios' });
  await expect(boton).toBeEnabled();
  await pulsar(page, boton, 'Enter');
};

test('CP-141 · subir la Productora a S/ 1.390 con el teclado y publicar: /precios muestra el precio nuevo y el botón lleva al pago con el plan', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  await page.goto('/s/precios');
  await expect(tarjetaSitio(page, 'Productora')).toContainText('S/ 1,290');

  await page.goto('/ventas/planes');
  await expect(page.getByRole('heading', { level: 1, name: 'Planes' })).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Planes' })).toHaveAttribute('aria-current', 'page');
  const productora = tarjeta(page, 'Productora');
  await expect(productora.getByText('Más elegido', { exact: true })).toBeVisible();
  await expect(productora.getByText('/productora · S/ 1,290 al mes + IGV · S/ 12,384 al año')).toBeVisible();
  const precio = productora.getByLabel('Precio al mes (S/, sin IGV)');
  await precio.focus();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.type('1390');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Productora' })).toHaveText('Se guardó «Productora». Publica el sitio para que se vea en /precios.');
  await expect(tarjeta(page, 'Productora').getByText('/productora · S/ 1,390 al mes + IGV · S/ 13,344 al año')).toBeVisible();
  await expect(page.getByText('Cambios sin publicar')).toBeVisible();

  // Sin publicar, el sitio sigue con el precio anterior.
  await page.goto('/s/precios');
  await expect(tarjetaSitio(page, 'Productora')).toContainText('S/ 1,290');
  await page.goto('/ventas/planes');
  await publicar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó' })).toContainText('Se publicó la versión 2');

  await page.goto('/s/precios');
  const enSitio = tarjetaSitio(page, 'Productora');
  await expect(enSitio).toContainText('S/ 1,390');
  await expect(enSitio).toContainText('o S/ 13,344 al año (ahorras S/ 3,336)');
  await expect(enSitio.getByText('Más elegido', { exact: true })).toBeVisible();
  await expect(enSitio.getByRole('link', { name: 'Suscribirme' })).toHaveAttribute('href', '/s/pago?plan=productora');
  await expect(tarjetaSitio(page, 'Empresa').getByText('A medida', { exact: true })).toBeVisible();
  await expect(page.locator('script[src*="plan"]')).toHaveCount(0);
  // El resumen del inicio enlaza a la página de precios.
  await page.goto('/s/');
  await expect(page.getByRole('link', { name: 'Ver los planes en detalle' })).toHaveAttribute('href', '/s/precios');
});

test('CP-142 · ocultar un plan con el teclado y publicar lo quita de /precios; destacar otro apaga el anterior', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  await page.goto('/ventas/planes');
  const mostrar = page.getByRole('switch', { name: 'Mostrar plan Inicial' });
  await expect(mostrar).toHaveAttribute('aria-checked', 'true');
  await pulsar(page, mostrar);
  await expect(page.getByRole('status').filter({ hasText: 'Inicial' })).toHaveText('«Inicial» quedó oculto. Publica el sitio para que se vea en /precios.');
  await expect(page.getByRole('switch', { name: 'Mostrar plan Inicial' })).toHaveAttribute('aria-checked', 'false');
  await expect(tarjeta(page, 'Inicial').getByText('Oculto', { exact: true })).toBeVisible();

  await pulsar(page, page.getByRole('switch', { name: 'Destacar Empresa como Más elegido' }));
  await expect(page.getByRole('status').filter({ hasText: 'Empresa' })).toHaveText('«Empresa» es ahora el plan «Más elegido»; los demás dejaron de estarlo.');
  await expect(page.getByRole('switch', { name: 'Destacar Productora como Más elegido' })).toHaveAttribute('aria-checked', 'false');
  await expect(tarjeta(page, 'Productora').getByText('Más elegido', { exact: true })).toHaveCount(0);

  await publicar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó' })).toBeVisible();
  await page.goto('/s/precios');
  await expect(tarjetaSitio(page, 'Inicial')).toHaveCount(0);
  await expect(page.locator('a[href*="plan=inicial"]')).toHaveCount(0);
  await expect(tarjetaSitio(page, 'Empresa').getByText('Más elegido', { exact: true })).toBeVisible();
  await expect(tarjetaSitio(page, 'Productora').getByText('Más elegido', { exact: true })).toHaveCount(0);
});

test('características, orden y página de precios: agregar, ocultar y quitar; subir un plan; el IGV y el descuento', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  await page.goto('/ventas/planes');
  const inicial = tarjeta(page, 'Inicial');
  await pulsar(page, inicial.getByRole('button', { name: 'Agregar característica' }), 'Enter');
  await expect(inicial.getByLabel('Característica 6', { exact: true })).toBeFocused();
  await page.keyboard.type('Plantillas del kit');
  await pulsar(page, inicial.getByRole('switch', { name: 'Mostrar característica 2' }));
  await pulsar(page, inicial.getByRole('button', { name: 'Quitar característica 5' }), 'Enter');
  await pulsar(page, inicial.getByRole('button', { name: 'Guardar plan' }), 'Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Inicial' })).toHaveText('Se guardó «Inicial». Publica el sitio para que se vea en /precios.');
  await expect(tarjeta(page, 'Inicial').getByLabel('Característica 5', { exact: true })).toHaveValue('Plantillas del kit');
  await expect(tarjeta(page, 'Inicial').getByRole('switch', { name: 'Mostrar característica 2' })).toHaveAttribute('aria-checked', 'false');

  // Un precio no válido no se envía.
  const extra = tarjeta(page, 'Inicial').getByLabel('Cápsula adicional (S/)');
  await extra.fill('0');
  await pulsar(page, tarjeta(page, 'Inicial').getByRole('button', { name: 'Guardar plan' }), 'Enter');
  await expect(tarjeta(page, 'Inicial').getByRole('alert')).toContainText('Soles enteros mayores que 0, o vacío');
  await extra.fill('89');

  await pulsar(page, page.getByRole('button', { name: 'Subir Productora' }), 'Enter');
  await expect(page.getByRole('status').filter({ hasText: 'posición' })).toHaveText('«Productora» quedó en la posición 1.');
  await expect(page.getByRole('list', { name: 'Planes' }).getByRole('heading', { level: 2 }).first()).toHaveText('Productora');

  const precios = page.getByRole('form', { name: 'Ajustes de la página de precios' });
  await precios.getByLabel('Descuento anual (%)').fill('95');
  await pulsar(page, precios.getByRole('button', { name: 'Guardar ajustes' }), 'Enter');
  await expect(precios.getByRole('alert')).toBeVisible();
  await precios.getByLabel('Descuento anual (%)').fill('20');
  await pulsar(page, precios.getByRole('switch', { name: 'Mostrar precios con IGV' }));
  await pulsar(page, precios.getByRole('button', { name: 'Guardar ajustes' }), 'Enter');
  await expect(page.getByRole('status').filter({ hasText: 'ajustes' })).toHaveText('Se guardaron los ajustes de la página de precios.');
  await expect(tarjeta(page, 'Inicial').getByText('/inicial · S/ 578.20 al mes con IGV · S/ 5,550.72 al año')).toBeVisible();

  await publicar(page);
  await page.goto('/s/precios');
  const enSitio = tarjetaSitio(page, 'Inicial');
  await expect(enSitio).toContainText('S/ 578.20');
  await expect(enSitio).toContainText('al mes con IGV');
  await expect(enSitio.getByText('Plantillas del kit')).toBeVisible();
  await expect(enSitio.getByText('Español', { exact: true })).toHaveCount(0);
  await expect(page.locator('article.plan h3').first()).toHaveText('Productora');
});

test('nuevo plan: nace oculto con su identificador; el identificador repetido se rechaza', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  await page.goto('/ventas/planes');
  await pulsar(page, page.getByRole('button', { name: 'Nuevo plan' }), 'Enter');
  await expect(page.getByLabel('Nombre', { exact: true }).last()).toBeFocused();
  await page.keyboard.type('Educación');
  await expect(page.getByLabel('Identificador')).toHaveValue('educacion');
  await pulsar(page, page.getByRole('button', { name: 'Crear plan' }), 'Enter');
  await expect(page.getByRole('status').filter({ hasText: 'Educación' })).toHaveText('Se creó «Educación», oculto: complétalo y muéstralo cuando esté listo.');
  await expect(tarjeta(page, 'Educación').getByText('Oculto', { exact: true })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Mostrar plan Educación' })).toHaveAttribute('aria-checked', 'false');

  await pulsar(page, page.getByRole('button', { name: 'Nuevo plan' }), 'Enter');
  await page.keyboard.type('Inicial');
  await pulsar(page, page.getByRole('button', { name: 'Crear plan' }), 'Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'No se creó' })).toContainText('Ya hay un plan con el identificador «inicial»');
});

test('en producción un plan marcado como ficticio bloquea publicar y se corrige desde Ventas › Planes', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, SITIO);
  await page.goto('/ventas/planes');
  const productora = tarjeta(page, 'Productora');
  await pulsar(page, productora.getByLabel('Dato ficticio (nunca se muestra en producción)'));
  await pulsar(page, productora.getByRole('button', { name: 'Guardar plan' }), 'Enter');
  await expect(tarjeta(page, 'Productora').getByText('Ficticio', { exact: true })).toBeVisible();
  await publicar(page);
  const bloqueo = page.getByRole('alert').filter({ hasText: 'Los cambios no se publicaron.' });
  await expect(bloqueo).toContainText('No se publica en producción con datos ficticios: hay 1.');
  await expect(bloqueo.getByRole('list', { name: 'Datos ficticios' }).getByRole('listitem')).toHaveText(['Productora (Planes)']);
  await expect(bloqueo.getByRole('button', { name: 'Ocultar todos los ficticios' })).toHaveCount(0);
  await expect(bloqueo.getByRole('link', { name: 'Ventas › Planes' })).toBeVisible();
  await sinViolaciones(page);
  // Ocultarlo deja publicar, y el sitio ya no lo muestra.
  await pulsar(page, page.getByRole('switch', { name: 'Mostrar plan Productora' }));
  await publicar(page);
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó' })).toBeVisible();
  await page.goto('/s/precios');
  await expect(page.locator('article.plan')).toHaveCount(2);
  await expect(page.locator('a[href*="plan=productora"]')).toHaveCount(0);
});

for (const ancho of [390, 1280]) {
  test(`a ${ancho} px Ventas › Planes y /precios pasan axe y no desbordan`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    await page.goto('/ventas/planes');
    await expect(tarjeta(page, 'Empresa').getByText('A medida: el botón lleva a agendar con ventas')).toBeVisible();
    await expect(tarjeta(page, 'Empresa').getByLabel('Precio al mes (S/, sin IGV)')).toHaveCount(0);
    await sinViolaciones(page);
    await sinDesbordeHorizontal(page);
    await page.goto('/s/precios');
    await expect(page.getByRole('heading', { level: 2, name: 'Planes a la medida de tu equipo de formación' })).toBeVisible();
    await expect(page.locator('article.plan')).toHaveCount(3);
    await sinViolaciones(page, false);
    await sinDesbordeHorizontal(page);
    // Con el teclado se llega al botón de cada plan.
    await page.locator('article.plan a').first().focus();
    await expect(page.locator('article.plan a').first()).toBeFocused();
  });
}

test('el administrador de una organización no ve Ventas en el menú', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, rol: 'ADMINISTRADOR' });
  await page.goto('/');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Proyectos' })).toBeVisible();
  await expect(page.getByRole('navigation').getByText('Ventas')).toHaveCount(0);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Planes' })).toHaveCount(0);
});
