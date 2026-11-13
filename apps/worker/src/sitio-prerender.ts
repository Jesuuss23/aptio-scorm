/**
 * HU-1508 · Pre-render del sitio público (DA-08, REQ-109). Toma la instantánea de una versión, arma todas sus páginas
 * con `@aptio/sitio` y las sube al bucket bajo `sitio/v{n}/…`, con el sitemap, robots.txt y la 404; las fuentes van a
 * `sitio/fuentes/` (su nombre lleva el hash). Al final, y solo si no hay ya una versión más nueva servida, mueve el
 * puntero `sitio/actual.json`: así el sitio cambia de una vez, nunca a medias. Deja el estado en la versión y en la
 * auditoría (SITIO_PRERENDER_LISTO o SITIO_PRERENDER_ERROR).
 */
import type { Almacen } from '@aptio/almacen';
import { leerBlogPublico, type Prisma, type PrismaClient } from '@aptio/db';
import { leerInstantanea } from '@aptio/schema/sitio-versiones';
import { CLAVE_ACTUAL, claveFuente, claveVersion, fuentes, leerFuente, opcionesRenderDesdeEnv, type PunteroSitio, renderizarSitio } from '@aptio/sitio';

export async function leerPuntero(almacen: Almacen): Promise<PunteroSitio | null> {
  if (!(await almacen.info(CLAVE_ACTUAL))) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(await almacen.leer(CLAVE_ACTUAL))) as Partial<PunteroSitio>;
    return typeof p.version === 'number' ? { version: p.version, generadoEn: String(p.generadoEn ?? '') } : null;
  } catch {
    return null;
  }
}

/** Las opciones del render. HU-1511 · El blog no va en la instantánea: sale de la copia de WordPress del momento. */
export async function opcionesPrerender(bd: PrismaClient, env: NodeJS.ProcessEnv = process.env) {
  return { ...opcionesRenderDesdeEnv(env), blog: await leerBlogPublico(bd) };
}

export interface ResultadoPrerender { numero: number; estado: 'listo' | 'error' | 'omitido'; archivos: number; puntero: boolean; error?: string }

export async function prerenderizarVersion(bd: PrismaClient, almacen: Almacen, numero: number, env: NodeJS.ProcessEnv = process.env): Promise<ResultadoPrerender> {
  const v = await bd.sitioVersion.findUnique({ where: { numero } });
  if (!v) return { numero, estado: 'omitido', archivos: 0, puntero: false };
  const op = await opcionesPrerender(bd, env);
  try {
    const archivos = renderizarSitio(leerInstantanea(v.instantanea), op);
    for (const a of archivos) await almacen.subir(claveVersion(numero, a.archivo), a.contenido, a.mime);
    for (const f of fuentes()) {
      if (!(await almacen.info(claveFuente(f.archivo)))) await almacen.subir(claveFuente(f.archivo), leerFuente(f.archivo)!, 'font/woff2');
    }
    // El puntero solo avanza: si otra versión más nueva ya se sirve, esta queda lista pero no se publica.
    const actual = await leerPuntero(almacen);
    const mover = !actual || actual.version <= numero;
    if (mover) await almacen.subir(CLAVE_ACTUAL, JSON.stringify({ version: numero, generadoEn: new Date().toISOString() } satisfies PunteroSitio), 'application/json');
    await bd.sitioVersion.update({ where: { numero }, data: { prerenderEstado: 'listo', prerenderEn: new Date(), prerenderError: null } });
    await bd.auditoria.create({
      data: { accion: 'SITIO_PRERENDER_LISTO', entidad: 'SitioVersion', entidadId: v.id, datos: { numero, archivos: archivos.length, puntero: mover, entorno: op.entorno } as Prisma.InputJsonValue },
    });
    return { numero, estado: 'listo', archivos: archivos.length, puntero: mover };
  } catch (e) {
    const error = (e instanceof Error ? e.message : String(e)).slice(0, 500);
    await bd.sitioVersion.update({ where: { numero }, data: { prerenderEstado: 'error', prerenderEn: new Date(), prerenderError: error } });
    await bd.auditoria.create({ data: { accion: 'SITIO_PRERENDER_ERROR', entidad: 'SitioVersion', entidadId: v.id, datos: { numero, error } } });
    return { numero, estado: 'error', archivos: 0, puntero: false, error };
  }
}

/** Al arrancar: si la última versión no quedó lista (versiones anteriores a la HU-1508 o un trabajo perdido), su número. */
export async function versionPendienteDePrerender(bd: PrismaClient): Promise<number | null> {
  const v = await bd.sitioVersion.findFirst({ orderBy: { numero: 'desc' }, select: { numero: true, prerenderEstado: true } });
  return v && v.prerenderEstado !== 'listo' ? v.numero : null;
}
