// HU-0801 · Etapa 8 «Subtítulos»: cada narración con audio recibe su archivo WebVTT, con los tiempos repartidos por
// letras sobre la duración del audio (SUP-37). Se guarda como recurso SUBTITULO, se enlaza a la narración y al curso, y
// la narración queda «generado» en el curso cuando ya tiene audio, boca y subtítulos (cierra SUP-35). Es local y sin
// costo: no se registra como tarea de IA. Continuar no repite: lo que ya tiene subtítulos para su audio se conserva
// (la etapa 6 los quita cuando hay un audio nuevo). Por ahora, español; el inglés llega con su etapa (S7).
import { createHash, randomUUID } from 'node:crypto';
import { aVtt, subtitulosDeNarracion } from '@aptio/ai';
import type { Prisma } from '@aptio/db';
import { conProcedencia, PROCEDENCIA_SUBTITULOS } from '../procedencia.js';
import { validarCurso } from '@aptio/schema';
import type { SubtitulosCurso } from '@aptio/schema/generacion';
import type { ContextoEtapa, EjecutorEtapa } from '../generar.js';
import { EN_PARALELO, enParalelo } from './voz.js';

type AudioDoc = { estado: string; recursoAudioId?: string; duracionMs?: number; bocas?: unknown[]; subtitulosId?: string };
type PantallaDoc = { id: string; narracion?: { texto: { es?: string }; porIdioma: { es?: AudioDoc } } };
type RecursoDoc = { id: string; tipo: string; idioma?: string };
type CursoDoc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[]; recursos: RecursoDoc[] };

export const MIME_VTT = 'text/vtt';

export interface DependenciasSubtitulos {
  subir: (clave: string, cuerpo: Uint8Array, mime: string) => Promise<void>;
}

const pantallasDe = (d: CursoDoc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

export function textoSubtitulos(listas: number, total: number, terminado: boolean): string {
  if (!terminado) return `${listas} de ${total} subtítulos listos`;
  return `${total} ${total === 1 ? 'narración' : 'narraciones'} con subtítulos sincronizados · WebVTT en español`;
}

export function crearEtapaSubtitulos({ subir }: DependenciasSubtitulos): EjecutorEtapa {
  return async (ctx: ContextoEtapa) => {
    const proyecto = await ctx.bd.proyecto.findFirstOrThrow({ where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId }, select: { id: true, clienteId: true } });
    const curso = await ctx.bd.curso.findUnique({ where: { proyectoId: proyecto.id } });
    if (!curso) throw new Error('Falta el curso: la etapa 4 (Pantallas con el kit) debe terminar antes');

    const narradas = pantallasDe(curso.documento as unknown as CursoDoc).filter((p) => p.narracion?.texto.es?.trim());
    const narraciones = new Map(
      (await ctx.bd.narracion.findMany({ where: { cursoId: curso.id, idioma: 'es', estado: { in: ['ACTUALIZADA', 'DESACTUALIZADA'] }, audioRecursoId: { not: null } } })).map((n) => [n.pantallaId, n]),
    );
    const faltan = narradas.filter((p) => !narraciones.has(p.id));
    if (faltan.length) {
      throw new Error(`Faltan ${faltan.length} narraciones con audio (${faltan.slice(0, 3).map((p) => p.id).join(', ')}): la etapa 6 (Voz en español) debe terminar antes`);
    }

    const listas = new Map<string, { audioRecursoId: string; subtitulosId: string; pantallaId: string; bytes: number }>();
    const datos = (): SubtitulosCurso => ({ total: narradas.length, listas: listas.size, cursoId: curso.id, idioma: 'es' });
    let cola = ctx.avance(textoSubtitulos(0, narradas.length, false), datos());
    const avisar = () => (cola = cola.then(() => ctx.avance(textoSubtitulos(listas.size, narradas.length, false), datos())));

    await enParalelo(narradas, EN_PARALELO, async (p) => {
      const n = narraciones.get(p.id)!;
      const audioRecursoId = n.audioRecursoId!;
      if (n.subtituloRecursoId) {
        const previo = await ctx.bd.recurso.findFirst({ where: { id: n.subtituloRecursoId, organizacionId: ctx.organizacionId }, select: { bytes: true } });
        if (previo) {
          listas.set(p.id, { audioRecursoId, subtitulosId: n.subtituloRecursoId, pantallaId: p.id, bytes: Number(previo.bytes) });
          await avisar();
          return;
        }
      }
      await ctx.comprobar();
      const audio = await ctx.bd.recurso.findFirst({ where: { id: audioRecursoId, organizacionId: ctx.organizacionId }, select: { duracionMs: true } });
      if (!audio?.duracionMs) throw new Error(`Falta el audio de la pantalla ${p.id}: continúa desde la etapa 6`);
      const cues = subtitulosDeNarracion(p.narracion!.texto.es!, audio.duracionMs);
      if (!cues.length) throw new Error(`La narración de la pantalla ${p.id} no dio subtítulos`);
      const cuerpo = new TextEncoder().encode(aVtt(cues));

      const recursoId = randomUUID();
      const claveS3 = `org/${ctx.organizacionId}/${proyecto.clienteId}/${recursoId}`;
      await subir(claveS3, cuerpo, MIME_VTT);
      await ctx.bd.$transaction([
        ctx.bd.recurso.create({
          data: conProcedencia({
            id: recursoId, organizacionId: ctx.organizacionId, clienteId: proyecto.clienteId, proyectoId: proyecto.id, tipo: 'SUBTITULO', origen: 'GENERADO',
            claveS3, mime: MIME_VTT, bytes: BigInt(cuerpo.byteLength), hash: createHash('sha256').update(cuerpo).digest('hex'),
            nombre: `${p.id}-es.vtt`, ...PROCEDENCIA_SUBTITULOS,
          }),
        }),
        ctx.bd.narracion.update({ where: { id: n.id }, data: { subtituloRecursoId: recursoId } }),
      ]);
      listas.set(p.id, { audioRecursoId, subtitulosId: recursoId, pantallaId: p.id, bytes: cuerpo.byteLength });
      await avisar();
    });
    await cola;

    // El curso recibe los subtítulos solo donde sigue el mismo audio; si alguien guardó mientras tanto, se vuelve a leer.
    for (let intento = 0; intento < 3; intento++) {
      const actual = await ctx.bd.curso.findUniqueOrThrow({ where: { id: curso.id } });
      const doc = structuredClone(actual.documento) as unknown as CursoDoc;
      const usados = new Set<string>();
      for (const p of pantallasDe(doc)) {
        const l = listas.get(p.id);
        const es = p.narracion?.porIdioma.es;
        if (!l || !es || es.recursoAudioId !== l.audioRecursoId) continue;
        es.subtitulosId = l.subtitulosId;
        usados.add(l.subtitulosId);
        // Audio, boca y subtítulos: la narración queda generada (el esquema exige los tres).
        if (es.duracionMs && Array.isArray(es.bocas) && es.bocas.length) es.estado = 'generado';
      }
      doc.recursos = [
        ...doc.recursos.filter((r) => !(r.tipo === 'subtitulos' && r.idioma === 'es')),
        ...[...listas.values()].filter((l) => usados.has(l.subtitulosId)).map((l) => ({
          id: l.subtitulosId, tipo: 'subtitulos', origen: 'generado', nombre: `${l.pantallaId}-es.vtt`, mime: MIME_VTT, idioma: 'es', bytes: l.bytes,
        })),
      ];
      const v = validarCurso(doc);
      if (!v.valido) throw new Error(`El curso con los subtítulos no valida: ${v.errores.slice(0, 3).join('; ')}`);
      const guardado = await ctx.bd.$transaction(async (tx) => {
        const r = await tx.curso.updateMany({ where: { id: curso.id, version: actual.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version: actual.version + 1 } });
        if (!r.count) return false;
        await tx.cursoVersion.create({ data: { cursoId: curso.id, version: actual.version + 1, documento: doc as unknown as Prisma.InputJsonValue, motivo: 'subtitulos' } });
        return true;
      });
      if (guardado) break;
      if (intento === 2) throw new Error('El curso cambió muchas veces mientras se guardaban los subtítulos; continúa la generación para reintentar');
    }

    return { texto: textoSubtitulos(listas.size, narradas.length, true), datos: datos() };
  };
}
