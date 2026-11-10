// HU-0702 · Etapa 7 «Boca del personaje»: cada narración lista recibe sus marcas [tiempoMs, boca] calculadas desde
// su audio (RN-07-2): Rhubarb en modo real, por letras en modo simulado (SUP-35). Las marcas no dependen del dibujo
// del personaje, así que se calculan aunque el kit no tenga uno. Es local y sin costo: no se registra como tarea de IA.
// Continuar no repite: una narración que ya tiene marcas para su audio actual se conserva.
import { type CalculadorBocas, type MarcaBoca, textoHablado } from '@aptio/ai';
import type { Prisma } from '@aptio/db';
import { validarCurso } from '@aptio/schema';
import type { BocaCurso } from '@aptio/schema/generacion';
import { aplicarPronunciacion, type TerminoPronunciacion } from '@aptio/schema/voz';
import type { ContextoEtapa, EjecutorEtapa } from '../generar.js';
import { EN_PARALELO, enParalelo } from './voz.js';

type AudioDoc = { recursoAudioId?: string; duracionMs?: number; bocas?: MarcaBoca[] };
type PantallaDoc = { id: string; narracion?: { texto: { es?: string }; porIdioma: { es?: AudioDoc } } };
type CursoDoc = { modulos: { capsulas: { pantallas: PantallaDoc[] }[] }[] };

export interface DependenciasBoca {
  calcular: CalculadorBocas;
  leer: (clave: string) => Promise<Uint8Array>;
}

const pantallasDe = (d: CursoDoc) => d.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));

export function textoBoca(listas: number, total: number, terminado: boolean, metodo: BocaCurso['metodo'] = 'simulado'): string {
  if (!terminado) return `${listas} de ${total} bocas listas`;
  return `${total} ${total === 1 ? 'narración' : 'narraciones'} con boca sincronizada · ${metodo === 'rhubarb' ? 'calculada desde el audio' : 'simulada por letras'}`;
}

export function crearEtapaBoca({ calcular, leer }: DependenciasBoca): EjecutorEtapa {
  return async (ctx: ContextoEtapa) => {
    const proyecto = await ctx.bd.proyecto.findFirstOrThrow({
      where: { id: ctx.proyectoId, organizacionId: ctx.organizacionId },
      select: { id: true, cliente: { select: { pronunciacion: { where: { idioma: 'es' } } } } },
    });
    const curso = await ctx.bd.curso.findUnique({ where: { proyectoId: proyecto.id } });
    if (!curso) throw new Error('Falta el curso: la etapa 4 (Pantallas con el kit) debe terminar antes');
    const diccionario: TerminoPronunciacion[] = proyecto.cliente.pronunciacion.map((t) => ({ idioma: 'es', escrito: t.escrito, pronunciado: t.pronunciado }));

    const narradas = pantallasDe(curso.documento as unknown as CursoDoc).filter((p) => p.narracion?.texto.es?.trim());
    const narraciones = new Map(
      // También las «Por regenerar» que siguen con su audio: la boca va con el audio que hay (HU-0703).
      (await ctx.bd.narracion.findMany({ where: { cursoId: curso.id, idioma: 'es', estado: { in: ['ACTUALIZADA', 'DESACTUALIZADA'] }, audioRecursoId: { not: null } } })).map((n) => [n.pantallaId, n]),
    );
    const faltan = narradas.filter((p) => !narraciones.has(p.id));
    if (faltan.length) {
      throw new Error(`Faltan ${faltan.length} narraciones con audio (${faltan.slice(0, 3).map((p) => p.id).join(', ')}): la etapa 6 (Voz en español) debe terminar antes`);
    }

    const listas = new Map<string, { audioRecursoId: string; bocas: MarcaBoca[] }>();
    let metodo: BocaCurso['metodo'] = 'simulado';
    const datos = (): BocaCurso => ({ total: narradas.length, listas: listas.size, cursoId: curso.id, metodo });
    let cola = ctx.avance(textoBoca(0, narradas.length, false), datos());
    const avisar = () => (cola = cola.then(() => ctx.avance(textoBoca(listas.size, narradas.length, false), datos())));

    await enParalelo(narradas, EN_PARALELO, async (p) => {
      const n = narraciones.get(p.id)!;
      const audioRecursoId = n.audioRecursoId!;
      if (Array.isArray(n.bocas) && n.bocas.length) {
        listas.set(p.id, { audioRecursoId, bocas: n.bocas as MarcaBoca[] });
        await avisar();
        return;
      }
      await ctx.comprobar();
      const r = await ctx.bd.recurso.findFirst({ where: { id: audioRecursoId, organizacionId: ctx.organizacionId }, select: { claveS3: true, mime: true, duracionMs: true } });
      if (!r?.duracionMs) throw new Error(`Falta el audio de la pantalla ${p.id}: continúa desde la etapa 6`);
      const texto = textoHablado(aplicarPronunciacion(p.narracion!.texto.es!.trim(), diccionario, 'es').ssml);
      const audio = await leer(r.claveS3);
      const resultado = await calcular({ audio, mime: r.mime, texto, duracionMs: r.duracionMs }).catch((e: unknown) => {
        throw new Error(`La boca de la pantalla ${p.id} no se pudo calcular: ${e instanceof Error ? e.message : String(e)}`);
      });
      if (resultado.metodo === 'rhubarb') metodo = 'rhubarb';
      await ctx.bd.narracion.update({ where: { id: n.id }, data: { bocas: resultado.bocas as unknown as Prisma.InputJsonValue } });
      listas.set(p.id, { audioRecursoId, bocas: resultado.bocas });
      await avisar();
    });
    await cola;

    // El curso recibe las marcas solo donde sigue el mismo audio; si alguien guardó mientras tanto, se vuelve a leer.
    for (let intento = 0; intento < 3; intento++) {
      const actual = await ctx.bd.curso.findUniqueOrThrow({ where: { id: curso.id } });
      const doc = structuredClone(actual.documento) as unknown as CursoDoc;
      for (const p of pantallasDe(doc)) {
        const l = listas.get(p.id);
        const es = p.narracion?.porIdioma.es;
        if (l && es?.recursoAudioId === l.audioRecursoId) es.bocas = l.bocas;
      }
      const v = validarCurso(doc);
      if (!v.valido) throw new Error(`El curso con las bocas no valida: ${v.errores.slice(0, 3).join('; ')}`);
      const guardado = await ctx.bd.$transaction(async (tx) => {
        const r = await tx.curso.updateMany({ where: { id: curso.id, version: actual.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version: actual.version + 1 } });
        if (!r.count) return false;
        await tx.cursoVersion.create({ data: { cursoId: curso.id, version: actual.version + 1, documento: doc as unknown as Prisma.InputJsonValue, motivo: 'boca' } });
        return true;
      });
      if (guardado) break;
      if (intento === 2) throw new Error('El curso cambió muchas veces mientras se guardaban las bocas; continúa la generación para reintentar');
    }

    return { texto: textoBoca(listas.size, narradas.length, true, metodo), datos: datos() };
  };
}
