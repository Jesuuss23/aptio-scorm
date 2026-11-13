// HU-0704 · Audio del cliente (CP-074, REQ-023, REQ-024, RN-07-4): una grabación del cliente pasa a ser la narración en
// español de una pantalla con su boca y sus subtítulos desde la transcripción; la regeneración de la voz de la IA no la
// pisa; la limpieza de ruido corre ffmpeg de verdad sobre un WAV corto y deja un recurso nuevo sin tocar el original.
// PostgreSQL real; boca simulada y el almacenamiento, un mapa en memoria.
import { calculadorSimulado, type CalculadorBocas, type PedidoVoz, proveedorSimulado, type Sintetizador, vozSimulada } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import { TAREA_CASCADA } from '@aptio/schema/generacion';
import { hashGrabacion, LICENCIA_GRABACION, pistaDeGrabacion, TAREA_GRABACION, TAREA_LIMPIAR } from '@aptio/schema/grabacion';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearCascada } from '../src/cascada.js';
import { crearEtapaBoca } from '../src/etapas/boca.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaSubtitulos } from '../src/etapas/subtitulos.js';
import { crearEtapaVoz } from '../src/etapas/voz.js';
import { audioFfmpeg, crearGrabacion, crearLimpieza } from '../src/grabacion.js';
import { baseLista, escenario } from './apoyo-generacion.js';

type Pista = { estado: string; voz: { proveedor: string }; recursoAudioId?: string; subtitulosId?: string; duracionMs?: number; bocas?: unknown[]; hashTexto: string; grabacion?: { materialId: string } };
type Doc = { recursos: { id: string; tipo: string; origen: string; idioma?: string; licencia?: string }[]; modulos: { capsulas: { pantallas: { id: string; estado: string; narracion?: { texto: { es: string }; porIdioma: { es: Pista } } }[] }[] }[] };
const pantallas = (d: Doc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

/** Un WAV mono de 16 kHz y 16 bits: un tono con ruido, determinista. */
function wav(segundos: number): Uint8Array {
  const tasa = 16000;
  const n = Math.round(segundos * tasa);
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(tasa, 24); b.writeUInt32LE(tasa * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  let semilla = 7;
  for (let i = 0; i < n; i++) {
    semilla = (semilla * 1103515245 + 12345) & 0x7fffffff;
    const ruido = (semilla / 0x7fffffff - 0.5) * 0.2;
    b.writeInt16LE(Math.round((Math.sin((2 * Math.PI * 220 * i) / tasa) * 0.3 + ruido) * 32767), 44 + i * 2);
  }
  return new Uint8Array(b);
}

const SEGMENTOS = [
  { desde: 0.2, hasta: 1.4, texto: 'Antes de intervenir un equipo,' },
  { desde: 1.4, hasta: 2.8, texto: 'bloquea todas sus fuentes de energía.' },
];
const TEXTO = 'Antes de intervenir un equipo, bloquea todas sus fuentes de energía.';

describe.skipIf(!baseLista && !process.env.CI)('audio del cliente (HU-0704)', () => {
  const e = escenario('grabacion');
  beforeAll(e.crear);
  afterAll(e.borrar);

  const almacen = new Map<string, Uint8Array>();
  const subir = async (clave: string, cuerpo: Uint8Array) => void almacen.set(clave, cuerpo);
  const leer = async (clave: string) => {
    const x = almacen.get(clave);
    if (!x) throw new Error(`No existe ${clave}`);
    return x;
  };
  let pedidosVoz: PedidoVoz[] = [];
  const sintetizar: Sintetizador = async (p) => (pedidosVoz.push(p), vozSimulada(p));
  let bocasPedidas: string[] = [];
  const calcular: CalculadorBocas = async (p) => (bocasPedidas.push(p.texto), calculadorSimulado(p));
  const etapas = { voz: crearEtapaVoz({ sintetizar, subir, esperaMs: 0 }), boca: crearEtapaBoca({ calcular, leer }), subtitulos: crearEtapaSubtitulos({ subir }) };
  const ejecutores = {
    RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION!, PANTALLAS: EJECUTORES.PANTALLAS!,
    VOZ_ES: etapas.voz, BOCA: etapas.boca, SUBTITULOS: etapas.subtitulos,
  };
  const grabacion = crearGrabacion({ bd: prisma, leer, subir, calcular });
  const limpieza = crearLimpieza({ bd: prisma, leer, subir });
  const trabajo = <T extends object>(data: T, cola = 'voz') => ({ data: { organizacionId: e.ids.orgId, ...data } as never, queueName: cola, updateProgress: async () => undefined });

  let cursoId = '';
  let proyectoId = '';
  let materialId = '';
  let originalId = '';
  const autorizacion = { autorizadoPor: 'Diseñadora instruccional', autorizadoEn: '2026-11-13T10:00:00.000Z' };
  const documento = async () => (await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } })).documento as unknown as Doc;

  /** Lo que guarda la API al elegir la grabación: el texto de la transcripción y la pista del cliente, pendiente. */
  async function elegir(pantallaId: string, recursoOrigenId: string, version: 'original' | 'limpio') {
    const c = await prisma.curso.findUniqueOrThrow({ where: { id: cursoId } });
    const doc = c.documento as unknown as Doc;
    const p = pantallas(doc).find((x) => x.id === pantallaId)!;
    p.narracion!.texto.es = TEXTO;
    p.narracion!.porIdioma.es = pistaDeGrabacion({ materialId, recursoOrigenId, version, ...autorizacion }, TEXTO) as unknown as Pista;
    await prisma.curso.update({ where: { id: cursoId }, data: { documento: doc as object, version: c.version + 1 } });
    await prisma.narracion.updateMany({ where: { cursoId, pantallaId, idioma: 'es' }, data: { origen: 'grabacion', estado: 'GENERANDO' } });
  }

  beforeAll(async () => {
    const r = await e.preparar();
    proyectoId = r.proyectoId;
    const fin = await e.correr(r.generacionId, proveedorSimulado(), ejecutores);
    if (fin.estado !== 'COMPLETADO') throw new Error(`La generación inicial terminó en ${fin.estado}`);
    cursoId = (await prisma.curso.findUniqueOrThrow({ where: { proyectoId } })).id;
    const audio = wav(3);
    const clave = `org/${e.ids.orgId}/${e.ids.clienteId}/grabacion-gerente`;
    almacen.set(clave, audio);
    const rec = await prisma.recurso.create({
      data: {
        organizacionId: e.ids.orgId, clienteId: e.ids.clienteId, proyectoId, tipo: 'AUDIO', origen: 'CLIENTE', claveS3: clave, mime: 'audio/wav', bytes: BigInt(audio.byteLength), hash: 'x',
        nombre: 'Grabacion_gerente.wav', eliminarEn: new Date('2027-05-13T00:00:00Z'), metadatos: { duracionS: 3 },
      },
    });
    originalId = rec.id;
    materialId = (await prisma.materialFuente.create({ data: { proyectoId, tipo: 'AUDIO', recursoId: rec.id, estado: 'listo', transcripcion: SEGMENTOS } })).id;
  });

  it('CP-074 · la grabación queda como narración de p05: MP3 propio del curso, boca desde el audio y subtítulos con los tiempos reales', async () => {
    await elegir('p05', originalId, 'original');
    bocasPedidas = [];
    const r = await grabacion(trabajo({ trabajoId: cursoId, tarea: TAREA_GRABACION, pantallaId: 'p05', grabacion: { materialId, recursoId: originalId, version: 'original', ...autorizacion } }));
    expect(r.metodo).toBe('simulado');
    expect(Math.abs(r.duracionMs - 3000)).toBeLessThan(150);
    expect(r.subtitulos).toBe(2);
    expect(bocasPedidas).toEqual([TEXTO]);

    const n = await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p05', idioma: 'es' } });
    expect(n).toMatchObject({ origen: 'grabacion', estado: 'ACTUALIZADA', textoHash: hashGrabacion(TEXTO, originalId) });
    const mp3 = await prisma.recurso.findUniqueOrThrow({ where: { id: n.audioRecursoId! } });
    // Recurso propio del curso: no es material del cliente ni tiene fecha de borrado (ADR-009).
    expect(mp3).toMatchObject({ tipo: 'AUDIO', origen: 'SUBIDO', mime: 'audio/mpeg', licencia: LICENCIA_GRABACION, eliminarEn: null, nombre: 'p05-es.mp3' });
    expect(mp3.metadatos).toMatchObject({ grabacion: { materialId, recursoOrigenId: originalId, ...autorizacion } });
    expect(Buffer.from(almacen.get(mp3.claveS3)!.subarray(0, 3)).toString('latin1')).toMatch(/^(ID3|\xff[\xe0-\xff])/);
    const vtt = await prisma.recurso.findUniqueOrThrow({ where: { id: n.subtituloRecursoId! } });
    expect(new TextDecoder().decode(almacen.get(vtt.claveS3)!)).toBe(
      'WEBVTT\n\n1\n00:00:00.200 --> 00:00:01.400\nAntes de intervenir un equipo,\n\n2\n00:00:01.400 --> 00:00:02.800\nbloquea todas sus fuentes de energía.\n\n',
    );

    const doc = await documento();
    const pista = pantallas(doc).find((p) => p.id === 'p05')!.narracion!.porIdioma.es;
    expect(pista).toMatchObject({ estado: 'generado', voz: { proveedor: 'cliente' }, recursoAudioId: mp3.id, subtitulosId: vtt.id, grabacion: { materialId } });
    expect(pista.bocas!.length).toBeGreaterThan(2);
    expect(doc.recursos.find((x) => x.id === mp3.id)).toMatchObject({ tipo: 'audio', origen: 'subido', idioma: 'es', licencia: LICENCIA_GRABACION });
    expect(esCursoValido(doc)).toBe(true);
  });

  it('regenerar la voz de la IA (también forzada, y en una generación) no pisa la grabación', async () => {
    const antes = await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p05', idioma: 'es' } });
    pedidosVoz = [];
    const cascada = crearCascada({ bd: prisma, ...etapas, esperaMs: 20 });
    expect(await cascada(trabajo({ trabajoId: cursoId, tarea: TAREA_CASCADA, pantallaId: 'p05' }))).toEqual({ estado: 'COMPLETADO' });
    // Toda la voz del curso, forzada: p05 no se pide a la voz de la IA.
    const ctx = { generacionId: '', organizacionId: e.ids.orgId, proyectoId, parametros: { regenerarVoz: { forzar: true, pantallaIds: ['p05', 'p06'] } }, anteriores: {}, bd: prisma, proveedor: 'x',
      ia: () => Promise.reject(new Error('no')), avance: async () => undefined, gastar: async () => undefined, comprobar: async () => undefined };
    await etapas.voz(ctx);
    await etapas.boca(ctx);
    await etapas.subtitulos(ctx);
    expect(pedidosVoz.some((p) => p.ssml.includes('bloquea todas sus fuentes'))).toBe(false);
    expect(pedidosVoz).toHaveLength(1);
    const despues = await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p05', idioma: 'es' } });
    expect(despues).toMatchObject({ origen: 'grabacion', estado: 'ACTUALIZADA', audioRecursoId: antes.audioRecursoId, subtituloRecursoId: antes.subtituloRecursoId });
    const doc = await documento();
    const pista = pantallas(doc).find((p) => p.id === 'p05')!.narracion!.porIdioma.es;
    expect(pista).toMatchObject({ estado: 'generado', voz: { proveedor: 'cliente' }, recursoAudioId: antes.audioRecursoId });
    expect(doc.recursos.some((x) => x.id === antes.audioRecursoId)).toBe(true);
    expect(esCursoValido(doc)).toBe(true);
  });

  it('REQ-024 · limpiar el ruido con ffmpeg deja un MP3 nuevo ligado al material, con la retención del original', async () => {
    await limpieza(trabajo({ trabajoId: materialId, tarea: TAREA_LIMPIAR }, 'media'));
    const original = await prisma.recurso.findUniqueOrThrow({ where: { id: originalId } });
    const marca = (original.metadatos as { limpieza: { estado: string; recursoId: string } }).limpieza;
    expect(marca.estado).toBe('listo');
    const limpio = await prisma.recurso.findUniqueOrThrow({ where: { id: marca.recursoId } });
    expect(limpio).toMatchObject({ tipo: 'AUDIO', origen: 'CLIENTE', mime: 'audio/mpeg', nombre: 'Grabacion_gerente-limpio.mp3', eliminarEn: original.eliminarEn });
    expect(limpio.metadatos).toMatchObject({ limpiezaDe: originalId });
    expect(Math.abs(limpio.duracionMs! - 3000)).toBeLessThan(150);
    // El original no se pisa.
    expect(almacen.get(original.claveS3)!.byteLength).toBe(wav(3).byteLength);

    // La versión limpia también sirve como narración (de otra pantalla).
    await elegir('p06', limpio.id, 'limpio');
    await grabacion(trabajo({ trabajoId: cursoId, tarea: TAREA_GRABACION, pantallaId: 'p06', grabacion: { materialId, recursoId: limpio.id, version: 'limpio', ...autorizacion } }));
    const pista = pantallas(await documento()).find((p) => p.id === 'p06')!.narracion!.porIdioma.es;
    expect(pista).toMatchObject({ estado: 'generado', hashTexto: hashGrabacion(TEXTO, limpio.id), grabacion: { version: 'limpio' } });
  });

  it('sin ffmpeg, la limpieza falla con un error claro y no guarda nada', async () => {
    const sinFfmpeg = crearLimpieza({ bd: prisma, leer, subir, audio: audioFfmpeg('/no/existe/ffmpeg') });
    const antes = await prisma.recurso.count({ where: { organizacionId: e.ids.orgId } });
    await expect(sinFfmpeg(trabajo({ trabajoId: materialId, tarea: TAREA_LIMPIAR }, 'media'))).rejects.toThrow(/ffmpeg no está instalado en el worker/);
    expect(await prisma.recurso.count({ where: { organizacionId: e.ids.orgId } })).toBe(antes);
    const original = await prisma.recurso.findUniqueOrThrow({ where: { id: originalId } });
    expect((original.metadatos as { limpieza: { estado: string; error: string } }).limpieza).toMatchObject({ estado: 'error', error: expect.stringMatching(/ffmpeg no está instalado/) });
  });

  it('un audio que no es del material o de otra organización no se usa; la narración queda en error', async () => {
    const otro = await prisma.recurso.findFirstOrThrow({ where: { organizacionId: e.ids.orgId, tipo: 'AUDIO', origen: 'GENERADO' } });
    await expect(grabacion(trabajo({ trabajoId: cursoId, tarea: TAREA_GRABACION, pantallaId: 'p07', grabacion: { materialId, recursoId: otro.id, version: 'original', ...autorizacion } })))
      .rejects.toThrow(/no es de este material/);
    expect((await prisma.narracion.findFirstOrThrow({ where: { cursoId, pantallaId: 'p07', idioma: 'es' } })).estado).toBe('ERROR');
    await expect(grabacion({ ...trabajo({ trabajoId: cursoId, tarea: TAREA_GRABACION, pantallaId: 'p05', grabacion: { materialId, recursoId: originalId, version: 'original', ...autorizacion } }), data: { trabajoId: cursoId, organizacionId: '00000000-0000-4000-8000-000000000000', tarea: TAREA_GRABACION, pantallaId: 'p05', grabacion: { materialId, recursoId: originalId, version: 'original', ...autorizacion } } }))
      .rejects.toThrow(/no existe en la organización/);
  });
});
