// HU-1105 · CP-089 y CP-092 · Reanudación del paquete LOTO en el LMS de prueba (`window.API`, SCORM 1.2): se avanza hasta
// la pantalla 12 sumando puntos en las actividades de p07 y p10, se cierra la sesión (LMSFinish) y se vuelve a entrar.
// Hasta que el participante elige, el paquete no escribe lesson_location ni hace LMSCommit. La subida a Moodle 4.5 de
// pruebas (CP-092 en un LMS real) la hace el responsable del producto en la demo del S6.
import { expect, type FrameLocator, type Page, test } from '@playwright/test';
import { aplanar, type CursoReproductor, huellaCurso } from '@aptio/player';
import { cursoLoto } from '../../../packages/exporters/test/loto.ts';
import { abrirEnLms, type Curso, pantallaVisible, registro, reingresar, salir, valores } from './lms-prueba';

type Bloque = { tipo: string; interaccion?: { datos: Record<string, unknown> } };
type Par = { a: { texto: { es: string } }; b: { texto: { es: string } } };
type Elemento = { id: string; grupoCorrecto: string };

const curso = cursoLoto();
const orden = aplanar(curso as unknown as CursoReproductor).map((x) => x.pantalla.id);
const H = huellaCurso(curso.id, orden);
const datosDe = (id: string) => {
  const pantallas = (curso as Curso).modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas)) as unknown as { id: string; bloques: Bloque[] }[];
  return pantallas.find((p) => p.id === id)!.bloques.find((b) => b.tipo === 'interaccion')!.interaccion!.datos;
};

const siguiente = (sco: FrameLocator) => sco.getByRole('button', { name: 'Siguiente', exact: true });

/** INT-01 · Memoria: mira las cartas de dos en dos (con errores, el puntaje baja de 100) y luego voltea cada pareja. */
async function resolverMemoria(sco: FrameLocator) {
  const cartas = sco.locator('[data-interaccion="INT-01"] .ap-carta');
  const n = await cartas.count();
  const texto: string[] = [];
  for (let i = 0; i < n; i += 2) {
    await cartas.nth(i).click();
    await cartas.nth(i + 1).click();
    for (const j of [i, i + 1]) texto[j] = ((await cartas.nth(j).getAttribute('aria-label')) ?? '').replace(/^Carta \d+: /, '');
  }
  for (const p of datosDe('p07').pares as Par[]) {
    const a = texto.indexOf(p.a.texto.es);
    if (await cartas.nth(a).evaluate((el) => el.classList.contains('ap-pareja'))) continue;
    await cartas.nth(a).click();
    await cartas.nth(texto.indexOf(p.b.texto.es)).click();
  }
}

/** INT-02 · Clasificar: cada elemento a su grupo correcto (100 %). */
async function clasificarBien(sco: FrameLocator) {
  for (const e of datosDe('p10').elementos as Elemento[]) {
    await sco.locator(`.ap-elemento[data-elemento="${e.id}"] [data-grupo="${e.grupoCorrecto}"]`).click();
  }
  await sco.getByRole('button', { name: 'Comprobar' }).click();
  await expect(sco.locator('.ap-resultado-texto')).toHaveText('★ Resultado: 100 %');
}

type Estado = { pantallaId: string; puntos: number; progreso: number; resultados: Record<string, { completada: boolean; puntaje: number | null; intentos?: number }> };
/** El estado del reproductor dentro del paquete (window.AptioPaquete), en el iframe abierto con esa marca. */
const estadoDe = (page: Page, marca: RegExp) => page.frame({ url: marca })!.evaluate(() => (window as unknown as { AptioPaquete: { reproductor: { estado: () => Estado } } }).AptioPaquete.reproductor.estado());

/** Primera entrada: de p01 a p12 resolviendo p07 y p10, y salida con LMSFinish. Devuelve lo que quedó en el LMS. */
async function avanzarHastaP12YSalir(page: Page) {
  const sco = await abrirEnLms(page, curso);
  await pantallaVisible(sco, 'p01');
  for (let n = 2; n <= 12; n++) {
    if (n === 8) await resolverMemoria(sco);
    if (n === 11) await clasificarBien(sco);
    await siguiente(sco).click();
    await pantallaVisible(sco, `p${String(n).padStart(2, '0')}`);
  }
  await expect.poll(async () => (await valores(page))['cmi.core.lesson_location']).toBe('p12');
  const antes = await estadoDe(page, /paquete\/index\.html$/);
  expect(antes.resultados.p07).toMatchObject({ completada: true, intentos: 1 });
  expect(antes.resultados.p10).toEqual({ completada: true, puntaje: 100, intentos: 1 });
  expect(antes.puntos).toBe(antes.resultados.p07!.puntaje! + 100);
  const guardado = await valores(page);
  expect(guardado['cmi.suspend_data']).toBe(`2|${H}|es|0-11|6:1:${antes.resultados.p07!.puntaje}:1,9:1:100:1`);
  await salir(page);
  return { antes, guardado };
}

/** El aviso accesible al volver: diálogo con nombre, «Pantalla 12 de 30» y el foco en Continuar. */
async function verAviso(sco: FrameLocator) {
  const aviso = sco.getByRole('dialog', { name: '¿Continuar donde lo dejaste?' });
  await expect(aviso).toBeVisible();
  await expect(aviso).toHaveAccessibleDescription(/Pantalla 12 de 30/);
  const continuar = aviso.getByRole('button', { name: 'Continuar' });
  await expect(continuar).toBeFocused();
  // El foco no sale del aviso con Tab, y el curso de fondo no responde mientras tanto.
  await continuar.press('Tab');
  await expect(aviso.getByRole('button', { name: 'Empezar de nuevo' })).toBeFocused();
  await aviso.getByRole('button', { name: 'Empezar de nuevo' }).press('Tab');
  await expect(continuar).toBeFocused();
  await expect(sco.getByRole('button', { name: 'Siguiente', exact: true })).toHaveCount(0);
  return aviso;
}

/** Mientras se pregunta, lo guardado no se toca: ni lesson_location ni suspend_data ni LMSCommit. */
async function nadaEscrito(page: Page) {
  const llamadas = await registro(page);
  expect(llamadas.map((l) => l[0])).not.toContain('LMSCommit');
  expect(llamadas.filter((l) => l[0] === 'LMSSetValue').map((l) => l[1])).toEqual(['cmi.core.exit']);
}

test('CP-089 · al volver pregunta si continúa; con «Continuar» vuelve a la pantalla 12 con sus puntos', async ({ page }) => {
  const { antes, guardado } = await avanzarHastaP12YSalir(page);

  await reingresar(page);
  const sco = page.frameLocator('#sco');
  const aviso = await verAviso(sco);
  await nadaEscrito(page);
  expect(await valores(page)).toMatchObject({ 'cmi.core.lesson_location': 'p12', 'cmi.suspend_data': guardado['cmi.suspend_data'] });

  await aviso.getByRole('button', { name: 'Continuar' }).click();
  await expect(aviso).toHaveCount(0);
  await pantallaVisible(sco, 'p12');
  await expect(sco.locator('.ap-titulo-pantalla')).toBeFocused();
  const despues = await estadoDe(page, /otra-vez/);
  expect(despues).toMatchObject({ pantallaId: 'p12', puntos: antes.puntos, progreso: antes.progreso, resultados: antes.resultados });
  // Lo que se reporta después de elegir es lo mismo que había: nada se perdió.
  await expect.poll(async () => (await registro(page)).some((l) => l[0] === 'LMSCommit')).toBe(true);
  expect(await valores(page)).toMatchObject({ 'cmi.core.lesson_location': 'p12', 'cmi.suspend_data': guardado['cmi.suspend_data'], 'cmi.core.lesson_status': 'incomplete' });

  // Sigue el curso desde ahí: p13, y lo ya visto (p07) se puede volver a abrir desde el temario.
  await siguiente(sco).click();
  await pantallaVisible(sco, 'p13');
  await expect.poll(async () => (await valores(page))['cmi.suspend_data']).toBe(guardado['cmi.suspend_data']!.replace('|0-11|', '|0-12|'));
});

test('CP-092 · con «Empezar de nuevo» reinicia en p01 sin avance, y un «passed» del LMS no baja a incomplete', async ({ page }) => {
  await avanzarHastaP12YSalir(page);

  // El participante ya había aprobado (estado y nota en el LMS): empezar de nuevo no puede degradarlo.
  await reingresar(page, { 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '85' });
  const sco = page.frameLocator('#sco');
  const aviso = await verAviso(sco);
  await nadaEscrito(page);

  await aviso.getByRole('button', { name: 'Empezar de nuevo' }).click();
  await pantallaVisible(sco, 'p01');
  const estado = await estadoDe(page, /otra-vez/);
  expect(estado).toMatchObject({ pantallaId: 'p01', puntos: 0, resultados: {} });
  await expect.poll(async () => (await valores(page))['cmi.core.lesson_location']).toBe('p01');
  expect(await valores(page)).toMatchObject({ 'cmi.suspend_data': `2|${H}|es|0|`, 'cmi.core.lesson_status': 'passed', 'cmi.core.score.raw': '85' });
  expect((await registro(page)).filter((l) => l[0] === 'LMSSetValue' && l[1] === 'cmi.core.lesson_status')).toEqual([]);

  // En la siguiente entrada desde p01 ya no se pregunta.
  await salir(page);
  await reingresar(page, {}, 'tercera');
  await pantallaVisible(sco, 'p01');
  await expect(sco.getByRole('dialog')).toHaveCount(0);
});

test('con avance de otro curso, en un intento nuevo o en la primera pantalla, no pregunta y empieza en p01', async ({ page }) => {
  const sco = await abrirEnLms(page, curso);
  await pantallaVisible(sco, 'p01');
  for (const [i, cambios] of ([
    { 'cmi.core.lesson_location': 'p12', 'cmi.suspend_data': `2|otrahuella|es|0-11|` },
    { 'cmi.core.lesson_location': 'p12', 'cmi.suspend_data': `2|${H}|es|0-11|`, 'cmi.core.entry': 'ab-initio' },
    { 'cmi.core.lesson_location': 'p12', 'cmi.suspend_data': `2|${H}|es|0-1` },
  ] as Record<string, string>[]).entries()) {
    await salir(page);
    await reingresar(page, cambios, `caso-${i}`);
    await pantallaVisible(sco, 'p01');
    await expect(sco.getByRole('dialog')).toHaveCount(0);
    await expect.poll(async () => (await valores(page))['cmi.core.lesson_location']).toBe('p01');
  }
});
