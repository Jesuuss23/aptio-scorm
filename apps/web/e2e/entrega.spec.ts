// HU-1202 · Entrega (PNT-13), CP-091 desde la web: elegir el LMS destino (solo cambia las recomendaciones), exportar,
// ver el avance hasta «Listo» y descargar el ZIP del caso LOTO; el historial muestra versión, peso y estado.
// La API se simula; el ZIP es el paquete real que arma @aptio/exporters.
// HU-1201 · CP-090 · Verificación automática: un paquete de 300 MB advierte con alternativas y se exporta igual; un error
// de esquema deshabilita Exportar; con pantallas sin aprobar se confirma antes (RN-12-3); cambiar el LMS vuelve a validar.
// HU-1203 · Formato HTML autocontenido: sin LMS destino ni límite de subida, con la misma confirmación y el formato en el historial.
// HU-0804 · Idioma «ES + EN en el mismo paquete»: sin todo el inglés no se exporta; los desbordes y la voz solo advierten.
import { codigoReproductor, construirScorm12 } from '@aptio/exporters';
import { expect, type Page, test } from '@playwright/test';
import JSZip from 'jszip';
import { readFileSync } from 'node:fs';
import { cursoLoto as cursoPaquete, recursosLoto } from '../../../packages/exporters/test/loto.ts';
import { simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const CURSO = '00000000-0000-4000-8000-000000000990';
const URL_ENTREGA = `/proyectos/${PROYECTO}/entrega`;
const DESCARGA = 'https://s3-descarga.prueba/paquete.zip?X-Amz-Expires=900';

type Validacion = Record<string, unknown> & { errores: string[]; advertencias: string[] };
const VALIDACION: Validacion = {
  formato: 'SCORM12', errores: [], advertencias: ['18 de 30 pantallas sin aprobar: revísalas antes de entregar al cliente.'], pesoEstimadoMb: 14.8, pesoEstimadoBytes: 15_518_924,
  limiteMb: 100, origenLimite: 'referencia', superaLimite: false, alternativas: [], recursosPesados: [], suspendDataCaracteres: 162,
  pantallasTotal: 30, pantallasSinAprobar: 18, recursosFaltantes: [],
};
/** Lo que responde la API para HTML: sin límite de subida ni suspend_data (HU-1203). */
const VALIDACION_HTML: Validacion = { ...VALIDACION, formato: 'HTML', limiteMb: null, origenLimite: null, suspendDataCaracteres: null, pesoEstimadoMb: 14.7 };
const ALTERNATIVAS = [
  'Exportar igual, con la recomendación de que el administrador del LMS amplíe el límite de subida.',
  'Comprimir más el video y las imágenes.',
  'Dividir el curso en varios paquetes (por módulo o cápsula).',
  'Alojar el video fuera del paquete (servidor del cliente, plataforma de video o almacenamiento propio).',
  'Usar el paquete de distribución (dispatch), cuando exista.',
];
const PESADA: Validacion = {
  ...VALIDACION, pesoEstimadoMb: 300.4, pesoEstimadoBytes: 315_000_000, superaLimite: true, alternativas: ALTERNATIVAS,
  advertencias: ['El paquete pesaría unos 300.4 MB y el límite de subida del destino es 100 MB (valor de referencia, el LMS del cliente puede aceptar más). Puedes exportar igual; revisa las alternativas.', ...VALIDACION.advertencias],
  recursosPesados: [{ id: 'r1', nombre: 'procedimiento.mp4', bytes: 300 * 1024 * 1024 }, { id: 'r2', nombre: 'p01-es.mp3', bytes: 420_000 }],
};

type Exp = { id: string; cursoId: string; formato: string; perfilLms: string; modoIdioma: string; versionCurso: number; estado: string; bytes: number | null; informe: unknown; motivo: string | null; nombreArchivo: string | null; descargaUrl: string | null; creadoEn: string };

/** Exportaciones simuladas: cada una pasa a EN_CURSO y a COMPLETADO en las consultas siguientes, como el worker. */
async function simularExportaciones(page: Page, zip: Uint8Array, opciones: { falla?: boolean; validacion?: Validacion; bilingue?: () => Validacion } = {}) {
  const lista: Exp[] = [{
    id: '00000000-0000-4000-8000-00000000e001', cursoId: CURSO, formato: 'SCORM12', perfilLms: 'generico', modoIdioma: 'unico', versionCurso: 1, estado: 'COMPLETADO',
    bytes: 2_400_000, informe: { errores: [], advertencias: [] }, motivo: null, nombreArchivo: 'bloqueo-y-etiquetado-scorm12-v1.zip', descargaUrl: null, creadoEn: '2026-11-10T09:00:00.000Z',
  }];
  const pedidos: Record<string, unknown>[] = [];
  const validaciones: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/cursos/${CURSO}/validar`, (r) => {
    const pedido = r.request().postDataJSON() as Record<string, unknown>;
    validaciones.push(pedido);
    if (pedido.modoIdioma === 'mismo-paquete' && opciones.bilingue) return r.fulfill({ json: opciones.bilingue() });
    return r.fulfill({ json: { ...(pedido.formato === 'HTML' ? VALIDACION_HTML : (opciones.validacion ?? VALIDACION)), modoIdioma: 'unico', textosIngles: null } });
  });
  const consultas = new Map<string, number>();
  const avanzar = (e: Exp) => {
    const n = (consultas.get(e.id) ?? 0) + 1;
    consultas.set(e.id, n);
    if (e.estado === 'EN_COLA' && n >= 1) e.estado = 'EN_CURSO';
    else if (e.estado === 'EN_CURSO' && n >= 2) {
      if (opciones.falla) Object.assign(e, { estado: 'ERROR', motivo: 'No se pudo leer el recurso «ana.svg»: NoSuchKey' });
      else Object.assign(e, { estado: 'COMPLETADO', bytes: zip.byteLength, nombreArchivo: 'bloqueo-y-etiquetado-scorm12-v3.zip', informe: { errores: [], advertencias: ['Falta el archivo de «p01-es.mp3»: el paquete muestra su texto alternativo.'] } });
    }
  };
  await page.route('**/api/v1/eventos', (r) => r.fulfill({ status: 204, body: '' }));
  await page.route(`**/api/v1/cursos/${CURSO}/exportaciones`, async (r) => {
    if (r.request().method() === 'POST') {
      pedidos.push(r.request().postDataJSON() as Record<string, unknown>);
      const nueva: Exp = { ...lista[0]!, id: `00000000-0000-4000-8000-00000000e${String(100 + pedidos.length)}`, formato: String(pedidos.at(-1)!.formato), perfilLms: String(pedidos.at(-1)!.perfilLms), modoIdioma: String(pedidos.at(-1)!.modoIdioma ?? 'unico'), versionCurso: 3, estado: 'EN_COLA', bytes: null, informe: null, nombreArchivo: null, creadoEn: new Date().toISOString() };
      lista.unshift(nueva);
      return r.fulfill({ status: 202, json: nueva });
    }
    lista.forEach(avanzar);
    return r.fulfill({ json: lista.map((e) => ({ ...e, descargaUrl: null })) });
  });
  await page.route('**/api/v1/exportaciones/*', (r) => {
    const e = lista.find((x) => r.request().url().endsWith(x.id));
    return e ? r.fulfill({ json: { ...e, descargaUrl: e.estado === 'COMPLETADO' ? DESCARGA : null } }) : r.fulfill({ status: 404, json: { codigo: 'NO_ENCONTRADO', mensaje: 'Exportación no encontrada' } });
  });
  await page.route('https://s3-descarga.prueba/**', (r) => r.fulfill({
    body: Buffer.from(zip), headers: { 'content-type': 'application/zip', 'content-disposition': 'attachment; filename="bloqueo-y-etiquetado-scorm12-v3.zip"' },
  }));
  return { pedidos, validaciones };
}

let zip: Uint8Array;
test.beforeAll(async () => {
  zip = (await construirScorm12({ curso: cursoPaquete(), recursos: recursosLoto({ sinAudio: true }), reproductor: await codigoReproductor() })).zip;
});

test('CP-091 · exportar desde Entrega: el perfil cambia las recomendaciones, se ve el avance y se descarga el ZIP', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { pedidos, validaciones } = await simularExportaciones(page, zip);

  // Desde el detalle del proyecto, «Exportar SCORM» lleva a Entrega.
  await page.goto(`/proyectos/${PROYECTO}`);
  await page.getByRole('link', { name: 'Exportar SCORM' }).click();
  await expect(page).toHaveURL(URL_ENTREGA);
  await expect(page.getByRole('heading', { name: 'Entrega', level: 1 })).toBeVisible();

  // El proyecto tiene Moodle como LMS: es el perfil propuesto; cambiar de perfil solo cambia la recomendación.
  const lms = page.getByRole('group', { name: 'LMS destino' });
  await expect(lms.getByRole('button', { name: 'Moodle 4.5+' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText(/método de calificación y el número de intentos/)).toBeVisible();
  await lms.getByRole('button', { name: 'Canvas' }).click();
  await expect(page.getByText(/herramienta LTI de SCORM/)).toBeVisible();
  await lms.getByRole('button', { name: 'Genérico (cualquier LMS)' }).click();
  await expect(page.getByText(/prueba antes el paquete en SCORM Cloud/)).toBeVisible();
  await expect(page.getByText('18 de 30 pantallas sin aprobar', { exact: false })).toBeVisible();
  // Cada cambio de LMS vuelve a validar (moodle, canvas, genérico).
  await expect.poll(() => validaciones.map((v) => v.perfilLms)).toEqual(['moodle', 'canvas', 'generico']);
  const verificacion = page.getByRole('region', { name: 'Verificación automática' });
  await expect(verificacion.getByText('14.8 MB', { exact: true })).toBeVisible();
  await expect(verificacion.getByText('12 / 30')).toBeVisible();
  await expect(verificacion.getByText(/caben en suspend_data \(162 de 4,096 caracteres\)/)).toBeVisible();

  const historial = page.getByRole('region', { name: 'Historial de exportaciones' });
  await expect(historial.getByRole('row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Exportar SCORM 1.2' }).click();
  // RN-12-3: con pantallas sin aprobar se confirma antes de exportar.
  const confirmar = page.getByRole('dialog', { name: '¿Exportar con pantallas sin aprobar?' });
  await expect(confirmar).toContainText('18 de 30 pantallas no están aprobadas');
  await confirmar.getByRole('button', { name: 'Exportar igual' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'versión 3 del curso' })).toBeVisible();
  expect(pedidos).toEqual([{ formato: 'SCORM12', perfilLms: 'generico', modoIdioma: 'unico' }]);
  const fila = historial.getByRole('row').nth(1);
  await expect(fila).toContainText('v3');
  await expect(fila).toContainText(/En cola|Armando el paquete…/);
  await expect(fila).toContainText('Listo', { timeout: 10_000 });
  await expect(fila).toContainText(`${Math.round(zip.byteLength / 1024)} KB`);
  await fila.getByText('1 advertencias').click();
  await expect(fila.getByText('Falta el archivo de «p01-es.mp3»')).toBeVisible();

  const descarga = page.waitForEvent('download');
  await fila.getByRole('button', { name: 'Descargar bloqueo-y-etiquetado-scorm12-v3.zip' }).click();
  const archivo = await descarga;
  expect(archivo.suggestedFilename()).toBe('bloqueo-y-etiquetado-scorm12-v3.zip');
  const contenido = await JSZip.loadAsync(readFileSync((await archivo.path())!));
  expect(await contenido.file('imsmanifest.xml')!.async('string')).toContain('<schemaversion>1.2</schemaversion>');
  expect(contenido.file('index.html')).not.toBeNull();
});

test('si la exportación falla, el historial muestra el motivo y no ofrece Descargar', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await simularExportaciones(page, zip, { falla: true });
  await page.goto(URL_ENTREGA);
  await page.getByRole('button', { name: 'Exportar SCORM 1.2' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Exportar igual' }).click();
  const fila = page.getByRole('region', { name: 'Historial de exportaciones' }).getByRole('row').nth(1);
  await expect(fila).toContainText('Error', { timeout: 10_000 });
  await expect(fila).toContainText('No se pudo leer el recurso «ana.svg»');
  await expect(fila.getByRole('button', { name: /Descargar/ })).toHaveCount(0);
});

test('el revisor del cliente ve la entrega sin el botón Exportar', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' });
  await simularExportaciones(page, zip);
  await page.goto(URL_ENTREGA);
  await expect(page.getByRole('heading', { name: 'Entrega', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar SCORM 1.2' })).toHaveCount(0);
  await expect(page.getByText('Solo administración, diseño instruccional y producción exportan.')).toBeVisible();
  await expect(page.getByText('El historial y la descarga son del equipo de producción.')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Verificación automática' })).toHaveCount(0);
  await page.goto(`/proyectos/${PROYECTO}`);
  await expect(page.getByRole('link', { name: 'Revisión' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exportar SCORM' })).toHaveCount(0);
});

test('CP-090 · con un paquete de 300 MB advierte con las alternativas y los recursos más pesados, y se exporta igual', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { pedidos } = await simularExportaciones(page, zip, { validacion: PESADA });
  await page.goto(URL_ENTREGA);
  const verificacion = page.getByRole('region', { name: 'Verificación automática' });
  await expect(verificacion.getByText('300.4 MB', { exact: true })).toBeVisible();
  await expect(verificacion.getByText('de 100 MB de referencia')).toBeVisible();
  await expect(verificacion.getByText(/El paquete pesaría unos 300\.4 MB y el límite de subida del destino es 100 MB/)).toBeVisible();
  const alternativas = verificacion.getByRole('listitem').filter({ hasText: /amplíe el límite|Comprimir|Dividir|Alojar el video|dispatch/ });
  await expect(alternativas).toHaveCount(5);
  const pesados = verificacion.getByRole('table', { name: 'Recursos que más pesan' });
  await expect(pesados.getByRole('row').nth(1)).toContainText('procedimiento.mp4');
  await expect(pesados.getByRole('row').nth(1)).toContainText('300 MB');

  // RN-12-2: nunca se bloquea por tamaño. Al cancelar la confirmación no se exporta; al confirmar, sí.
  const exportar = page.getByRole('button', { name: 'Exportar SCORM 1.2' });
  await expect(exportar).toBeEnabled();
  await exportar.click();
  const confirmar = page.getByRole('dialog', { name: '¿Exportar con pantallas sin aprobar?' });
  await expect(confirmar.getByRole('button', { name: 'Cancelar' })).toBeFocused();
  await confirmar.getByRole('button', { name: 'Cancelar' }).click();
  await expect(confirmar).toBeHidden();
  expect(pedidos).toEqual([]);
  await exportar.click();
  await confirmar.getByRole('button', { name: 'Exportar igual' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'versión 3 del curso' })).toBeVisible();
  expect(pedidos).toHaveLength(1);
});

test('con un error de esquema, Exportar queda deshabilitado y se listan los errores', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await simularExportaciones(page, zip, { validacion: { ...VALIDACION, errores: ['/seguimiento: falta la propiedad obligatoria'] } });
  await page.goto(URL_ENTREGA);
  const verificacion = page.getByRole('region', { name: 'Verificación automática' });
  await expect(verificacion.getByText('El curso no cumple el esquema: corrígelo antes de exportar.')).toBeVisible();
  await expect(verificacion.getByText('/seguimiento: falta la propiedad obligatoria')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar SCORM 1.2' })).toBeDisabled();
});

test('con todas las pantallas aprobadas se exporta sin confirmar', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { pedidos } = await simularExportaciones(page, zip, { validacion: { ...VALIDACION, advertencias: [], pantallasSinAprobar: 0 } });
  await page.goto(URL_ENTREGA);
  await expect(page.getByText('Todas las pantallas están aprobadas')).toBeVisible();
  await page.getByRole('button', { name: 'Exportar SCORM 1.2' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'versión 3 del curso' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(pedidos).toHaveLength(1);
});

test('HU-1203 · con HTML autocontenido no hay LMS destino ni límite de subida, se confirma igual y el historial muestra el formato', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { pedidos, validaciones } = await simularExportaciones(page, zip);
  await page.goto(URL_ENTREGA);
  const formato = page.getByRole('group', { name: 'Formato' });
  await expect(formato.getByRole('button', { name: 'SCORM 1.2 · un solo SCO' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('El peso cabe en el límite de subida del destino (100 MB)')).toBeVisible();

  await formato.getByRole('button', { name: 'HTML autocontenido · para presentar sin LMS' }).click();
  await expect(formato.getByRole('button', { name: 'HTML autocontenido · para presentar sin LMS' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('group', { name: 'LMS destino' })).toHaveCount(0);
  await expect(page.getByText('No guarda el avance ni la nota: para el seguimiento, exporta SCORM 1.2.', { exact: false })).toBeVisible();
  const verificacion = page.getByRole('region', { name: 'Verificación automática' });
  await expect(verificacion.getByText('sin límite de subida: no hay LMS')).toBeVisible();
  await expect(verificacion.getByText('Carpeta HTML autocontenida: abre sin internet y sin LMS', { exact: false })).toBeVisible();
  await expect(verificacion.getByText('límite de subida del destino')).toHaveCount(0);
  await expect(verificacion.getByText('suspend_data')).toHaveCount(0);
  expect(validaciones.at(-1)).toEqual({ formato: 'HTML', perfilLms: 'generico', modoIdioma: 'unico' });

  // Con pantallas sin aprobar se confirma también en HTML (RN-12-3).
  await page.getByRole('button', { name: 'Exportar HTML' }).click();
  const dialogo = page.getByRole('dialog', { name: '¿Exportar con pantallas sin aprobar?' });
  await expect(dialogo).toContainText('La carpeta HTML saldrá con su contenido actual');
  await dialogo.getByRole('button', { name: 'Exportar igual' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'se arma la carpeta HTML con la versión 3 del curso' })).toBeVisible();
  expect(pedidos).toEqual([{ formato: 'HTML', perfilLms: 'generico', modoIdioma: 'unico' }]);
  const fila = page.getByRole('region', { name: 'Historial de exportaciones' }).locator('tbody tr').first();
  await expect(fila.locator('td').nth(1)).toHaveText('HTML');
  await expect(fila.locator('td').nth(3)).toHaveText('—');
});

// HU-1406 · CP-106 · «Créditos y licencias»: los recursos generados del curso con su procedencia; al abrir la
// ilustración se ven proveedor, modelo y licencia. Arriba, el texto de los créditos tal como saldrá en el paquete.
const VOZ = { id: 'aud-p02-es', tipo: 'AUDIO', origen: 'GENERADO', nombre: 'p02-es.mp3', proveedor: 'google', modelo: 'es-US-Neural2-A', licencia: 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)' };
const ILUSTRACION = { id: 'img-p20-faja', tipo: 'IMAGEN', origen: 'GENERADO', nombre: 'Faja de seguridad.png', proveedor: 'recraft', modelo: 'recraftv3', licencia: 'Recraft · uso comercial (plan de pago)' };
const SUBTITULOS = { id: 'vtt-p03-es', tipo: 'SUBTITULO', origen: 'GENERADO', nombre: 'p03-es.vtt', proveedor: 'aptio', modelo: 'subtitulos-por-letras v1', licencia: 'Generado por Aptio SCORM desde el guion' };
const AVISO = 'Voz e ilustraciones generadas con IA y revisadas por AulasEducativas';

async function simularRecursos(page: Page) {
  const fichas: string[] = [];
  const base = { clienteId: '00000000-0000-4000-8000-0000000000c1', proyectoId: PROYECTO, mime: 'application/octet-stream', bytes: 1000, hash: 'x', eliminarEn: null, creadoEn: '2026-11-12T10:00:00.000Z' };
  // Otro recurso generado del proyecto que el curso ya no usa: no se lista.
  const sueltos = [VOZ, ILUSTRACION, SUBTITULOS, { ...ILUSTRACION, id: 'img-descartada', nombre: 'Descartada.png' }].map((r) => ({ ...base, ...r }));
  await page.route('**/api/v1/recursos?*', (r) => r.fulfill({ json: sueltos }));
  await page.route('**/api/v1/recursos/*', (r) => {
    const id = new URL(r.request().url()).pathname.split('/').pop()!;
    fichas.push(id);
    const fila = sueltos.find((x) => x.id === id);
    return fila ? r.fulfill({ json: { ...fila, url: `https://s3-descarga.prueba/${id}?X-Amz-Expires=900` } }) : r.fulfill({ status: 404, json: { codigo: 'NO_ENCONTRADO', mensaje: 'Recurso no encontrado' } });
  });
  return fichas;
}

test('CP-106 · Créditos y licencias: al abrir la ilustración se ven proveedor, modelo y licencia, y la vista previa de los créditos', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await simularExportaciones(page, zip, { validacion: { ...VALIDACION, creditos: { aviso: AVISO, filas: [
    { que: 'Voz', proveedor: 'Google', modelo: VOZ.modelo, licencia: VOZ.licencia },
    { que: 'Ilustraciones', proveedor: 'Recraft', modelo: ILUSTRACION.modelo, licencia: ILUSTRACION.licencia },
  ] } } });
  const fichas = await simularRecursos(page);
  await page.goto(URL_ENTREGA);
  const seccion = page.getByRole('region', { name: 'Créditos y licencias' });
  await expect(seccion.getByRole('heading', { name: 'Créditos y licencias' })).toBeVisible();

  const vista = seccion.getByRole('group', { name: 'Así saldrán los créditos' });
  await expect(vista.getByText(AVISO, { exact: true })).toBeVisible();
  await expect(vista.getByRole('table', { name: 'Recursos generados con IA' }).getByRole('row')).toHaveCount(3);

  // La lista: lo de IA primero, los subtítulos de la plataforma al final, y sin el recurso que el curso no usa.
  const tabla = seccion.getByRole('table', { name: 'Recursos generados del curso' });
  await expect(tabla.locator('tbody tr')).toHaveCount(3);
  await expect(tabla.locator('tbody tr td:first-child')).toHaveText(['p02-es.mp3', 'Faja de seguridad.png', 'p03-es.vtt']);
  await expect(tabla.getByText('Descartada.png')).toHaveCount(0);

  await tabla.getByRole('button', { name: 'Abrir Faja de seguridad.png' }).click();
  const dialogo = page.getByRole('dialog', { name: 'Faja de seguridad.png' });
  await expect(dialogo).toBeVisible();
  const campo = (nombre: string) => dialogo.locator(`dt:text-is("${nombre}") + dd`);
  await expect(campo('Proveedor')).toHaveText('recraft');
  await expect(campo('Modelo')).toHaveText('recraftv3');
  await expect(campo('Licencia')).toHaveText('Recraft · uso comercial (plan de pago)');
  await expect(campo('En los créditos')).toHaveText('Sí: se generó con IA');
  await expect(dialogo.getByRole('link', { name: 'Ver archivo' })).toHaveAttribute('href', /img-p20-faja\?X-Amz-Expires=900$/);
  expect(fichas).toEqual(['img-p20-faja']);
  await page.keyboard.press('Escape');
  await expect(dialogo).toBeHidden();

  // Los subtítulos los arma la plataforma: no salen en los créditos.
  await tabla.getByRole('button', { name: 'Abrir p03-es.vtt' }).click();
  await expect(page.getByRole('dialog', { name: 'p03-es.vtt' }).locator('dt:text-is("En los créditos") + dd')).toHaveText('No: lo armó la plataforma, sin IA');
});

test('CP-106 · el revisor del cliente ve los recursos y su procedencia, sin la vista previa de los créditos', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' });
  await simularExportaciones(page, zip);
  await simularRecursos(page);
  await page.goto(URL_ENTREGA);
  const seccion = page.getByRole('region', { name: 'Créditos y licencias' });
  await expect(seccion.getByRole('table', { name: 'Recursos generados del curso' }).locator('tbody tr')).toHaveCount(3);
  await expect(seccion.getByRole('group', { name: 'Así saldrán los créditos' })).toHaveCount(0);
  await seccion.getByRole('button', { name: 'Abrir Faja de seguridad.png' }).click();
  await expect(page.getByRole('dialog', { name: 'Faja de seguridad.png' }).locator('dt:text-is("Proveedor") + dd')).toHaveText('recraft');
});

test('HU-0804 · ES + EN en el mismo paquete: sin todo el inglés no se exporta; con él, exporta con los avisos de desborde y voz', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  let traducidos = 118;
  const FALTA = 'Faltan 2 textos en inglés: tradúcelos en Idiomas';
  const AVISOS = ['1 texto en inglés no cabe en su espacio (Desborde): revísalos en Idiomas.', 'Sin voz en inglés en 30 pantallas: en inglés esas pantallas muestran la narración como texto. Genérala en Idiomas.'];
  const { pedidos, validaciones } = await simularExportaciones(page, zip, {
    bilingue: () => ({ ...VALIDACION, modoIdioma: 'mismo-paquete', textosIngles: { traducidos, total: 120 }, errores: traducidos < 120 ? [FALTA] : [], advertencias: [...AVISOS, ...VALIDACION.advertencias] }),
  });
  await page.goto(URL_ENTREGA);
  const idioma = page.getByRole('group', { name: 'Idioma' });
  await expect(idioma.getByRole('button', { name: 'Español' })).toHaveAttribute('aria-pressed', 'true');
  const verificacion = page.getByRole('region', { name: 'Verificación automática' });
  await expect(verificacion.getByText('Textos en inglés')).toHaveCount(0);

  await idioma.getByRole('button', { name: 'ES + EN en el mismo paquete' }).click();
  await expect(page.getByText('El paquete abre en español y lleva un botón EN / ES para cambiar sin perder el avance.')).toBeVisible();
  await expect(verificacion.locator('[data-cifra="ingles"]')).toHaveText(/Textos en inglés\s*118 \/ 120/);
  await expect(verificacion.getByText(FALTA)).toBeVisible();
  await expect(verificacion.getByRole('link', { name: 'Ir a Idiomas' })).toHaveAttribute('href', `/proyectos/${PROYECTO}/idiomas`);
  // Faltar inglés no es un error de esquema: esa línea sigue bien.
  await expect(verificacion.getByText('el curso cumple el esquema', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Exportar SCORM 1.2' })).toBeDisabled();
  expect(validaciones.at(-1)).toMatchObject({ formato: 'SCORM12', modoIdioma: 'mismo-paquete' });

  // Con todo traducido se exporta: los desbordes y la voz en inglés solo advierten.
  traducidos = 120;
  await idioma.getByRole('button', { name: 'Español' }).click();
  await idioma.getByRole('button', { name: 'ES + EN en el mismo paquete' }).click();
  await expect(verificacion.locator('[data-cifra="ingles"]')).toHaveText(/120 \/ 120/);
  await expect(verificacion.getByText('Todos los textos tienen su inglés')).toBeVisible();
  for (const a of AVISOS) await expect(verificacion.getByText(a)).toBeVisible();
  await page.getByRole('button', { name: 'Exportar SCORM 1.2' }).click();
  await page.getByRole('dialog', { name: '¿Exportar con pantallas sin aprobar?' }).getByRole('button', { name: 'Exportar igual' }).click();
  await expect.poll(() => pedidos.at(-1)).toMatchObject({ formato: 'SCORM12', modoIdioma: 'mismo-paquete' });
  await expect(page.getByRole('region', { name: 'Historial de exportaciones' }).getByRole('cell', { name: 'SCORM 1.2 · ES + EN' })).toBeVisible();
});
