// HU-0701 · Etapa 6 «Voz en español»: cada pantalla con narración se dice con la voz del kit y el diccionario de
// pronunciación del cliente. El audio se guarda cifrado en el almacenamiento con su duración real y la narración
// queda «Lista» (CP-071). Hasta 4 a la vez y cada una lista se ve en Producción sin esperar al resto.
// Continuar no paga otra vez: una narración ya lista con el mismo hash (texto, voz, velocidad y diccionario) se reusa.
// HU-0703 · Regenerar (`parametros.regenerarVoz`) decide por el hash (RN-07-1): una marcada «Por regenerar» que en
// realidad no cambió vuelve a «Lista» sin costo; `pantallaIds` limita a esas pantallas y `forzar` pide una toma nueva.
// HU-0608 · Con un audio nuevo, cada elemento anclado a una palabra toma el segundo de esa palabra en la voz nueva
// (RN-06-8, CP-067); si la voz no la tiene, conserva su segundo y queda la observación «Revisar tiempo».
// HU-0804 · Con `regenerarVoz.idioma: 'en'` dice el inglés de cada pantalla narrada que ya lo tiene, con `kit.voces.en`
// o, sin ella, `en-US-Neural2-F` a la velocidad del español, y el diccionario del cliente en inglés. Guarda
// `porIdioma.en`, la Narracion en inglés y `pNN-en.mp3`; el español no se toca. Las anclas siguen la voz en español.
import { createHash, randomUUID } from 'node:crypto';
import { type AudioVoz, costoVoz, duracionAudio, hashNarracion, type Sintetizador, VozNoDisponible } from '@aptio/ai';
import { Prisma } from '@aptio/db';
import { validarCurso } from '@aptio/schema';
import { duracionLegible, type NarracionLista, type VozCurso } from '@aptio/schema/generacion';
import { marcasPalabra, mensajeRevisarTiempo, ORIGEN_REVISAR_TIEMPO, recalcularAnclas } from '@aptio/schema/tiempos';
import { aplicarPronunciacion, type TerminoPronunciacion } from '@aptio/schema/voz';
import { conProcedencia } from '../procedencia.js';
import { type ContextoEtapa, type EjecutorEtapa, GeneracionCancelada } from '../generar.js';

/** Narraciones que se sintetizan a la vez. */
export const EN_PARALELO = 4;
/** Intentos por narración antes de dejar la etapa en error (los audios ya listos se conservan). */
export const INTENTOS_VOZ = 3;
/** Proveedores de voz con ejecutor hoy (decisión 8: Google por defecto; Azure y ElevenLabs después). */
const PROVEEDORES = ['google'];

type VozDoc = { proveedor: string; voz: string; velocidad?: number };
type AudioDoc = { estado: string; voz: VozDoc; hashTexto: string; recursoAudioId?: string; duracionMs?: number; bocas?: unknown; subtitulosId?: string };
type PantallaDoc = {
  id: string; titulo: { es?: string; en?: string }; narracion?: { texto: { es?: string; en?: string }; porIdioma: { es?: AudioDoc; en?: AudioDoc } };
  ajustes?: Record<string, { retardoS?: number; anclaPalabra?: number }>;
};
type RecursoDoc = { id: string; tipo: string; idioma?: string };
type CursoDoc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[]; recursos: RecursoDoc[] };

/** Lo que pide `POST /cursos/{id}/narraciones/regenerar` (se guarda en los parámetros de la generación). */
export interface RegenerarVoz {
  pantallaIds?: string[];
  forzar?: boolean;
  /** HU-0804 · Idioma de la voz, la boca y los subtítulos; por defecto, español. */
  idioma?: IdiomaVoz;
}

export type IdiomaVoz = 'es' | 'en';
/** HU-0804 · Voz en inglés cuando el kit no tiene una (Google, GA). */
export const VOZ_INGLES_PREDETERMINADA = 'en-US-Neural2-F';
/** El idioma que pide la regeneración (español si no pide ninguno). */
export const idiomaDe = (ctx: Pick<ContextoEtapa, 'parametros'>): IdiomaVoz => ((ctx.parametros.regenerarVoz as RegenerarVoz | undefined)?.idioma === 'en' ? 'en' : 'es');
export const NOMBRE_IDIOMA: Record<IdiomaVoz, string> = { es: 'español', en: 'inglés' };

export interface DependenciasVoz {
  sintetizar: Sintetizador;
  subir: (clave: string, cuerpo: Uint8Array, mime: string) => Promise<void>;
  /** Espera entre intentos (en las pruebas, 0). */
  esperaMs?: number;
}

const pantallasDe = (d: CursoDoc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
const extension = (mime: string) => (mime === 'audio/mpeg' ? 'mp3' : 'wav');

export async function enParalelo<T>(lista: T[], n: number, trabajo: (x: T) => Promise<void>): Promise<void> {
  let siguiente = 0;
  const hilo = async () => {
    while (siguiente < lista.length) await trabajo(lista[siguiente++]!);
  };
  await Promise.all(Array.from({ length: Math.min(n, lista.length) }, hilo));
}

export function textoVoz(listas: number, total: number, terminado: boolean, duracionMs = 0, voz = '', idioma: IdiomaVoz = 'es'): string {
  const en = idioma === 'en' ? ' en inglés' : '';
  if (!terminado) return `${listas} de ${total} narraciones${en} listas`;
  return `${total} ${total === 1 ? 'narración' : 'narraciones'}${en} ${total === 1 ? 'lista' : 'listas'} · ${duracionLegible(duracionMs)} de audio${voz ? ` · voz ${voz}` : ''}`;
}

export function crearEtapaVoz({ sintetizar, subir, esperaMs = 1000 }: DependenciasVoz): EjecutorEtapa {
  return async (ctx: ContextoEtapa) => {
    const idioma = idiomaDe(ctx);
    const proyecto = await ctx.bd.proyecto.findFirstOrThrow({
      where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId },
      select: { id: true, clienteId: true, cliente: { select: { pronunciacion: { where: { idioma } }, kit: { select: { voces: true } } } } },
    });
    const curso = await ctx.bd.curso.findUnique({ where: { proyectoId: proyecto.id } });
    if (!curso) throw new Error('Falta el curso: la etapa 4 (Pantallas con el kit) debe terminar antes');
    const diccionario: TerminoPronunciacion[] = proyecto.cliente.pronunciacion.map((t) => ({ idioma, escrito: t.escrito, pronunciado: t.pronunciado }));
    const vozKit = (proyecto.cliente.kit?.voces as Partial<Record<IdiomaVoz, VozDoc>> | null | undefined)?.en;

    // En inglés: solo las pantallas narradas que ya tienen su inglés (las demás se listan en Idiomas).
    const conNarracion = pantallasDe(curso.documento as unknown as CursoDoc).filter((p) => p.narracion?.texto[idioma]?.trim() && p.narracion.porIdioma.es);
    /** La voz de la pantalla: la del curso o, en inglés sin voz todavía, la del kit o la predeterminada a la velocidad del español. */
    const vozDe = (p: PantallaDoc): VozDoc => {
      const propia = p.narracion!.porIdioma[idioma]?.voz;
      if (propia) return propia;
      const es = p.narracion!.porIdioma.es!.voz;
      return vozKit?.voz ? { proveedor: vozKit.proveedor ?? 'google', voz: vozKit.voz, velocidad: vozKit.velocidad ?? es.velocidad ?? 1 } : { proveedor: 'google', voz: VOZ_INGLES_PREDETERMINADA, velocidad: es.velocidad ?? 1 };
    };
    const previas = new Map(
      (await ctx.bd.narracion.findMany({ where: { cursoId: curso.id, idioma, estado: { in: ['ACTUALIZADA', 'DESACTUALIZADA'] }, audioRecursoId: { not: null } } })).map((n) => [n.pantallaId, n]),
    );
    const pedido = (ctx.parametros.regenerarVoz ?? {}) as RegenerarVoz;
    const solo = pedido.pantallaIds?.length ? new Set(pedido.pantallaIds) : null;

    const listas = new Map<string, NarracionLista & { recursoId: string; hash: string; mime: string; velocidad: number; proveedor: string }>();
    let simulada = false;
    const datos = (): VozCurso => ({
      total: conNarracion.length, cursoId: curso.id, simulada,
      narraciones: conNarracion.flatMap((p) => {
        const n = listas.get(p.id);
        return n ? [{ pantallaId: n.pantallaId, titulo: n.titulo, texto: n.texto, duracionMs: n.duracionMs, voz: n.voz, pronunciados: n.pronunciados }] : [];
      }),
    });
    // Los avances se encadenan para que no se pisen entre hilos.
    let cola = ctx.avance(textoVoz(0, conNarracion.length, false, 0, '', idioma), datos());
    const avisar = () => (cola = cola.then(() => ctx.avance(textoVoz(listas.size, conNarracion.length, false, 0, '', idioma), datos())));

    await enParalelo(conNarracion, EN_PARALELO, async (p) => {
      const texto = p.narracion!.texto[idioma]!.trim();
      const voz = vozDe(p);
      const velocidad = voz.velocidad ?? 1;
      const { ssml, aplicados } = aplicarPronunciacion(texto, diccionario, idioma);
      const usados = diccionario.filter((t) => aplicados.includes(t.escrito.trim()));
      const hash = hashNarracion(texto, voz.voz, velocidad, usados);
      const base = { pantallaId: p.id, titulo: p.titulo[idioma] ?? p.titulo.es ?? p.id, texto, voz: voz.voz, velocidad, proveedor: voz.proveedor, pronunciados: aplicados, hash };

      // Continuar: lo que ya se dijo igual no se paga otra vez. Fuera de las pantallas pedidas, el audio queda como está.
      const previa = previas.get(p.id);
      const fuera = solo !== null && !solo.has(p.id);
      const forzada = !fuera && solo !== null && pedido.forzar === true;
      if (previa?.audioRecursoId && (fuera || (previa.textoHash === hash && !forzada))) {
        const r = await ctx.bd.recurso.findUnique({ where: { id: previa.audioRecursoId }, select: { duracionMs: true, proveedor: true, mime: true } });
        if (r?.duracionMs) {
          if (r.proveedor === 'simulado') simulada = true;
          // Marcada «Por regenerar» sin que cambiara nada de lo que se dice: vuelve a «Lista» sin pagar (RN-07-1).
          if (!fuera && previa.estado === 'DESACTUALIZADA') await ctx.bd.narracion.update({ where: { id: previa.id }, data: { estado: 'ACTUALIZADA' } });
          listas.set(p.id, { ...base, ...(fuera ? { hash: previa.textoHash } : {}), duracionMs: r.duracionMs, recursoId: previa.audioRecursoId, mime: r.mime });
          await avisar();
          return;
        }
      }
      if (fuera) return;
      if (!PROVEEDORES.includes(voz.proveedor)) {
        throw new Error(`La voz de ${voz.proveedor} todavía no está disponible: elige una voz de Google en el kit`);
      }

      let audio: AudioVoz | undefined;
      let ultimoError = '';
      for (let intento = 1; intento <= INTENTOS_VOZ && !audio; intento++) {
        await ctx.comprobar();
        const inicio = Date.now();
        try {
          audio = await sintetizar({ ssml, idioma, voz: voz.voz, velocidad });
          const costo = costoVoz(audio.caracteres, audio.modelo, audio.proveedor);
          await ctx.bd.trabajoIA.create({
            data: {
              organizacionId: ctx.organizacionId, proyectoId: proyecto.id, generacionId: ctx.generacionId || null, tarea: 'VOZ', tipo: 'VOZ',
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
          where: { cursoId_pantallaId_idioma: { cursoId: curso.id, pantallaId: p.id, idioma } },
          create: { cursoId: curso.id, pantallaId: p.id, idioma, textoHash: hash, origen: 'tts', voz: voz.voz, velocidad, estado: 'ERROR' },
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
          data: conProcedencia({
            id: recursoId, organizacionId: ctx.organizacionId, clienteId: proyecto.clienteId, proyectoId: proyecto.id, tipo: 'AUDIO', origen: 'GENERADO',
            claveS3, mime: audio.mime, bytes: BigInt(audio.audio.byteLength), duracionMs, hash: createHash('sha256').update(audio.audio).digest('hex'),
            nombre: `${p.id}-${idioma}.${extension(audio.mime)}`, proveedor: audio.proveedor, modelo: audio.modelo,
            licencia: audio.simulada ? 'Audio simulado de prueba' : 'Google Cloud Text-to-Speech · uso comercial (servicio de pago)',
          }),
        }),
        ctx.bd.narracion.upsert({
          where: { cursoId_pantallaId_idioma: { cursoId: curso.id, pantallaId: p.id, idioma } },
          create: { cursoId: curso.id, pantallaId: p.id, idioma, textoHash: hash, origen: 'tts', voz: voz.voz, velocidad, audioRecursoId: recursoId, estado: 'ACTUALIZADA' },
          // Un audio nuevo deja sin boca ni subtítulos a la narración: las etapas 7 y 8 los rehacen (HU-0702, HU-0801).
          update: { textoHash: hash, origen: 'tts', voz: voz.voz, velocidad, audioRecursoId: recursoId, bocas: Prisma.DbNull, subtituloRecursoId: null, estado: 'ACTUALIZADA' },
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
      const sinAncla: { pantallaId: string; id: string }[] = [];
      for (const p of pantallasDe(doc)) {
        const n = listas.get(p.id);
        if (!n || !p.narracion?.porIdioma.es || p.narracion.texto[idioma]?.trim() !== n.texto) continue;
        // En inglés, la primera voz crea su pista en el curso.
        const es = (p.narracion.porIdioma[idioma] ??= { estado: 'pendiente', voz: { proveedor: n.proveedor, voz: n.voz, velocidad: n.velocidad }, hashTexto: n.hash });
        // Con otro audio, la boca y los subtítulos anteriores ya no sirven (los rehacen las etapas 7 y 8) y la narración
        // vuelve a «pendiente»: el esquema exige audio, boca y subtítulos para «generado».
        if (es.recursoAudioId !== n.recursoId) {
          delete es.bocas;
          delete es.subtitulosId;
          es.estado = 'pendiente';
          // Los tiempos de la pantalla siguen la voz en español (HU-0608).
          if (idioma === 'es') for (const id of recalcularAnclas(p.ajustes, marcasPalabra(n.texto, n.duracionMs))) sinAncla.push({ pantallaId: p.id, id });
        }
        es.voz = { proveedor: n.proveedor, voz: n.voz, velocidad: n.velocidad };
        es.recursoAudioId = n.recursoId;
        es.duracionMs = n.duracionMs;
        es.hashTexto = n.hash;
        usados.add(n.recursoId);
      }
      const otros = doc.recursos.filter((r) => !(r.tipo === 'audio' && r.idioma === idioma));
      doc.recursos = [
        ...otros,
        ...[...listas.values()].filter((n) => usados.has(n.recursoId)).map((n) => ({
          id: n.recursoId, tipo: 'audio', origen: 'generado', nombre: `${n.pantallaId}-${idioma}.${extension(n.mime)}`, mime: n.mime, idioma,
        })),
      ];
      const v = validarCurso(doc);
      if (!v.valido) throw new Error(`El curso con la voz no valida: ${v.errores.slice(0, 3).join('; ')}`);
      const guardado = await ctx.bd.$transaction(async (tx) => {
        const r = await tx.curso.updateMany({ where: { id: curso.id, version: actual.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version: actual.version + 1 } });
        if (!r.count) return false;
        await tx.cursoVersion.create({ data: { cursoId: curso.id, version: actual.version + 1, documento: doc as unknown as Prisma.InputJsonValue, motivo: 'voz' } });
        if (sinAncla.length) {
          await tx.observacion.createMany({
            data: sinAncla.map((x) => ({ cursoId: curso.id, pantallaId: x.pantallaId, tipo: 'CALIDAD' as const, severidad: 'aviso', mensaje: mensajeRevisarTiempo(x.id), origen: ORIGEN_REVISAR_TIEMPO })),
          });
        }
        return true;
      });
      if (guardado) break;
      if (intento === 2) throw new Error('El curso cambió muchas veces mientras se guardaba la voz; continúa la generación para reintentar');
    }

    const total = [...listas.values()].reduce((n, x) => n + x.duracionMs, 0);
    const voces = [...new Set([...listas.values()].map((n) => n.voz))].join(', ');
    return { texto: textoVoz(listas.size, conNarracion.length, true, total, voces, idioma), datos: { ...datos(), ...(idioma === 'en' ? { idioma } : {}) } };
  };
}
