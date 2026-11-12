// HU-1401 · CP-101 · Accesibilidad de la cápsula exportada (la carpeta HTML real que arma @aptio/exporters, abierta
// con file:// y sin red; el SCORM lleva el mismo reproductor).
// - Solo teclado: Tab y Mayús+Tab para llegar a cada control, Enter y Espacio para usarlo y flechas para pasar de
//   pantalla. En cada parada el foco está dentro del curso, se ve (contorno de 2 px o más) y nada lo tapa; después de
//   cada acción el foco sigue en el curso (nunca en el body).
// - axe-core con las reglas WCAG 2.2 A y AA en cada pantalla, al entrar y al terminar su actividad: cero violaciones.
// - Un curso sintético con las 8 interacciones (LOTO no trae Tarjetas) y un kit de poco contraste, de punta a punta.
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import AxeBuilder from '@axe-core/playwright';
import { codigoReproductor, construirHtml, type EntradaHtml } from '@aptio/exporters';
import { expect, type Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { cursoLoto, recursosLoto } from '../../../packages/exporters/test/loto.ts';
import { cursoCatalogo } from '../../../packages/player/test/catalogo.ts';
import { wavSilencio } from './api-simulada';

type Datos = Record<string, unknown>;
type Pantalla = { id: string; bloques: { tipo: string; interaccion?: { tipo: string; datos: Datos } }[] };
type Curso = ReturnType<typeof cursoLoto>;
const pantallasDe = (c: Curso) => (c as unknown as { modulos: { capsulas: { pantallas: Pantalla[] }[] }[] }).modulos.flatMap((m) => m.capsulas.flatMap((x) => x.pantallas));
const actividad = (p: Pantalla) => p.bloques.find((b) => b.tipo === 'interaccion')?.interaccion;
const es = (x: unknown) => (x as { es?: string; texto?: { es?: string } })?.es ?? (x as { texto?: { es?: string } })?.texto?.es ?? '';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8z8Dwn4GBgYGJgYGBAQAqWAIDdkGx7QAAAABJRU5ErkJggg==', 'base64');
/** Kit de poco contraste: el verde da 2,8:1 sobre blanco y el naranja, 2,4:1. El reproductor debe ajustarlos (SUP-63). */
const KIT_POCO_CONTRASTE = { paleta: { primario: '#0B3D91', secundario: '#4CAF50', acento: '#F28C28' } };

async function carpetaHtml(curso: Curso, kit?: EntradaHtml['kit']) {
  const recursos = recursosLoto().map((r) => (r.nombre.endsWith('.png') ? { ...r, datos: new Uint8Array(PNG) } : r.nombre.endsWith('.mp3') ? { ...r, datos: new Uint8Array(wavSilencio(200)) } : r));
  const { zip } = await construirHtml({ curso, recursos, reproductor: await codigoReproductor(), kit });
  const carpeta = mkdtempSync(join(tmpdir(), 'aptio-a11y-'));
  const archivos = await JSZip.loadAsync(zip);
  for (const [ruta, f] of Object.entries(archivos.files)) {
    if (f.dir) continue;
    mkdirSync(dirname(join(carpeta, ruta)), { recursive: true });
    writeFileSync(join(carpeta, ruta), await f.async('uint8array'));
  }
  return pathToFileURL(join(carpeta, 'index.html')).href;
}

const loto = cursoLoto();
const catalogo = cursoCatalogo() as unknown as Curso;
let urlLoto: string;
let urlCatalogo: string;
test.beforeAll(async () => {
  urlLoto = await carpetaHtml(loto);
  urlCatalogo = await carpetaHtml(catalogo, KIT_POCO_CONTRASTE);
});

// ---------- El foco, mirado dentro del Shadow DOM del reproductor ----------

type Foco = { enCurso: boolean; descripcion: string; contorno: number; tapado: boolean; dentroDeVista: boolean; titulo: boolean };

/** El elemento enfocado de verdad (atravesando el Shadow DOM) y cómo se ve. */
const foco = (page: Page): Promise<Foco> => page.evaluate(() => {
  let e = document.activeElement as HTMLElement | null;
  while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement as HTMLElement;
  if (!e || e === document.body) return { enCurso: false, descripcion: 'body', contorno: 0, tapado: true, dentroDeVista: false, titulo: false };
  const raiz = e.getRootNode() as ShadowRoot | Document;
  const enCurso = raiz instanceof ShadowRoot && (raiz.host as HTMLElement).id === 'curso';
  const cs = getComputedStyle(e);
  const r = e.getBoundingClientRect();
  const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
  const arriba = raiz.elementFromPoint(cx, cy);
  return {
    enCurso,
    descripcion: `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} «${(e.getAttribute('aria-label') ?? e.textContent ?? '').trim().slice(0, 50)}»`,
    contorno: cs.outlineStyle === 'none' ? 0 : parseFloat(cs.outlineWidth),
    tapado: !(arriba && (arriba === e || e.contains(arriba))),
    dentroDeVista: cx >= 0 && cy >= 0 && cx <= innerWidth && cy <= innerHeight,
    titulo: e.classList.contains('ap-titulo-pantalla'),
  };
});

/** Después de una acción el foco sigue en el curso: nunca en el body ni en un control que se quitó. */
async function focoEnCurso(page: Page, despues: string) {
  await expect.poll(async () => (await foco(page)).enCurso, { message: `foco en el curso después de ${despues}` }).toBe(true);
}

let paradas = 0;
let atras = 0;

/**
 * Llega con Tab (o Mayús+Tab, si el destino está antes en la página) al control que cumple `selector` y revisa cada
 * parada: dentro del curso, con contorno visible de 2 px o más, en la vista y sin nada encima.
 */
async function llegar(page: Page, selector: string) {
  for (let i = 0; i < 150; i++) {
    const estado = await page.evaluate((sel) => {
      const host = document.getElementById('curso')!;
      const sombra = host.shadowRoot!;
      const destino = sombra.querySelector(sel);
      if (!destino) return 'sin-destino';
      let e = document.activeElement as Element | null;
      while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement;
      if (e === destino) return 'listo';
      if (!e || e === document.body || e.getRootNode() !== sombra) return 'adelante';
      return e.compareDocumentPosition(destino) & Node.DOCUMENT_POSITION_PRECEDING ? 'atras' : 'adelante';
    }, selector);
    if (estado === 'listo') return;
    if (estado === 'sin-destino') throw new Error(`No hay ${selector}`);
    await page.keyboard.press(estado === 'atras' ? 'Shift+Tab' : 'Tab');
    if (estado === 'atras') atras++;
    paradas++;
    const f = await foco(page);
    expect(f.enCurso, `Tab deja el foco fuera del curso (${f.descripcion})`).toBe(true);
    expect(f.contorno, `foco sin contorno visible en ${f.descripcion}`).toBeGreaterThanOrEqual(2);
    expect(f.dentroDeVista, `foco fuera de la vista en ${f.descripcion}`).toBe(true);
    expect(f.tapado, `foco tapado en ${f.descripcion}`).toBe(false);
  }
  throw new Error(`No se llegó a ${selector} con el teclado`);
}

/** Llega con el teclado y usa el control: Enter o Espacio, como haría cualquiera. */
async function usar(page: Page, selector: string, tecla: 'Enter' | 'Space' = 'Enter') {
  await llegar(page, selector);
  await page.keyboard.press(tecla);
  await focoEnCurso(page, `${tecla} en ${selector}`);
}

const leer = (page: Page, selector: string, atributo: string) => page.locator(`#curso ${selector}`).first().getAttribute(atributo);
const contar = (page: Page, selector: string) => page.locator(`#curso ${selector}`).count();
const texto = (page: Page, selector: string) => page.locator(`#curso ${selector}`).first().textContent();

// ---------- Cada actividad del catálogo, solo con teclado ----------

async function memoria(page: Page, d: Datos) {
  const n = await contar(page, '.ap-carta');
  const vistos: string[] = [];
  for (let i = 0; i < n; i += 2) {
    for (const j of [i, i + 1]) {
      await usar(page, `.ap-carta[data-carta="${j}"]`, j % 2 ? 'Space' : 'Enter');
      vistos[j] = ((await leer(page, `.ap-carta[data-carta="${j}"]`, 'aria-label')) ?? '').replace(/^Carta \d+: /, '');
    }
  }
  for (const p of d.pares as { a: unknown; b: unknown }[]) {
    const [a, b] = [vistos.indexOf(es(p.a)), vistos.indexOf(es(p.b))];
    if ((await leer(page, `.ap-carta[data-carta="${a}"]`, 'class'))?.includes('ap-pareja')) continue;
    await usar(page, `.ap-carta[data-carta="${a}"]`);
    await usar(page, `.ap-carta[data-carta="${b}"]`);
  }
}

async function clasificar(page: Page, d: Datos) {
  for (const e of d.elementos as { id: string; grupoCorrecto: string }[]) await usar(page, `.ap-elemento[data-elemento="${e.id}"] [data-grupo="${e.grupoCorrecto}"]`, 'Space');
  await usar(page, '.ap-clasificar .ap-acciones .ap-primario');
}

async function ordenar(page: Page, d: Datos) {
  const ids = (d.pasos as { id: string }[]).map((p) => p.id);
  for (const [k, id] of ids.entries()) {
    for (;;) {
      const actual = await page.locator('#curso .ap-paso').evaluateAll((li) => li.map((x) => x.getAttribute('data-paso')));
      if (actual.indexOf(id) <= k) break;
      await usar(page, `.ap-paso[data-paso="${id}"] [data-mover="-1"]`);
    }
  }
  await usar(page, '.ap-ordenar .ap-acciones .ap-primario, .ap-pasos ~ .ap-acciones .ap-primario');
}

async function tarjetas(page: Page) {
  const ids = await page.locator('#curso .ap-tarjeta').evaluateAll((b) => b.map((x) => x.getAttribute('data-tarjeta')!));
  for (const id of ids) {
    await usar(page, `.ap-tarjeta[data-tarjeta="${id}"]`, 'Space');
    expect(await leer(page, `.ap-tarjeta[data-tarjeta="${id}"]`, 'aria-pressed')).toBe('true');
  }
}

async function decision(page: Page, d: Datos) {
  const puntos = new Map((d.nodos as { opciones: { id: string; puntaje: number }[] }[]).flatMap((n) => n.opciones.map((o) => [o.id, o.puntaje])));
  for (;;) {
    const visibles = await page.locator('#curso .ap-decision .ap-opcion:not([disabled])').evaluateAll((b) => b.map((x) => x.getAttribute('data-opcion')!));
    if (!visibles.length) break;
    const mejor = visibles.sort((a, b) => (puntos.get(b) ?? 0) - (puntos.get(a) ?? 0))[0]!;
    await usar(page, `.ap-decision [data-opcion="${mejor}"]`);
    const fin = (await texto(page, '.ap-decision .ap-acciones .ap-primario')) !== 'Continuar';
    await usar(page, '.ap-decision .ap-acciones .ap-primario');
    if (fin) break;
  }
}

async function exploracion(page: Page) {
  const ids = await page.locator('#curso .ap-punto').evaluateAll((b) => b.map((x) => x.getAttribute('data-punto')!));
  for (const id of ids) await usar(page, `.ap-punto[data-punto="${id}"]`);
}

async function quiz(page: Page, d: Datos, opciones: { quitarLimite?: boolean } = {}) {
  const correctas = new Set((d.preguntas as { opciones: { id: string; correcta: boolean }[] }[]).flatMap((p) => p.opciones.filter((o) => o.correcta).map((o) => o.id)));
  if (opciones.quitarLimite) {
    await usar(page, '.ap-quiz .ap-quitar-tiempo');
    await expect(page.locator('#curso .ap-tiempo')).toHaveText('Sin límite de tiempo');
    await expect(page.locator('#curso .ap-quitar-tiempo')).toHaveCount(0);
    expect((await foco(page)).descripcion).toMatch(/^p\.ap-enunciado/);
  }
  for (;;) {
    const visibles = await page.locator('#curso .ap-quiz .ap-opcion:not([disabled])').evaluateAll((b) => b.map((x) => x.getAttribute('data-opcion')!));
    if (!visibles.length) break;
    for (const id of visibles.filter((x) => correctas.has(x))) await usar(page, `.ap-quiz [data-opcion="${id}"]`, 'Space');
    if ((await texto(page, '.ap-quiz .ap-acciones .ap-primario')) === 'Responder') await usar(page, '.ap-quiz .ap-acciones .ap-primario');
    const fin = (await texto(page, '.ap-quiz .ap-acciones .ap-primario')) === 'Ver resultado';
    await usar(page, '.ap-quiz .ap-acciones .ap-primario');
    if (fin) break;
    if (opciones.quitarLimite) await expect(page.locator('#curso .ap-tiempo')).toHaveText('Sin límite de tiempo');
  }
}

async function deslizar(page: Page, d: Datos) {
  const verdad = new Map((d.afirmaciones as { texto: unknown; verdadera: boolean }[]).map((a) => [`«${es(a.texto)}»`, a.verdadera]));
  for (;;) {
    if (!(await contar(page, '.ap-deslizar [data-respuesta]:not([disabled])'))) break;
    const dice = verdad.get((await texto(page, '.ap-afirmacion p')) ?? '') ? 'verdadero' : 'falso';
    await usar(page, `.ap-deslizar [data-respuesta="${dice}"]`);
    await usar(page, '.ap-deslizar .ap-acciones .ap-primario');
  }
}

async function resolver(page: Page, tipo: string, d: Datos, opciones: { quitarLimite?: boolean } = {}) {
  await expect(page.locator(`#curso [data-interaccion="${tipo}"]`)).toBeVisible();
  if (tipo === 'INT-01') await memoria(page, d);
  else if (tipo === 'INT-02') await clasificar(page, d);
  else if (tipo === 'INT-03') await ordenar(page, d);
  else if (tipo === 'INT-04') await tarjetas(page);
  else if (tipo === 'INT-05') await quiz(page, d, opciones);
  else if (tipo === 'INT-06') await exploracion(page);
  else if (tipo === 'INT-07') await deslizar(page, d);
  else if (tipo === 'INT-08') await decision(page, d);
  else throw new Error(`Sin estrategia para ${tipo}`);
  // Al terminar, el foco quedó en el curso (en el resultado o en el último control usado), no en el vacío.
  await focoEnCurso(page, `terminar ${tipo}`);
}

// ---------- axe ----------

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Espera que terminen las animaciones de entrada: a mitad del fundido el texto tiene menos contraste del real. */
const sinAnimaciones = (page: Page) => page.evaluate(async () => {
  // Dos cuadros primero: una pantalla recién insertada todavía no creó sus animaciones. Las del Shadow DOM no salen en
  // `document.getAnimations()`: se piden también a la raíz del reproductor.
  for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
  const sombra = document.getElementById('curso')?.shadowRoot;
  const todas = new Set([...document.getAnimations(), ...(sombra?.getAnimations() ?? [])]);
  await Promise.all([...todas]
    .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
    .map((a) => a.finished.catch(() => undefined)));
});

async function auditar(page: Page, donde: string, hallazgos: string[]) {
  await sinAnimaciones(page);
  const { violations } = await new AxeBuilder({ page }).withTags(REGLAS).analyze();
  for (const v of violations) hallazgos.push(`${donde} · ${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

// ---------- El recorrido ----------

/**
 * Recorre todas las pantallas solo con teclado: la actividad se resuelve con Tab, Enter y Espacio; se pasa de pantalla
 * con la flecha derecha cuando el foco está fuera de una actividad y, si no, con Tab hasta «Siguiente» y Enter.
 */
async function recorrer(page: Page, url: string, pantallas: Pantalla[], opciones: { axe?: string[]; quitarLimite?: boolean } = {}) {
  const errores: string[] = [];
  const externas: string[] = [];
  page.on('pageerror', (e) => errores.push(e.message));
  page.on('request', (r) => { if (!r.url().startsWith('file:')) externas.push(r.url()); });
  await page.context().setOffline(true);
  await page.goto(url);
  const siguiente = page.getByRole('button', { name: 'Siguiente', exact: true });
  let conFlecha = 0;
  for (const [n, p] of pantallas.entries()) {
    await expect(page.locator(`#curso [data-pantalla="${p.id}"]`)).toBeVisible();
    if (opciones.axe) await auditar(page, `${p.id} al entrar`, opciones.axe);
    const act = actividad(p);
    if (act) {
      await resolver(page, act.tipo, act.datos, opciones);
      if (opciones.axe) await auditar(page, `${p.id} al terminar`, opciones.axe);
    }
    if (n === pantallas.length - 1) break;
    await expect(siguiente).toBeEnabled({ timeout: 10_000 });
    // Las flechas pasan de pantalla con el foco en el curso y fuera de una actividad (ahí las usa la actividad).
    const flecha = await page.evaluate(() => {
      let e = document.activeElement as Element | null;
      while (e?.shadowRoot?.activeElement) e = e.shadowRoot.activeElement;
      return Boolean(e && e.getRootNode() instanceof ShadowRoot && !e.closest('.ap-actividad, .ap-temario'));
    });
    if (flecha && n % 2 === 0) {
      await page.keyboard.press('ArrowRight');
      conFlecha++;
    } else {
      await usar(page, '.ap-nav.ap-primario');
    }
    // Al cambiar de pantalla, el foco va a su título (el lector lo anuncia).
    await expect(page.locator(`#curso [data-pantalla="${pantallas[n + 1]!.id}"]`)).toBeVisible();
    await expect.poll(async () => (await foco(page)).titulo, { message: `foco en el título de ${pantallas[n + 1]!.id}` }).toBe(true);
  }
  expect(errores).toEqual([]);
  expect(externas).toEqual([]);
  return { conFlecha };
}

const estado = (page: Page) => page.evaluate(() => (window as unknown as { AptioPaquete: { reproductor: { estado: () => { pantallaId: string; resultados: Record<string, { completada: boolean }> } } } }).AptioPaquete.reproductor.estado());

test.beforeEach(() => { paradas = 0; atras = 0; });

test('CP-101 · LOTO solo con teclado: de p01 a p30, las 9 actividades, con el foco visible y dentro del curso', async ({ page }) => {
  test.setTimeout(240_000);
  const pantallas = pantallasDe(loto);
  const { conFlecha } = await recorrer(page, urlLoto, pantallas);
  expect(conFlecha, 'se usó la flecha derecha para pasar de pantalla').toBeGreaterThan(0);
  const final = await estado(page);
  expect(final.pantallaId).toBe('p30');
  const conActividad = pantallas.filter((p) => actividad(p)).map((p) => p.id);
  expect(conActividad).toHaveLength(9);
  expect(conActividad.every((id) => final.resultados[id]?.completada)).toBe(true);
  expect(paradas).toBeGreaterThan(100);
  expect(atras, 'también se usó Mayús+Tab').toBeGreaterThan(0);
});

test('CP-101 · las 8 interacciones del catálogo solo con teclado, con un kit de poco contraste y el reto sin límite de tiempo', async ({ page }) => {
  test.setTimeout(180_000);
  const pantallas = pantallasDe(catalogo);
  const tipos = pantallas.map((p) => actividad(p)?.tipo).filter(Boolean);
  expect(tipos).toEqual(['INT-01', 'INT-02', 'INT-03', 'INT-04', 'INT-05', 'INT-06', 'INT-07', 'INT-08']);
  const hallazgos: string[] = [];
  await recorrer(page, urlCatalogo, pantallas, { axe: hallazgos, quitarLimite: true });
  const final = await estado(page);
  expect(pantallas.filter((p) => actividad(p)).every((p) => final.resultados[p.id]?.completada)).toBe(true);
  expect(hallazgos).toEqual([]);
  // El kit no se cambió, pero el texto de los aciertos y el foco usan su variante legible.
  const variables = await page.evaluate(() => {
    const r = document.getElementById('curso')!.shadowRoot!.querySelector<HTMLElement>('.ap-r')!;
    const cs = getComputedStyle(r);
    return { secundario: cs.getPropertyValue('--ap-secundario').trim(), bien: cs.getPropertyValue('--ap-bien-texto').trim(), acento: cs.getPropertyValue('--ap-acento').trim(), foco: cs.getPropertyValue('--ap-foco').trim() };
  });
  expect(variables.secundario).toBe('#4CAF50');
  expect(variables.acento).toBe('#F28C28');
  expect(variables.bien).not.toBe('#4CAF50');
  expect(variables.foco).not.toBe('#F28C28');
});

test('axe · WCAG 2.2 A y AA en las 30 pantallas de LOTO, al entrar y al terminar cada actividad: cero violaciones', async ({ page }) => {
  test.setTimeout(240_000);
  const hallazgos: string[] = [];
  await recorrer(page, urlLoto, pantallasDe(loto), { axe: hallazgos });
  expect(hallazgos).toEqual([]);
});
