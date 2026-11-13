// HU-1502 · Páginas del sitio comercial (M16). Reglas compartidas por la API y el worker: forma de la ruta y la
// publicación de las programadas que ya llegaron a su hora (CP-111).
import { Prisma, type PrismaClient } from '@prisma/client';
import type { EntornoSitio } from '@aptio/schema/sitio-ficticios';
import { leerAjustes, type AjustesSitio } from '@aptio/schema/sitio-ajustes';
import { armarInstantanea, coleccionesDeBloques, leerInstantanea, type Instantanea, type OrigenVersion } from '@aptio/schema/sitio-versiones';

type Bd = PrismaClient | Prisma.TransactionClient;

/**
 * HU-1507 · La instantánea del sitio tal como está ahora en el panel: las páginas PUBLICADAS con sus bloques y elementos
 * visibles y la navegación visible (RN-16-5). En producción no entra ningún ficticio.
 */
export async function armarInstantaneaActual(bd: Bd, entorno: EntornoSitio): Promise<Instantanea> {
  const paginas = await bd.sitioPagina.findMany({ where: { estado: 'PUBLICADA' }, include: { bloques: true } });
  const colecciones = coleccionesDeBloques(paginas.flatMap((p) => p.bloques.filter((b) => b.visible).map((b) => b.tipo)));
  const elementos = colecciones.length ? await bd.sitioElemento.findMany({ where: { coleccion: { in: colecciones }, visible: true } }) : [];
  const enlaces = await bd.sitioEnlace.findMany({ where: { visible: true } });
  const ajustes = await leerAjustesSitio(bd);
  // HU-1512 · Las redirecciones activas y las reglas extra de robots.txt viajan en la versión, como el resto del sitio.
  const redirecciones = await bd.sitioRedireccion.findMany({ where: { activa: true } });
  const seo = await bd.sitioSeo.findUnique({ where: { id: ID_SEO } });
  return armarInstantanea({ paginas, elementos, enlaces, ajustes, redirecciones, robotsExtra: seo?.robotsExtra ?? null }, entorno);
}

/** HU-1512 · La fila única de los ajustes SEO del sitio (reglas extra de robots.txt). */
export const ID_SEO = 'seo';

/** HU-1509 · La fila única de ajustes del sitio. */
export const ID_AJUSTES = 'sitio';

/** HU-1509 · Los ajustes guardados, o null si todavía nadie los guardó (el sitio usa los valores por defecto). */
export async function leerAjustesSitio(bd: Bd): Promise<AjustesSitio | null> {
  const fila = await bd.sitioAjustes.findUnique({ where: { id: ID_AJUSTES } });
  return fila ? leerAjustes(fila.datos) : null;
}

/** HU-1507 · La última versión publicada (la que ve el sitio), o null si todavía no hay ninguna. */
export async function ultimaVersion(bd: Bd): Promise<{ numero: number; instantanea: Instantanea; creadoEn: Date } | null> {
  const v = await bd.sitioVersion.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true, instantanea: true, creadoEn: true } });
  return v ? { numero: v.numero, instantanea: leerInstantanea(v.instantanea), creadoEn: v.creadoEn } : null;
}

export interface NuevaVersion {
  origen: OrigenVersion;
  entorno: EntornoSitio;
  usuario?: { id: string; nombre: string } | null;
  /** Por defecto, la instantánea actual del panel; al restaurar, la de la versión restaurada. */
  instantanea?: Instantanea;
  restauradaDe?: number;
}

/**
 * HU-1507 · Crea la versión siguiente (número mayor + 1). Si dos publicaciones chocan en el número único, reintenta con
 * el siguiente. Devuelve la versión creada.
 */
export async function crearVersion(bd: PrismaClient, v: NuevaVersion) {
  for (let intento = 0; ; intento++) {
    try {
      return await bd.$transaction(async (tx) => {
        const instantanea = v.instantanea ?? (await armarInstantaneaActual(tx, v.entorno));
        const mayor = await tx.sitioVersion.aggregate({ _max: { numero: true } });
        return tx.sitioVersion.create({
          data: {
            numero: (mayor._max.numero ?? 0) + 1, instantanea: instantanea as unknown as Prisma.InputJsonValue,
            publicadoPorId: v.usuario?.id ?? null, publicadoPorNombre: v.usuario?.nombre ?? null,
            entorno: v.entorno, origen: v.origen, restauradaDe: v.restauradaDe ?? null,
          },
        });
      });
    } catch (e) {
      if (intento < 3 && e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
}

/** `/` (inicio) o `/segmento[/segmento…]` con minúsculas, números y guiones; sin `/` final ni segmentos vacíos. */
export const RUTA_SITIO = /^\/(?:[a-z0-9]+(?:-[a-z0-9]+)*(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*)?$/;
export const rutaSitioValida = (ruta: string): boolean => ruta.length <= 200 && RUTA_SITIO.test(ruta);

/**
 * Publica las páginas PROGRAMADAS cuyo `publicarEn` ya pasó y deja SITIO_PAGINA_PUBLICADA en la auditoría (sin usuario:
 * la publica la plataforma). Corre cada 30 s en la cola `mantenimiento`; como lee el estado de la base, una página
 * vencida durante un reinicio se publica en la primera vuelta. Devuelve los ids publicados.
 *
 * HU-1505 · En producción, si hay algún dato ficticio visible (RN-16-3), no publica: la página sigue PROGRAMADA y queda
 * SITIO_PAGINA_BLOQUEADA en la auditoría una sola vez (no en cada vuelta de 30 s). Se publica en la primera vuelta en
 * que ya no quede ninguno.
 *
 * HU-1507 · Si publicó alguna, crea una versión del sitio completo con origen `programada` (RN-16-5).
 */
export async function publicarProgramadas(bd: PrismaClient, ahora: Date = new Date(), entorno: EntornoSitio = 'produccion'): Promise<string[]> {
  const vencidas = await bd.sitioPagina.findMany({
    where: { estado: 'PROGRAMADA', publicarEn: { lte: ahora } },
    select: { id: true, ruta: true, idioma: true, publicarEn: true },
    orderBy: { publicarEn: 'asc' },
  });
  const publicadas: string[] = [];
  if (!vencidas.length) return publicadas;
  if (entorno === 'produccion') {
    const ficticios = await bd.sitioElemento.findMany({ where: { ficticio: true, visible: true }, select: { id: true, coleccion: true } });
    if (ficticios.length) {
      for (const p of vencidas) {
        const ultima = await bd.auditoria.findFirst({ where: { entidad: 'SitioPagina', entidadId: p.id }, orderBy: { creadoEn: 'desc' }, select: { accion: true } });
        if (ultima?.accion === 'SITIO_PAGINA_BLOQUEADA') continue;
        await bd.auditoria.create({
          data: {
            accion: 'SITIO_PAGINA_BLOQUEADA', entidad: 'SitioPagina', entidadId: p.id,
            datos: { ruta: p.ruta, idioma: p.idioma, motivo: 'FICTICIOS_VISIBLES', ficticios: ficticios.length, publicarEn: p.publicarEn?.toISOString() ?? null },
          },
        });
      }
      return publicadas;
    }
  }
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
  if (publicadas.length) {
    const v = await crearVersion(bd, { origen: 'programada', entorno });
    await bd.auditoria.create({ data: { accion: 'SITIO_VERSION_PUBLICADA', entidad: 'SitioVersion', entidadId: v.id, datos: { numero: v.numero, origen: 'programada', entorno, paginas: publicadas } } });
  }
  return publicadas;
}
