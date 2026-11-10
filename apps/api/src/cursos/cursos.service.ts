// HU-0501 y HU-0502 · Revisión del curso: observaciones, edición de textos y aprobación de pantallas (M05).
// RN-05-1: aprobar exige que la pantalla no tenga observaciones que bloquean la entrega.
// RN-05-2: una pantalla aprobada que se modifica vuelve a borrador.
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { hashNarracion } from '@aptio/ai';
import type { Prisma } from '@aptio/db';
import { erroresCurso } from '@aptio/schema';
import { type CursoDoc, observacionesRegla, type PantallaDoc, pantallasDe } from '@aptio/schema/revision';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { AprobacionDto, CambioResultadoDto, FiltroNarracionesDto, FiltroObservacionesDto, NarracionDto, ObservacionDto, PantallaCambioDto, TextoI18nDto } from './curso.dto.js';

const NINGUNO = '00000000-0000-0000-0000-000000000000';
type Texto = { es?: string; en?: string };
type Narracion = { texto: Texto; porIdioma: Record<string, { estado: string; voz: { voz: string; velocidad?: number }; hashTexto: string }> };
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

@Injectable()
export class CursosService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacenes: AlmacenService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** El curso, si es de la organización (y del cliente del revisor). */
  private async buscar(u: UsuarioSesion, cursoId: string) {
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
    return lista.map((o) => ({
      id: o.id, pantallaId: o.pantallaId, tipo: o.tipo, severidad: o.severidad, mensaje: o.mensaje, origen: o.origen, resuelta: o.resuelta, creadoEn: o.creadoEn.toISOString(),
    }));
  }

  /** HU-0701 · Narraciones del curso en el orden de las pantallas, con su audio firmado por 15 minutos. */
  async narraciones(u: UsuarioSesion, cursoId: string, f: FiltroNarracionesDto): Promise<NarracionDto[]> {
    const c = await this.buscar(u, cursoId);
    const filas = await this.bd.narracion.findMany({ where: { cursoId, ...(f.idioma ? { idioma: f.idioma } : {}) } });
    const recursos = await this.bd.recurso.findMany({
      where: { id: { in: filas.flatMap((n) => (n.audioRecursoId ? [n.audioRecursoId] : [])) }, organizacionId: c.organizacionId },
      select: { id: true, claveS3: true, duracionMs: true, nombre: true },
    });
    const orden = pantallasDe(c.documento as unknown as CursoDoc);
    const posicion = new Map(orden.map((p, i) => [p.id, i]));
    const textos = new Map(orden.map((p) => [p.id, p.narracion?.texto as Texto | undefined]));
    filas.sort((a, b) => (posicion.get(a.pantallaId) ?? 1e9) - (posicion.get(b.pantallaId) ?? 1e9) || a.idioma.localeCompare(b.idioma));
    return Promise.all(filas.map(async (n) => {
      const r = recursos.find((x) => x.id === n.audioRecursoId);
      const texto = textos.get(n.pantallaId)?.[n.idioma as 'es' | 'en'];
      return {
        pantallaId: n.pantallaId, idioma: n.idioma, origen: n.origen, estado: n.estado,
        ...(texto ? { texto } : {}), ...(n.voz ? { voz: n.voz } : {}),
        ...(r?.duracionMs ? { duracionS: Math.round(r.duracionMs / 100) / 10 } : {}),
        ...(r ? { audioUrl: await this.almacenes.almacen.urlDescarga(r.claveS3, r.nombre) } : {}),
      };
    }));
  }

  /**
   * Guarda el documento con bloqueo optimista y una versión en el historial. `cambiar` modifica una copia del documento
   * y devuelve lo que responde la API; si el documento no valida, nada se guarda.
   */
  private async guardar<T>(u: UsuarioSesion, cursoId: string, versionLeida: number | null, motivo: string, cambiar: (doc: CursoDoc) => T): Promise<T & { version: number }> {
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
      await tx.observacion.deleteMany({ where: { cursoId: c.id, origen: 'regla' } });
      const obs = observacionesRegla(doc);
      if (obs.length) await tx.observacion.createMany({ data: obs.map((o) => ({ cursoId: c.id, ...o, origen: 'regla' })) });
    });
    return { ...resultado, version };
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
    const r = await this.guardar(u, cursoId, dto.version, 'edición', (doc) => {
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
    if (narracionCambiada.length) {
      await this.bd.narracion.updateMany({ where: { cursoId, pantallaId, idioma: { in: narracionCambiada }, estado: 'ACTUALIZADA' }, data: { estado: 'DESACTUALIZADA' } });
    }
    return r;
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
