// SUP-31 · Arrastrar y soltar en el paquete real (la carpeta HTML que arma @aptio/exporters, abierta con file://):
// en «Clasificar» cada elemento se arrastra desde su asa hasta la etiqueta de su grupo y en «Ordenar pasos» cada paso
// se arrastra a su lugar, con el ratón y con el dedo (Pointer Events de tipo touch). Escape cancela un arrastre; los
// botones y las flechas siguen siendo el camino con teclado (los prueban CP-093 y CP-101).
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { codigoReproductor, construirHtml } from '@aptio/exporters';
import { expect, type Locator, type Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { recursosLoto } from '../../../packages/exporters/test/loto.ts';
import { cursoLotoBase } from '../../../packages/player/test/catalogo.ts';
import { wavSilencio } from './api-simulada';

type Elemento = { id: string; grupoCorrecto: string };
type Paso = { id: string };
type Pantalla = { id: string; bloques: { tipo: string; interaccion?: { tipo: string; datos: Record<string, unknown> } }[] };

const base = cursoLotoBase();
const todas = base.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)) as unknown as Pantalla[];
const de = (id: string) => structuredClone(todas.find((p) => p.id === id)!);
const datos = (p: Pantalla) => p.bloques.find((b) => b.tipo === 'interaccion')!.interaccion!.datos;
// Clasificar (p10), Ordenar pasos (p15) y el cierre.
const pantallas = [de('p10'), de('p15'), de('p30')];
const elementos = datos(pantallas[0]!).elementos as Elemento[];
const pasos = (datos(pantallas[1]!).pasos as Paso[]).map((p) => p.id);
const curso = { ...base, id: `${base.id}-arrastre`, modulos: [{ ...base.modulos[0]!, capsulas: [{ ...base.modulos[0]!.capsulas[0]!, pantallas }] }] } as typeof base;

let url: string;
test.beforeAll(async () => {
  const recursos = recursosLoto().map((r) => (r.nombre.endsWith('.mp3') ? { ...r, datos: new Uint8Array(wavSilencio(200)) } : r));
  const { zip } = await construirHtml({ curso: curso as never, recursos, reproductor: await codigoReproductor() });
  const carpeta = mkdtempSync(join(tmpdir(), 'aptio-arrastre-'));
  const archivos = await JSZip.loadAsync(zip);
  for (const [ruta, f] of Object.entries(archivos.files)) {
    if (f.dir) continue;
    mkdirSync(dirname(join(carpeta, ruta)), { recursive: true });
    writeFileSync(join(carpeta, ruta), await f.async('uint8array'));
  }
  url = pathToFileURL(join(carpeta, 'index.html')).href;
});

const centro = async (l: Locator) => {
  const r = (await l.boundingBox())!;
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
};

/** Arrastre con el ratón, en pasos para que el reproductor vea el movimiento. */
async function conRaton(page: Page, desde: Locator, x: number, y: number) {
  const a = await centro(desde);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(a.x + 10, a.y + 10, { steps: 3 });
  await page.mouse.move(x, y, { steps: 8 });
  await page.mouse.up();
}

/** Arrastre con el dedo: Pointer Events de tipo touch sobre el asa (el navegador los manda allí con la captura). */
async function conDedo(desde: Locator, x: number, y: number) {
  const a = await centro(desde);
  const comun = { pointerId: 7, pointerType: 'touch', isPrimary: true, bubbles: true, composed: true };
  await desde.dispatchEvent('pointerdown', { ...comun, clientX: a.x, clientY: a.y, button: 0, buttons: 1 });
  for (let i = 1; i <= 6; i++) {
    await desde.dispatchEvent('pointermove', { ...comun, clientX: a.x + ((x - a.x) * i) / 6, clientY: a.y + ((y - a.y) * i) / 6, buttons: 1 });
  }
  await desde.dispatchEvent('pointerup', { ...comun, clientX: x, clientY: y, button: 0, buttons: 0 });
}

/** Espera que terminen las animaciones de entrada (también las del Shadow DOM): a mitad, las cajas se mueven. */
const quieto = (page: Page) => page.evaluate(async () => {
  for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
  const sombra = document.getElementById('curso')?.shadowRoot;
  const todas = new Set([...document.getAnimations(), ...(sombra?.getAnimations() ?? [])]);
  await Promise.all([...todas].filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined)));
});

const asaDe = (page: Page, id: string) => page.locator(`.ap-elemento[data-elemento="${id}"] .ap-asa`);
const zona = (page: Page, grupo: string) => page.locator(`.ap-soltar[data-zona="${grupo}"]`);
const orden = (page: Page) => page.locator('.ap-paso').evaluateAll((li) => li.map((x) => x.getAttribute('data-paso')!));

/** Lleva cada paso a su lugar arrastrándolo sobre el que hoy ocupa ese lugar (mitad de arriba). */
async function ordenarArrastrando(page: Page, arrastrar: (desde: Locator, x: number, y: number) => Promise<void>) {
  for (const [k, id] of pasos.entries()) {
    const actual = await orden(page);
    if (actual[k] === id) continue;
    await page.locator('.ap-paso').nth(k).scrollIntoViewIfNeeded();
    await page.locator(`.ap-paso[data-paso="${id}"]`).scrollIntoViewIfNeeded();
    await quieto(page);
    const destino = (await page.locator('.ap-paso').nth(k).boundingBox())!;
    await arrastrar(page.locator(`.ap-paso[data-paso="${id}"] .ap-asa`), destino.x + destino.width / 2, destino.y + 4);
    await expect.poll(() => orden(page).then((o) => o[k])).toBe(id);
  }
}

test('SUP-31 · con el ratón se clasifica arrastrando a la etiqueta del grupo y se ordena arrastrando cada paso', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('[data-interaccion="INT-02"]')).toBeVisible();
  await quieto(page);

  // Escape cancela el arrastre: soltar después no elige grupo.
  const primero = elementos[0]!;
  const a = await centro(asaDe(page, primero.id));
  const z = await centro(zona(page, primero.grupoCorrecto));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move(z.x, z.y, { steps: 8 });
  await expect(page.locator('.ap-fantasma')).toHaveCount(1);
  await expect(zona(page, primero.grupoCorrecto)).toHaveClass(/ap-sobre/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.ap-fantasma')).toHaveCount(0);
  await page.mouse.up();
  await expect(page.locator(`.ap-elemento[data-elemento="${primero.id}"] [aria-pressed="true"]`)).toHaveCount(0);

  for (const e of elementos) {
    // La leyenda queda fija arriba al desplazar: el elemento y su grupo se ven a la vez.
    await asaDe(page, e.id).scrollIntoViewIfNeeded();
    await quieto(page);
    const destino = await centro(zona(page, e.grupoCorrecto));
    await conRaton(page, asaDe(page, e.id), destino.x, destino.y);
    await expect(page.locator(`.ap-elemento[data-elemento="${e.id}"] [data-grupo="${e.grupoCorrecto}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  await expect(page.locator('.ap-fantasma')).toHaveCount(0);
  await page.getByRole('button', { name: 'Comprobar' }).click();
  await expect(page.locator('.ap-elemento.ap-acierto')).toHaveCount(elementos.length);
  // Después de comprobar ya no se arrastra.
  const despues = await centro(zona(page, elementos[0]!.grupoCorrecto === 'x' ? 'y' : elementos[0]!.grupoCorrecto));
  await conRaton(page, asaDe(page, elementos[0]!.id), despues.x, despues.y);
  await expect(page.locator('.ap-fantasma')).toHaveCount(0);

  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('[data-interaccion="INT-03"]')).toBeVisible();
  await quieto(page);
  expect(await orden(page)).not.toEqual(pasos);
  await ordenarArrastrando(page, (desde, x, y) => conRaton(page, desde, x, y));
  expect(await orden(page)).toEqual(pasos);
  await page.getByRole('button', { name: 'Comprobar' }).click();
  await expect(page.locator('.ap-paso.ap-acierto')).toHaveCount(pasos.length);
  await expect(page.locator('.ap-paso .ap-asa')).toHaveCount(0);
});

test('SUP-31 · con el dedo se clasifica y se ordena igual, en un celular', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await contexto.newPage();
  await page.goto(url);
  await expect(page.locator('[data-interaccion="INT-02"]')).toBeVisible();
  await quieto(page);
  // El asa no deja que el navegador desplace la pantalla mientras se arrastra.
  expect(await asaDe(page, elementos[0]!.id).evaluate((el) => getComputedStyle(el).touchAction)).toBe('none');

  for (const e of elementos) {
    await asaDe(page, e.id).scrollIntoViewIfNeeded();
    const z = zona(page, e.grupoCorrecto);
    await quieto(page);
    const destino = await centro(z);
    await conDedo(asaDe(page, e.id), destino.x, destino.y);
    await expect(page.locator(`.ap-elemento[data-elemento="${e.id}"] [data-grupo="${e.grupoCorrecto}"]`)).toHaveAttribute('aria-pressed', 'true');
  }
  // En el celular el aviso flotante tapa el pie: Comprobar se usa con el teclado (el mismo botón).
  await page.getByRole('button', { name: 'Comprobar' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('.ap-elemento.ap-acierto')).toHaveCount(elementos.length);

  await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await expect(page.locator('[data-interaccion="INT-03"]')).toBeVisible();
  await quieto(page);
  await ordenarArrastrando(page, (desde, x, y) => conDedo(desde, x, y));
  await expect(page.locator('.ap-fantasma')).toHaveCount(0);
  expect(await orden(page)).toEqual(pasos);
  await contexto.close();
});
