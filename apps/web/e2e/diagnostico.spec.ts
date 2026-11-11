// HU-1204 · CP-094 · Modo diagnóstico del paquete SCORM 1.2 y ficha de compatibilidad del cliente.
// Caso A: el paquete abierto en una página sin API; Ctrl+Alt+Shift+D muestra que no hay API, las ventanas revisadas y
// copia el informe. Caso B: en el LMS de prueba, con ?diagnostico=1, el panel lista LMSInitialize, LMSSetValue y
// LMSCommit y se actualiza en vivo. Caso C: ese informe se pega en la ficha del cliente y queda con su límite en MB.
// Una página real solo tiene las ventanas que existen (aquí 2); los 8 niveles de ADL los cubre Vitest.
import { expect, type FrameLocator, type Page, test } from '@playwright/test';
import { cursoLoto } from '../../../packages/exporters/test/loto.ts';
import { CLIENTE_ID, simularApi } from './api-simulada';
import { abrirEnLms, pantallaVisible } from './lms-prueba';

const curso = cursoLoto();
const LMS = 'https://lms.prueba';

/** El atajo se escucha en la ventana del paquete: se enfoca algo dentro del iframe y se pulsa. */
async function atajo(page: Page, sco: FrameLocator) {
  await sco.locator('.ap-titulo-pantalla').click();
  await page.keyboard.press('Control+Alt+Shift+KeyD');
}

async function copiarInforme(page: Page, panel: ReturnType<FrameLocator['getByRole']>) {
  await panel.getByRole('button', { name: 'Copiar informe' }).click();
  await expect(panel.getByRole('status')).toHaveText('Informe copiado. Pégalo en la ficha de compatibilidad del cliente.');
  return page.evaluate(() => navigator.clipboard.readText());
}

test('CP-094 · caso A · sin API: el atajo abre el diagnóstico, dice qué ventanas se revisaron y copia el informe', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: LMS });
  const avisos: string[] = [];
  page.on('console', (m) => { if (m.type() === 'warning') avisos.push(m.text()); });
  const sco = await abrirEnLms(page, curso, { sinApi: true });
  await pantallaVisible(sco, 'p01');
  // El curso funciona igual y nada se abre solo.
  await expect(sco.getByRole('dialog')).toHaveCount(0);
  expect(avisos.some((a) => a.includes('No se encontró la API SCORM 1.2'))).toBe(true);

  await atajo(page, sco);
  const panel = sco.getByRole('dialog', { name: 'Modo diagnóstico' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('No se encontró la API SCORM 1.2. El curso funciona, pero el LMS no recibe avance ni nota.')).toBeVisible();
  await expect(panel.locator('.ap-diag-busqueda li')).toHaveText(['Nivel 0 · esta ventana: sin API', 'Nivel 1 · ventana padre: sin API']);
  await expect(panel.getByText('Se revisaron 2 ventanas', { exact: false })).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Copiar informe' })).toBeFocused();

  const informe = JSON.parse(await copiarInforme(page, panel));
  expect(informe).toMatchObject({
    aptio: 'diagnostico-scorm12', version: 1, reproductor: '0.1.0', enIframe: true,
    curso: { id: curso.id, pantallas: 30 }, api: { encontrada: false, origen: null, nivel: null, conectado: false },
    busqueda: [{ nivel: 0, origen: 'propia', resultado: 'sin-api' }, { nivel: 1, origen: 'padre', resultado: 'sin-api' }],
    llamadas: { total: 0, guardadas: 0, lista: [] },
  });
  expect(informe.navegador).toMatch(/^Chrome \d+ · /);

  // El foco no sale del panel con Tab; Escape lo cierra y devuelve el foco al curso.
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(panel.getByRole('button', { name: 'Copiar informe' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
  await pantallaVisible(sco, 'p01');
});

test('CP-094 · caso B · en el LMS: con ?diagnostico=1 se ven LMSInitialize, LMSSetValue y LMSCommit, en vivo', async ({ page }) => {
  const sco = await abrirEnLms(page, curso, { consulta: 'diagnostico=1' });
  const panel = sco.getByRole('dialog', { name: 'Modo diagnóstico' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText('API SCORM 1.2 encontrada en ventana padre (nivel 1); LMSInitialize respondió bien.')).toBeVisible();
  await expect(panel.locator('.ap-diag-busqueda li')).toHaveText(['Nivel 0 · esta ventana: sin API', 'Nivel 1 · ventana padre: API SCORM 1.2 encontrada']);
  const tabla = panel.getByRole('table', { name: 'Llamadas al LMS' });
  const filas = tabla.locator('tbody tr');
  await expect(filas.first().locator('td').nth(1)).toHaveText('LMSInitialize');
  await expect(filas.filter({ hasText: 'cmi.core.entry' }).first()).toContainText('ab-initio');

  // Con el panel abierto, el curso avanza: las llamadas nuevas aparecen sin cerrar ni volver a abrir.
  const antes = await filas.count();
  await page.frame({ url: /paquete\/index\.html\?diagnostico=1$/ })!.evaluate(() => (window as unknown as { AptioPaquete: { reproductor: { siguiente: () => boolean } } }).AptioPaquete.reproductor.siguiente());
  await expect.poll(() => filas.count()).toBeGreaterThan(antes);
  const ubicacion = filas.filter({ hasText: 'LMSSetValue' }).filter({ hasText: 'cmi.core.lesson_location' }).last();
  await expect(ubicacion).toContainText('p02');
  await expect(ubicacion.locator('td').nth(5)).toHaveText('0');
  await expect(filas.filter({ hasText: 'LMSCommit' }).last()).toBeVisible();
  await expect(panel.getByText(/\d+ en total; se muestran las últimas \d+/)).toBeVisible();

  await panel.getByRole('button', { name: 'Cerrar' }).click();
  await expect(panel).toHaveCount(0);
  await pantallaVisible(sco, 'p02');
});

test('sin permiso para el portapapeles (pasa en algunos LMS), el informe queda seleccionado para Ctrl+C', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: () => Promise.reject(new Error('sin permiso')) } });
  });
  const sco = await abrirEnLms(page, curso, { consulta: 'diagnostico=1' });
  const panel = sco.getByRole('dialog', { name: 'Modo diagnóstico' });
  await panel.getByRole('button', { name: 'Copiar informe' }).click();
  await expect(panel.getByRole('status')).toHaveText('No se pudo copiar solo: el informe quedó seleccionado; cópialo con Ctrl+C.');
  const respaldo = panel.getByRole('textbox', { name: 'Informe de diagnóstico' });
  await expect(respaldo).toBeFocused();
  expect(JSON.parse(await respaldo.inputValue())).toMatchObject({ aptio: 'diagnostico-scorm12', api: { encontrada: true, conectado: true } });
  expect(await respaldo.evaluate((t: HTMLTextAreaElement) => t.selectionEnd - t.selectionStart)).toBe((await respaldo.inputValue()).length);
});

test('un paquete exportado sin modo diagnóstico no lo abre ni con el atajo ni con ?diagnostico=1', async ({ page }) => {
  const sco = await abrirEnLms(page, curso, { consulta: 'diagnostico=1', incluirDiagnostico: false });
  await pantallaVisible(sco, 'p01');
  await atajo(page, sco);
  await expect(sco.getByRole('dialog')).toHaveCount(0);
});

test('CP-094 · caso C · el informe copiado se pega en la ficha del cliente y queda con su límite de subida', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: LMS });
  const sco = await abrirEnLms(page, curso, { consulta: 'diagnostico=1' });
  const copiado = await copiarInforme(page, sco.getByRole('dialog', { name: 'Modo diagnóstico' }));

  await simularApi(page, { conSesion: true, rol: 'PRODUCTOR' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const seccion = page.getByRole('region', { name: 'Fichas de compatibilidad LMS' });
  await expect(seccion.getByText('Todavía no hay fichas', { exact: false })).toBeVisible();
  await seccion.getByRole('button', { name: 'Nueva ficha' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Nueva ficha de compatibilidad' });
  await expect(dialogo).toBeVisible();
  await dialogo.getByLabel('LMS', { exact: true }).fill('Moodle');
  await dialogo.getByLabel('Versión').fill('4.5');
  await dialogo.getByLabel('Límite de subida (MB)').fill('200');
  // Un texto que no es JSON se rechaza antes de enviar.
  const informe = dialogo.getByLabel('Informe del modo diagnóstico (JSON)');
  await informe.fill('{"aptio":');
  await dialogo.getByRole('button', { name: 'Guardar ficha' }).click();
  await expect(dialogo.getByRole('alert')).toContainText('El informe no es un JSON válido');

  const envio = page.waitForRequest((r) => r.url().endsWith(`/clientes/${CLIENTE_ID}/fichas-lms`) && r.method() === 'POST');
  await informe.fill(copiado);
  await dialogo.getByRole('button', { name: 'Guardar ficha' }).click();
  expect((await envio).postDataJSON()).toEqual({ lmsNombre: 'Moodle', lmsVersion: '4.5', limiteSubidaMb: 200, resultadoDiagnostico: JSON.parse(copiado) });
  await expect(dialogo).toBeHidden();
  await expect(seccion.getByRole('status')).toHaveText('Ficha de Moodle guardada');
  const fila = seccion.getByRole('table', { name: 'Fichas de compatibilidad' }).locator('tbody tr');
  await expect(fila).toHaveCount(1);
  await expect(fila.locator('td')).toHaveText(['Moodle', '4.5', '200 MB', /^API encontrada · Chrome \d+/, /\d/]);
});

test('el diseñador gráfico ve las fichas pero no crea', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(`/clientes/${CLIENTE_ID}`);
  const seccion = page.getByRole('region', { name: 'Fichas de compatibilidad LMS' });
  await expect(seccion).toBeVisible();
  await expect(seccion.getByRole('button', { name: 'Nueva ficha' })).toHaveCount(0);
});
