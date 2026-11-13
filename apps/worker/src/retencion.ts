// Borrado programado de los documentos del cliente (HU-1404, CP-104, ADR-009).
// Cada día borra del almacenamiento los recursos de origen CLIENTE cuyo `eliminarEn` ya pasó, limpia el texto
// extraído de esos documentos y deja registro en Auditoría. El curso y los recursos generados se conservan.
import type { Almacen } from '@aptio/almacen';
import { Prisma, type PrismaClient } from '@aptio/db';

export { COLA_MANTENIMIENTO } from '@aptio/colas';
export const TAREA_BORRADO = 'borrar-documentos-vencidos';
/** Todos los días a las 3:00 de Lima. */
export const PATRON_BORRADO = '0 3 * * *';

const LOTE = 500;

export interface ResultadoBorrado {
  documentos: number;
  proyectos: number;
}

export async function borrarDocumentosVencidos(bd: PrismaClient, almacen: Almacen, ahora = new Date()): Promise<ResultadoBorrado> {
  let documentos = 0;
  const proyectos = new Set<string>();
  for (;;) {
    const lote = await bd.recurso.findMany({
      where: { origen: 'CLIENTE', eliminarEn: { lte: ahora } },
      select: { id: true, organizacionId: true, proyectoId: true, clienteId: true, claveS3: true, nombre: true },
      take: LOTE,
    });
    if (lote.length === 0) break;
    // Primero el almacenamiento: si falla, la fila queda y se reintenta al día siguiente.
    await almacen.borrar(lote.map((r) => r.claveS3));
    const ids = lote.map((r) => r.id);
    await bd.$transaction(async (tx) => {
      await tx.materialFuente.updateMany({
        where: { recursoId: { in: ids } },
        data: { paginas: Prisma.DbNull, transcripcion: Prisma.DbNull, estado: 'borrado' },
      });
      await tx.recurso.deleteMany({ where: { id: { in: ids } } });
      const grupos = new Map<string, typeof lote>();
      for (const r of lote) {
        const clave = `${r.organizacionId}|${r.proyectoId ?? ''}`;
        grupos.set(clave, [...(grupos.get(clave) ?? []), r]);
      }
      for (const grupo of grupos.values()) {
        const { organizacionId, proyectoId, clienteId } = grupo[0]!;
        if (proyectoId) proyectos.add(proyectoId);
        await tx.auditoria.create({
          data: {
            organizacionId,
            accion: 'DOCUMENTOS_BORRADOS',
            entidad: proyectoId ? 'Proyecto' : 'Cliente',
            entidadId: proyectoId ?? clienteId,
            datos: { motivo: 'retencion', documentos: grupo.map((r) => ({ id: r.id, nombre: r.nombre })) },
          },
        });
      }
    });
    documentos += lote.length;
  }
  return { documentos, proyectos: proyectos.size };
}
