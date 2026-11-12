// HU-0804 · CP-079 · Paquete bilingüe de LOTO (ES + EN en el mismo SCORM 1.2) en el LMS de prueba: se llega a la
// pantalla 8 resolviendo la memoria de p07, se cambia a inglés con el botón de la barra y la cápsula sigue en p08 con los
// mismos puntos y el texto en inglés; suspend_data guarda `en` con LMSCommit y, al volver a entrar, abre en inglés.
// El inglés es el de la traducción simulada («[EN] …»), como queda tras HU-0801 en modo simulado.
// axe-core WCAG 2.2 A/AA con el botón de idioma visible, en español y en inglés: cero violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type FrameLocator, type Page, test } from '@playwright/test';
import { aplanar, type CursoReproductor, huellaCurso } from '@aptio/player';
import { cursoLoto, traducirLoto } from '../../../packages/exporters/test/loto.ts';
import { abrirEnLms, type Curso, pantallaVisible, registro, reingresar, salir, valores } from './lms-prueba';

type Par = { a: { texto: { es: string } }; b: { texto: { es: string } } };
type Pantalla = { id: string; bloques: { tipo: string; interaccion?: { datos: { pares?: Par[] } } }[] };

const curso = traducirLoto(cursoLoto());
const orden = aplanar(curso as unknown as CursoReproductor).map((x) => x.pantalla.id);
const H = huellaCurso(curso.id, orden);
const pares = () => ((curso as Curso).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)) as unknown as Pantalla[])
  .find((p) => p.id === 'p07')!.bloques.find((b) => b.tipo === 'interaccion')!.interaccion!.datos.pares!;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

type Estado = { pantallaId: string; puntos: number; progreso: number; vistas: string[]; resultados: Record<string, unknown> };
const estadoDe = (page: Page, marca: RegExp) => page.frame({ url: marca })!.evaluate(() => (window as unknown as { AptioPaquete: { reproductor: { estado: () => Estado } } }).AptioPaquete.reproductor.estado());

/** INT-01 · Memoria: voltea cada pareja (en español, antes de cambiar de idioma). */
async function resolverMemoria(sco: FrameLocator) {
  const cartas = sco.locator('[data-interaccion="INT-01"] .ap-carta');
  const n = await cartas.count();
  const texto: string[] = [];
  for (let i = 0; i < n; i += 2) {
    await cartas.nth(i).click();
    await cartas.nth(i + 1).click();
    for (const j of [i, i + 1]) texto[j] = ((await cartas.nth(j).getAttribute('aria-label')) ?? '').replace(/^Carta \d+: /, '');
  }
  for (const p of pares()) {
    const a = texto.indexOf(p.a.texto.es);
    if (await cartas.nth(a).evaluate((el) => el.classList.contains('ap-pareja'))) continue;
    await cartas.nth(a).click();
    await cartas.nth(texto.indexOf(p.b.texto.es)).click();
  }
}

/** axe con las reglas WCAG 2.2 A/AA sobre el paquete, cuando terminaron las animaciones de entrada. */
async function auditar(page: Page, marca: RegExp) {
  await page.frame({ url: marca })!.evaluate(async () => {
    for (let i = 0; i < 2; i++) await new Promise((r) => requestAnimationFrame(r));
    const raices = [document, ...[...document.querySelectorAll('*')].map((el) => el.shadowRoot).filter((s): s is ShadowRoot => Boolean(s))];
    const todas = raices.flatMap((r) => r.getAnimations());
    await Promise.all(todas.filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime))).map((a) => a.finished.catch(() => undefined)));
  });
  const { violations } = await new AxeBuilder({ page }).include('#sco').withTags(REGLAS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test('CP-079 · en la pantalla 8 con puntos, cambiar a inglés deja la 8 con los mismos puntos; al volver abre en inglés', async ({ page }) => {
  const sco = await abrirEnLms(page, curso, { modoIdioma: 'mismo-paquete' });
  await pantallaVisible(sco, 'p01');
  const boton = sco.getByRole('button', { name: 'EN, ver en inglés' });
  await expect(boton).toBeVisible();
  await expect(sco.locator('.ap-r')).toHaveAttribute('lang', 'es');
  for (let n = 2; n <= 8; n++) {
    if (n === 8) await resolverMemoria(sco);
    await sco.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await pantallaVisible(sco, `p${String(n).padStart(2, '0')}`);
  }
  const antes = await estadoDe(page, /paquete\/index\.html$/);
  expect(antes.pantallaId).toBe('p08');
  expect(antes.puntos).toBeGreaterThan(0);
  const tituloEs = (await sco.locator('.ap-titulo-pantalla').textContent())!;
  expect(await auditar(page, /paquete\/index\.html$/)).toEqual([]);

  // Cambiar con el teclado: Enter sobre el botón.
  await page.evaluate(() => { (window as unknown as { registro: unknown[] }).registro = []; });
  await boton.focus();
  await boton.press('Enter');
  await pantallaVisible(sco, 'p08');
  await expect(sco.locator('.ap-r')).toHaveAttribute('lang', 'en');
  await expect(sco.locator('.ap-titulo-pantalla')).toHaveText(`[EN] ${tituloEs}`);
  await expect(sco.getByRole('button', { name: 'Next', exact: true })).toBeVisible();
  const enIngles = sco.getByRole('button', { name: 'ES, view in Spanish' });
  await expect(enIngles).toBeFocused();
  const despues = await estadoDe(page, /paquete\/index\.html$/);
  expect(despues).toMatchObject({ pantallaId: 'p08', puntos: antes.puntos, progreso: antes.progreso, vistas: antes.vistas, resultados: antes.resultados });

  // suspend_data guarda el idioma y se confirma en el momento.
  await expect.poll(async () => (await valores(page))['cmi.suspend_data']).toMatch(new RegExp(`^2\\|${H}\\|en\\|`));
  expect((await registro(page)).map((l) => l[0])).toContain('LMSCommit');
  expect((await valores(page))['cmi.core.lesson_location']).toBe('p08');
  expect(await auditar(page, /paquete\/index\.html$/)).toEqual([]);

  // Al volver: el aviso y la cápsula, en inglés, en la misma pantalla y con los mismos puntos.
  await salir(page);
  await reingresar(page);
  const aviso = sco.getByRole('dialog', { name: 'Continue where you left off?' });
  await expect(aviso).toBeVisible();
  await aviso.getByRole('button', { name: 'Continue' }).click();
  await pantallaVisible(sco, 'p08');
  await expect(sco.locator('.ap-r')).toHaveAttribute('lang', 'en');
  await expect(sco.locator('.ap-titulo-pantalla')).toHaveText(`[EN] ${tituloEs}`);
  expect(await estadoDe(page, /otra-vez/)).toMatchObject({ pantallaId: 'p08', puntos: antes.puntos });
});

test('un paquete de un solo idioma no muestra el botón de idioma', async ({ page }) => {
  const sco = await abrirEnLms(page, cursoLoto());
  await pantallaVisible(sco, 'p01');
  await expect(sco.locator('.ap-idioma')).toHaveCount(0);
});
