// HU-1202 · CP-091 · La cola `export` arma el paquete SCORM 1.2 del caso LOTO con la versión ligada a la exportación,
// lo guarda como recurso PAQUETE e informa los recursos que faltan; si un recurso no se puede leer, queda en ERROR.
// HU-1406 · CP-107 · Con voz de Google y una ilustración generada, `datos.js` lleva los créditos con la frase exacta;
// el paquete se registra con proveedor `aptio` (REQ-062).
// HU-0804 · ES + EN en el mismo paquete: entran los recursos de los dos idiomas y los créditos van en español.
// PostgreSQL real; el almacenamiento es un mapa en memoria (la API e2e usa S3 de LocalStack).
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { TAREA_EXPORTAR } from '@aptio/colas';
import { prisma } from '@aptio/db';
import JSZip from 'jszip';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearExportador, MIME_ZIP, nombrePaquete } from '../src/exportar.js';
import { AI, baseLista, escenario } from './apoyo-generacion.js';

const redis = { publish: async () => 1 } as unknown as Redis;
const ANA = readFileSync(new URL('../../../docs/diseno/personaje/plantilla-ana.svg', import.meta.url));

describe.skipIf(!baseLista && !process.env.CI)('exportar SCORM 1.2 (HU-1202)', () => {
  const e = escenario('exportar');
  const almacen = new Map<string, Uint8Array>();
  const leer = async (clave: string) => {
    const x = almacen.get(clave);
    if (!x) throw new Error('NoSuchKey');
    return x;
  };
  const subir = async (clave: string, cuerpo: Uint8Array) => void almacen.set(clave, cuerpo);
  const eventos: string[] = [];
  const conEventos = { publish: async (_c: string, m: string) => (eventos.push((JSON.parse(m) as { estado: string }).estado), 1) } as unknown as Redis;

  let cursoId = '';
  let proyectoId = '';
  const ids = { ana: randomUUID(), vtt: randomUUID(), doc: randomUUID(), voz: randomUUID(), img: randomUUID() };

  /**
   * El curso LOTO con recursos que son filas de Recurso: Ana, el VTT de p03, el manual del cliente, la voz de p02
   * (Google) y la ilustración de p20 (generada con IA).
   */
  const documento = () => JSON.parse(readFileSync(`${AI}/casos/loto/curso-esperado-es.json`, 'utf8')
    .replaceAll('"svg-ana"', `"${ids.ana}"`).replaceAll('"vtt-p03-es"', `"${ids.vtt}"`).replaceAll('"doc-pets-seg-014"', `"${ids.doc}"`)
    .replaceAll('"aud-p02-es"', `"${ids.voz}"`).replaceAll('"img-p20-faja"', `"${ids.img}"`));

  type Procedencia = { proveedor: string; modelo: string; licencia: string };
  const recurso = async (id: string, tipo: 'SVG' | 'SUBTITULO' | 'DOCUMENTO' | 'AUDIO' | 'IMAGEN', nombre: string, mime: string, cuerpo?: Uint8Array, procedencia?: Procedencia) => {
    const claveS3 = `org/${e.ids.orgId}/${e.ids.clienteId}/${id}`;
    if (cuerpo) almacen.set(claveS3, cuerpo);
    await prisma.recurso.create({ data: { id, organizacionId: e.ids.orgId, clienteId: e.ids.clienteId, proyectoId, tipo, origen: 'GENERADO', claveS3, mime, bytes: BigInt(cuerpo?.byteLength ?? 1), hash: 'x', nombre, ...procedencia } });
  };

  /** Lo que hace la API al exportar: la Exportacion en cola, ligada a la versión del curso. */
  const exportacion = (versionCurso: number, formato: 'SCORM12' | 'HTML' = 'SCORM12', modoIdioma = 'unico') => prisma.exportacion.create({
    data: { organizacionId: e.ids.orgId, cursoId, versionCurso, formato, perfilLms: formato === 'HTML' ? 'generico' : 'moodle', modoIdioma, creadoPorId: e.ids.usuarioId },
  });
  const correr = (id: string, r: Redis = redis) => crearExportador({ bd: prisma, redis: r, leer, subir })({
    data: { trabajoId: id, organizacionId: e.ids.orgId, tarea: TAREA_EXPORTAR }, queueName: 'export', updateProgress: async () => undefined,
  });

  beforeAll(async () => {
    await e.crear();
    proyectoId = (await e.preparar()).proyectoId;
    await prisma.kitMarca.create({ data: { clienteId: e.ids.clienteId, estilo: 'Industrial', voces: {}, paleta: { primario: '#0B3D91', acento: '#F28C28' }, tipografias: { titulos: 'Montserrat', textos: 'Open Sans' } } });
    cursoId = (await prisma.curso.create({ data: { organizacionId: e.ids.orgId, proyectoId, versionEsquema: '0.2.0', documento: documento(), version: 3 } })).id;
    await prisma.cursoVersion.create({ data: { cursoId, version: 3, documento: documento(), motivo: 'generación' } });
    await recurso(ids.ana, 'SVG', 'ana.svg', 'image/svg+xml', new Uint8Array(ANA));
    await recurso(ids.vtt, 'SUBTITULO', 'p03-es.vtt', 'text/vtt', new TextEncoder().encode('WEBVTT\n\n00:00.000 --> 00:02.300\nHola, soy Ana.\n'));
    // El manual del cliente no está en el almacenamiento: si el exportador lo leyera, fallaría.
    await recurso(ids.doc, 'DOCUMENTO', 'PETS-SEG-014.pdf', 'application/pdf');
    await recurso(ids.voz, 'AUDIO', 'p02-es.mp3', 'audio/mpeg', new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]),
      { proveedor: 'google', modelo: 'es-US-Neural2-A', licencia: 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)' });
    await recurso(ids.img, 'IMAGEN', 'p20-faja.png', 'image/png', new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      { proveedor: 'recraft', modelo: 'recraftv3', licencia: 'Recraft · uso comercial (plan de pago)' });
    // Quien revisa es la organización: su nombre va en los créditos.
    await prisma.organizacion.update({ where: { id: e.ids.orgId }, data: { nombre: 'AulasEducativas' } });
  });
  afterAll(async () => {
    if (cursoId) await prisma.exportacion.deleteMany({ where: { cursoId } });
    await prisma.kitMarca.deleteMany({ where: { clienteId: e.ids.clienteId } });
    await e.borrar();
  });

  it('CP-091 · arma el ZIP de la versión ligada, lo guarda como PAQUETE y deja COMPLETADO con el informe', async () => {
    // El curso cambió después de pedir la exportación: el paquete sale de la versión 3 (RN-12-4).
    const otra = documento();
    otra.metadatos.titulo.es = 'Título cambiado después';
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: otra, version: 4 } });
    await prisma.cursoVersion.create({ data: { cursoId, version: 4, documento: otra, motivo: 'edición' } });

    const exp = await exportacion(3);
    const { recursoId } = await correr(exp.id, conEventos);
    expect(eventos).toEqual(['EN_CURSO', 'EN_CURSO', 'COMPLETADO']);

    const r = await prisma.recurso.findUniqueOrThrow({ where: { id: recursoId } });
    const zip = almacen.get(r.claveS3)!;
    expect(r).toMatchObject({ tipo: 'PAQUETE', origen: 'GENERADO', mime: MIME_ZIP, proyectoId, nombre: 'bloqueo-y-etiquetado-scorm12-v3.zip', bytes: BigInt(zip.byteLength) });
    // REQ-062 · El paquete también tiene procedencia: lo armó la plataforma, sin IA.
    expect(r).toMatchObject({ proveedor: 'aptio', modelo: 'exportador-scorm12 v1', licencia: 'Paquete generado por Aptio SCORM' });
    expect(r.hash).toBe(createHash('sha256').update(zip).digest('hex'));
    expect(r.claveS3).toBe(`org/${e.ids.orgId}/${e.ids.clienteId}/${recursoId}`);

    const final = await prisma.exportacion.findUniqueOrThrow({ where: { id: exp.id } });
    expect(final).toMatchObject({ estado: 'COMPLETADO', recursoId, bytes: BigInt(zip.byteLength), motivo: null });
    const informe = final.informe as { errores: string[]; advertencias: string[]; recursosFaltantes: string[]; idioma: string };
    expect(informe.errores).toEqual([]);
    expect(informe.idioma).toBe('es');
    // Los recursos del caso que no son filas de Recurso (ids de ejemplo) faltan; Ana, el VTT y el manual no.
    expect(informe.recursosFaltantes).not.toContain(ids.ana);
    expect(informe.recursosFaltantes).not.toContain(ids.vtt);
    expect(informe.recursosFaltantes).not.toContain(ids.doc);
    expect(informe.advertencias[0]).toMatch(/^Falta el archivo de «p01-es\.mp3»: el paquete muestra su texto alternativo\.$/);

    const contenido = await JSZip.loadAsync(zip);
    const manifiesto = await contenido.file('imsmanifest.xml')!.async('string');
    expect(manifiesto).toContain('<schemaversion>1.2</schemaversion>');
    expect(manifiesto).toContain('<title>Bloqueo y etiquetado</title>');
    expect(manifiesto).toContain('<adlcp:masteryscore>70</adlcp:masteryscore>');
    expect(contenido.file(`recursos/${ids.ana}.svg`)).not.toBeNull();
    expect(Object.keys(contenido.files).some((n) => n.endsWith('.pdf'))).toBe(false);
    const datos = await contenido.file('datos.js')!.async('string');
    expect(datos).toContain('"titulos":"Montserrat"');
    expect(datos).toContain('Hola, soy Ana.');

    // CP-107 · Los créditos de IA: voz de Google e ilustración de Recraft, revisadas por la organización. Ana (sin
    // proveedor de IA) y los subtítulos (aptio) no salen.
    const { creditos } = JSON.parse(datos.replace(/^window\.APTIO_DATOS = /, '').replace(/;\n?$/, '')) as { creditos: { aviso: string; filas: { que: string; proveedor: string; modelo: string; licencia: string }[] } };
    expect(creditos.aviso).toBe('Voz e ilustraciones generadas con IA y revisadas por AulasEducativas');
    expect(creditos.filas).toEqual([
      { que: 'Voz', proveedor: 'Google', modelo: 'es-US-Neural2-A', licencia: 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)' },
      { que: 'Ilustraciones', proveedor: 'Recraft', modelo: 'recraftv3', licencia: 'Recraft · uso comercial (plan de pago)' },
    ]);
  }, 60_000);

  it('HU-1203 · con formato HTML arma la carpeta sin manifiesto, con LEEME.txt y modo html, y la nombra -html-v<n>', async () => {
    const exp = await exportacion(3, 'HTML');
    const { recursoId } = await correr(exp.id);
    const r = await prisma.recurso.findUniqueOrThrow({ where: { id: recursoId } });
    expect(r).toMatchObject({ tipo: 'PAQUETE', mime: MIME_ZIP, nombre: 'bloqueo-y-etiquetado-html-v3.zip', proveedor: 'aptio', modelo: 'exportador-html v1' });
    expect(await prisma.exportacion.findUniqueOrThrow({ where: { id: exp.id } })).toMatchObject({ estado: 'COMPLETADO', formato: 'HTML', recursoId });
    const contenido = await JSZip.loadAsync(almacen.get(r.claveS3)!);
    expect(contenido.file('imsmanifest.xml')).toBeNull();
    expect(await contenido.file('LEEME.txt')!.async('string')).toContain('Descomprime y abre index.html con doble clic.');
    expect(await contenido.file('datos.js')!.async('string')).toContain('"modo":"html"');
    // CP-107 · La carpeta HTML lleva los mismos créditos.
    expect(await contenido.file('datos.js')!.async('string')).toContain('"aviso":"Voz e ilustraciones generadas con IA y revisadas por AulasEducativas"');
    expect(contenido.file(`recursos/${ids.ana}.svg`)).not.toBeNull();
    expect(Object.keys(contenido.files).some((n) => n.endsWith('.pdf'))).toBe(false);
  }, 60_000);

  it('HU-0804 · ES + EN en el mismo paquete: lleva la voz en inglés, abre en español y los créditos la incluyen', async () => {
    const vozEn = randomUUID();
    await recurso(vozEn, 'AUDIO', 'p01-en.mp3', 'audio/mpeg', new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 1]),
      { proveedor: 'google', modelo: 'en-US-Neural2-F', licencia: 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)' });
    const doc = documento();
    const visitar = (v: unknown) => {
      if (Array.isArray(v)) { v.forEach(visitar); return; }
      if (!v || typeof v !== 'object') return;
      const o = v as Record<string, unknown>;
      if (typeof o.es === 'string' && Object.keys(o).every((k) => k === 'es' || k === 'en')) { o.en = `[EN] ${o.es}`; return; }
      Object.values(o).forEach(visitar);
    };
    visitar(doc);
    doc.recursos.push({ id: vozEn, tipo: 'audio', origen: 'generado', nombre: 'p01-en.mp3', mime: 'audio/mpeg', idioma: 'en' });
    const n = doc.modulos[0].capsulas[0].pantallas[0].narracion;
    n.porIdioma.en = { ...structuredClone(n.porIdioma.es), recursoAudioId: vozEn };
    await prisma.cursoVersion.create({ data: { cursoId, version: 9, documento: doc, motivo: 'traducción' } });

    const exp = await exportacion(9, 'SCORM12', 'mismo-paquete');
    const { recursoId } = await correr(exp.id);
    const final = await prisma.exportacion.findUniqueOrThrow({ where: { id: exp.id } });
    expect(final.informe).toMatchObject({ idioma: 'es', idiomas: ['es', 'en'] });
    const contenido = await JSZip.loadAsync(almacen.get((await prisma.recurso.findUniqueOrThrow({ where: { id: recursoId } })).claveS3)!);
    expect(contenido.file(`recursos/${vozEn}.mp3`)).not.toBeNull();
    const datos = JSON.parse((await contenido.file('datos.js')!.async('string')).replace(/^window\.APTIO_DATOS = /, '').replace(/;\n?$/, '')) as
      { idioma: string; curso: { idiomas: string[]; modoIdioma: string }; creditos: { aviso: string; filas: { modelo: string }[] } };
    expect(datos).toMatchObject({ idioma: 'es', curso: { idiomas: ['es', 'en'], modoIdioma: 'mismo-paquete' } });
    expect(datos.creditos.aviso).toBe('Voz e ilustraciones generadas con IA y revisadas por AulasEducativas');
    expect(datos.creditos.filas.map((f) => f.modelo)).toContain('en-US-Neural2-F');
  }, 60_000);

  it('si un recurso no se puede leer, la exportación queda en ERROR con el motivo', async () => {
    const perdido = randomUUID();
    const doc = documento();
    doc.recursos.push({ id: perdido, tipo: 'svg', origen: 'generado', nombre: 'perdido.svg', mime: 'image/svg+xml' });
    await prisma.cursoVersion.create({ data: { cursoId, version: 5, documento: doc, motivo: 'edición' } });
    await recurso(perdido, 'SVG', 'perdido.svg', 'image/svg+xml');

    const exp = await exportacion(5);
    await expect(correr(exp.id)).rejects.toThrow('No se pudo leer el recurso «perdido.svg»: NoSuchKey');
    expect(await prisma.exportacion.findUniqueOrThrow({ where: { id: exp.id } })).toMatchObject({ estado: 'ERROR', motivo: 'No se pudo leer el recurso «perdido.svg»: NoSuchKey', recursoId: null });
  }, 60_000);

  it('una exportación de otra organización no se procesa', async () => {
    const exp = await exportacion(3);
    await expect(crearExportador({ bd: prisma, redis, leer, subir })({
      data: { trabajoId: exp.id, organizacionId: randomUUID(), tarea: TAREA_EXPORTAR }, queueName: 'export', updateProgress: async () => undefined,
    })).rejects.toThrow('no existe en la organización');
    expect((await prisma.exportacion.findUniqueOrThrow({ where: { id: exp.id } })).estado).toBe('EN_COLA');
  });

  it('el nombre del archivo no lleva tildes ni espacios', () => {
    expect(nombrePaquete('Inducción · Seguridad   2026', 7)).toBe('induccion-seguridad-2026-scorm12-v7.zip');
    expect(nombrePaquete('¡¿?!', 1)).toBe('curso-scorm12-v1.zip');
    expect(nombrePaquete('Inducción · Seguridad', 2, 'HTML')).toBe('induccion-seguridad-html-v2.zip');
  });
});
