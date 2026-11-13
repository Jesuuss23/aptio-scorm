// HU-1511 · Sección Blog desde WordPress (REQ-070, PNT-28, RN-16-8). CP-123: el filtro por categoría con su número
// funciona sin JavaScript, con clic y con el teclado. CP-155: ocultar una categoría o un artículo en Sitio web › Blog lo
// quita de la sección y de «Últimos artículos» del pie, sin publicar. CP-154: «Sincronizar ahora» trae lo publicado en
// WordPress, no los borradores ni los protegidos con clave. CP-156: si WordPress no responde, el panel muestra el error
// y el sitio sigue con la copia. CP-159: una landing empieza en su categoría inicial. axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string, extra: object = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F, ...extra,
});
const INICIO = pagina(1, '/', 'Inicio');
const BANCA = pagina(2, '/sectores/banca-y-seguros', 'Banca y seguros', {
  tipo: 'sector', sector: 'Banca y seguros', portada: { titulo: 'Cumplimiento normativo en cápsulas', texto: 'Cápsulas cortas con evaluación.' }, metaTitulo: 'Banca y seguros', blogCategoriaInicial: 'Estándares',
});
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-0000000000${n}`, paginaId, tipo, orden: n, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const SITIO = {
  conSesion: true, rol: 'SUPERADMIN', versionSitio: true, blogSitio: true,
  paginasSitio: [INICIO, BANCA],
  bloquesSitio: [bloque(10, INICIO.id, 'hero'), bloque(11, INICIO.id, 'bloglista'), bloque(12, INICIO.id, 'cta'), bloque(20, BANCA.id, 'hero'), bloque(21, BANCA.id, 'bloglista')],
};
/** Un artículo como lo devuelve la API REST de WordPress con `_embed`. */
const postWp = (id: number, titulo: string, extra: object = {}) => ({
  id, slug: `nuevo-${id}`, status: 'publish', date_gmt: '2026-11-12T15:00:00', link: `https://blog.aptioscorm.com/nuevo-${id}/`,
  title: { rendered: titulo }, excerpt: { rendered: '<p>Recién publicado.</p>', protected: false }, content: { rendered: '', protected: false },
  categories: [5], _embedded: { author: [{ name: 'Carla Montoya' }] }, ...extra,
});

const sinViolaciones = async (page: Page, soloMain = true) => {
  const b = new AxeBuilder({ page }).withTags(REGLAS);
  const axe = await (soloMain ? b.include('main') : b).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const seccion = (page: Page) => page.locator('section#blog');
const filtros = (page: Page) => seccion(page).getByRole('group', { name: 'Filtrar artículos por categoría' });
const listaVisible = (page: Page) => seccion(page).locator('ul.lista:visible');
const titulosVisibles = (page: Page) => listaVisible(page).locator('h3');
const pie = (page: Page) => page.locator('footer');
const fila = (page: Page, titulo: string) => page.getByRole('table', { name: 'Artículos de WordPress' }).getByRole('row').filter({ has: page.getByRole('rowheader', { name: titulo }) });

for (const ancho of [390, 1280]) {
  test(`CP-123 a ${ancho} px: los filtros con su número cambian la lista con clic y con el teclado, sin JavaScript ni violaciones de axe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    await page.goto('/s/');
    await expect(page.locator('script')).toHaveCount(0);
    await expect(seccion(page).getByRole('heading', { level: 2, name: 'Ideas para producir mejores cápsulas' })).toBeVisible();
    const etiquetas = filtros(page).locator('label');
    await expect(etiquetas).toHaveText(['Todas (7) artículos', 'Microaprendizaje (1) artículo', 'Estándares (1) artículo', 'Guías (2) artículos', 'Accesibilidad (1) artículo', 'Gestión (1) artículo', 'Casos (1) artículo']);
    // «Todas» empieza marcada y muestra hasta 6; lo oculto (Noticias internas y un artículo) no sale.
    await expect(filtros(page).getByRole('radio', { name: /^Todas/ })).toBeChecked();
    await expect(titulosVisibles(page)).toHaveCount(6);
    await expect(seccion(page)).not.toContainText('Noticias internas');
    await expect(page.getByText('Celebramos 10 años')).toHaveCount(0);
    await expect(page.getByText('Evaluación formativa y sumativa')).toHaveCount(0);

    await etiquetas.filter({ hasText: 'Guías' }).click();
    await expect(filtros(page).getByRole('radio', { name: /^Guías/ })).toBeChecked();
    await expect(titulosVisibles(page)).toHaveText(['Cómo preparar un manual para convertirlo en cápsula', 'Cómo escribir guiones que suenen bien con voz de IA']);
    // Con el teclado: las flechas mueven la selección entre los filtros.
    await filtros(page).getByRole('radio', { name: /^Guías/ }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(filtros(page).getByRole('radio', { name: /^Accesibilidad/ })).toBeChecked();
    await expect(titulosVisibles(page)).toHaveText(['Subtítulos y accesibilidad en cursos corporativos']);
    await expect(seccion(page).getByRole('link', { name: 'Ver todos los artículos en el blog' })).toHaveAttribute('href', 'https://blog.aptioscorm.com');

    await expect(pie(page).getByRole('heading', { name: 'Últimos artículos' })).toBeVisible();
    await expect(pie(page).locator('li a[href^="https://blog.aptioscorm.com/"]')).toHaveText([
      'Qué es una cápsula de microaprendizaje y cuándo usarla', 'SCORM 1.2, SCORM 2004 y cmi5: cuál pedir a tu proveedor', 'Cómo preparar un manual para convertirlo en cápsula',
    ]);
    await sinViolaciones(page, false);
  });

  test(`CP-155 a ${ancho} px: ocultar una categoría y un artículo en Sitio web › Blog los quita del sitio y del pie al instante, sin violaciones de axe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    await page.goto('/sitio/blog');
    await expect(page.getByRole('heading', { level: 1, name: 'Blog' })).toBeVisible();
    await expect(page.getByText('7 visibles de 9')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Conexión' }).getByText('Conectado', { exact: true })).toBeVisible();
    const categorias = page.getByRole('list', { name: 'Categorías del blog' });
    await expect(categorias.getByRole('switch', { name: 'Mostrar categoría Noticias internas' })).toHaveAttribute('aria-checked', 'false');
    await expect(fila(page, 'Celebramos 10 años del equipo de producción')).toContainText('Categoría oculta');
    await expect(fila(page, 'Bloqueo y etiquetado explicado en 5 minutos').getByRole('link', { name: /^Editar en WordPress/ }))
      .toHaveAttribute('href', 'https://blog.aptioscorm.com/wp-admin/post.php?post=377&action=edit');
    await sinViolaciones(page);

    await categorias.getByRole('switch', { name: 'Mostrar categoría Casos' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'La categoría «Casos» quedó oculta' })).toBeVisible();
    await fila(page, 'Qué es una cápsula de microaprendizaje y cuándo usarla').getByRole('switch').click();
    await expect(page.getByRole('status').filter({ hasText: '«Qué es una cápsula de microaprendizaje y cuándo usarla» quedó oculto.' })).toBeVisible();
    await expect(page.getByText('5 visibles de 9')).toBeVisible();
    await sinViolaciones(page);

    await page.goto('/s/');
    await expect(filtros(page).locator('label')).toHaveText(['Todas (5) artículos', 'Estándares (1) artículo', 'Guías (2) artículos', 'Accesibilidad (1) artículo', 'Gestión (1) artículo']);
    await expect(page.getByText('Bloqueo y etiquetado explicado en 5 minutos')).toHaveCount(0);
    await expect(page.getByText('Qué es una cápsula de microaprendizaje')).toHaveCount(0);
    await expect(pie(page).locator('li a[href^="https://blog.aptioscorm.com/"]').first()).toHaveText('SCORM 1.2, SCORM 2004 y cmi5: cuál pedir a tu proveedor');
  });
}

test('las categorías se ordenan con las flechas y el sitio sigue ese orden', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio/blog');
  const categorias = page.getByRole('list', { name: 'Categorías del blog' });
  await categorias.getByRole('button', { name: 'Subir Guías' }).click();
  await expect(page.getByRole('status').filter({ hasText: '«Guías» quedó en la posición 2.' })).toBeVisible();
  await expect(categorias.locator('b')).toHaveText(['Microaprendizaje', 'Guías', 'Estándares', 'Accesibilidad', 'Gestión', 'Casos', 'Noticias internas']);
  await page.goto('/s/');
  await expect(filtros(page).locator('label').nth(2)).toHaveText('Guías (2) artículos');
});

test('CP-154: «Sincronizar ahora» trae el artículo publicado en WordPress, no el borrador ni el protegido con clave', async ({ page }) => {
  await simularApi(page, {
    ...SITIO,
    wordpress: [
      postWp(420, 'Checklist para revisar una cápsula antes de entregarla'),
      postWp(421, 'Borrador sin terminar', { status: 'draft' }),
      postWp(422, 'Solo para clientes', { content: { rendered: '', protected: true } }),
    ],
  });
  await page.goto('/sitio/blog');
  await page.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Sincronizado: 10 artículos publicados en WordPress.' })).toBeVisible();
  await expect(fila(page, 'Checklist para revisar una cápsula antes de entregarla')).toContainText('Guías');
  await expect(page.getByRole('rowheader', { name: 'Borrador sin terminar' })).toHaveCount(0);
  await expect(page.getByRole('rowheader', { name: 'Solo para clientes' })).toHaveCount(0);

  await page.goto('/s/');
  await expect(titulosVisibles(page).first()).toHaveText('Checklist para revisar una cápsula antes de entregarla');
  await expect(filtros(page).locator('label').filter({ hasText: 'Guías' })).toHaveText('Guías (3) artículos');
});

test('CP-156: si WordPress no responde, el panel muestra el error y el sitio sigue con la copia anterior', async ({ page }) => {
  await simularApi(page, { ...SITIO, wordpress: 'caido' });
  await page.goto('/sitio/blog');
  await page.getByRole('button', { name: 'Sincronizar ahora' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'No se pudo sincronizar: No se pudo conectar con WordPress. El sitio sigue mostrando la copia anterior.' })).toBeVisible();
  const conexion = page.getByRole('region', { name: 'Conexión' });
  await expect(conexion.getByText('Con error', { exact: true })).toBeVisible();
  await expect(conexion).toContainText('Última sincronización con error');
  await expect(page.getByText('7 visibles de 9')).toBeVisible();
  await sinViolaciones(page);

  await page.goto('/s/');
  await expect(filtros(page).locator('label').first()).toHaveText('Todas (7) artículos');
  await expect(titulosVisibles(page)).toHaveCount(6);
});

test('CP-159: la landing empieza en su categoría inicial; si se oculta, en «Todas»', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/s/sectores/banca-y-seguros');
  await expect(filtros(page).getByRole('radio', { name: /^Estándares/ })).toBeChecked();
  await expect(titulosVisibles(page)).toHaveText(['SCORM 1.2, SCORM 2004 y cmi5: cuál pedir a tu proveedor']);
  await sinViolaciones(page, false);

  await page.goto('/sitio/blog');
  await page.getByRole('list', { name: 'Categorías del blog' }).getByRole('switch', { name: 'Mostrar categoría Estándares' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'La categoría «Estándares» quedó oculta' })).toBeVisible();
  await page.goto('/s/sectores/banca-y-seguros');
  await expect(filtros(page).getByRole('radio', { name: /^Todas/ })).toBeChecked();
});

test('sin WordPress conectado no hay sección ni columna; la URL se valida y al guardarla queda lista para sincronizar', async ({ page }) => {
  await simularApi(page, { ...SITIO, blogSitio: false });
  await page.goto('/s/');
  await expect(seccion(page)).toHaveCount(0);
  await expect(page.getByText('Últimos artículos')).toHaveCount(0);

  await page.goto('/sitio/blog');
  const conexion = page.getByRole('region', { name: 'Conexión' });
  await expect(conexion.getByText('Sin conectar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sincronizar ahora' })).toBeDisabled();
  await expect(page.getByText('Conecta tu WordPress para traer sus artículos publicados.')).toBeVisible();
  await conexion.getByLabel('URL de WordPress').fill('http://blog.ejemplo.pe');
  await conexion.getByRole('button', { name: 'Guardar' }).click();
  await expect(conexion.getByRole('alert')).toHaveText('La URL del blog empieza con https://');
  await conexion.getByLabel('URL de WordPress').fill('https://blog.ejemplo.pe/');
  await conexion.getByLabel('Sincronización').selectOption({ label: 'Cada hora' });
  await conexion.getByRole('button', { name: 'Guardar' }).click();
  await expect(conexion.getByRole('status').filter({ hasText: 'Se guardó la conexión.' })).toBeVisible();
  await expect(conexion.getByLabel('URL de WordPress')).toHaveValue('https://blog.ejemplo.pe');
  await expect(conexion.getByText('Sin sincronizar', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sincronizar ahora' })).toBeEnabled();
  await sinViolaciones(page);
});
