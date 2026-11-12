// HU-0901 · Preguntas en el video (PNT-10, CP-080, RN-09-1). En Video interactivo, producción agrega una pregunta en
// 0:45 del video de p18 (un WebM de 60 s hecho con ffmpeg) y se guarda sola; en la vista previa, al reproducir, el video
// se detiene en 0:45, muestra la pregunta encima, deja reintentar al fallar y sigue al acertar. La vista y la pregunta
// pasan axe WCAG 2.2 A/AA.
// HU-0902 · Impedir adelantar (CP-081, RN-09-2): con la casilla activa, adelantar más allá de una pregunta pendiente
// vuelve a su segundo, la muestra y avisa por qué.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const panel = (page: Page) => page.getByRole('complementary', { name: 'Marcadores' });
const pregunta = (page: Page) => panel(page).getByRole('group', { name: /^Pregunta en/ });

function contarEdiciones(page: Page) {
  const cuerpos: { marcadores?: Record<string, { id: string; tiempoMs: number; tipo: string; obligatorio: boolean; pregunta?: unknown }[]>; reglasVideo?: Record<string, { impedirAdelantar: boolean }>; motivo?: string }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/cursos\/[^/]+\/pantallas\/p18$/.test(r.url())) cuerpos.push(r.postDataJSON());
  });
  return cuerpos;
}
async function auditar(page: Page, zona: string) {
  const { violations } = await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}
/** Lleva el video de la vista al segundo dado y espera a que la vista lo muestre. */
async function irAlSegundo(page: Page, s: number) {
  await page.locator('.video-pantalla video').evaluate((v: HTMLVideoElement, x) => { v.currentTime = x; }, s);
  await expect(page.locator('.video-reloj')).toHaveText(new RegExp(`^0:${String(s).padStart(2, '0')}`));
}
async function escribirPregunta(page: Page) {
  await pregunta(page).getByRole('textbox', { name: 'Enunciado' }).fill('¿Qué se hace antes de apagar el equipo?');
  await pregunta(page).getByRole('textbox', { name: 'Opción 1' }).fill('Avisar a los afectados');
  await pregunta(page).getByRole('textbox', { name: 'Opción 2' }).fill('Retirar los candados');
}

test.beforeEach(async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', conVideo: true });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('CP-080 · una pregunta en 0:45: se guarda sola y, en la vista previa, el video se detiene en 0:45 y la muestra', async ({ page }) => {
  const ediciones = contarEdiciones(page);
  await page.goto(`/proyectos/${PROYECTO}`);
  await page.getByRole('link', { name: 'Video interactivo' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Video interactivo' })).toBeVisible();
  // p18 es la única pantalla con video: no hay selector. El capítulo y el punto se ven, sin editar.
  await expect(page.getByRole('combobox', { name: 'Pantalla con video' })).toHaveCount(0);
  await expect(page.locator('.video-reloj')).toHaveText('0:00 / 1:00');
  await expect(page.getByRole('img', { name: 'Capítulo en 0:00: Preparar, avisar y apagar' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Punto interactivo en 0:20: Tarjeta de bloqueo' })).toBeVisible();

  // Dado una pregunta en 0:45.
  await irAlSegundo(page, 45);
  await page.getByRole('button', { name: '+ Pregunta en 0:45' }).click();
  await expect(pregunta(page)).toHaveAccessibleName('Pregunta en 0:45');
  await expect(panel(page).getByText('Falta el enunciado')).toBeVisible();
  expect(ediciones).toHaveLength(0);
  await escribirPregunta(page);
  await expect(panel(page).getByRole('status')).toHaveText('Preguntas del video guardadas.');
  const guardada = ediciones.at(-1)!.marcadores!['p18-video']!;
  expect(guardada.map((m) => [m.id, m.tiempoMs, m.tipo, m.obligatorio])).toEqual([['vm-1', 0, 'capitulo', false], ['vm-3', 20000, 'punto', false], ['p18-vm-1', 45000, 'pregunta', true]]);
  expect(guardada[2]!.pregunta).toMatchObject({
    enunciado: { es: '¿Qué se hace antes de apagar el equipo?' },
    opciones: [{ contenido: { texto: { es: 'Avisar a los afectados' } }, correcta: true }, { contenido: { texto: { es: 'Retirar los candados' } }, correcta: false }],
  });
  await expect(page.getByRole('button', { name: 'Pregunta en 0:45: ¿Qué se hace antes de apagar el equipo?' })).toBeVisible();
  expect(await auditar(page, '.video-vista')).toEqual([]);

  // Cuando reproduzco en la vista previa.
  await page.getByRole('link', { name: '▶ Probar en la vista previa' }).click();
  await page.getByRole('button', { name: 'Revisión' }).click();
  await page.getByRole('combobox', { name: 'Ir a la pantalla' }).selectOption('p18');
  const r = page.locator('.vista-previa-reproductor');
  const video = r.locator('[data-bloque="p18-video"] video');
  await video.evaluate(async (v: HTMLVideoElement) => { v.muted = true; v.currentTime = 43; await v.play(); });

  // Entonces el video se detiene en 0:45 y muestra la pregunta.
  const tarjeta = r.getByRole('dialog', { name: '¿Qué se hace antes de apagar el equipo?' });
  await expect(tarjeta).toBeVisible({ timeout: 6000 });
  await expect(tarjeta).toContainText('Pregunta en 0:45');
  const { tiempo, pausado } = await video.evaluate((v: HTMLVideoElement) => ({ tiempo: v.currentTime, pausado: v.paused }));
  expect(pausado).toBe(true);
  expect(tiempo).toBeCloseTo(45, 1);
  await expect(tarjeta.getByRole('heading', { name: '¿Qué se hace antes de apagar el equipo?' })).toBeFocused();
  expect(await auditar(page, '.vista-previa-reproductor')).toEqual([]);

  // Al fallar se ve la retroalimentación y se reintenta; al acertar sigue solo.
  await tarjeta.getByRole('button', { name: 'Retirar los candados' }).click();
  await expect(tarjeta).toContainText('Revisa lo que acabas de ver e intenta de nuevo. Intenta de nuevo.');
  await expect(tarjeta).toBeVisible();
  await tarjeta.getByRole('button', { name: 'Avisar a los afectados' }).click();
  await expect(tarjeta).toContainText('¡Correcto! Sigue el video.');
  await expect(tarjeta).toBeHidden();
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => !v.paused && v.currentTime > 45)).toBe(true);
});

test('una pregunta fuera del video no se guarda; se puede volver opcional; deshacer vuelve a la versión anterior', async ({ page }) => {
  const ediciones = contarEdiciones(page);
  await page.goto(`/proyectos/${PROYECTO}/video?pantalla=p18`);
  await expect(page.locator('.video-reloj')).toHaveText('0:00 / 1:00');
  await irAlSegundo(page, 30);
  await page.getByRole('button', { name: '+ Pregunta en 0:30' }).click();
  await escribirPregunta(page);
  await expect(panel(page).getByRole('status')).toHaveText('Preguntas del video guardadas.');
  const guardados = ediciones.length;

  // Un segundo que pasa el video se marca y no se guarda.
  const segundo = pregunta(page).getByRole('spinbutton', { name: 'Segundo del video' });
  await segundo.fill('70');
  await expect(pregunta(page).getByText('El tiempo 1:10 pasa la duración del video (1:00)')).toBeVisible();
  await expect(segundo).toHaveAttribute('aria-invalid', 'true');
  await expect(panel(page).getByRole('status')).toHaveText('Corrige la pregunta marcada para guardar.');
  expect(await auditar(page, '.video-vista')).toEqual([]);
  await segundo.fill('30');
  // Opcional: el participante verá «Saltar».
  await pregunta(page).getByRole('checkbox', { name: /^Obligatoria/ }).uncheck();
  await expect(panel(page).getByRole('status')).toHaveText('Preguntas del video guardadas.');
  expect(ediciones.length).toBe(guardados + 1);
  expect(ediciones.at(-1)!.marcadores!['p18-video']!.find((m) => m.id === 'p18-vm-1')).toMatchObject({ tiempoMs: 30000, obligatorio: false });

  // Deshacer vuelve a la versión anterior (obligatoria) y se guarda con su motivo.
  await page.getByRole('button', { name: '↶ Deshacer' }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Cambio deshecho.');
  expect(ediciones.at(-1)).toMatchObject({ motivo: 'deshacer' });
  expect(ediciones.at(-1)!.marcadores!['p18-video']!.find((m) => m.id === 'p18-vm-1')).toMatchObject({ obligatorio: true });
  await expect(pregunta(page).getByRole('checkbox', { name: /^Obligatoria/ })).toBeChecked();
});

test('CP-081 · con «Impedir adelantar», ir a 0:50 con la pregunta de 0:30 pendiente vuelve a 0:30 y explica por qué', async ({ page }) => {
  const ediciones = contarEdiciones(page);
  await page.goto(`/proyectos/${PROYECTO}/video?pantalla=p18`);
  await expect(page.locator('.video-reloj')).toHaveText('0:00 / 1:00');
  await irAlSegundo(page, 30);
  await page.getByRole('button', { name: '+ Pregunta en 0:30' }).click();
  await escribirPregunta(page);
  await expect(panel(page).getByRole('status')).toHaveText('Preguntas del video guardadas.');

  // La casilla se guarda sola y se deshace como las preguntas.
  const impedir = page.getByRole('checkbox', { name: 'Impedir adelantar hasta responder' });
  await expect(impedir).not.toBeChecked();
  await impedir.check();
  await expect(panel(page).getByRole('status')).toHaveText('Guardado: no se podrá adelantar sin responder.');
  expect(ediciones.at(-1)!.reglasVideo).toEqual({ 'p18-video': { impedirAdelantar: true } });
  await page.getByRole('button', { name: '↶ Deshacer' }).click();
  await expect(panel(page).getByRole('status')).toHaveText('Cambio deshecho.');
  await expect(impedir).not.toBeChecked();
  expect(ediciones.at(-1)).toMatchObject({ motivo: 'deshacer', reglasVideo: { 'p18-video': { impedirAdelantar: false } } });
  await impedir.check();
  await expect(panel(page).getByRole('status')).toHaveText('Guardado: no se podrá adelantar sin responder.');
  expect(await auditar(page, '.video-vista')).toEqual([]);

  // Dado la pregunta de 0:30 pendiente, cuando intento ir a 0:50…
  await page.getByRole('link', { name: '▶ Probar en la vista previa' }).click();
  await page.getByRole('button', { name: 'Revisión' }).click();
  await page.getByRole('combobox', { name: 'Ir a la pantalla' }).selectOption('p18');
  const r = page.locator('.vista-previa-reproductor');
  const video = r.locator('[data-bloque="p18-video"] video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.readyState)).toBeGreaterThan(0);
  await video.evaluate((v: HTMLVideoElement) => { v.muted = true; v.currentTime = 50; });

  // …entonces no se permite: vuelve a 0:30, muestra la pregunta y explica por qué.
  const tarjeta = r.getByRole('dialog', { name: '¿Qué se hace antes de apagar el equipo?' });
  await expect(tarjeta).toBeVisible();
  await expect(tarjeta).toContainText('Pregunta en 0:30');
  await expect(r.getByRole('alert')).toHaveText('No puedes adelantar: responde primero la pregunta de 0:30.');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(30, 1);
  expect(await auditar(page, '.vista-previa-reproductor')).toEqual([]);

  // Retroceder sí se puede; después de responder, adelantar también.
  await tarjeta.getByRole('button', { name: 'Avisar a los afectados' }).click();
  await expect(tarjeta).toBeHidden();
  await expect(r.locator('.ap-video-bloqueo')).toBeEmpty();
  await video.evaluate((v: HTMLVideoElement) => { v.pause(); v.currentTime = 50; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(50, 1);
  await video.evaluate((v: HTMLVideoElement) => { v.currentTime = 10; });
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeCloseTo(10, 1);
  await expect(tarjeta).toBeHidden();
});
