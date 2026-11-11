// LMS de prueba para los paquetes SCORM 1.2 (HU-1202, HU-1105): una página que deja `window.API` (SCORM 1.2) en la
// ventana padre y abre el paquete en un iframe, como hacen los LMS. Registra cada llamada en `window.registro` y guarda
// los valores en `window.valores`, que sobreviven al cerrar y volver a abrir el paquete (como en un LMS real).
import { expect, type FrameLocator, type Page } from '@playwright/test';
import JSZip from 'jszip';
import { codigoReproductor, construirScorm12 } from '@aptio/exporters';
import { cursoLoto, recursosLoto } from '../../../packages/exporters/test/loto.ts';

export type Curso = ReturnType<typeof cursoLoto>;
export type Llamada = [string, ...string[]];

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

export async function abrirEnLms(page: Page, curso: Curso) {
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

export const registro = (page: Page) => page.evaluate(() => (window as unknown as { registro: Llamada[] }).registro);
export const valores = (page: Page) => page.evaluate(() => (window as unknown as { valores: Record<string, string> }).valores);
export const pantallaVisible = (sco: FrameLocator, id: string) => expect(sco.locator(`[data-pantalla="${id}"]`)).toBeVisible();


/** Cierra el paquete (el LMS cambia el iframe: pagehide hace LMSFinish) y espera que se haya cerrado la sesión. */
export async function salir(page: Page) {
  const antes = (await registro(page)).filter((l) => l[0] === 'LMSFinish').length;
  await page.evaluate(() => { (document.getElementById('sco') as HTMLIFrameElement).src = 'about:blank'; });
  await expect.poll(async () => (await registro(page)).filter((l) => l[0] === 'LMSFinish').length).toBe(antes + 1);
}

/** Vuelve a abrir el paquete como lo hace el LMS en un reingreso: `cmi.core.entry` en `resume` y el registro en cero. */
export async function reingresar(page: Page, cambios: Record<string, string> = {}, marca = 'otra-vez') {
  await page.evaluate(({ cambios, marca }) => {
    const w = window as unknown as { valores: Record<string, string>; registro: unknown[] };
    Object.assign(w.valores, { 'cmi.core.entry': 'resume' }, cambios);
    w.registro = [];
    (document.getElementById('sco') as HTMLIFrameElement).src = `paquete/index.html?${marca}`;
  }, { cambios, marca });
}
