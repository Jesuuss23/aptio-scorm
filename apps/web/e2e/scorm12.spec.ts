// HU-1202 · CP-091 · El paquete SCORM 1.2 del caso LOTO dentro de un LMS de prueba (`lms-prueba.ts`). Comprueba que el
// paquete inicializa, guarda la pantalla y el avance con LMSCommit en cada cambio, reporta nota y estado, y cierra con
// LMSFinish. La subida a SCORM Cloud y a Moodle 4.5 la hace el responsable del producto en la demo del S6. El reingreso
// (CP-089, CP-092) está en reanudacion.spec.ts.
import { expect, test } from '@playwright/test';
import { aplanar, type CursoReproductor, huellaCurso } from '@aptio/player';
import { cursoLoto } from '../../../packages/exporters/test/loto.ts';
import { abrirEnLms, type Curso, pantallaVisible, registro, valores } from './lms-prueba';

/** La huella del curso que va en suspend_data v2 (HU-1105). */
const huella = (c: Curso) => huellaCurso(c.id, aplanar(c as unknown as CursoReproductor).map((x) => x.pantalla.id));

test('CP-091 · el paquete LOTO inicializa, guarda la pantalla y el avance con LMSCommit y cierra con LMSFinish', async ({ page }) => {
  const curso = cursoLoto();
  const H = huella(curso);
  const sco = await abrirEnLms(page, curso);
  await pantallaVisible(sco, 'p01');
  await expect.poll(async () => (await valores(page))['cmi.core.lesson_location']).toBe('p01');

  const inicio = await registro(page);
  expect(inicio[0]).toEqual(['LMSInitialize']);
  expect(await valores(page)).toMatchObject({ 'cmi.core.lesson_status': 'incomplete', 'cmi.core.exit': 'suspend', 'cmi.suspend_data': `2|${H}|es|0|` });

  await sco.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await pantallaVisible(sco, 'p02');
  await sco.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await pantallaVisible(sco, 'p03');
  await expect.poll(async () => (await valores(page))['cmi.core.lesson_location']).toBe('p03');

  const v = await valores(page);
  expect(v['cmi.suspend_data']).toBe(`2|${H}|es|0-2|`);
  expect(v['cmi.suspend_data']!.length).toBeLessThanOrEqual(4096);
  expect(v['cmi.core.session_time']).toMatch(/^\d{2,4}:\d{2}:\d{2}$/);
  // Cada cambio de pantalla termina en LMSCommit: después de escribir p02 y p03 hay un commit antes del siguiente cambio.
  const llamadas = await registro(page);
  for (const id of ['p02', 'p03']) {
    const i = llamadas.findIndex((l) => l[0] === 'LMSSetValue' && l[1] === 'cmi.core.lesson_location' && l[2] === id);
    expect(i).toBeGreaterThan(0);
    expect(llamadas.slice(i).find((l) => l[0] === 'LMSCommit' || (l[0] === 'LMSSetValue' && l[1] === 'cmi.core.lesson_location' && l[2] !== id))?.[0]).toBe('LMSCommit');
  }
  expect(llamadas.some((l) => l[0] === 'LMSFinish')).toBe(false);

  // Al salir del curso (el LMS cambia el iframe) se guarda el tiempo y se cierra la sesión una sola vez.
  await page.evaluate(() => { (document.getElementById('sco') as HTMLIFrameElement).src = 'about:blank'; });
  await expect.poll(async () => (await registro(page)).filter((l) => l[0] === 'LMSFinish').length).toBe(1);
  const final = await registro(page);
  expect(final.at(-2)).toEqual(['LMSCommit']);
  expect(final.at(-1)).toEqual(['LMSFinish']);
});

test('CP-091 · al responder el reto final (sumativa) reporta la nota y «passed»', async ({ page }) => {
  // El reto final de LOTO (p28) como único contenido, para llegar a la nota sin recorrer las 30 pantallas.
  const curso = cursoLoto();
  type Modulo = Curso['modulos'][number];
  const p28 = curso.modulos.flatMap((m: Modulo) => m.capsulas.flatMap((c) => c.pantallas)).find((p) => p.id === 'p28')!;
  curso.modulos = [{ ...curso.modulos[0]!, capsulas: [{ ...curso.modulos[0]!.capsulas[0]!, pantallas: [p28] }] }];
  const bloque = p28.bloques.find((b) => b.tipo === 'interaccion') as unknown as { interaccion: { datos: { preguntas: { opciones: { id: string; correcta: boolean }[] }[] } } };
  const correctas = new Set(bloque.interaccion.datos.preguntas.flatMap((q) => q.opciones.filter((o) => o.correcta).map((o) => o.id)));

  const sco = await abrirEnLms(page, curso);
  await pantallaVisible(sco, 'p28');
  for (let i = 0; i < 5; i++) {
    const opciones = sco.locator('.ap-opcion:not([disabled])');
    await expect(opciones.first()).toBeVisible();
    const ids = await opciones.evaluateAll((els) => els.map((el) => el.getAttribute('data-opcion') ?? ''));
    await sco.locator(`.ap-opcion[data-opcion="${ids.find((id) => correctas.has(id))}"]`).click();
    await sco.getByRole('button', { name: i === 4 ? 'Ver resultado' : 'Siguiente pregunta' }).click();
  }

  await expect.poll(async () => (await valores(page))['cmi.core.lesson_status']).toBe('passed');
  expect(await valores(page)).toMatchObject({ 'cmi.core.score.raw': '100', 'cmi.core.score.min': '0', 'cmi.core.score.max': '100', 'cmi.suspend_data': `2|${huella(curso)}|es|0|0:1:100:1` });
  expect((await registro(page)).at(-1)).toEqual(['LMSCommit']);
});
