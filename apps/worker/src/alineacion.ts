// HU-1002 · Corregir la alineación con IA (IA-17 v2, CP-084, RN-10-3): con las alertas vigentes del informe (calculado
// sin IA), la IA propone preguntas o pantallas nuevas y se guarda como `Propuesta` de tipo `alineacion` del curso entero
// (sin pantalla), con la versión base. El curso no cambia hasta que alguien la aplica. Cola ia, tarea IA-17; el trabajo
// es el TrabajoIA que creó la API. La salida se valida con Ajv y con `erroresCorreccion` (rutas permitidas, curso
// válido y 0 alertas en los objetivos tratados); si no, se reintenta con los errores (3 intentos en total).
import { neutralizar, type ProveedorTexto } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import { erroresCurso } from '@aptio/schema';
import { type CorreccionAlineacion, elementosAlineacion, erroresCorreccion, informeAlineacion, TAREA_CORRECCION } from '@aptio/schema/alineacion';
import type { CursoDoc } from '@aptio/schema/revision';
import type { Redis } from 'ioredis';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export const VERSION_PROMPT = 'v2';
export const TIPO_ALINEACION = 'alineacion';

type Pregunta = { id: string; objetivoId?: string; nivelBloom?: string; enunciado?: { es?: string } };

/** Lo que IA-17 lee de cada pantalla que cuenta: su ruta en el curso, su rol y nivel, y sus preguntas con su ruta. */
export function pantallasParaPrompt(doc: CursoDoc) {
  const elementos = elementosAlineacion(doc);
  const salida: unknown[] = [];
  doc.modulos.forEach((m, mi) => m.capsulas.forEach((c, ci) => c.pantallas.forEach((p, pi) => {
    const mios = elementos.filter((x) => x.pantallaId === p.id);
    if (!mios.length) return;
    const ruta = `/modulos/${mi}/capsulas/${ci}/pantallas/${pi}`;
    const preguntas = p.bloques.flatMap((b, bi) => ((b.interaccion as { datos?: { preguntas?: Pregunta[] } } | undefined)?.datos?.preguntas ?? []).map((q, qi) => ({
      id: q.id, ruta: `${ruta}/bloques/${bi}/interaccion/datos/preguntas/${qi}`, enunciado: q.enunciado?.es ?? '',
      objetivoId: q.objetivoId ?? null, nivelBloom: mios.find((x) => x.preguntaId === q.id)?.nivelBloom ?? q.nivelBloom ?? null,
    })));
    salida.push({
      id: p.id, numero: mios[0]!.numero, ruta, titulo: mios[0]!.titulo, tipo: p.tipo, disposicion: p.disposicion ?? null,
      rol: mios[0]!.rol, nivelBloom: mios[0]!.preguntaId ? null : mios[0]!.nivelBloom, objetivoIds: p.objetivoIds ?? [],
      ...(preguntas.length ? { preguntas } : {}),
    });
  })));
  return salida;
}

export function crearCorrecciones({ bd, redis, proveedor }: { bd: PrismaClient; redis: Redis; proveedor: ProveedorTexto }) {
  return async function corregir(trabajo: TrabajoEnCola): Promise<{ propuestaId: string }> {
    const { trabajoId, organizacionId, tarea, propuesta: pedido } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId, organizacionId, cola: 'ia', tarea, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });
    try {
      if (!pedido) throw new Error('El trabajo no trae el pedido de la corrección');
      // El curso se busca con la organización del trabajo: nunca se corrige el de otra.
      const curso = await bd.curso.findFirst({
        where: { id: pedido.cursoId, organizacionId },
        include: { proyecto: { include: { cliente: { include: { kit: { include: { pantallasModelo: { where: { activa: true } } } } } } } } },
      });
      if (!curso) throw new Error(`El curso ${pedido.cursoId} no existe en la organización`);
      const doc = curso.documento as unknown as CursoDoc;
      const informe = informeAlineacion(doc);
      const conAlertas = informe.objetivos.filter((o) => o.alertas.length);
      if (!conAlertas.length) throw new Error('El curso no tiene alertas de alineación que corregir');
      await emitir('EN_CURSO', 10);
      const disposiciones = [...new Set((curso.proyecto.cliente.kit?.pantallasModelo ?? []).map((m) => m.disposicion))];
      const r = await tareaRegistrada<CorreccionAlineacion>(
        bd, { organizacionId, proyectoId: curso.proyectoId, trabajoId }, proveedor, TAREA_CORRECCION,
        {
          versionBase: curso.version,
          objetivos: informe.objetivos.map((o) => ({ id: o.id, texto: o.texto, nivelBloom: o.nivelBloom })),
          alertas: conAlertas.map((o) => ({ objetivoId: o.id, nivelBloom: o.nivelBloom, alertas: o.alertas })),
          // Los textos de las pantallas salen del documento del cliente: van neutralizados dentro de <material_cliente>.
          pantallas: neutralizar(JSON.stringify(pantallasParaPrompt(doc), null, 2)),
          disposiciones: disposiciones.join(', ') || 'las que ya usa el curso',
        },
        { version: VERSION_PROMPT, validarExtra: (d) => erroresCorreccion(doc, d as CorreccionAlineacion, erroresCurso) },
      );
      await emitir('EN_CURSO', 90);
      const n = informe.totalAlertas;
      const p = await bd.propuesta.create({
        data: {
          cursoId: curso.id, pantallaId: null, tipo: TIPO_ALINEACION, titulo: `Corregir ${n === 1 ? '1 alerta' : `${n} alertas`} de alineación`,
          descripcion: r.datos.resumen,
          cambios: { patch: r.datos.patch, correcciones: r.datos.cambios, huella: null } as unknown as Prisma.InputJsonValue,
          versionBase: curso.version, trabajoIAId: trabajoId,
        },
      });
      await trabajo.updateProgress(100);
      await emitir('COMPLETADO', 100);
      return { propuestaId: p.id };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      // tareaRegistrada ya guardó el error de la IA; esto cubre lo que falla antes (curso inexistente o sin alertas).
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId, estado: { not: 'ERROR' } }, data: { estado: 'ERROR', error: mensaje } });
      await emitir('ERROR', 0, mensaje);
      throw e;
    }
  };
}
