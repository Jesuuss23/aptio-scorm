// HU-1203 · CP-093 · El HTML autocontenido del caso LOTO sin conexión: se descomprime el ZIP real que arma
// @aptio/exporters en una carpeta temporal y se abre `file:///…/index.html` con el navegador sin red. Toda petición que no
// sea `file://` se bloquea y se cuenta: deben ser cero. Se recorren las 30 pantallas resolviendo cada actividad hasta el
// cierre, con las imágenes y los SVG cargados y sin llamar a ningún LMS.
// Los recursos de prueba de LOTO son marcadores; aquí la imagen es un PNG real y los audios, WAV de silencio cortos.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { codigoReproductor, construirHtml } from '@aptio/exporters';
import { expect, type Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { cursoLoto, recursosLoto } from '../../../packages/exporters/test/loto.ts';
import { wavSilencio } from './api-simulada';

type Datos = Record<string, unknown>;
type Pantalla = { id: string; bloques: { tipo: string; interaccion?: { tipo: string; datos: Datos } }[] };
const curso = cursoLoto();
const pantallas = (curso as unknown as { modulos: { capsulas: { pantallas: Pantalla[] }[] }[] }).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
const actividad = (p: Pantalla) => p.bloques.find((b) => b.tipo === 'interaccion')?.interaccion;
const es = (x: unknown) => (x as { es?: string; texto?: { es?: string } })?.es ?? (x as { texto?: { es?: string } })?.texto?.es ?? '';

/** PNG real de 2×2 píxeles. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAqWAIDdkGx7QAAAABJRU5ErkJggg==', 'base64');

let carpeta: string;
test.beforeAll(async () => {
  const recursos = recursosLoto().map((r) => (r.nombre.endsWith('.png') ? { ...r, datos: new Uint8Array(PNG) } : r.nombre.endsWith('.mp3') ? { ...r, datos: new Uint8Array(wavSilencio(200)) } : r));
  const { zip } = await construirHtml({ curso, recursos, reproductor: await codigoReproductor() });
  carpeta = mkdtempSync(join(tmpdir(), 'aptio-html-'));
  const archivos = await JSZip.loadAsync(zip);
  for (const [ruta, f] of Object.entries(archivos.files)) {
    if (f.dir) continue;
    mkdirSync(dirname(join(carpeta, ruta)), { recursive: true });
    writeFileSync(join(carpeta, ruta), await f.async('uint8array'));
  }
});

// ---------- Cómo se resuelve cada actividad del catálogo, con sus datos ----------

async function memoria(page: Page, d: Datos) {
  const cartas = page.locator('.ap-carta');
  const n = await cartas.count();
  const texto: string[] = [];
  for (let i = 0; i < n; i += 2) {
    await cartas.nth(i).click();
    await cartas.nth(i + 1).click();
    for (const j of [i, i + 1]) texto[j] = ((await cartas.nth(j).getAttribute('aria-label')) ?? '').replace(/^Carta \d+: /, '');
  }
  for (const p of d.pares as { a: unknown; b: unknown }[]) {
    const a = texto.indexOf(es(p.a));
    if (await cartas.nth(a).evaluate((el) => el.classList.contains('ap-pareja'))) continue;
    await cartas.nth(a).click();
    await cartas.nth(texto.indexOf(es(p.b))).click();
  }
}

async function clasificar(page: Page, d: Datos) {
  for (const e of d.elementos as { id: string; grupoCorrecto: string }[]) await page.locator(`.ap-elemento[data-elemento="${e.id}"] [data-grupo="${e.grupoCorrecto}"]`).click();
  await page.getByRole('button', { name: 'Comprobar' }).click();
}

/** Ordenar pasos: sube cada paso hasta su lugar con «↑» y comprueba. */
async function ordenar(page: Page, d: Datos) {
  const ids = (d.pasos as { id: string }[]).map((p) => p.id);
  for (const [k, id] of ids.entries()) {
    for (;;) {
      const actual = await page.locator('.ap-paso').evaluateAll((li) => li.map((x) => x.getAttribute('data-paso')));
      if (actual.indexOf(id) <= k) break;
      await page.locator(`.ap-paso[data-paso="${id}"] [data-mover="-1"]`).click();
    }
  }
  await page.getByRole('button', { name: 'Comprobar' }).click();
}

/** Decisión: en cada situación, la opción con más puntaje; luego Continuar o Ver resultado. */
async function decision(page: Page, d: Datos) {
  const opciones = new Map((d.nodos as { opciones: { id: string; puntaje: number }[] }[]).flatMap((n) => n.opciones.map((o) => [o.id, o.puntaje])));
  for (;;) {
    const visibles = await page.locator('.ap-decision .ap-opcion:not([disabled])').evaluateAll((b) => b.map((x) => x.getAttribute('data-opcion')!));
    if (!visibles.length) break;
    const mejor = visibles.sort((a, b) => (opciones.get(b) ?? 0) - (opciones.get(a) ?? 0))[0]!;
    await page.locator(`.ap-decision [data-opcion="${mejor}"]`).click();
    const seguir = page.locator('.ap-decision .ap-acciones .ap-primario');
    const fin = (await seguir.textContent()) !== 'Continuar';
    await seguir.click();
    if (fin) break;
  }
}

async function exploracion(page: Page) {
  const puntos = page.locator('.ap-punto');
  for (let i = 0; i < (await puntos.count()); i++) await puntos.nth(i).click();
}

/** Quiz (formativo o sumativo): marca las opciones correctas de cada pregunta que aparece y avanza. */
async function quiz(page: Page, d: Datos) {
  const correctas = new Set((d.preguntas as { opciones: { id: string; correcta: boolean }[] }[]).flatMap((p) => p.opciones.filter((o) => o.correcta).map((o) => o.id)));
  for (;;) {
    const visibles = await page.locator('.ap-quiz .ap-opcion:not([disabled])').evaluateAll((b) => b.map((x) => x.getAttribute('data-opcion')!));
    if (!visibles.length) break;
    for (const id of visibles.filter((x) => correctas.has(x))) await page.locator(`.ap-quiz [data-opcion="${id}"]`).click();
    const responder = page.locator('.ap-quiz .ap-acciones .ap-primario', { hasText: 'Responder' });
    if (await responder.count()) await responder.click();
    const seguir = page.locator('.ap-quiz .ap-acciones .ap-primario');
    const fin = (await seguir.textContent()) === 'Ver resultado';
    await seguir.click();
    if (fin) break;
  }
}

/** Deslizar: verdadero o falso según la afirmación, y la siguiente. */
async function deslizar(page: Page, d: Datos) {
  const verdad = new Map((d.afirmaciones as { texto: unknown; verdadera: boolean }[]).map((a) => [`«${es(a.texto)}»`, a.verdadera]));
  for (;;) {
    const tarjeta = page.locator('.ap-afirmacion p');
    if (!(await page.locator('.ap-deslizar [data-respuesta]:not([disabled])').count())) break;
    await page.locator(`.ap-deslizar [data-respuesta="${verdad.get((await tarjeta.textContent()) ?? '') ? 'verdadero' : 'falso'}"]`).click();
    await page.locator('.ap-deslizar .ap-acciones .ap-primario').click();
  }
}

async function resolver(page: Page, tipo: string, d: Datos) {
  const raiz = page.locator(`[data-interaccion="${tipo}"]`);
  await expect(raiz).toBeVisible();
  if (tipo === 'INT-01') await memoria(page, d);
  else if (tipo === 'INT-02') await clasificar(page, d);
  else if (tipo === 'INT-03') await ordenar(page, d);
  else if (tipo === 'INT-05') await quiz(page, d);
  else if (tipo === 'INT-06') await exploracion(page);
  else if (tipo === 'INT-07') await deslizar(page, d);
  else if (tipo === 'INT-08') await decision(page, d);
  else throw new Error(`Sin estrategia para ${tipo}`);
}

test('CP-093 · la carpeta exportada abre index.html sin internet ni LMS y funciona completa: 30 pantallas hasta el cierre', async ({ page, context }) => {
  test.setTimeout(120_000);
  const externas: string[] = [];
  await context.route(/^(?!file:)/, (r) => { externas.push(r.request().url()); return r.abort('internetdisconnected'); });
  page.on('request', (r) => { if (!r.url().startsWith('file:')) externas.push(r.url()); });
  const errores: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('console', (m) => { if (m.type() === 'warning' || m.type() === 'error') errores.push(m.text()); });
  await context.setOffline(true);

  await page.goto(pathToFileURL(join(carpeta, 'index.html')).href);
  await expect(page).toHaveTitle('Bloqueo y etiquetado');
  const siguiente = page.getByRole('button', { name: 'Siguiente', exact: true });
  const vistas: string[] = [];
  for (const [n, p] of pantallas.entries()) {
    const visible = page.locator(`[data-pantalla="${p.id}"]`);
    await expect(visible).toBeVisible();
    vistas.push(p.id);
    // Imágenes y SVG de la pantalla, cargados desde la carpeta.
    for (const img of await visible.locator('img').all()) {
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), { message: `imagen de ${p.id}` }).toBe(true);
      expect(await img.getAttribute('src')).toMatch(/^recursos\//);
    }
    await expect(visible.locator('.ap-sin-imagen')).toHaveCount(0);
    if (p.bloques.some((b) => b.tipo === 'personaje')) await expect(visible.locator('.ap-personaje svg:not(.ap-silueta)'), `personaje de ${p.id}`).toBeVisible();
    for (const v of await visible.locator('video').all()) expect(await v.getAttribute('src')).toMatch(/^recursos\/.*\.mp4$/);
    const act = actividad(p);
    if (act) {
      await expect(siguiente).toBeDisabled();
      await resolver(page, act.tipo, act.datos);
    }
    if (n === pantallas.length - 1) break;
    await expect(siguiente).toBeEnabled({ timeout: 10_000 });
    await siguiente.click();
  }
  expect(vistas).toHaveLength(30);
  await expect(page.locator('[data-pantalla="p30"]')).toBeVisible();

  // El estado final es el del curso terminado, sin conexión con ningún LMS.
  expect(await page.evaluate(() => (window as unknown as { AptioPaquete: { lms: { conectado: boolean } } }).AptioPaquete.lms.conectado)).toBe(false);
  const final = await page.evaluate(() => (window as unknown as { AptioPaquete: { reproductor: { estado: () => { pantallaId: string; vistas: string[]; resultados: Record<string, { completada: boolean }> } } } }).AptioPaquete.reproductor.estado());
  expect(final.pantallaId).toBe('p30');
  expect(new Set(final.vistas).size).toBe(30);
  const conActividad = pantallas.filter((p) => actividad(p)).map((p) => p.id);
  expect(conActividad).toEqual(['p07', 'p10', 'p15', 'p17', 'p20', 'p22', 'p25', 'p26', 'p28']);
  expect(conActividad.every((id) => final.resultados[id]?.completada)).toBe(true);

  // Sin red, sin LMS y sin modo diagnóstico.
  expect(externas).toEqual([]);
  expect(errores).toEqual([]);
  await page.keyboard.press('Control+Alt+Shift+KeyD');
  await expect(page.getByRole('dialog', { name: 'Modo diagnóstico' })).toHaveCount(0);
});

test('con ?diagnostico=1 el HTML tampoco abre el modo diagnóstico: no hay LMS', async ({ page, context }) => {
  await context.setOffline(true);
  await page.goto(`${pathToFileURL(join(carpeta, 'index.html')).href}?diagnostico=1`);
  await expect(page.locator('[data-pantalla="p01"]')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});
