// HU-0206 · Proponer el kit desde un curso anterior o un manual de marca (CP-028, IA-18 v2). El worker lee el ZIP o el
// PDF del cliente sin ejecutar nada (extraer/kit.ts), pasa las evidencias a IA-18 dentro de <material_cliente>, valida
// con Ajv y con el contraste WCAG (3 intentos en total) y guarda la propuesta en `TrabajoIA.resultado`. El kit del
// cliente no cambia: el equipo la aplica al formulario y guarda con «Guardar». Cola ia, tarea IA-18.
import { neutralizar, type ProveedorTexto, SalidaNoValida } from '@aptio/ai';
import { type EventoTrabajo, publicarEvento } from '@aptio/colas';
import type { Prisma, PrismaClient } from '@aptio/db';
import {
  erroresPropuestaKit, type EvidenciasKit, evidenciasComoTexto, fuenteParecida, prepararPropuestaKit, type PropuestaKit,
  type ResultadoKit, TAREA_KIT,
} from '@aptio/schema/extraccion-kit';
import { ESTILOS_KIT, FAMILIAS_KIT } from '@aptio/schema/marca';
import type { Redis } from 'ioredis';
import { evidenciasDeMaterial, MaterialKitNoValido } from './extraer/kit.js';
import { tareaRegistrada } from './ia.js';
import type { TrabajoEnCola } from './procesar.js';

export const VERSION_PROMPT = 'v2';

/** Por cada tipografía encontrada, la más parecida de la lista del kit (ayuda determinista para la IA). */
export function parecidasComoTexto(e: EvidenciasKit): string {
  if (!e.fuentes.length) return 'No se encontraron tipografías: propone las del kit que mejor vayan con el estilo.';
  return e.fuentes
    .map((f) => {
      const nombre = neutralizar(f.valor);
      return `- ${nombre}: títulos ${fuenteParecida(f.valor, 'titulos')}, textos ${fuenteParecida(f.valor, 'textos')}`;
    })
    .join('\n');
}

export function crearExtraccionKit({ bd, redis, leer, proveedor }: { bd: PrismaClient; redis: Redis; leer: (clave: string) => Promise<Uint8Array>; proveedor: ProveedorTexto }) {
  return async function extraerKit(trabajo: TrabajoEnCola): Promise<{ trabajoId: string }> {
    const { trabajoId, organizacionId, tarea, kit } = trabajo.data;
    const emitir = (estado: EventoTrabajo['estado'], progreso: number, mensaje?: string) =>
      publicarEvento(redis, { tipo: 'estado', trabajoId, organizacionId, cola: 'ia', tarea, estado, progreso, ...(mensaje ? { mensaje } : {}), en: new Date().toISOString() });
    // `resultado` se mezcla: lo que guardó la API (cliente, recurso, nombre) se conserva.
    const guardarResultado = async (extra: Partial<ResultadoKit> & { error?: { codigo: string; mensaje: string } }) => {
      const t = await bd.trabajoIA.findFirst({ where: { id: trabajoId, organizacionId }, select: { resultado: true } });
      const resultado = { ...((t?.resultado ?? {}) as object), ...extra } as unknown as Prisma.InputJsonValue;
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId }, data: { resultado } });
    };
    try {
      if (!kit) throw new Error('El trabajo no trae el cliente ni el material');
      // El cliente y el recurso se buscan con la organización del trabajo: nunca se lee el material de otra.
      const [cliente, recurso] = await Promise.all([
        bd.cliente.findFirst({ where: { id: kit.clienteId, organizacionId } }),
        bd.recurso.findFirst({ where: { id: kit.recursoId, organizacionId, clienteId: kit.clienteId } }),
      ]);
      if (!cliente || !recurso) throw new Error('El cliente o el material no existen en la organización');
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId }, data: { estado: 'EN_CURSO' } });
      await emitir('EN_CURSO', 10, 'Leyendo colores y tipografías del material');
      const evidencias = await evidenciasDeMaterial(await leer(recurso.claveS3), recurso.mime);
      await guardarResultado({ evidencias });
      await emitir('EN_CURSO', 40, 'Proponiendo el kit');
      const r = await tareaRegistrada<PropuestaKit>(
        bd, { organizacionId, trabajoId }, proveedor, TAREA_KIT,
        {
          cliente: { nombre: neutralizar(cliente.nombre) },
          // Colores y nombres de fuentes salen del archivo del cliente: van neutralizados dentro de <material_cliente>.
          evidencias: neutralizar(evidenciasComoTexto(evidencias)),
          parecidas: parecidasComoTexto(evidencias),
          familiasKit: FAMILIAS_KIT.join(', '),
          estilosKit: ESTILOS_KIT.join(', '),
        },
        { version: VERSION_PROMPT, preparar: prepararPropuestaKit, validarExtra: (d) => erroresPropuestaKit(d as PropuestaKit) },
      );
      await guardarResultado({ evidencias, propuesta: r.datos });
      await trabajo.updateProgress(100);
      await emitir('COMPLETADO', 100);
      return { trabajoId };
    } catch (e) {
      const mensaje = e instanceof Error ? e.message : String(e);
      if (e instanceof MaterialKitNoValido) await guardarResultado({ error: { codigo: e.codigo, mensaje } });
      else if (e instanceof SalidaNoValida) await guardarResultado({ error: { codigo: 'PROPUESTA_NO_VALIDA', mensaje: 'La IA no logró una propuesta válida; vuelve a intentarlo' } });
      await bd.trabajoIA.updateMany({ where: { id: trabajoId, organizacionId, estado: { not: 'ERROR' } }, data: { estado: 'ERROR', error: mensaje } });
      await emitir('ERROR', 0, mensaje);
      // Un material que no sirve no se reintenta: el resultado ya dice qué subir.
      if (e instanceof MaterialKitNoValido) return { trabajoId };
      throw e;
    }
  };
}
