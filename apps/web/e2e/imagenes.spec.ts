// HU-0609 · Imágenes propias y biblioteca del kit en el editor (REQ-046, REQ-017).
// CP-070 · Arrastrar archivo: una imagen soltada en la pantalla queda centrada donde se soltó (en % de la pantalla) y en
// la biblioteca del proyecto, con su texto alternativo por revisar; Deshacer la quita. Una pieza del kit se agrega con
// el color de la marca. Un archivo que no es imagen se explica. axe WCAG 2.2 A/AA sin violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type JSHandle, type Page, test } from '@playwright/test';
import { KIT_MINERA, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_P05 = `/proyectos/${PROYECTO}/editor?pantalla=p05`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const lienzo = (page: Page) => page.getByRole('region', { name: /^Lienzo de la pantalla/ });
const imagenes = (page: Page) => page.getByRole('complementary', { name: 'Imágenes' });
const propiedades = (page: Page) => page.getByRole('complementary', { name: 'Propiedades' });
const pestana = (page: Page, nombre: string) => page.getByRole('tablist', { name: 'Panel del editor' }).getByRole('tab', { name: nombre }).click();

type Extra = { id: string; tipo: string; recursoId?: string; pieza?: string; texto?: { es: string }; x: number; y: number; ancho: number };
function contarEdiciones(page: Page) {
  const cuerpos: { extras?: Extra[]; motivo?: string }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/cursos\/[^/]+\/pantallas\/p05$/.test(r.url())) cuerpos.push(r.postDataJSON());
  });
  return cuerpos;
}
/** Un archivo del «escritorio» dentro de un DataTransfer: un PNG de 40 × 20 px hecho con un canvas, o un texto. */
function archivo(page: Page, nombre: string, tipo: 'png' | 'gif'): Promise<JSHandle<DataTransfer>> {
  return page.evaluateHandle(async ([n, t]) => {
    const dt = new DataTransfer();
    if (t === 'gif') {
      dt.items.add(new File(['GIF89a'], n, { type: 'image/gif' }));
      return dt;
    }
    const c = document.createElement('canvas');
    c.width = 40;
    c.height = 20;
    const g = c.getContext('2d')!;
    g.fillStyle = '#2E7D6B';
    g.fillRect(0, 0, 40, 20);
    const blob = await new Promise<Blob>((ok) => c.toBlob((b) => ok(b!), 'image/png'));
    dt.items.add(new File([blob], n, { type: 'image/png' }));
    return dt;
  }, [nombre, tipo] as const);
}
/** Arrastra el archivo hasta el punto (px de la página) y lo suelta sobre el lienzo. */
async function soltarEn(page: Page, dt: JSHandle<DataTransfer>, x: number, y: number) {
  const escenario = page.locator('.revision-escenario');
  for (const tipo of ['dragenter', 'dragover', 'drop']) await escenario.dispatchEvent(tipo, { dataTransfer: dt, clientX: x, clientY: y, bubbles: true });
}

test.describe('imágenes en el editor (HU-0609)', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  });

  test('CP-070 · soltar un PNG en un punto: queda centrado ahí, en la biblioteca del proyecto, y Deshacer lo quita', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    const pantalla = lienzo(page).locator('[data-pantalla="p05"]');
    await expect(pantalla).toBeVisible();
    await pestana(page, 'Imágenes');
    await expect(imagenes(page).getByText('Aún no hay imágenes subidas en este proyecto.')).toBeVisible();
    const caja = (await pantalla.boundingBox())!;
    // Se suelta a un cuarto del ancho y a la mitad del alto de la pantalla.
    const punto = { x: caja.x + caja.width * 0.25, y: caja.y + caja.height * 0.5 };
    await soltarEn(page, await archivo(page, 'operario-con_casco.png', 'png'), punto.x, punto.y);
    await expect(page.getByRole('status').filter({ hasText: 'Imagen «operario-con_casco.png» agregada. Revisa su texto alternativo en Propiedades.' })).toBeVisible();

    // La posición: centrada en el punto, en % de la pantalla (la imagen mide 20 % del ancho y es el doble de ancha que alta).
    const alto = (20 * 0.5 * caja.width) / caja.height;
    const r1 = (v: number) => Math.round(v * 10) / 10;
    const extra = ediciones.at(-1)!.extras!.at(-1)!;
    expect(extra).toMatchObject({ id: 'p05-extra-imagen-1', tipo: 'imagen', texto: { es: 'Operario con casco' }, ancho: 20, x: 15, y: r1(50 - alto / 2) });
    expect(extra.recursoId).toMatch(/^[0-9a-f-]{36}$/);

    // En el lienzo, la imagen se ve con su URL y su centro cae donde se soltó.
    const img = lienzo(page).locator('[data-bloque="p05-extra-imagen-1"] img');
    await expect(img).toHaveAttribute('alt', 'Operario con casco');
    await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(40);
    // Respecto de la pantalla: arriba aparecen el aviso y la barra del elemento, así que se mide contra la pantalla.
    const b = (await img.boundingBox())!;
    const ahora = (await pantalla.boundingBox())!;
    expect(Math.abs(b.x + b.width / 2 - ahora.x - caja.width * 0.25)).toBeLessThan(3);
    expect(Math.abs(b.y + b.height / 2 - ahora.y - caja.height * 0.5)).toBeLessThan(3);
    await expect(page.getByRole('group', { name: 'Modo de edición' }).getByRole('button', { name: 'Libre' })).toHaveAttribute('aria-pressed', 'true');

    // Queda en la biblioteca del proyecto y Propiedades pide revisar el texto alternativo.
    await expect(imagenes(page).getByRole('button', { name: 'Agregar operario-con_casco.png' })).toBeVisible();
    await expect(propiedades(page).getByRole('note')).toHaveText('Revisa el texto alternativo: ahora es el nombre del archivo.');
    await propiedades(page).getByRole('textbox', { name: 'Texto alternativo' }).fill('Operario con casco cerrando la válvula');
    await propiedades(page).getByRole('textbox', { name: 'Texto alternativo' }).press('Enter');
    await expect(propiedades(page).getByRole('note')).toHaveCount(0);
    await expect(img).toHaveAttribute('alt', 'Operario con casco cerrando la válvula');

    // Deshacer dos veces: primero el texto alternativo, luego la imagen, en un solo guardado.
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(lienzo(page).locator('[data-bloque="p05-extra-imagen-1"]')).toHaveCount(0);
    await expect(page.getByText('✓ Guardado')).toBeVisible();
    expect(ediciones.at(-1)).toMatchObject({ extras: [], motivo: 'deshacer' });
    // Sigue en la biblioteca para volver a usarla.
    await imagenes(page).getByRole('button', { name: 'Agregar operario-con_casco.png' }).click();
    await expect(lienzo(page).locator('[data-bloque="p05-extra-imagen-1"] img')).toBeVisible();
  });

  test('una pieza de la biblioteca del kit se agrega con los colores de la marca; axe sin violaciones', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    await pestana(page, 'Imágenes');
    await expect(imagenes(page).getByRole('list', { name: 'Biblioteca del kit' }).getByRole('button')).toHaveCount(6);
    await imagenes(page).getByRole('button', { name: 'Agregar Candado' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Candado agregado: arrástralo donde quieras.' })).toBeVisible();
    expect(ediciones.at(-1)!.extras!.at(-1)).toEqual({ id: 'p05-extra-imagen-1', tipo: 'imagen', pieza: 'candado', texto: { es: 'Candado' }, x: 42, y: 30, ancho: 16 });
    const pieza = lienzo(page).getByRole('img', { name: 'Candado' });
    await expect(pieza).toBeVisible();
    // El cuerpo del candado es el color primario del kit de Minera Andina (#12355B).
    expect(KIT_MINERA.paleta.primario).toBe('#12355B');
    await expect(pieza.locator('rect').first()).toHaveCSS('fill', 'rgb(18, 53, 91)');
    // En Propiedades se cambia por otra pieza o se marca decorativa.
    await expect(propiedades(page).getByRole('combobox', { name: 'Imagen' })).toHaveValue('pieza:candado');
    await propiedades(page).getByRole('checkbox', { name: 'Decorativa (el lector de pantalla la omite)' }).click();
    await expect(propiedades(page).getByRole('checkbox', { name: 'Decorativa (el lector de pantalla la omite)' })).toBeChecked();
    await expect(lienzo(page).getByRole('img', { name: 'Candado' })).toHaveCount(0);
    await expect(lienzo(page).locator('[data-bloque="p05-extra-imagen-1"] svg')).toHaveAttribute('aria-hidden', 'true');
    for (const zona of ['.editor-izquierda', '.editor-lienzo', '[aria-label="Propiedades"]']) expect(await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze().then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`))).toEqual([]);
  });

  test('un archivo que no es imagen se explica y no se sube; «Subir imagen propia» también agrega a la pantalla', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    await expect(lienzo(page).locator('[data-pantalla="p05"]')).toBeVisible();
    const caja = (await lienzo(page).locator('[data-pantalla="p05"]').boundingBox())!;
    await soltarEn(page, await archivo(page, 'animacion.gif', 'gif'), caja.x + 50, caja.y + 50);
    await expect(page.getByRole('alert')).toHaveText('«animacion.gif» no es una imagen que se pueda usar: sube PNG, JPEG, WebP o SVG.');
    expect(ediciones).toEqual([]);
    await pestana(page, 'Imágenes');
    await imagenes(page).getByLabel('Archivo de imagen').setInputFiles({ name: 'planta.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#2E7D6B"/></svg>') });
    await expect(page.getByRole('status').filter({ hasText: 'Imagen «planta.svg» agregada.' })).toBeVisible();
    expect(ediciones.at(-1)!.extras!.at(-1)).toMatchObject({ tipo: 'imagen', texto: { es: 'Planta' }, x: 42, y: 30, ancho: 16 });
    await expect(imagenes(page).getByRole('button', { name: 'Agregar planta.svg' })).toBeVisible();
  });
});
