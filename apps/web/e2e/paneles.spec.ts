// SUP-104 · Glosario, ayuda y panel de accesibilidad en el paquete real (la carpeta HTML que arma @aptio/exporters,
// abierta con file://). Los tres son diálogos modales: Tab no sale, Escape cierra y el foco vuelve al botón. El glosario
// busca sin tildes; las preferencias (texto grande, alto contraste, menos movimiento) se aplican al instante y siguen al
// volver a abrir el curso. axe WCAG 2.2 A/AA sin violaciones con cada diálogo abierto.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { codigoReproductor, construirHtml } from '@aptio/exporters';
import { expect, type Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { cursoLoto, recursosLoto } from '../../../packages/exporters/test/loto.ts';
import { wavSilencio } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const GLOSARIO = [
  { id: 'bloqueo', termino: { es: 'Bloqueo', en: 'Lockout' }, definicion: { es: 'Dispositivo que impide liberar la energía.', en: 'Device that prevents energy release.' } },
  { id: 'energia-cero', termino: { es: 'Energía cero', en: 'Zero energy' }, definicion: { es: 'Estado verificado sin energía peligrosa.', en: 'Verified state with no hazardous energy.' } },
  { id: 'candado', termino: { es: 'Candado personal', en: 'Personal lock' }, definicion: { es: 'Cada trabajador usa el suyo y guarda la llave.', en: 'Each worker uses their own and keeps the key.' } },
];

async function carpeta(curso: unknown) {
  const recursos = recursosLoto().map((r) => (r.nombre.endsWith('.mp3') ? { ...r, datos: new Uint8Array(wavSilencio(200)) } : r));
  const { zip } = await construirHtml({ curso: curso as never, recursos, reproductor: await codigoReproductor() });
  const dir = mkdtempSync(join(tmpdir(), 'aptio-paneles-'));
  const archivos = await JSZip.loadAsync(zip);
  for (const [ruta, f] of Object.entries(archivos.files)) {
    if (f.dir) continue;
    mkdirSync(dirname(join(dir, ruta)), { recursive: true });
    writeFileSync(join(dir, ruta), await f.async('uint8array'));
  }
  return pathToFileURL(join(dir, 'index.html')).href;
}

let url: string;
let urlSin: string;
test.beforeAll(async () => {
  const base = cursoLoto() as unknown as { navegacion: Record<string, unknown> };
  url = await carpeta({ ...base, navegacion: { ...base.navegacion, patron: 'clasico', mostrar: ['temario', 'progreso', 'glosario', 'ayuda', 'accesibilidad'] }, glosario: GLOSARIO });
  // Sin glosario ni ayuda en `mostrar`: no hay botones.
  urlSin = await carpeta({ ...base, navegacion: { ...base.navegacion, patron: 'clasico', mostrar: ['temario', 'progreso'] }, glosario: GLOSARIO });
});

const quieto = (page: Page) => page.evaluate(async () => {
  for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
  const sombra = document.getElementById('curso')?.shadowRoot;
  const todas = new Set([...document.getAnimations(), ...(sombra?.getAnimations() ?? [])]);
  await Promise.all([...todas].filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined)));
});
const axe = async (page: Page) => {
  await quieto(page);
  return (await new AxeBuilder({ page }).withTags(REGLAS).analyze()).violations.map((v) => `${v.id}: ${v.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' | ')}`);
};
/** El elemento enfocado de verdad, atravesando el Shadow DOM. */
const enfocado = (page: Page) => page.evaluate(() => {
  let e = document.activeElement as HTMLElement | null;
  while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement as HTMLElement;
  return e ? (e.getAttribute('aria-label') ?? e.textContent ?? '').trim() || e.tagName : '';
});

test('SUP-104 · el glosario busca sin tildes, es modal y devuelve el foco al botón', async ({ page }) => {
  await page.goto(url);
  const boton = page.getByRole('button', { name: 'Glosario' });
  await expect(boton).toBeVisible();
  await boton.click();
  const dialogo = page.getByRole('dialog', { name: 'Glosario' });
  await expect(dialogo).toBeVisible();
  // Abre con el foco en el buscador y los términos en orden alfabético.
  await expect(dialogo.getByRole('searchbox', { name: 'Buscar en el glosario' })).toBeFocused();
  await expect(dialogo.locator('dt')).toHaveText(['Bloqueo', 'Candado personal', 'Energía cero']);
  await expect(dialogo.getByRole('status')).toHaveText('3 términos');
  expect(await axe(page)).toEqual([]);
  // «energia» sin tilde encuentra «Energía cero» y la definición de «Bloqueo» («liberar la energía»).
  await page.keyboard.type('energia');
  await expect(dialogo.locator('dt')).toHaveText(['Bloqueo', 'Energía cero']);
  await expect(dialogo.getByRole('status')).toHaveText('2 términos');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('llave');
  await expect(dialogo.locator('dt')).toHaveText(['Candado personal']);
  await expect(dialogo.getByRole('status')).toHaveText('1 término');
  await page.keyboard.press('Control+A');
  await page.keyboard.type('xyz');
  await expect(dialogo.getByRole('status')).toHaveText('Ningún término coincide con la búsqueda');
  // Tab da la vuelta dentro del diálogo y las flechas no cambian de pantalla.
  await page.keyboard.press('Tab');
  expect(await enfocado(page)).toBe('Cerrar');
  await page.keyboard.press('Tab');
  expect(await enfocado(page)).toBe('INPUT');
  await page.keyboard.press('Escape');
  await expect(dialogo).toHaveCount(0);
  await expect(boton).toBeFocused();
});

test('SUP-104 · la ayuda explica cómo usar este curso y se cierra con «Cerrar»', async ({ page }) => {
  await page.goto(url);
  await page.getByRole('button', { name: 'Ayuda' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Ayuda' });
  await expect(dialogo.getByRole('heading', { level: 3 })).toHaveText(['Avanzar y volver', 'Temario', 'Actividades', 'Subtítulos', 'Tu avance', 'Glosario', 'Accesibilidad']);
  await expect(dialogo).toContainText('las flechas → y ← también pasan de pantalla');
  await expect(dialogo).toContainText('arrastrar cada elemento desde su asa');
  expect(await axe(page)).toEqual([]);
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();
  await expect(dialogo).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ayuda' })).toBeFocused();
});

test('SUP-104 · el panel de accesibilidad agranda el texto, pone alto contraste y quita animaciones, y lo recuerda', async ({ page }) => {
  await page.goto(url);
  const titulo = page.locator('[data-pantalla] h2').first();
  await quieto(page);
  const antes = await titulo.boundingBox();
  await page.getByRole('button', { name: 'Accesibilidad' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Accesibilidad' });
  await expect(dialogo.getByRole('radio', { name: 'Normal' })).toBeChecked();
  await expect(dialogo.getByRole('radio', { name: 'Normal' })).toBeFocused();
  expect(await axe(page)).toEqual([]);
  await dialogo.getByRole('radio', { name: 'Muy grande' }).check();
  await dialogo.getByRole('checkbox', { name: /Alto contraste/ }).check();
  await dialogo.getByRole('checkbox', { name: /Reducir animaciones/ }).check();
  const raiz = page.locator('.ap-r');
  await expect(raiz).toHaveAttribute('data-texto', 'muy-grande');
  await expect(raiz).toHaveClass(/ap-alto-contraste/);
  await expect(raiz).toHaveClass(/ap-sin-movimiento/);
  expect(await axe(page)).toEqual([]);
  await page.keyboard.press('Escape');
  // El texto creció y la paleta pasó a negro sobre blanco (gana a la del kit, que va en línea).
  const despues = await titulo.boundingBox();
  expect(despues!.height).toBeGreaterThan(antes!.height * 1.2);
  expect(await raiz.evaluate((el) => ['--ap-texto', '--ap-fondo', '--ap-primario'].map((v) => getComputedStyle(el).getPropertyValue(v).trim()))).toEqual(['#000', '#fff', '#000']);
  expect(await axe(page)).toEqual([]);
  // Al volver a abrir el curso, las preferencias siguen.
  await page.reload();
  await expect(page.locator('.ap-r')).toHaveAttribute('data-texto', 'muy-grande');
  await expect(page.locator('.ap-r')).toHaveClass(/ap-alto-contraste/);
  await page.getByRole('button', { name: 'Accesibilidad' }).click();
  await expect(page.getByRole('dialog', { name: 'Accesibilidad' }).getByRole('radio', { name: 'Muy grande' })).toBeChecked();
});

test('SUP-104 · sin glosario ni ayuda en «Elementos visibles», el curso no muestra esos botones', async ({ page }) => {
  await page.goto(urlSin);
  await expect(page.getByRole('button', { name: 'Temario' })).toBeVisible();
  for (const x of ['Glosario', 'Ayuda', 'Accesibilidad']) await expect(page.getByRole('button', { name: x })).toHaveCount(0);
});
