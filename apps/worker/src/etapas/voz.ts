// HU-0701 · Etapa 6 «Voz en español»: cada pantalla con narración se dice con la voz del kit y el diccionario de
// pronunciación del cliente. El audio se guarda cifrado en el almacenamiento con su duración real y la narración
// queda «Lista» (CP-071). Hasta 4 a la vez y cada una lista se ve en Producción sin esperar al resto.
// Continuar no paga otra vez: una narración ya lista con el mismo hash (texto, voz, velocidad y diccionario) se reusa.
import { createHash, randomUUID } from 'node:crypto';
import { type AudioVoz, costoVoz, duracionAudio, hashNarracion, type Sintetizador, VozNoDisponible } from '@aptio/ai';
import type { Prisma } from '@aptio/db';
import { validarCurso } from '@aptio/schema';
import { duracionLegible, type NarracionLista, type VozCurso } from '@aptio/schema/generacion';
import { aplicarPronunciacion, type TerminoPronunciacion } from '@aptio/schema/voz';
import { type ContextoEtapa, type EjecutorEtapa, GeneracionCancelada } from '../generar.js';

/** Narraciones que se sintetizan a la vez. */
export const EN_PARALELO = 4;
/** Intentos por narración antes de dejar la etapa en error (los audios ya listos se conservan). */
export const INTENTOS_VOZ = 3;
/** Proveedores de voz con ejecutor hoy (decisión 8: Google por defecto; Azure y ElevenLabs después). */
const PROVEEDORES = ['google'];

type VozDoc = { proveedor: string; voz: string; velocidad?: number };
type AudioDoc = { estado: string; voz: VozDoc; hashTexto: string; recursoAudioId?: string; duracionMs?: number };
type PantallaDoc = { id: string; titulo: { es?: string }; narracion?: { texto: { es?: string }; porIdioma: { es?: AudioDoc } } };
type RecursoDoc = { id: string; tipo: string; idioma?: string };
type CursoDoc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[]; recursos: RecursoDoc[] };

export interface DependenciasVoz {
  sintetizar: Sintetizador;
  subir: (clave: string, cuerpo: Uint8Array, mime: string) => Promise<void>;
  /** Espera entre intentos (en las pruebas, 0). */
  esperaMs?: number;
}

const pantallasDe = (d: CursoDoc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
const extension = (mime: string) => (mime === 'audio/mpeg' ? 'mp3' : 'wav');

async function enParalelo<T>(lista: T[], n: number, trabajo: (x: T) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const hilo = async () => {
    while (siguiente < lista.length) await trabajo(lista[siguiente++]!);
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, hilo));
}

export function textoVoz(listas: number, total: number, terminado: boolean, duracionMs = 0, voz = ''): string {
  if (!terminado) return `${listas} de ${total} narraciones listas`;
  return `${total} ${total === 1 ? 'narración lista' : 'narraciones listas'} · ${duracionLegible(duracionMs)} de audio${voz ? ` · voz ${voz}` : ''}`;
}

export function crearEtapaVoz({ sintetizar, subir, esperaMs = 1000 }: DependenciasVoz): EjecutorEtapa {
  return async (ctx: ContextoEtapa) => {
    const proyecto = await ctx.bd.proyecto.findFirstOrThrow({
      where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId },
      select: { id: true, clienteId: true, cliente: { select: { pronunciacion: { where: { idioma: 'es' } } } } },
    });
    const curso = await ctx.bd.curso.findUnique({ where: { proyectoId: proyecto.id } });
    if (!curso) throw new Error('Falta el curso: la etapa 4 (Pantallas con el kit) debe terminar antes');
    const diccionario: TerminoPronunciacion[] = proyecto.cliente.pronunciacion.map((t) => ({ idioma: 'es', escrito: t.escrito, pronunciado: t.pronunciado }));

    const conNarracion = pantallasDe(curso.documento as unknown as CursoDoc).filter((p) => p.narracion?.texto.es?.trim() && p.narracion.porIdioma.es);
    const previas = new Map(
      (await ctx.bd.narracion.findMany({ where: { cursoId: curso.id, idioma: 'es', estado: 'ACTUALIZADA', audioRecursoId: { not: null } } })).map((n) => [n.pantallaId, n]),
    );

    const listas = new Map<string, NarracionLista & { recursoId: string; hash: string; mime: string }>();
    let simulada = false;
    const datos = (): VozCurso => ({
      total: conNarracion.length, cursoId: curso.id, simulada,
      narraciones: conNarracion.flatMap((p) => {
        const n = listas.get(p.id);
        return n ? [{ pantallaId: n.pantallaId, titulo: n.titulo, texto: n.texto, duracionMs: n.duracionMs, voz: n.voz, pronunciados: n.pronunciados }] : [];
      }),
    });
    // Los avances se encadenan para que no se pisen entre hilos.
    let cola = ctx.avance(textoVoz(0, conNarracion.length, false), datos());
    const avisar = () => (cola = cola.then(() => ctx.avance(textoVoz(listas.size, conNarracion.length, false), datos())));

    await enParalelo(conNarracion, EN_PARALELO, async (p) => {
      const texto = p.narracion!.texto.es!.trim();
      const audioDoc = p.narracion!.porIdioma.es!;
      const voz = audioDoc.voz;
      const velocidad = voz.velocidad ?? 1;
      const { ssml, aplicados } = aplicarPronunciacion(texto, diccionario, 'es');
      const usados = diccionario.filter((t) => aplicados.includes(t.escrito.trim()));
      const hash = hashNarracion(texto, voz.voz, velocidad, usados);
      const base = { pantallaId: p.id, titulo: p.titulo.es ?? p.id, texto, voz: voz.voz, pronunciados: aplicados, hash };

      // Continuar: lo que ya se dijo igual no se paga otra vez.
      const previa = previas.get(p.id);
      if (previa?.textoHash === hash && previa.audioRecursoId) {
        const r = await ctx.bd.recurso.findUnique({ where: { id: previa.audioRecursoId }, select: { duracionMs: true, proveedor: true, mime: true } });
        if (r?.duracionMs) {
          if (r.proveedor === 'simulado') simulada = true;
          listas.set(p.id, { ...base, duracionMs: r.duracionMs, recursoId: previa.audioRecursoId, mime: r.mime });
          await avisar();
          return;
        }
      }
      if (!PROVEEDORES.includes(voz.proveedor)) {
        throw new Error(`La voz de ${voz.proveedor} todavía no está disponible: elige una voz de Google en el kit`);
      }

      let audio: AudioVoz | undefined;
      let ultimoError = '';
      for (let intento = 1; intento <= INTENTOS_VOZ && !audio; intento++) {
        await ctx.comprobar();
        const inicio = Date.now();
        try {
          audio = await sintetizar({ ssml, idioma: 'es', voz: voz.voz, velocidad });
          const costo = costoVoz(audio.caracteres, audio.modelo, audio.proveedor);
          await ctx.bd.trabajoIA.create({
            data: {
              organizacionId: ctx.organizacionId, proyectoId: proyecto.id, generacionId: ctx.generacionId, tarea: 'VOZ', tipo: 'VOZ',
              proveedor: audio.proveedor, modelo: audio.modelo, caracteres: audio.caracteres, costoUsd: costo, estado: 'COMPLETADO',
              intentos: intento, duracionMs: Date.now() - inicio,
            },
          });
          await ctx.gastar(costo);
        } catch (err) {
          if (err instanceof GeneracionCancelada) throw err;
          ultimoError = err instanceof Error ? err.message : String(err);
          if (!(err instanceof VozNoDisponible)) throw err;
          if (intento < INTENTOS_VOZ && esperaMs) await new Promise((r) => setTimeout(r, esperaMs * intento));
        }
      }
      if (!audio) {
        await ctx.bd.narracion.upsert({
          where: { cursoId_pantallaId_idioma: { cursoId: curso.id, pantallaId: p.id, idioma: 'es' } },
          create: { cursoId: curso.id, pantallaId: p.id, idioma: 'es', textoHash: hash, origen: 'tts', voz: voz.voz, velocidad, estado: 'ERROR' },
          update: { textoHash: hash, estado: 'ERROR' },
        });
        throw new Error(`La voz de la pantalla ${p.id} falló ${INTENTOS_VOZ} veces: ${ultimoError}`);
      }
      if (audio.simulada) simulada = true;
      const duracionMs = duracionAudio(audio.audio, audio.mime);
      if (!duracionMs) throw new Error(`El audio de la pantalla ${p.id} no tiene un formato reconocible (${audio.mime})`);

      const recursoId = randomUUID();
      const claveS3 = `org/${ctx.organizacionId}/${proyecto.clienteId}/${recursoId}`;
      await subir(claveS3, audio.audio, audio.mime);
      await ctx.bd.$transaction([
        ctx.bd.recurso.create({
          data: {
            id: recursoId, organizacionId: ctx.organizacionId, clienteId: proyecto.clienteId, proyectoId: proyecto.id, tipo: 'AUDIO', origen: 'GENERADO',
            claveS3, mime: audio.mime, bytes: BigInt(audio.audio.byteLength), duracionMs, hash: createHash('sha256').update(audio.audio).digest('hex'),
            nombre: `${p.id}-es.${extension(audio.mime)}`, proveedor: audio.proveedor, modelo: audio.modelo,
            licencia: audio.simulada ? 'Audio simulado de prueba' : 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)',
          },
        }),
        ctx.bd.narracion.upsert({
          where: { cursoId_pantallaId_idioma: { cursoId: curso.id, pantallaId: p.id, idioma: 'es' } },
          create: { cursoId: curso.id, pantallaId: p.id, idioma: 'es', textoHash: hash, origen: 'tts', voz: voz.voz, velocidad, audioRecursoId: recursoId, estado: 'ACTUALIZADA' },
          update: { textoHash: hash, origen: 'tts', voz: voz.voz, velocidad, audioRecursoId: recursoId, estado: 'ACTUALIZADA' },
        }),
      ]);
      listas.set(p.id, { ...base, duracionMs, recursoId, mime: audio.mime });
      await avisar();
    });
    await cola;

    // El documento del curso recibe cada audio. Si alguien guardó el curso mientras tanto, se vuelve a leer; una
    // pantalla cuyo texto cambió entretanto no recibe el audio viejo (queda por regenerar, HU-0703).
    for (let intento = 0; intento < 3; intento++) {
      const actual = await ctx.bd.curso.findUniqueOrThrow({ where: { id: curso.id } });
      const doc = structuredClone(actual.documento) as unknown as CursoDoc;
      const usados = new Set<string>();
      for (const p of pantallasDe(doc)) {
        const n = listas.get(p.id);
        const es = p.narracion?.porIdioma.es;
        if (!n || !es || p.narracion!.texto.es?.trim() !== n.texto) continue;
        es.recursoAudioId = n.recursoId;
        es.duracionMs = n.duracionMs;
        es.hashTexto = n.hash;
        // Queda «pendiente» hasta tener boca (HU-0702) y subtítulos (HU-0801): el esquema exige los tres para «generado».
        usados.add(n.recursoId);
      }
      const otros = doc.recursos.filter((r) => !(r.tipo === 'audio' && r.idioma === 'es'));
      doc.recursos = [
        ...otros,
        ...[...listas.values()].filter((n) => usados.has(n.recursoId)).map((n) => ({
          id: n.recursoId, tipo: 'audio', origen: 'generado', nombre: `${n.pantallaId}-es.${extension(n.mime)}`, mime: n.mime, idioma: 'es',
        })),
      ];
      const v = validarCurso(doc);
      if (!v.valido) throw new Error(`El curso con la voz no valida: ${v.errores.slice(0, 3).join('; ')}`);
      const guardado = await ctx.bd.$transaction(async (tx) => {
        const r = await tx.curso.updateMany({ where: { id: curso.id, version: actual.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version: actual.version + 1 } });
        if (!r.count) return false;
        await tx.cursoVersion.create({ data: { cursoId: curso.id, version: actual.version + 1, documento: doc as unknown as Prisma.InputJsonValue, motivo: 'voz' } });
        return true;
      });
      if (guardado) break;
      if (intento === 2) throw new Error('El curso cambió muchas veces mientras se guardaba la voz; continúa la generación para reintentar');
    }

    const total = [...listas.values()].reduce((n, x) => n + x.duracionMs, 0);
    const voces = [...new Set([...listas.values()].map((n) => n.voz))].join(', ');
    return { texto: textoVoz(listas.size, conNarracion.length, true, total, voces), datos: datos() };
  };
}
