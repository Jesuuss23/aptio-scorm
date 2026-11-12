// HU-0505 · Recalcula las observaciones por reglas de un curso (las de IA, personas y «Revisar tiempo» se conservan).
// Lo usan la API al guardar y al revisar un inglés, y el worker al componer las pantallas, al traducir y en el control
// de calidad: así las reglas leen siempre la paleta del kit del cliente y las filas de Traduccion en Desborde.
import type { Prisma, PrismaClient } from '@prisma/client';
import { type ObservacionRegla, observacionesRegla } from '@aptio/schema/calidad';
import type { Paleta } from '@aptio/schema/marca';
import type { CursoDoc } from '@aptio/schema/revision';

type Cliente = PrismaClient | Prisma.TransactionClient;

/** Borra las observaciones de reglas del curso y crea las del documento dado. Devuelve las que quedaron. */
export async function recalcularReglas(bd: Cliente, cursoId: string, documento: unknown): Promise<ObservacionRegla[]> {
  const curso = await bd.curso.findUnique({ where: { id: cursoId }, select: { proyecto: { select: { cliente: { select: { kit: { select: { paleta: true } } } } } } } });
  const desbordes = await bd.traduccion.findMany({ where: { cursoId, idioma: 'en', estado: 'DESBORDE' }, select: { ruta: true } });
  const obs = observacionesRegla(documento as CursoDoc, {
    paleta: (curso?.proyecto.cliente.kit?.paleta as Paleta | undefined) ?? null,
    desbordesEn: desbordes.map((d) => d.ruta),
  });
  await bd.observacion.deleteMany({ where: { cursoId, origen: 'regla' } });
  if (obs.length) {
    await bd.observacion.createMany({
      data: obs.map((o) => ({ cursoId, pantallaId: o.pantallaId, tipo: o.tipo, severidad: o.severidad, categoria: o.categoria, mensaje: o.mensaje, ruta: o.ruta ?? null, origen: 'regla' })),
    });
  }
  return obs;
}
