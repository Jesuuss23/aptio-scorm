// HU-0601 · Editor (PNT-21): edición en el lugar (CP-056). Doble clic, escribir y Enter guarda; Esc cancela;
// con teclado se entra con Tab y Enter; si otra persona guardó antes, se recarga y se avisa.
// HU-0602 · Barra contextual y propiedades: tamaño, color del kit (CP-057), alineación y animación.
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_EDITOR = `/proyectos/${PROYECTO}/editor?pantalla=p01`;
const lienzo = (page: Page) => page.getByRole('region', { name: /^Lienzo de la pantalla/ });
const titulo = (page: Page) => lienzo(page).getByRole('heading', { level: 2 });

/** Peticiones de edición que llegan a la API. */
function contarEdiciones(page: Page) {
  const cuerpos: unknown[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/cursos\/[^/]+\/pantallas\/p\d+$/.test(r.url())) cuerpos.push(r.postDataJSON());
  });
  return cuerpos;
}

test.describe('con el productor', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR' });
  });

  test('desde Revisión se abre el editor en la misma pantalla y se vuelve', async ({ page }) => {
    await page.goto(`/proyectos/${PROYECTO}/revision`);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('link', { name: '✎ Editar pantalla' }).click();
    await expect(page).toHaveURL(`/proyectos/${PROYECTO}/editor?pantalla=p02`);
    await expect(page.getByRole('region', { name: 'Lienzo de la pantalla p02' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pantallas' }).getByRole('button')).toHaveCount(30);
    await page.getByRole('navigation', { name: 'Pantallas' }).getByRole('button', { name: /Bloqueo y etiquetado/ }).click();
    await expect(page).toHaveURL(URL_EDITOR);
    await page.getByRole('link', { name: '← Revisión' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Revisión' })).toBeVisible();
  });

  test('CP-056 · doble clic en el título, escribir y Enter lo guarda; sigue tras recargar', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
    await titulo(page).dblclick();
    await expect(page.getByText('Escribiendo… Enter para terminar · Esc para cancelar')).toBeVisible();
    await page.keyboard.type('Bloqueo y etiquetado seguro');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Texto guardado.' })).toBeVisible();
    expect(ediciones).toEqual([expect.objectContaining({ titulo: { es: 'Bloqueo y etiquetado seguro' } })]);
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado seguro');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bloqueo y etiquetado seguro');
    await expect(page.locator('.editor-barra .chip')).toHaveText('Borrador');
    await page.reload();
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado seguro');
  });

  test('CP-056 · Esc cancela: el texto vuelve y no se guarda nada', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    const subtitulo = lienzo(page).getByText('Cápsula de seguridad · 15 min · 3 retos');
    await subtitulo.dblclick();
    await page.keyboard.type('Otro texto');
    await page.keyboard.press('Escape');
    await expect(lienzo(page).getByText('Cápsula de seguridad · 15 min · 3 retos')).toBeVisible();
    // Deja de escribir; el texto sigue elegido para retocarlo (HU-0602).
    await expect(page.getByText('Escribiendo… Enter para terminar · Esc para cancelar')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: 'Opciones del elemento' })).toContainText('Subtítulo · Cápsula de seguridad');
    expect(ediciones).toEqual([]);
  });

  test('CP-056 · solo con teclado: Tab hasta el texto, Enter, escribir y Enter; clic fuera también guarda', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await titulo(page).waitFor();
    const subtitulo = lienzo(page).getByText('Cápsula de seguridad · 15 min · 3 retos');
    // Tab recorre los textos editables del lienzo.
    for (let i = 0; i < 40 && !(await subtitulo.evaluate((el) => el.matches(':focus'))); i++) await page.keyboard.press('Tab');
    await expect(subtitulo).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Cápsula de seguridad · 12 min');
    await page.keyboard.press('Enter');
    await expect(lienzo(page).getByText('Cápsula de seguridad · 12 min', { exact: true })).toBeVisible();
    expect(ediciones).toEqual([expect.objectContaining({ textos: { 'p01-subtitulo': { es: 'Cápsula de seguridad · 12 min' } } })]);
    // Clic fuera mientras se escribe guarda lo escrito.
    await titulo(page).dblclick();
    await page.keyboard.type('Bloqueo y etiquetado LOTO');
    await page.getByRole('heading', { level: 1 }).click();
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado LOTO');
    expect(ediciones).toHaveLength(2);
  });

  test('un texto vacío no se guarda y vuelve el que tenía', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await titulo(page).dblclick();
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Un texto no puede quedar vacío; se dejó el que tenía.');
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
    expect(ediciones).toEqual([]);
  });

  test('si otra persona guardó antes (409), se recarga el curso y se avisa', async ({ page }) => {
    await page.route('**/api/v1/cursos/*/pantallas/p01', (r) =>
      r.request().method() === 'PATCH'
        ? r.fulfill({ status: 409, json: { codigo: 'VERSION_CAMBIO', mensaje: 'Otra persona guardó cambios en el curso.' } })
        : r.fallback());
    await page.goto(URL_EDITOR);
    await titulo(page).dblclick();
    await page.keyboard.type('Mi cambio');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Otra persona cambió el curso mientras editabas. Se cargó la última versión; vuelve a hacer tu cambio.');
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
  });
});

test('el revisor del cliente no ve «Editar pantalla» ni puede escribir en el editor', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' });
  await page.goto(`/proyectos/${PROYECTO}/revision`);
  await expect(page.getByRole('region', { name: 'Pantalla p01' })).toBeVisible();
  await expect(page.getByRole('link', { name: '✎ Editar pantalla' })).toHaveCount(0);
  await page.goto(URL_EDITOR);
  await expect(page.getByText('El editor es del equipo de producción. Puedes ver y comentar las pantallas en Revisión.')).toBeVisible();
  await expect(lienzo(page)).toHaveCount(0);
});

test.describe('HU-0602 · retoques del elemento elegido', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  });
  const barra = (page: Page) => page.getByRole('toolbar', { name: 'Opciones del elemento' });
  const propiedades = (page: Page) => page.getByRole('complementary', { name: 'Propiedades' });
  const estilo = (page: Page, prop: string) => titulo(page).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

  test('CP-057 · elijo un texto y el color Acento: cambia, y solo se ofrecen los colores del kit', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await expect(propiedades(page)).toContainText('Elige un elemento en el lienzo para cambiarlo');
    await titulo(page).click();
    await expect(barra(page)).toContainText('Título · Bloqueo y etiquetado');
    const colores = barra(page).getByRole('group', { name: 'Colores del kit' }).getByRole('button');
    await expect(colores).toHaveText(['', '', '', '', '', '']);
    expect(await colores.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).toEqual(['Primario', 'Secundario', 'Acento', 'Texto', 'Blanco', 'Alerta']);
    // Cada muestra tiene el color real del kit; no hay selector de color libre.
    await expect(colores.nth(2)).toHaveCSS('background-color', 'rgb(242, 169, 0)');
    await expect(page.locator('input[type="color"]')).toHaveCount(0);
    await barra(page).getByRole('button', { name: 'Acento' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cambio guardado.' })).toBeVisible();
    expect(ediciones).toEqual([expect.objectContaining({ ajustes: { 'p01-titulo': { color: 'acento' } } })]);
    await expect(titulo(page)).toHaveCSS('color', 'rgb(242, 169, 0)');
    await expect(barra(page).getByRole('button', { name: 'Acento' })).toHaveAttribute('aria-pressed', 'true');
    // El contenido no cambia y el retoque sigue tras recargar.
    await page.reload();
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
    await expect(titulo(page)).toHaveCSS('color', 'rgb(242, 169, 0)');
  });

  test('A+ agranda el texto, Centro lo centra, la animación se guarda y Restablecer quita el ajuste', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await titulo(page).click();
    const antes = parseFloat(await estilo(page, 'font-size'));
    await barra(page).getByRole('button', { name: 'Más grande' }).click();
    await expect.poll(async () => parseFloat(await estilo(page, 'font-size'))).toBeGreaterThan(antes);
    // RN-06-2: el tamaño se guarda en % del ancho de la pantalla, nunca en píxeles.
    expect((ediciones[0] as { ajustes: Record<string, { tamanoCqw: number }> }).ajustes['p01-titulo']!.tamanoCqw).toBeGreaterThan(0);
    await barra(page).getByRole('group', { name: 'Alineación' }).getByRole('button', { name: 'Centro' }).click();
    await expect.poll(() => estilo(page, 'text-align')).toBe('center');
    await propiedades(page).getByRole('group', { name: 'Animación de entrada' }).getByRole('button', { name: 'Rebotar' }).click();
    await expect(titulo(page)).toHaveClass(/ap-anim-rebotar/);
    expect(ediciones.at(-1)).toEqual(expect.objectContaining({ ajustes: { 'p01-titulo': expect.objectContaining({ alineacion: 'centro', animacion: 'rebotar' }) } }));
    await propiedades(page).getByRole('button', { name: '▶ Ver animación' }).click();
    await expect(titulo(page)).toHaveClass(/ap-anim-rebotar/);
    await barra(page).getByRole('button', { name: 'Restablecer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se restableció el elemento.' })).toBeVisible();
    expect(ediciones.at(-1)).toEqual(expect.objectContaining({ ajustes: { 'p01-titulo': null } }));
    await expect.poll(async () => parseFloat(await estilo(page, 'font-size'))).toBeCloseTo(antes, 0);
    await expect(titulo(page)).not.toHaveClass(/ap-anim-/);
  });

  test('con teclado: Tab hasta el elemento y Espacio lo elige; Esc lo suelta', async ({ page }) => {
    await page.goto(URL_EDITOR);
    await titulo(page).waitFor();
    for (let i = 0; i < 40 && !(await titulo(page).evaluate((el) => el.matches(':focus'))); i++) await page.keyboard.press('Tab');
    await expect(titulo(page)).toBeFocused();
    await page.keyboard.press(' ');
    await expect(barra(page)).toBeVisible();
    await expect(propiedades(page).getByRole('heading', { level: 2 })).toHaveText('Título · Bloqueo y etiquetado');
    await page.keyboard.press('Escape');
    await expect(barra(page)).toHaveCount(0);
  });
});

