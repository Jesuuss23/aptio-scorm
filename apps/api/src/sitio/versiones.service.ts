import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { armarInstantaneaActual, crearVersion, Prisma, type SitioVersion, ultimaVersion } from '@aptio/db';
import { nombreElemento } from '@aptio/schema/sitio-contenido';
import { bloqueaPublicacion, ficticiosVisibles } from '@aptio/schema/sitio-ficticios';
import { navegacionPublica, type NavegacionPublica } from '@aptio/schema/sitio-navegacion';
import { armarPagina, coleccionesDeBloques, ficticiosDeInstantanea, hayPendientes, leerInstantanea, type Instantanea, type OrigenVersion } from '@aptio/schema/sitio-versiones';
import { entornoActual } from './entorno-sitio.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { PrerenderService } from './prerender.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { VersionSitioDto, VersionesSitioDto, VistaPreviaPaginaDto } from './versiones.dto.js';

type DetalleFicticio = { id: string; coleccion: string; nombre: string };

const aDto = (v: SitioVersion): VersionSitioDto => {
  const inst = leerInstantanea(v.instantanea);
  return {
    numero: v.numero, creadoEn: v.creadoEn.toISOString(), entorno: v.entorno, origen: v.origen, restauradaDe: v.restauradaDe,
    publicadoPor: v.publicadoPorId ? { id: v.publicadoPorId, nombre: v.publicadoPorNombre ?? '' } : null,
    paginas: inst.paginas.length,
    prerender: { estado: v.prerenderEstado, en: v.prerenderEn?.toISOString() ?? null, error: v.prerenderError },
  };
};

const bloqueo = (detalles: DetalleFicticio[], que: string) => new ConflictException({
  codigo: 'FICTICIOS_VISIBLES',
  mensaje: `No se ${que} en producción con datos ficticios: hay ${detalles.length}. Ocúltalos o reemplázalos primero.`,
  detalles,
});

/** Cuántas versiones lista el panel (las más recientes). Todas se conservan. */
export const VERSIONES_LISTADAS = 50;

/**
 * HU-1507 · Versiones del sitio (REQ-068, RN-16-5). Publicar arma la instantánea del sitio completo y crea una versión
 * inmutable; el sitio público sirve solo la última. Restaurar la N crea la N+1 con la instantánea de N, sin tocar lo
 * que se edita en el panel (CP-119). En producción, los ficticios bloquean publicar y restaurar (RN-16-3).
 */
@Injectable()
export class VersionesService {
  constructor(private readonly baseDatos: BaseDatosService, private readonly prerender: PrerenderService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /**
   * HU-1505 · Antes de publicar: en producción, 409 FICTICIOS_VISIBLES con la lista si hay algún ficticio visible
   * (CP-116); en pruebas devuelve cuántos hay para avisar (CP-117).
   */
  async revisarFicticios(): Promise<number> {
    const filas = ficticiosVisibles(await this.bd.sitioElemento.findMany({ where: { ficticio: true, visible: true } }));
    if (bloqueaPublicacion(entornoActual(), filas.length)) {
      throw bloqueo(filas.map((e) => ({ id: e.id, coleccion: e.coleccion, nombre: nombreElemento(e.coleccion, e.datos) })), 'publica');
    }
    return filas.length;
  }

  /** Crea la versión siguiente con la instantánea actual (o la dada) y la deja en la auditoría. */
  async nuevaVersion(u: UsuarioSesion | null, origen: OrigenVersion, extra: { instantanea?: Instantanea; restauradaDe?: number } = {}): Promise<SitioVersion> {
    const usuario = u ? await this.bd.usuario.findUnique({ where: { id: u.id }, select: { id: true, nombre: true } }) : null;
    const entorno = entornoActual();
    const v = await crearVersion(this.bd, { origen, entorno, usuario, ...extra });
    await this.bd.auditoria.create({
      data: {
        usuarioId: u?.id ?? null, organizacionId: null, accion: origen === 'restauracion' ? 'SITIO_VERSION_RESTAURADA' : 'SITIO_VERSION_PUBLICADA',
        entidad: 'SitioVersion', entidadId: v.id,
        datos: { numero: v.numero, origen, entorno, ...(extra.restauradaDe ? { restauradaDe: extra.restauradaDe } : {}) } as Prisma.InputJsonValue,
      },
    });
    // HU-1508 · El sitio público sirve el HTML pre-renderizado: el worker lo arma y mueve el puntero al terminar.
    await this.prerender.encolar(v.numero);
    return v;
  }

  /** «Publicar cambios»: 409 en producción con ficticios visibles; en pruebas publica y avisa cuántos hay. */
  async publicar(u: UsuarioSesion): Promise<VersionSitioDto & { avisoFicticios?: number }> {
    const aviso = await this.revisarFicticios();
    const v = await this.nuevaVersion(u, 'publicacion');
    return { ...aDto(v), ...(aviso ? { avisoFicticios: aviso } : {}) };
  }

  async listar(): Promise<VersionesSitioDto> {
    const filas = await this.bd.sitioVersion.findMany({ orderBy: { numero: 'desc' }, take: VERSIONES_LISTADAS });
    const ultima = filas[0] ? leerInstantanea(filas[0].instantanea) : null;
    const actual = await armarInstantaneaActual(this.bd, entornoActual());
    return {
      entorno: entornoActual(), actual: filas[0]?.numero ?? null, pendientes: hayPendientes(actual, ultima),
      total: await this.bd.sitioVersion.count(), versiones: filas.map(aDto),
    };
  }

  /** CP-119 · Restaurar la N: el sitio queda igual a N y se crea la versión siguiente. El panel no cambia. */
  async restaurar(u: UsuarioSesion, numero: number): Promise<VersionSitioDto> {
    const origen = await this.bd.sitioVersion.findUnique({ where: { numero } });
    if (!origen) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: `No existe la versión ${numero}` });
    const ultima = await ultimaVersion(this.bd);
    if (ultima?.numero === numero) {
      throw new UnprocessableEntityException({ codigo: 'VERSION_ACTUAL', mensaje: `La versión ${numero} ya es la que ve el sitio` });
    }
    const instantanea = leerInstantanea(origen.instantanea);
    if (entornoActual() === 'produccion') {
      const ficticios = ficticiosDeInstantanea(instantanea);
      if (ficticios.length) throw bloqueo(ficticios, `restaura la versión ${numero}`);
    }
    return aDto(await this.nuevaVersion(u, 'restauracion', { instantanea, restauradaDe: numero }));
  }

  /** La vista previa de una página con lo que hay ahora en el panel (publicado o no), con el menú y el pie actuales de su idioma. */
  async vistaPrevia(paginaId: string): Promise<VistaPreviaPaginaDto> {
    const p = await this.bd.sitioPagina.findUnique({ where: { id: paginaId }, include: { bloques: true } });
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'La página no existe' });
    const colecciones = coleccionesDeBloques(p.bloques.filter((b) => b.visible).map((b) => b.tipo));
    const elementos = colecciones.length ? await this.bd.sitioElemento.findMany({ where: { coleccion: { in: colecciones }, visible: true } }) : [];
    const enlaces = await this.bd.sitioEnlace.findMany({ where: { visible: true, idioma: p.idioma === 'en' ? 'en' : 'es' } });
    // En la vista previa los ficticios salen marcados aunque el entorno sea producción: es para revisar, no para el público.
    const pagina = armarPagina(p, elementos, 'pruebas');
    const navegacion: NavegacionPublica = navegacionPublica(enlaces);
    return {
      estado: p.estado, entorno: entornoActual(),
      pagina: {
        ruta: pagina.ruta, idioma: pagina.idioma, titulo: pagina.titulo, publicadaEn: pagina.publicadaEn,
        bloques: pagina.bloques.map((b) => ({
          tipo: b.tipo, ajustes: b.ajustes,
          ...(b.elementos ? { elementos: b.elementos.map((e) => ({ datos: e.datos, ...(e.ficticio ? { ficticio: true } : {}) })) } : {}),
        })),
      },
      navegacion,
    };
  }
}
