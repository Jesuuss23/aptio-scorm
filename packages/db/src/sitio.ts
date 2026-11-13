// HU-1502 · Páginas del sitio comercial (M16). Reglas compartidas por la API y el worker: forma de la ruta y la
// publicación de las programadas que ya llegaron a su hora (CP-111).
import type { PrismaClient } from '@prisma/client';

/** `/` (inicio) o `/segmento[/segmento…]` con minúsculas, números y guiones; sin `/` final ni segmentos vacíos. */
export const RUTA_SITIO = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
export const rutaSitioValida = (ruta: string): boolean => ruta.length <= 200 && RUTA_SITIO.test(ruta);

/**
 * Publica las páginas PROGRAMADAS cuyo `publicarEn` ya pasó y deja SITIO_PAGINA_PUBLICADA en la auditoría (sin usuario:
 * la publica la plataforma). Corre cada 30 s en la cola `mantenimiento`; como lee el estado de la base, una página
 * vencida durante un reinicio se publica en la primera vuelta. Devuelve los ids publicados.
 */
export async function publicarProgramadas(bd: PrismaClient, ahora: Date = new Date()): Promise<string[]> {
  const vencidas = await bd.sitioPagina.findMany({
    where: { estado: 'PROGRAMADA', publicarEn: { lte: ahora } },
    select: { id: true, ruta: true, idioma: true, publicarEn: true },
    orderBy: { publicarEn: 'asc' },
  });
  const publicadas: string[] = [];
  for (const p of vencidas) {
    // Solo si sigue programada: si el superadmin la pasó a borrador en el medio, no se toca.
    const { count } = await bd.sitioPagina.updateMany({
      where: { id: p.id, estado: 'PROGRAMADA', publicarEn: { lte: ahora } },
      data: { estado: 'PUBLICADA', publicadaEn: ahora, publicarEn: null },
    });
    if (!count) continue;
    await bd.auditoria.create({
      data: {
        accion: 'SITIO_PAGINA_PUBLICADA', entidad: 'SitioPagina', entidadId: p.id,
        datos: { ruta: p.ruta, idioma: p.idioma, programada: true, publicarEn: p.publicarEn?.toISOString() ?? null },
      },
    });
    publicadas.push(p.id);
  }
  return publicadas;
}
