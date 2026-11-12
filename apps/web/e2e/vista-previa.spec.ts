// HU-1101 y HU-1102 · Vista previa con el reproductor único (CP-085) y bloqueo por actividad (CP-086).
// HU-0804 · Con algún texto en inglés, la vista previa ofrece el botón EN / ES del paquete bilingüe.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { cursoLoto, KIT_MINERA, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_VISTA = `/proyectos/${PROYECTO}/vista-previa`;

type Par = { a: { texto: { es: string } }; b: { texto: { es: string } } };
const pantallas = () => (cursoLoto().modulos as { capsulas: { pantallas: { id: string; bloques: { tipo: string; interaccion?: { datos: Record<string, unknown> } }[] }[] }[] }[])
  .flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
const paresDe = (id: string) => pantallas().find((p) => p.id === id)!.bloques.find((b) => b.tipo === 'interaccion')!.interaccion!.datos.pares as Par[];

/** Resuelve la memoria: primero mira todas las cartas de dos en dos y luego voltea cada pareja. */
async function resolverMemoria(juego: Locator, pares: Par[]) {
  const cartas = juego.locator('.ap-carta');
  const n = await cartas.count();
  const texto: string[] = [];
  for (let i = 0; i < n; i += 2) {
    await cartas.nth(i).click();
    await cartas.nth(i + 1).click();
    for (const j of [i, i + 1]) texto[j] = ((await cartas.nth(j).getAttribute('aria-label')) ?? '').replace(/^Carta \d+: /, '');
  }
  for (const p of pares) {
    const a = texto.indexOf(p.a.texto.es);
    const b = texto.indexOf(p.b.texto.es);
    if (await cartas.nth(a).evaluate((el) => el.classList.contains('ap-pareja'))) continue;
    await cartas.nth(a).click();
    await cartas.nth(b).click();
  }
}

const reproductor = (page: Page) => page.locator('.vista-previa-reproductor');
/** LOTO no muestra el contador en la cápsula (navegacion.mostrar): la pantalla se lee en el panel de seguimiento. */
const enPantalla = (page: Page, n: number) => expect(page.getByLabel('Seguimiento simulado').getByText(`${n} de 30`, { exact: true })).toBeVisible();

test.beforeEach(async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
});

test('desde el proyecto se abre la vista previa con el patrón que pide el curso (HU-1103: LOTO usa Historias)', async ({ page }) => {
  await page.goto(`/proyectos/${PROYECTO}`);
  await page.getByRole('link', { name: 'Vista previa' }).click();
  await expect(page).toHaveURL(URL_VISTA);
  await expect(page.getByRole('heading', { level: 1, name: 'Vista previa' })).toBeVisible();
  await expect(page.getByText('Así se verá en el LMS con el patrón «Historias» y la regla «actividades obligatorias».')).toBeVisible();
  // Ya no hay aviso de «solo Clásico» (SUP-32): el reproductor dibuja el patrón del curso.
  await expect(page.getByText(/Por ahora la vista previa y el paquete usan el patrón Clásico/)).toHaveCount(0);
  const r = reproductor(page);
  await expect(r.locator('[data-patron="historias"]')).toBeVisible();
  await expect(r.getByRole('heading', { level: 2, name: 'Bloqueo y etiquetado' })).toBeVisible();
  await enPantalla(page, 1);
  await expect(page.getByLabel('Seguimiento simulado').getByText('Incompleto')).toBeVisible();
});

test('CP-086 · con actividades obligatorias, Siguiente se deshabilita en la actividad y dice por qué', async ({ page }) => {
  await page.goto(URL_VISTA);
  const r = reproductor(page);
  const siguiente = r.getByRole('button', { name: 'Siguiente' });
  for (let i = 1; i < 7; i++) {
    await expect(siguiente).toBeEnabled();
    await siguiente.click();
  }
  await enPantalla(page, 7);
  await expect(siguiente).toBeDisabled();
  await expect(r.getByRole('status').filter({ hasText: 'Completa la actividad para continuar' })).toBeVisible();
  await expect(siguiente).toHaveAccessibleDescription('Completa la actividad para continuar');
  // Las flechas del teclado tampoco la saltan.
  await r.getByRole('heading', { level: 2 }).press('ArrowRight');
  await enPantalla(page, 7);
  // Desde el temario se puede volver atrás, pero no saltar más allá de la actividad pendiente.
  await r.getByRole('button', { name: 'Temario' }).click();
  const temario = r.getByRole('navigation', { name: 'Temario' });
  await expect(temario.getByRole('button', { name: /^9\. .*bloqueada$/ })).toBeDisabled();
  await expect(temario.getByRole('button', { name: /^3\. / })).toBeEnabled();
  await temario.getByRole('button', { name: 'Cerrar' }).click();

  await resolverMemoria(r.locator('[data-interaccion="INT-01"]'), paresDe('p07'));
  // Al mirar las cartas de dos en dos se cometen errores: el puntaje baja de 100 (100 × pares / (pares + errores × 0,5)).
  const resultado = r.getByText(/^Resultado: \d+ %$/);
  await expect(resultado).toBeVisible();
  const puntaje = Number((await resultado.textContent())!.match(/\d+/)![0]);
  expect(puntaje).toBeGreaterThan(0);
  await expect(siguiente).toBeEnabled();
  await expect(r.getByRole('status').filter({ hasText: 'Completa la actividad' })).toHaveCount(0);
  const seguimiento = page.getByLabel('Seguimiento simulado');
  // La memoria es formativa: suma puntos, pero no nota.
  await expect(seguimiento.locator('div').filter({ hasText: /^Puntos/ }).locator('dd')).toHaveText(String(puntaje));
  await expect(seguimiento.locator('div').filter({ hasText: /^Actividades hechas/ }).locator('dd')).toHaveText('1');
  await expect(seguimiento.getByText('Sin nota aún')).toBeVisible();
  await siguiente.click();
  await enPantalla(page, 8);
});

test('en revisión se salta a cualquier pantalla y se ven los ids; clasificar se hace con botones', async ({ page }) => {
  await page.goto(URL_VISTA);
  await page.getByRole('button', { name: 'Revisión' }).click();
  await page.getByLabel('Ir a la pantalla').selectOption('p10');
  const r = reproductor(page);
  await expect(r.getByText('p10', { exact: true })).toBeVisible();
  await expect(r.getByText('INT-02 · formativa')).toBeVisible();
  const comprobar = r.getByRole('button', { name: 'Comprobar' });
  await expect(comprobar).toBeDisabled();
  const grupos = r.locator('.ap-grupos');
  for (let i = 0; i < (await grupos.count()); i++) await grupos.nth(i).getByRole('button').first().click();
  await comprobar.click();
  await expect(r.getByText(/^Resultado: \d+ %$/)).toBeVisible();
  await expect(r.locator('.ap-elemento .ap-marca')).toHaveCount(7);
});

test('HU-0804 · sin inglés en el curso, la vista previa no muestra el botón de idioma', async ({ page }) => {
  await page.goto(URL_VISTA);
  const r = reproductor(page);
  await expect(r.getByRole('heading', { level: 2, name: 'Bloqueo y etiquetado' })).toBeVisible();
  await expect(r.locator('.ap-idioma')).toHaveCount(0);
});

test('HU-0804 · con el curso traducido, la vista previa cambia a inglés en la misma pantalla', async ({ page }) => {
  await page.unrouteAll();
  await simularApi(page, { conSesion: true, conProyectos: true, cursoTraducido: true });
  await page.goto(URL_VISTA);
  const r = reproductor(page);
  await expect(r.getByRole('heading', { level: 2, name: 'Bloqueo y etiquetado' })).toBeVisible();
  await r.getByRole('button', { name: 'Siguiente' }).click();
  await enPantalla(page, 2);
  await r.getByRole('button', { name: 'EN, ver en inglés' }).click();
  await enPantalla(page, 2);
  await expect(r.locator('.ap-titulo-pantalla')).toHaveText(/^\[EN\] /);
  await expect(r.getByRole('button', { name: 'ES, view in Spanish' })).toBeFocused();
});

test('celular, tableta y escritorio: el marco cambia y el reproductor se acomoda sin desbordar', async ({ page }) => {
  await page.goto(URL_VISTA);
  const r = reproductor(page);
  await enPantalla(page, 1);
  for (const [nombre, ancho] of [['Celular', 360], ['Tableta', 768], ['Escritorio', 1024]] as const) {
    await page.getByRole('button', { name: nombre, exact: true }).click();
    const caja = (await r.boundingBox())!;
    expect(caja.width).toBeLessThanOrEqual(ancho);
    const sinDesborde = await r.evaluate((el) => {
      const raiz = el.shadowRoot!.querySelector('.ap-r')!;
      return raiz.scrollWidth <= raiz.clientWidth;
    });
    expect(sinDesborde).toBe(true);
  }
  // En un celular de verdad la página tampoco se desplaza de lado.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Celular', exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('sin curso: dice cómo llegar a la vista previa', async ({ page }) => {
  await page.goto('/proyectos/00000000-0000-4000-8000-000000000702/vista-previa');
  await expect(page.getByText(/Este proyecto aún no tiene pantallas/)).toBeVisible();
});

test('CP-085 · la pantalla del paquete empaquetado es igual a la de la vista previa', async ({ page, browser }) => {
  // El mismo reproductor, empaquetado como va dentro del SCORM.
  const script = fileURLToPath(new URL('../../../packages/player/scripts/construir.mjs', import.meta.url));
  execFileSync(process.execPath, [script]);
  const paquete = fileURLToPath(new URL('../../../packages/player/dist/aptio-reproductor.js', import.meta.url));

  await page.goto(URL_VISTA);
  await page.getByRole('button', { name: 'Revisión' }).click();
  await page.getByLabel('Ir a la pantalla').selectOption('p10');
  const enVista = await reproductor(page).evaluate((el) => el.shadowRoot!.querySelector('.ap-pantalla')!.outerHTML);

  const otra = await browser.newPage();
  await otra.setContent('<!doctype html><html lang="es"><body><div id="curso" style="height:640px"></div></body></html>');
  await otra.addScriptTag({ path: paquete });
  const enPaquete = await otra.evaluate(({ curso, kit }) => {
    const el = document.getElementById('curso')!;
    (window as unknown as { AptioReproductor: { montar: (e: HTMLElement, c: unknown, o: unknown) => unknown } }).AptioReproductor.montar(el, curso, { kit, revision: true, inicio: 'p10' });
    return el.shadowRoot!.querySelector('.ap-pantalla')!.outerHTML;
  }, { curso: cursoLoto(), kit: { paleta: KIT_MINERA.paleta, tipografias: KIT_MINERA.tipografias, personaje: null } });
  await otra.close();
  expect(enPaquete).toContain('data-pantalla="p10"');
  expect(enPaquete).toBe(enVista);
});
