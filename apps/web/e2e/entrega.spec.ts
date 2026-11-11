// HU-1202 · Entrega (PNT-13), CP-091 desde la web: elegir el LMS destino (solo cambia las recomendaciones), exportar,
// ver el avance hasta «Listo» y descargar el ZIP del caso LOTO; el historial muestra versión, peso y estado.
// La API se simula; el ZIP es el paquete real que arma @aptio/exporters.
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

type Exp = { id: string; cursoId: string; formato: string; perfilLms: string; modoIdioma: string; versionCurso: number; estado: string; bytes: number | null; informe: unknown; motivo: string | null; nombreArchivo: string | null; descargaUrl: string | null; creadoEn: string };

/** Exportaciones simuladas: cada una pasa a EN_CURSO y a COMPLETADO en las consultas siguientes, como el worker. */
async function simularExportaciones(page: Page, zip: Uint8Array, opciones: { falla?: boolean } = {}) {
  const lista: Exp[] = [{
    id: '00000000-0000-4000-8000-00000000e001', cursoId: CURSO, formato: 'SCORM12', perfilLms: 'generico', modoIdioma: 'unico', versionCurso: 1, estado: 'COMPLETADO',
    bytes: 2_400_000, informe: { errores: [], advertencias: [] }, motivo: null, nombreArchivo: 'bloqueo-y-etiquetado-scorm12-v1.zip', descargaUrl: null, creadoEn: '2026-11-10T09:00:00.000Z',
  }];
  const pedidos: Record<string, unknown>[] = [];
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
      const nueva: Exp = { ...lista[0]!, id: `00000000-0000-4000-8000-00000000e${String(100 + pedidos.length)}`, perfilLms: String(pedidos.at(-1)!.perfilLms), versionCurso: 3, estado: 'EN_COLA', bytes: null, informe: null, nombreArchivo: null, creadoEn: new Date().toISOString() };
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
  return { pedidos };
}

let zip: Uint8Array;
test.beforeAll(async () => {
  zip = (await construirScorm12({ curso: cursoPaquete(), recursos: recursosLoto({ sinAudio: true }), reproductor: await codigoReproductor() })).zip;
});

test('CP-091 · exportar desde Entrega: el perfil cambia las recomendaciones, se ve el avance y se descarga el ZIP', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { pedidos } = await simularExportaciones(page, zip);

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

  const historial = page.getByRole('region', { name: 'Historial de exportaciones' });
  await expect(historial.getByRole('row')).toHaveCount(2);

  await page.getByRole('button', { name: 'Exportar SCORM 1.2' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'versión 3 del curso' })).toBeVisible();
  expect(pedidos).toEqual([{ formato: 'SCORM12', perfilLms: 'generico' }]);
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
  await page.goto(`/proyectos/${PROYECTO}`);
  await expect(page.getByRole('link', { name: 'Revisión' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Exportar SCORM' })).toHaveCount(0);
});
