// HU-0501 y HU-0502 · Revisión del curso: observaciones, edición de textos y aprobación de pantallas (M05).
// RN-05-1: aprobar exige que la pantalla no tenga observaciones que bloquean la entrega.
// RN-05-2: una pantalla aprobada que se modifica vuelve a borrador.
// HU-0602: los retoques del editor (tamaño, color del kit, alineación y animación) se guardan en `ajustes` (RN-06-1).
// HU-0503: corregir la narración en español regenera su voz, boca y subtítulos en cascada (trabajo CASCADA, cola voz).
// HU-0608: al corregirla, los elementos anclados siguen a su palabra; si la palabra ya no está, conservan su segundo y
// queda la observación «Revisar tiempo» (RN-06-8, CP-067). Mover o anclar de nuevo el elemento la quita.
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { hashNarracion } from '@aptio/ai';
import { type Prisma, recalcularReglas } from '@aptio/db';
import { erroresCurso } from '@aptio/schema';
import { CASCADA_ES, ESPERA_CASCADA_MS, TAREA_CASCADA } from '@aptio/schema/generacion';
import { erroresExtras, TIPOS_IMAGEN } from '@aptio/schema/biblioteca';
import { erroresDisparadores, purgarDisparadores } from '@aptio/schema/disparadores';
import { erroresMarcadores } from '@aptio/schema/marcadores';
import { disenoPermitido, disenosPara, plantillaPara } from '@aptio/schema/marca';
import { type CursoDoc, type PantallaDoc, pantallasDe } from '@aptio/schema/revision';
import { mensajeRevisarTiempo, ORIGEN_REVISAR_TIEMPO, reanclarAjustes } from '@aptio/schema/tiempos';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { ColasService } from '../trabajos/colas.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { aObservacionDto, type AprobacionDto, type CambioResultadoDto, type FiltroNarracionesDto, type FiltroObservacionesDto, type NarracionDto, type ObservacionDto, type PantallaCambioDto, type TextoI18nDto } from './curso.dto.js';

const NINGUNO = '00000000-0000-0000-0000-000000000000';
type Texto = { es?: string; en?: string };
type Narracion = { texto: Texto; porIdioma: Record<string, { estado: string; voz: { voz: string; velocidad?: number }; hashTexto: string }> };
/** RN-06-4: los colores de un retoque son roles del kit, nunca un color suelto. */
const ROLES_KIT = ['primario', 'secundario', 'acento', 'texto', 'blanco', 'alerta', 'fondo'];
type Bloque = PantallaDoc['bloques'][number] & { origen?: { tipo: string; revisado: boolean; documentoId?: string; paginas?: number[] } };

/** Texto por idioma sin claves vacías; null si no queda ninguno. */
function limpio(t: TextoI18nDto | undefined): Texto | null {
  if (!t || typeof t !== 'object') return null;
  const r: Texto = {};
  for (const k of ['es', 'en'] as const) {
    const v = (t as Record<string, unknown>)[k];
    if (typeof v === 'string' && v.trim()) r[k] = v.trim();
  }
  return Object.keys(r).length ? r : null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type ExtraImagen = { id: string; tipo: string; recursoId?: string; pieza?: string; decorativa?: boolean };
type ImagenSubida = { tipo: 'imagen' | 'svg'; nombre: string; mime: string; bytes: number; licencia: string | null };
type RecursoImg = { id: string; tipo: string; origen: string; nombre: string; mime: string; bytes?: number; licencia?: string };

const recursoNoValido = (mensaje: string) => new UnprocessableEntityException({ codigo: 'RECURSO_NO_VALIDO', mensaje });

/**
 * HU-0609 · Los extras imagen con `recursoId`: el recurso ya es una imagen o SVG del curso, o es una imagen o SVG subido
 * al proyecto del curso (`subidas`) y se suma a `recursos` con origen `subido`. Si no, 422 RECURSO_NO_VALIDO. Una pieza
 * con `recursoId`, o `pieza`/`decorativa` fuera de una imagen, da 422 EXTRA_NO_VALIDO.
 */
function enlazarImagenes(doc: CursoDoc, pantallaId: string, extras: readonly ExtraImagen[], subidas: ReadonlyMap<string, ImagenSubida>): void {
  const d = doc as unknown as { recursos?: RecursoImg[] };
  const recursos = d.recursos ?? (d.recursos = []);
  const errores = erroresExtras(pantallaId, extras, new Map(recursos.map((r) => [r.id, r.tipo])));
  if (errores.length) throw new UnprocessableEntityException({ codigo: 'EXTRA_NO_VALIDO', mensaje: 'Revisa la imagen del elemento agregado', detalles: errores.map((e) => ({ mensaje: e })) });
  for (const e of extras) {
    if (e.tipo !== 'imagen' || e.recursoId === undefined) continue;
    const enCurso = recursos.find((r) => r.id === e.recursoId);
    if (enCurso) continue; // erroresExtras ya comprobó que es una imagen o un SVG
    const s = subidas.get(e.recursoId);
    if (!s) throw recursoNoValido('La imagen no existe en este proyecto o no es una imagen (PNG, JPEG, WebP o SVG)');
    recursos.push({ id: e.recursoId, tipo: s.tipo, origen: 'subido', nombre: s.nombre, mime: s.mime, bytes: s.bytes, ...(s.licencia ? { licencia: s.licencia } : {}) });
  }
}

/** Quita de `recursos` las imágenes subidas de `candidatos` que ya no nombra ningún elemento del curso. */
function soltarImagenes(doc: CursoDoc, candidatos: readonly string[]): void {
  const d = doc as unknown as { recursos?: RecursoImg[] };
  if (!candidatos.length || !d.recursos?.length) return;
  const { recursos, ...resto } = d;
  const usados = new Set<string>();
  const visitar = (v: unknown): void => {
    if (Array.isArray(v)) { v.forEach(visitar); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) {
      if (k === 'recursoId' && typeof x === 'string') usados.add(x);
      else visitar(x);
    }
  };
  visitar(resto);
  d.recursos = recursos.filter((r) => !(candidatos.includes(r.id) && r.origen === 'subido' && (TIPOS_IMAGEN as readonly string[]).includes(r.tipo) && !usados.has(r.id)));
}

@Injectable()
export class CursosService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacenes: AlmacenService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** El curso, si es de la organización (y del cliente del revisor). También lo usan las propuestas (HU-0504). */
  async buscar(u: UsuarioSesion, cursoId: string) {
    const organizacionId = organizacionDe(u);
    const c = await this.bd.curso.findFirst({
      where: { id: cursoId, organizacionId, ...(u.rol === 'REVISOR_CLIENTE' ? { proyecto: { clienteId: u.clienteId ?? NINGUNO } } : {}) },
    });
    if (!c) throw new NotFoundException('Curso no encontrado');
    return c;
  }

  async observaciones(u: UsuarioSesion, cursoId: string, f: FiltroObservacionesDto): Promise<ObservacionDto[]> {
    await this.buscar(u, cursoId);
    const lista = await this.bd.observacion.findMany({
      where: { cursoId, ...(f.pantallaId ? { pantallaId: f.pantallaId } : {}), ...(f.resuelta !== undefined ? { resuelta: f.resuelta } : {}) },
      orderBy: [{ pantallaId: 'asc' }, { creadoEn: 'asc' }],
    });
    return lista.map(aObservacionDto);
  }

  /** HU-0701 · Narraciones del curso en el orden de las pantallas, con su audio (y sus subtítulos, HU-0801) firmados por 15 minutos. */
  async narraciones(u: UsuarioSesion, cursoId: string, f: FiltroNarracionesDto): Promise<NarracionDto[]> {
    const c = await this.buscar(u, cursoId);
    const filas = await this.bd.narracion.findMany({ where: { cursoId, ...(f.idioma ? { idioma: f.idioma } : {}) } });
    const recursos = await this.bd.recurso.findMany({
      where: { id: { in: filas.flatMap((n) => [n.audioRecursoId, n.subtituloRecursoId].filter((x): x is string => Boolean(x))) }, organizacionId: c.organizacionId },
      select: { id: true, claveS3: true, duracionMs: true, nombre: true },
    });
    const orden = pantallasDe(c.documento as unknown as CursoDoc);
    const posicion = new Map(orden.map((p, i) => [p.id, i]));
    const textos = new Map(orden.map((p) => [p.id, p.narracion?.texto as Texto | undefined]));
    filas.sort((a, b) => (posicion.get(a.pantallaId) ?? 1e9) - (posicion.get(b.pantallaId) ?? 1e9) || a.idioma.localeCompare(b.idioma));
    return Promise.all(filas.map(async (n) => {
      const r = recursos.find((x) => x.id === n.audioRecursoId);
      const vtt = n.subtituloRecursoId ? recursos.find((x) => x.id === n.subtituloRecursoId) : undefined;
      const texto = textos.get(n.pantallaId)?.[n.idioma as 'es' | 'en'];
      return {
        pantallaId: n.pantallaId, idioma: n.idioma, origen: n.origen, estado: n.estado,
        ...(texto ? { texto } : {}), ...(n.voz ? { voz: n.voz } : {}),
        ...(r?.duracionMs ? { duracionS: Math.round(r.duracionMs / 100) / 10 } : {}),
        ...(r ? { audioUrl: await this.almacenes.almacen.urlDescarga(r.claveS3, r.nombre) } : {}),
        ...(vtt ? { subtitulosUrl: await this.almacenes.almacen.urlDescarga(vtt.claveS3, vtt.nombre) } : {}),
      };
    }));
  }

  /**
   * Guarda el documento con bloqueo optimista y una versión en el historial. `cambiar` modifica una copia del documento
   * y devuelve lo que responde la API; si el documento no valida, nada se guarda.
   */
  async guardar<T>(u: UsuarioSesion, cursoId: string, versionLeida: number | null, motivo: string, cambiar: (doc: CursoDoc) => T): Promise<T & { version: number }> {
    const c = await this.buscar(u, cursoId);
    if (versionLeida !== null && versionLeida !== c.version) {
      throw new ConflictException({ codigo: 'VERSION_CAMBIO', mensaje: 'Otra persona guardó cambios en el curso. Recarga para ver la última versión.' });
    }
    const doc = structuredClone(c.documento) as unknown as CursoDoc;
    const resultado = cambiar(doc);
    const errores = erroresCurso(doc);
    if (errores.length) throw new UnprocessableEntityException({ codigo: 'CURSO_NO_VALIDO', mensaje: 'El cambio deja el curso inválido', detalles: errores.slice(0, 10).map((e) => ({ mensaje: e })) });
    const version = c.version + 1;
    await this.bd.$transaction(async (tx) => {
      const r = await tx.curso.updateMany({ where: { id: c.id, version: c.version }, data: { documento: doc as unknown as Prisma.InputJsonValue, version, actualizadoPorId: u.id } });
      if (r.count === 0) throw new ConflictException({ codigo: 'VERSION_CAMBIO', mensaje: 'Otra persona guardó cambios en el curso. Recarga para ver la última versión.' });
      await tx.cursoVersion.create({ data: { cursoId: c.id, version, documento: doc as unknown as Prisma.InputJsonValue, motivo, creadoPorId: u.id } });
      // Las observaciones por reglas se recalculan con el documento nuevo; las de la IA y las de personas se conservan.
      await recalcularReglas(tx, c.id, doc);
    });
    return { ...resultado, version };
  }

  /** HU-0609 · Las imágenes y SVG subidos o generados en el proyecto del curso que nombran los extras imagen (ids uuid); nunca el material del cliente. */
  private async imagenesDelProyecto(u: UsuarioSesion, cursoId: string, extras: unknown): Promise<Map<string, ImagenSubida>> {
    const ids = Array.isArray(extras)
      ? [...new Set(extras.filter((e): e is ExtraImagen => Boolean(e) && typeof e === 'object' && (e as ExtraImagen).tipo === 'imagen' && typeof (e as ExtraImagen).recursoId === 'string')
        .map((e) => e.recursoId!).filter((id) => UUID.test(id)))]
      : [];
    if (!ids.length) return new Map();
    const c = await this.buscar(u, cursoId);
    const filas = await this.bd.recurso.findMany({
      where: { id: { in: ids }, organizacionId: c.organizacionId, proyectoId: c.proyectoId, tipo: { in: ['IMAGEN', 'SVG'] }, origen: { not: 'CLIENTE' } },
      select: { id: true, tipo: true, nombre: true, mime: true, bytes: true, licencia: true },
    });
    return new Map(filas.map((f) => [f.id, { tipo: f.tipo === 'SVG' ? 'svg' : 'imagen', nombre: f.nombre, mime: f.mime, bytes: Number(f.bytes), licencia: f.licencia }]));
  }

  private pantalla(doc: CursoDoc, pantallaId: string): PantallaDoc {
    const p = pantallasDe(doc).find((x) => x.id === pantallaId);
    if (!p) throw new NotFoundException('Pantalla no encontrada');
    return p;
  }

  /** CP-049: editar el título, un texto o la narración deja la pantalla en borrador, aunque estuviera aprobada. */
  async editar(u: UsuarioSesion, cursoId: string, pantallaId: string, dto: PantallaCambioDto): Promise<CambioResultadoDto> {
    /** Idiomas cuya narración cambió de verdad: su audio queda «Por regenerar» (HU-0703, RN-07-1). */
    const narracionCambiada: string[] = [];
    /** HU-0608 · Elementos que perdieron su palabra de anclaje y elementos cuyo tiempo se volvió a fijar. */
    const sinAncla: string[] = [];
    const tiempoFijado: string[] = [];
    // HU-0609 · Las imágenes subidas que traen los extras: se buscan antes (solo las del proyecto del curso) para
    // sumarlas a `recursos` del curso en la misma versión.
    const subidas = await this.imagenesDelProyecto(u, cursoId, dto.extras);
    const r = await this.guardar(u, cursoId, dto.version, dto.motivo ?? 'edición', (doc) => {
      const p = this.pantalla(doc, pantallaId);
      const bloques = p.bloques as Bloque[];
      const editado = (b: Bloque, contenido: Texto) => {
        b.contenido = contenido;
        // Lo que escribe una persona deja de ser propuesta de la IA; se conserva el documento y la página de origen.
        b.origen = { ...(b.origen ?? {}), tipo: 'manual', revisado: true };
      };
      let cambios = 0;
      const titulo = limpio(dto.titulo);
      if (dto.titulo !== undefined) {
        if (!titulo) throw new UnprocessableEntityException({ codigo: 'TITULO_VACIO', mensaje: 'El título no puede quedar vacío' });
        p.titulo = titulo;
        const b = bloques.find((x) => x.tipo === 'texto' && x.rol === 'titulo');
        if (b) editado(b, titulo);
        cambios++;
      }
      for (const [id, valor] of Object.entries(dto.textos ?? {})) {
        const b = bloques.find((x) => x.id === id && x.tipo === 'texto');
        if (!b) throw new UnprocessableEntityException({ codigo: 'BLOQUE_NO_EXISTE', mensaje: `La pantalla no tiene el texto «${id}»` });
        const t = limpio(valor);
        if (!t) throw new UnprocessableEntityException({ codigo: 'TEXTO_VACIO', mensaje: 'Un texto no puede quedar vacío; quita el bloque en el editor' });
        editado(b, t);
        cambios++;
      }
      // HU-0605 · Cambiar diseño: la misma pantalla en otra composición de contenido. Los bloques no se tocan; los ajustes
      // se reinician y los extras quedan (RN-06-3). Si vienen `ajustes` en el mismo cambio, se aplican después (Deshacer).
      if (dto.disposicion !== undefined) {
        const destino = dto.disposicion;
        if (!disenoPermitido(p, destino)) {
          throw new UnprocessableEntityException({
            codigo: 'DISENO_NO_PERMITIDO',
            mensaje: disenosPara(p).length ? 'Ese diseño no está entre los de contenido' : 'Esta pantalla tiene una actividad: su diseño se cambia en Revisión con la IA',
          });
        }
        const pd = p as PantallaDoc & { disposicion?: string; plantilla: string; ajustes?: unknown };
        if (pd.disposicion !== destino) {
          pd.disposicion = destino;
          pd.plantilla = plantillaPara(pd.plantilla, destino);
          delete pd.ajustes;
        }
        cambios++;
      }
      // HU-0606 · Extras: la lista completa de la pantalla. Un id repetido o igual al de un bloque no se acepta; lo demás
      // (tipos, posición y ancho) lo valida el esquema. Al quitar un extra se borra su ajuste (SUP-45).
      if (dto.extras !== undefined) {
        const pe = p as PantallaDoc & { extras?: { id: string }[]; ajustes?: Record<string, unknown> };
        if (!Array.isArray(dto.extras) || dto.extras.some((e) => !e || typeof e !== 'object' || typeof (e as { id?: unknown }).id !== 'string')) {
          throw new UnprocessableEntityException({ codigo: 'EXTRA_NO_VALIDO', mensaje: 'Cada elemento agregado necesita un id' });
        }
        const ids = dto.extras.map((e) => (e as { id: string }).id);
        const repetido = ids.find((id, i) => ids.indexOf(id) !== i || bloques.some((b) => b.id === id));
        if (repetido) throw new UnprocessableEntityException({ codigo: 'EXTRA_NO_VALIDO', mensaje: `El id «${repetido}» ya está en la pantalla` });
        const antes = (pe.extras ?? []).map((e) => e.id);
        const recursosAntes = (pe.extras ?? []).map((e) => (e as { recursoId?: string }).recursoId).filter((x): x is string => Boolean(x));
        enlazarImagenes(doc, p.id, dto.extras as ExtraImagen[], subidas);
        for (const id of antes) if (!ids.includes(id) && pe.ajustes) delete pe.ajustes[id];
        if (pe.ajustes && !Object.keys(pe.ajustes).length) delete pe.ajustes;
        if (dto.extras.length) pe.extras = dto.extras as { id: string }[];
        else delete pe.extras;
        // HU-0610 · Los disparadores de un extra que se quitó se van con él.
        purgarDisparadores(p as PantallaDoc & { disparadores?: unknown });
        // HU-0609 · Una imagen subida que ya nadie usa sale de `recursos` (así Deshacer la quita en el mismo cambio).
        soltarImagenes(doc, recursosAntes);
        cambios++;
      }
      // HU-0610 · Disparadores: la lista completa de la pantalla, como los extras (después de ellos, para poder apuntar a
      // uno nuevo en el mismo cambio). 422 DISPARADOR_NO_VALIDO si no pasan `erroresDisparadores`.
      if (dto.disparadores !== undefined) {
        const pd = p as PantallaDoc & { disparadores?: unknown[] };
        if (Array.isArray(dto.disparadores) && dto.disparadores.length) pd.disparadores = dto.disparadores;
        else delete pd.disparadores;
        const errores = erroresDisparadores(pd, pantallasDe(doc).map((x) => x.id));
        if (errores.length) {
          throw new UnprocessableEntityException({ codigo: 'DISPARADOR_NO_VALIDO', mensaje: 'Revisa los disparadores de la pantalla', detalles: errores.slice(0, 10).map((e) => ({ mensaje: e })) });
        }
        cambios++;
      }
      // HU-0901 · Marcadores del video: por id del bloque de video, la lista completa (capítulos y puntos incluidos).
      // 422 BLOQUE_NO_EXISTE si el bloque no es un video de la pantalla; MARCADOR_NO_VALIDO si no pasan `erroresMarcadores`.
      if (dto.marcadores !== undefined) {
        const duraciones = new Map(((doc as { recursos?: { id: string; duracionMs?: number }[] }).recursos ?? []).map((r) => [r.id, r.duracionMs]));
        const errores: string[] = [];
        for (const [id, lista] of Object.entries(dto.marcadores)) {
          const video = bloques.find((x) => x.id === id) as { tipo: string; recursoId?: string; marcadores?: unknown } | undefined;
          if (!video || video.tipo !== 'video') {
            throw new UnprocessableEntityException({ codigo: 'BLOQUE_NO_EXISTE', mensaje: `La pantalla no tiene el video «${id}»` });
          }
          video.marcadores = lista;
          errores.push(...erroresMarcadores(`${p.id}/${id}`, lista, video.recursoId ? duraciones.get(video.recursoId) : undefined));
        }
        if (errores.length) {
          throw new UnprocessableEntityException({ codigo: 'MARCADOR_NO_VALIDO', mensaje: 'Revisa las preguntas del video', detalles: errores.slice(0, 10).map((e) => ({ mensaje: e })) });
        }
        cambios++;
      }
      // HU-0902 · Reglas del video («impedir adelantar» y el porcentaje mínimo, que se conserva si no se manda).
      if (dto.reglasVideo !== undefined) {
        for (const [id, regla] of Object.entries(dto.reglasVideo)) {
          const video = bloques.find((x) => x.id === id) as { tipo: string; reglas?: { impedirAdelantar: boolean; porcentajeMinimo: number } } | undefined;
          if (!video || video.tipo !== 'video') {
            throw new UnprocessableEntityException({ codigo: 'BLOQUE_NO_EXISTE', mensaje: `La pantalla no tiene el video «${id}»` });
          }
          const r = regla as { impedirAdelantar?: unknown; porcentajeMinimo?: unknown } | null;
          const extra = r && typeof r === 'object' ? Object.keys(r).filter((k) => k !== 'impedirAdelantar' && k !== 'porcentajeMinimo') : [];
          const porcentaje = r?.porcentajeMinimo ?? video.reglas?.porcentajeMinimo ?? 90;
          if (!r || typeof r !== 'object' || typeof r.impedirAdelantar !== 'boolean' || extra.length
            || typeof porcentaje !== 'number' || !Number.isFinite(porcentaje) || porcentaje < 0 || porcentaje > 100) {
            throw new UnprocessableEntityException({
              codigo: 'REGLA_VIDEO_NO_VALIDA', mensaje: 'Revisa las reglas del video',
              detalles: [{ mensaje: `${p.id}/${id}/reglas: impedirAdelantar es sí o no y porcentajeMinimo va de 0 a 100` }],
            });
          }
          video.reglas = { impedirAdelantar: r.impedirAdelantar, porcentajeMinimo: porcentaje };
        }
        cambios++;
      }
      if (dto.ajustes !== undefined) {
        const pa = p as PantallaDoc & { ajustes?: Record<string, unknown> };
        const ajustes = { ...(pa.ajustes ?? {}) };
        for (const [id, ajuste] of Object.entries(dto.ajustes)) {
          const extras = (p as { extras?: { id: string }[] }).extras ?? [];
          if (!bloques.some((x) => x.id === id) && !extras.some((x) => x.id === id)) {
            throw new UnprocessableEntityException({ codigo: 'BLOQUE_NO_EXISTE', mensaje: `La pantalla no tiene el elemento «${id}»` });
          }
          // HU-0608 · El tiempo se fija si cambia la entrada o el ancla (otro retoque manda el ajuste entero).
          const previo = (ajustes[id] ?? {}) as { retardoS?: unknown; anclaPalabra?: unknown };
          const nuevo = (ajuste ?? {}) as { retardoS?: unknown; anclaPalabra?: unknown };
          if (previo.retardoS !== nuevo.retardoS || previo.anclaPalabra !== nuevo.anclaPalabra) tiempoFijado.push(id);
          if (ajuste === null) {
            delete ajustes[id];
          } else {
            if (typeof ajuste !== 'object' || Array.isArray(ajuste)) throw new UnprocessableEntityException({ codigo: 'AJUSTE_NO_VALIDO', mensaje: `El ajuste de «${id}» no es válido` });
            for (const k of ['color', 'relleno'] as const) {
              if (ajuste[k] !== undefined && !ROLES_KIT.includes(ajuste[k] as string)) {
                throw new UnprocessableEntityException({ codigo: 'COLOR_FUERA_DEL_KIT', mensaje: 'Solo se pueden usar los colores del kit' });
              }
            }
            ajustes[id] = ajuste;
          }
        }
        // Lo demás (rangos, alineación, animación) lo valida el esquema del curso al guardar.
        if (Object.keys(ajustes).length) pa.ajustes = ajustes;
        else delete pa.ajustes;
        cambios++;
      }
      if (dto.narracion !== undefined) {
        const n = (p as unknown as { narracion?: Narracion }).narracion;
        const t = limpio(dto.narracion);
        if (!n || !t) throw new UnprocessableEntityException({ codigo: 'NARRACION_NO_VALIDA', mensaje: n ? 'La narración no puede quedar vacía' : 'Esta pantalla no tiene narración' });
        const antes = n.texto;
        n.texto = t;
        for (const [idioma, audio] of Object.entries(n.porIdioma)) {
          const texto = t[idioma as 'es' | 'en'];
          if (!texto) continue;
          if (texto !== antes[idioma as 'es' | 'en']) narracionCambiada.push(idioma);
          // RN-06-8: los tiempos siguen la narración en español (SUP-47).
          if (idioma === 'es' && antes.es && texto !== antes.es) {
            sinAncla.push(...reanclarAjustes((p as { ajustes?: Record<string, { anclaPalabra?: number }> }).ajustes, antes.es, texto));
          }
          // El hash liga el audio al texto: si cambia, el audio queda desactualizado hasta regenerarlo (HU-0703).
          audio.hashTexto = hashNarracion(texto, audio.voz.voz, audio.voz.velocidad ?? 1);
          if (audio.estado === 'generado') audio.estado = 'desactualizado';
        }
        cambios++;
      }
      if (!cambios) throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'No hay cambios que guardar' });
      p.estado = 'borrador';
      return { regenerando: [] as string[], estado: p.estado };
    });
    if (tiempoFijado.length || sinAncla.length) await this.revisarTiempo(cursoId, pantallaId, tiempoFijado, sinAncla);
    if (narracionCambiada.length) {
      await this.bd.narracion.updateMany({ where: { cursoId, pantallaId, idioma: { in: narracionCambiada }, estado: { in: ['ACTUALIZADA', 'ERROR'] } }, data: { estado: 'DESACTUALIZADA' } });
    }
    // HU-0503 (SUP-38): solo el español y solo si la pantalla ya tenía voz; el inglés se regenera desde el S7.
    if (narracionCambiada.includes('es') && (await this.bd.narracion.count({ where: { cursoId, pantallaId, idioma: 'es' } }))) {
      const c = await this.buscar(u, cursoId);
      await this.colas.encolarConEspera('voz', { trabajoId: cursoId, organizacionId: c.organizacionId, tarea: TAREA_CASCADA, pantallaId }, `cascada-${cursoId}-${pantallaId}`, ESPERA_CASCADA_MS);
      return { ...r, regenerando: [...CASCADA_ES] };
    }
    return r;
  }

  /** HU-0608 · Quita «Revisar tiempo» de los elementos cuyo tiempo se fijó y la crea para los que perdieron su ancla. */
  private async revisarTiempo(cursoId: string, pantallaId: string, fijados: string[], perdidos: string[]) {
    const ids = [...new Set([...fijados, ...perdidos])];
    await this.bd.observacion.deleteMany({ where: { cursoId, pantallaId, origen: ORIGEN_REVISAR_TIEMPO, mensaje: { in: ids.map(mensajeRevisarTiempo) } } });
    const nuevos = perdidos.filter((id) => !fijados.includes(id));
    if (nuevos.length) {
      await this.bd.observacion.createMany({
        data: nuevos.map((id) => ({ cursoId, pantallaId, tipo: 'CALIDAD' as const, severidad: 'aviso', mensaje: mensajeRevisarTiempo(id), origen: ORIGEN_REVISAR_TIEMPO })),
      });
    }
  }

  /** Abiertas que bloquean la entrega, por pantalla. */
  private async abiertas(cursoId: string) {
    return this.bd.observacion.findMany({ where: { cursoId, resuelta: false, pantallaId: { not: null } }, select: { pantallaId: true, severidad: true } });
  }

  private static aprobar(p: PantallaDoc) {
    p.estado = 'aprobado';
    for (const b of p.bloques as Bloque[]) if (b.origen) b.origen.revisado = true;
  }

  async aprobarUna(u: UsuarioSesion, cursoId: string, pantallaId: string): Promise<CambioResultadoDto> {
    await this.buscar(u, cursoId);
    const bloquean = (await this.abiertas(cursoId)).filter((o) => o.pantallaId === pantallaId && o.severidad === 'bloquea-entrega');
    if (bloquean.length) {
      throw new ConflictException({ codigo: 'OBSERVACIONES_BLOQUEAN', mensaje: `Resuelve antes ${bloquean.length === 1 ? 'la observación que bloquea' : `las ${bloquean.length} observaciones que bloquean`} la entrega` });
    }
    return this.guardar(u, cursoId, null, 'aprobación', (doc) => {
      const p = this.pantalla(doc, pantallaId);
      CursosService.aprobar(p);
      return { regenerando: [] as string[], aprobadas: [pantallaId], estado: p.estado };
    });
  }

  /** CP-048: con soloSinObservaciones se aprueban las que no tienen observaciones abiertas; las demás quedan pendientes. */
  async aprobarVarias(u: UsuarioSesion, cursoId: string, dto: AprobacionDto): Promise<CambioResultadoDto> {
    if (!dto.pantallaIds?.length && !dto.soloSinObservaciones) {
      throw new UnprocessableEntityException({ codigo: 'SIN_PANTALLAS', mensaje: 'Indica las pantallas o pide las que no tienen observaciones' });
    }
    await this.buscar(u, cursoId);
    const abiertas = await this.abiertas(cursoId);
    const conObservaciones = new Set(abiertas.filter((o) => dto.soloSinObservaciones || o.severidad === 'bloquea-entrega').map((o) => o.pantallaId!));
    return this.guardar(u, cursoId, null, 'aprobación', (doc) => {
      const todas = pantallasDe(doc);
      const pedidas = dto.pantallaIds?.length ? dto.pantallaIds.map((id) => this.pantalla(doc, id)) : todas;
      const aprobadas: string[] = [];
      const pendientes: string[] = [];
      for (const p of pedidas) {
        if (p.estado === 'aprobado') continue;
        if (conObservaciones.has(p.id)) pendientes.push(p.id);
        else {
          CursosService.aprobar(p);
          aprobadas.push(p.id);
        }
      }
      return { regenerando: [] as string[], aprobadas, pendientes };
    });
  }
}
