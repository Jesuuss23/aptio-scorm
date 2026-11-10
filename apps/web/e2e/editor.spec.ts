// HU-0601 · Editor (PNT-21): edición en el lugar (CP-056). Doble clic, escribir y Enter guarda; Esc cancela;
// con teclado se entra con Tab y Enter; si otra persona guardó antes, se recarga y se avisa.
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
    await expect(page.getByText('Doble clic en un texto para escribir (o Tab hasta el texto y Enter).')).toBeVisible();
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
    await expect(page.getByRole('alert')).toHaveText('Otra persona cambió el curso mientras escribías. Se cargó la última versión; vuelve a escribir tu cambio.');
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
