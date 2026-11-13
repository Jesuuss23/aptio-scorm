// HU-0704 · Audio del cliente (CP-074, REQ-023, REQ-024, RN-07-4).
// Grabación (cola voz, tarea GRABACION): el audio del material (original o limpio) pasa a MP3 con ffmpeg, la boca se
// calcula con el mismo calculador de la etapa 7 (Rhubarb en modo real, por letras en modo simulado) y los subtítulos
// WebVTT salen de los segmentos reales de la transcripción. El MP3 queda como recurso propio del curso (origen SUBIDO,
// licencia «Grabación del cliente», sin `eliminarEn`): el borrado del material del cliente (ADR-009) no lo toca.
// Limpieza (cola media, tarea LIMPIAR_AUDIO): ffmpeg `afftdn` + `loudnorm` a −16 LUFS en un recurso nuevo ligado al
// material, con la misma retención que el original; el original no se pisa. Sin ffmpeg falla con un error claro y no
// se guarda nada.
import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { aVtt, type CalculadorBocas, type MarcaBoca } from '@aptio/ai';
import { Prisma, type PrismaClient } from '@aptio/db';
import { validarCurso } from '@aptio/schema';
import { FILTRO_LIMPIEZA, hashGrabacion, LICENCIA_GRABACION, type SegmentoTranscripcion, subtitulosDeSegmentos, textoDeTranscripcion, VOZ_GRABACION } from '@aptio/schema/grabacion';
import { conProcedencia } from './procedencia.js';
import { PROVEEDOR_APTIO } from '@aptio/exporters';
import type { TrabajoEnCola } from './procesar.js';

const ejecutar = promisify(execFile);
const MIME_MP3 = 'audio/mpeg';
const MIME_VTT = 'text/vtt';

/** Lo que hace ffmpeg con el audio del cliente; en las pruebas se puede cambiar. */
export interface AudioCliente {
  /** El audio a MP3 mono de 44,1 kHz, con su duración real. */
  aMp3(archivo: Uint8Array): Promise<{ audio: Uint8Array; duracionMs: number }>;
  /** Reduce el ruido y normaliza a −16 LUFS (REQ-024); MP3 con su duración. */
  limpiar(archivo: Uint8Array): Promise<{ audio: Uint8Array; duracionMs: number }>;
}

export class FfmpegNoDisponible extends Error {}

async function conFfmpeg(archivo: Uint8Array, filtros: string[], ruta = 'ffmpeg', rutaProbe = 'ffprobe'): Promise<{ audio: Uint8Array; duracionMs: number }> {
  const dir = await mkdtemp(join(tmpdir(), 'aptio-grabacion-'));
  try {
    const entrada = join(dir, 'original');
    const salida = join(dir, 'salida.mp3');
    await writeFile(entrada, archivo);
    await ejecutar(ruta, ['-v', 'error', '-y', '-i', entrada, '-vn', ...filtros, '-ac', '1', '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '96k', salida]).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') throw new FfmpegNoDisponible('ffmpeg no está instalado en el worker: el audio no se procesó y no se guardó nada');
      throw new Error('No se pudo leer el audio del cliente (¿el archivo tiene sonido?)');
    });
    const { stdout } = await ejecutar(rutaProbe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', salida]).catch((e: NodeJS.ErrnoException) => {
      if (e.code === 'ENOENT') throw new FfmpegNoDisponible('ffprobe no está instalado en el worker: el audio no se procesó y no se guardó nada');
      throw e;
    });
    const s = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(s) || s <= 0) throw new Error('El audio del cliente no tiene duración legible');
    return { audio: new Uint8Array(await readFile(salida)), duracionMs: Math.round(s * 1000) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** ffmpeg y ffprobe del PATH (o de las rutas dadas). */
export function audioFfmpeg(ruta = 'ffmpeg', rutaProbe = 'ffprobe'): AudioCliente {
  return {
    aMp3: (archivo) => conFfmpeg(archivo, [], ruta, rutaProbe),
    limpiar: (archivo) => conFfmpeg(archivo, ['-af', FILTRO_LIMPIEZA], ruta, rutaProbe),
  };
}

export interface DependenciasGrabacion {
  bd: PrismaClient;
  leer: (clave: string) => Promise<Uint8Array>;
  subir: (clave: string, cuerpo: Uint8Array, mime: string) => Promise<void>;
  calcular: CalculadorBocas;
  audio?: AudioCliente;
}

type Pista = {
  estado: string; voz: { proveedor: string; voz: string; velocidad?: number }; hashTexto: string; recursoAudioId?: string; duracionMs?: number;
  bocas?: MarcaBoca[]; subtitulosId?: string; grabacion?: { materialId: string; recursoOrigenId?: string };
};
type PantallaDoc = { id: string; narracion?: { texto: { es?: string }; porIdioma: { es?: Pista } } };
type RecursoDoc = { id: string; tipo: string; origen: string; nombre: string; mime?: string; idioma?: string; bytes?: number; duracionMs?: number; licencia?: string };
type CursoDoc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[]; recursos: RecursoDoc[] };
const pantallasDe = (d: CursoDoc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

/** Un recurso de audio que sirve para el material: el suyo o su versión limpia. */
async function audioDelMaterial(bd: PrismaClient, organizacionId: string, material: { recursoId: string | null }, recursoId: string) {
  if (!material.recursoId) return null;
  const r = await bd.recurso.findFirst({ where: { id: recursoId, organizacionId, tipo: 'AUDIO' } });
  if (!r) return null;
  const limpiezaDe = (r.metadatos as { limpiezaDe?: string } | null)?.limpiezaDe;
  return r.id === material.recursoId || limpiezaDe === material.recursoId ? r : null;
}

export function crearGrabacion({ bd, leer, subir, calcular, audio = audioFfmpeg() }: DependenciasGrabacion) {
  return async function grabacion(trabajo: TrabajoEnCola): Promise<{ duracionMs: number; subtitulos: number; metodo: string }> {
    const { trabajoId: cursoId, organizacionId, pantallaId, grabacion: g } = trabajo.data;
    if (!pantallaId || !g) throw new Error('La grabación necesita la pantalla y el material');
    // Todo se busca con la organización del trabajo: nunca se procesa el curso o el audio de otra.
    const curso = await bd.curso.findFirst({ where: { id: cursoId, organizacionId }, include: { proyecto: { select: { id: true, clienteId: true } } } });
    if (!curso) throw new Error(`Curso ${cursoId} no existe en la organización`);
    const marcarError = () => bd.narracion.updateMany({ where: { cursoId, pantallaId, idioma: 'es' }, data: { estado: 'ERROR' } });
    try {
      const material = await bd.materialFuente.findFirst({ where: { id: g.materialId, proyectoId: curso.proyectoId, tipo: 'AUDIO', estado: 'listo' } });
      if (!material) throw new Error('El audio del cliente ya no está listo en el proyecto');
      const fuente = await audioDelMaterial(bd, organizacionId, material, g.recursoId);
      if (!fuente) throw new Error('El audio elegido no es de este material');
      const segmentos = (material.transcripcion ?? []) as unknown as SegmentoTranscripcion[];
      const texto = textoDeTranscripcion(segmentos);
      if (!texto) throw new Error('La grabación no tiene transcripción');

      await trabajo.updateProgress(10);
      const mp3 = await audio.aMp3(await leer(fuente.claveS3));
      await trabajo.updateProgress(40);
      const boca = await calcular({ audio: mp3.audio, mime: MIME_MP3, texto, duracionMs: mp3.duracionMs }).catch((e: unknown) => {
        throw new Error(`La boca de la grabación no se pudo calcular: ${e instanceof Error ? e.message : String(e)}`);
      });
      const cues = subtitulosDeSegmentos(segmentos, mp3.duracionMs);
      if (!cues.length) throw new Error('La transcripción no dio subtítulos dentro del audio');
      const vtt = new TextEncoder().encode(aVtt(cues));
      await trabajo.updateProgress(70);

      const audioId = randomUUID();
      const vttId = randomUUID();
      const clave = (id: string) => `org/${organizacionId}/${curso.proyecto.clienteId}/${id}`;
      await subir(clave(audioId), mp3.audio, MIME_MP3);
      await subir(clave(vttId), vtt, MIME_VTT);
      const hash = hashGrabacion(texto, fuente.id);
      const base = { organizacionId, clienteId: curso.proyecto.clienteId, proyectoId: curso.proyectoId };
      await bd.$transaction([
        bd.recurso.create({
          data: {
            ...base, id: audioId, tipo: 'AUDIO', origen: 'SUBIDO', claveS3: clave(audioId), mime: MIME_MP3, bytes: BigInt(mp3.audio.byteLength), duracionMs: mp3.duracionMs,
            hash: createHash('sha256').update(mp3.audio).digest('hex'), nombre: `${pantallaId}-es.mp3`, licencia: LICENCIA_GRABACION,
            // RN-07-4: quién autorizó usar la voz real y cuándo, junto al audio del curso.
            metadatos: { grabacion: { materialId: material.id, recursoOrigenId: fuente.id, version: g.version, autorizadoPor: g.autorizadoPor, autorizadoEn: g.autorizadoEn } },
          },
        }),
        bd.recurso.create({
          data: conProcedencia({
            ...base, id: vttId, tipo: 'SUBTITULO', origen: 'GENERADO', claveS3: clave(vttId), mime: MIME_VTT, bytes: BigInt(vtt.byteLength),
            hash: createHash('sha256').update(vtt).digest('hex'), nombre: `${pantallaId}-es.vtt`,
            proveedor: PROVEEDOR_APTIO, modelo: 'subtitulos-desde-transcripcion v1', licencia: 'Generado por Aptio SCORM desde la transcripción de la grabación',
          }),
        }),
        bd.narracion.upsert({
          where: { cursoId_pantallaId_idioma: { cursoId, pantallaId, idioma: 'es' } },
          create: {
            cursoId, pantallaId, idioma: 'es', textoHash: hash, origen: 'grabacion', voz: VOZ_GRABACION.voz, velocidad: 1, audioRecursoId: audioId,
            bocas: boca.bocas as unknown as Prisma.InputJsonValue, subtituloRecursoId: vttId, estado: 'ACTUALIZADA',
          },
          update: {
            textoHash: hash, origen: 'grabacion', voz: VOZ_GRABACION.voz, velocidad: 1, audioRecursoId: audioId,
            bocas: boca.bocas as unknown as Prisma.InputJsonValue, subtituloRecursoId: vttId, estado: 'ACTUALIZADA',
          },
        }),
      ]);

      // El curso recibe el audio, la boca y los subtítulos si la pantalla sigue con esta grabación; si alguien guardó
      // mientras tanto, se vuelve a leer.
      for (let intento = 0; intento < 3; intento++) {
        const actual = await bd.curso.findUniqueOrThrow({ where: { id: cursoId } });
        const doc = structuredClone(actual.documento) as unknown as CursoDoc;
        const pista = pantallasDe(doc).find((p) => p.id === pantallaId)?.narracion?.porIdioma.es;
        if (!pista?.grabacion || pista.grabacion.materialId !== material.id || (pista.grabacion.recursoOrigenId ?? material.recursoId) !== fuente.id) break;
        const anteriores = new Set([pista.recursoAudioId, pista.subtitulosId].filter(Boolean));
        Object.assign(pista, { estado: 'generado', recursoAudioId: audioId, duracionMs: mp3.duracionMs, bocas: boca.bocas, subtitulosId: vttId, hashTexto: hash });
        doc.recursos = [
          ...doc.recursos.filter((r) => !anteriores.has(r.id)),
          { id: audioId, tipo: 'audio', origen: 'subido', nombre: `${pantallaId}-es.mp3`, mime: MIME_MP3, idioma: 'es', bytes: mp3.audio.byteLength, duracionMs: mp3.duracionMs, licencia: LICENCIA_GRABACION },
          { id: vttId, tipo: 'subtitulos', origen: 'generado', nombre: `${pantallaId}-es.vtt`, mime: MIME_VTT, idioma: 'es', bytes: vtt.byteLength },
        ];
        const v = validarCurso(doc);
        if (!v.valido) throw new Error(`El curso con la grabación no valida: ${v.errores.slice(0, 3).join('; ')}`);
        const r = await bd.$transaction(async (tx) => {
          const n = await tx.curso.updateMany({ where: { id: cursoId, version: actual.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version: actual.version + 1 } });
          if (!n.count) return false;
          await tx.cursoVersion.create({ data: { cursoId, version: actual.version + 1, documento: doc as unknown as Prisma.InputJsonValue, motivo: 'grabación del cliente' } });
          return true;
        });
        if (r) break;
        if (intento === 2) throw new Error('El curso cambió muchas veces mientras se guardaba la grabación; vuelve a usarla para reintentar');
      }
      await trabajo.updateProgress(100);
      return { duracionMs: mp3.duracionMs, subtitulos: cues.length, metodo: boca.metodo };
    } catch (e) {
      await marcarError();
      throw e;
    }
  };
}

export interface DependenciasLimpieza {
  bd: PrismaClient;
  leer: (clave: string) => Promise<Uint8Array>;
  subir: (clave: string, cuerpo: Uint8Array, mime: string) => Promise<void>;
  audio?: AudioCliente;
}

type Limpieza = { estado: 'procesando' | 'listo' | 'error'; recursoId?: string; error?: string };

/** El estado de la limpieza vive en los metadatos del recurso original: así la API lo muestra con el material. */
async function anotar(bd: PrismaClient, recursoId: string, limpieza: Limpieza) {
  const r = await bd.recurso.findUniqueOrThrow({ where: { id: recursoId }, select: { metadatos: true } });
  await bd.recurso.update({ where: { id: recursoId }, data: { metadatos: { ...((r.metadatos as Record<string, unknown> | null) ?? {}), limpieza } as Prisma.InputJsonValue } });
}

export function crearLimpieza({ bd, leer, subir, audio = audioFfmpeg() }: DependenciasLimpieza) {
  return async function limpiar(trabajo: TrabajoEnCola): Promise<{ recursoId: string; duracionMs: number }> {
    const { trabajoId: materialId, organizacionId } = trabajo.data;
    const material = await bd.materialFuente.findFirst({ where: { id: materialId, tipo: 'AUDIO', proyecto: { organizacionId } } });
    if (!material?.recursoId) throw new Error(`Material ${materialId} no existe en la organización`);
    const original = await bd.recurso.findFirst({ where: { id: material.recursoId, organizacionId } });
    if (!original) throw new Error(`El audio del material ${materialId} ya no existe`);
    try {
      const limpio = await audio.limpiar(await leer(original.claveS3));
      const id = randomUUID();
      const claveS3 = `org/${organizacionId}/${original.clienteId}/${id}`;
      await subir(claveS3, limpio.audio, MIME_MP3);
      await bd.recurso.create({
        data: {
          id, organizacionId, clienteId: original.clienteId, proyectoId: original.proyectoId, tipo: 'AUDIO', origen: 'CLIENTE', claveS3, mime: MIME_MP3,
          bytes: BigInt(limpio.audio.byteLength), duracionMs: limpio.duracionMs, hash: createHash('sha256').update(limpio.audio).digest('hex'),
          nombre: `${original.nombre.replace(/\.[^.]+$/, '')}-limpio.mp3`,
          // Material del cliente igual que el original: se borra con su misma retención (ADR-009).
          eliminarEn: original.eliminarEn, metadatos: { limpiezaDe: original.id, filtro: FILTRO_LIMPIEZA, duracionS: Math.round(limpio.duracionMs / 100) / 10 },
        },
      });
      await anotar(bd, original.id, { estado: 'listo', recursoId: id });
      return { recursoId: id, duracionMs: limpio.duracionMs };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      await anotar(bd, original.id, { estado: 'error', error: e instanceof FfmpegNoDisponible ? mensaje : `No se pudo limpiar el audio: ${mensaje}` });
      throw e;
    }
  };
}
