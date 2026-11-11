// HU-1202 · CP-091 y CP-092 (preliminar) · El paquete SCORM 1.2 del caso LOTO dentro de un LMS de prueba: una página que
// deja `window.API` (SCORM 1.2) en la ventana padre y abre el paquete en un iframe, como hacen los LMS. Comprueba que el
// paquete inicializa, guarda la pantalla y el avance con LMSCommit en cada cambio, reporta nota y estado, y cierra con
// LMSFinish. La subida a SCORM Cloud y a Moodle 4.5 la hace el responsable del producto en la demo del S6.
import { expect, type FrameLocator, type Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { codigoReproductor, construirScorm12 } from '@aptio/exporters';
import { cursoLoto, recursosLoto } from '../../../packages/exporters/test/loto.ts';

type Curso = ReturnType<typeof cursoLoto>;
type Llamada = [string, ...string[]];

const LMS = 'http://lms.prueba';

/** La API de SCORM 1.2 del LMS de prueba: guarda los valores en memoria y registra cada llamada en `window.registro`. */
const LMS_HTML = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>LMS de prueba</title></head><body>
<script>
  window.registro = [];
  window.valores = { 'cmi.core.lesson_status': 'not attempted', 'cmi.core.entry': 'ab-initio', 'cmi.core.lesson_location': '', 'cmi.suspend_data': '' };
  var ok = function (nombre, extra) { window.registro.push([nombre].concat(extra || [])); return 'true'; };
  window.API = {
    LMSInitialize: function () { return ok('LMSInitialize'); },
    LMSFinish: function () { return ok('LMSFinish'); },
    LMSGetValue: function (k) { window.registro.push(['LMSGetValue', k]); return window.valores[k] || ''; },
    LMSSetValue: function (k, v) { window.valores[k] = String(v); return ok('LMSSetValue', [k, String(v)]); },
    LMSCommit: function () { return ok('LMSCommit'); },
    LMSGetLastError: function () { return '0'; },
    LMSGetErrorString: function () { return ''; },
    LMSGetDiagnostic: function () { return ''; }
  };
</script>
<iframe id="sco" title="Curso" src="paquete/index.html" style="width:1000px;height:700px;border:0"></iframe>
</body></html>`;

async function abrirEnLms(page: Page, curso: Curso) {
  const { zip } = await construirScorm12({ curso, recursos: recursosLoto({ sinAudio: true }), reproductor: await codigoReproductor() });
  const archivos = await JSZip.loadAsync(zip);
  await page.route(`${LMS}/**`, async (ruta) => {
    const camino = new URL(ruta.request().url()).pathname;
    if (camino === '/lms.html') return ruta.fulfill({ contentType: 'text/html; charset=utf-8', body: LMS_HTML });
    const archivo = archivos.file(camino.replace(/^\/paquete\//, ''));
    if (!archivo) return ruta.fulfill({ status: 404, body: '' });
    const tipo = camino.endsWith('.html') ? 'text/html; charset=utf-8' : camino.endsWith('.js') ? 'text/javascript' : camino.endsWith('.svg') ? 'image/svg+xml' : 'application/octet-stream';
    return ruta.fulfill({ contentType: tipo, body: Buffer.from(await archivo.async('uint8array')) });
  });
  await page.goto(`${LMS}/lms.html`);
  return page.frameLocator('#sco');
}

const registro = (page: Page) => page.evaluate(() => (window as unknown as { registro: Llamada[] }).registro);
const valores = (page: Page) => page.evaluate(() => (window as unknown as { valores: Record<string, string> }).valores);
const pantallaVisible = (sco: FrameLocator, id: string) => expect(sco.locator(`[data-pantalla="${id}"]`)).toBeVisible();

test('CP-091 · el paquete LOTO inicializa, guarda la pantalla y el avance con LMSCommit y cierra con LMSFinish', async ({ page }) => {
  const sco = await abrirEnLms(page, cursoLoto());
  await pantallaVisible(sco, 'p01');
  await expect.poll(async () => (await valores(page))['cmi.core.lesson_location']).toBe('p01');

  const inicio = await registro(page);
  expect(inicio[0]).toEqual(['LMSInitialize']);
  expect(await valores(page)).toMatchObject({ 'cmi.core.lesson_status': 'incomplete', 'cmi.core.exit': 'suspend', 'cmi.suspend_data': '1|es|0|' });

  await sco.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await pantallaVisible(sco, 'p02');
  await sco.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await pantallaVisible(sco, 'p03');
  await expect.poll(async () => (await valores(page))['cmi.core.lesson_location']).toBe('p03');

  const v = await valores(page);
  expect(v['cmi.suspend_data']).toBe('1|es|0-2|');
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
  expect(await valores(page)).toMatchObject({ 'cmi.core.score.raw': '100', 'cmi.core.score.min': '0', 'cmi.core.score.max': '100', 'cmi.suspend_data': '1|es|0|0:1:100' });
  expect((await registro(page)).at(-1)).toEqual(['LMSCommit']);
});

test('CP-092 (preliminar) · al volver a entrar, el paquete lee del LMS la pantalla y el avance guardados', async ({ page }) => {
  // Volver a esa pantalla y preguntar «¿continúas?» es la HU-1105; aquí solo se comprueba que el paquete recibe lo guardado.
  const sco = await abrirEnLms(page, cursoLoto());
  await pantallaVisible(sco, 'p01');
  await sco.getByRole('button', { name: 'Siguiente', exact: true }).click();
  await pantallaVisible(sco, 'p02');
  await expect.poll(async () => (await valores(page))['cmi.suspend_data']).toBe('1|es|0-1|');

  await page.evaluate(() => {
    const w = window as unknown as { valores: Record<string, string>; registro: unknown[] };
    w.valores['cmi.core.entry'] = 'resume';
    w.registro = [];
    (document.getElementById('sco') as HTMLIFrameElement).src = 'paquete/index.html?otra-vez';
  });
  await pantallaVisible(sco, 'p01');
  const inicial = await page.frame({ url: /otra-vez/ })!.evaluate(() => (window as unknown as { AptioPaquete: { lms: { inicial: unknown } } }).AptioPaquete.lms.inicial);
  expect(inicial).toEqual({ entrada: 'resume', ubicacion: 'p02', suspendData: '1|es|0-1|', estado: 'incomplete' });
  const lecturas = (await registro(page)).filter((l) => l[0] === 'LMSGetValue').map((l) => l[1]);
  expect(lecturas).toEqual(['cmi.core.entry', 'cmi.core.lesson_location', 'cmi.suspend_data', 'cmi.core.lesson_status']);
});
