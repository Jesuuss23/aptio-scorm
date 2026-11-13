// HU-1202 · Exportar SCORM 1.2 (M12). La API valida el curso y el pedido, crea la Exportacion ligada a la versión actual
// del curso (RN-12-4) y encola EXPORTAR en la cola `export`; el worker arma el ZIP. Exportar dos veces crea dos
// exportaciones: la anterior no cambia. Se exporta aunque haya pantallas sin aprobar (SUP-51); la web pide confirmación.
// HU-1201 · `validar` estima el peso contra el límite del destino y avisa sin bloquear (RN-12-2, CP-090).
// HU-1203 · También HTML autocontenido: sin LMS, sin límite de subida ni modo diagnóstico, y perfil siempre «generico».
// HU-0804 · `modoIdioma: 'mismo-paquete'` arma el paquete con español e inglés; sin todo el inglés escrito no se exporta
// (TRADUCCION_INCOMPLETA). Los paquetes separados por idioma siguen en 422 IDIOMA_NO_DISPONIBLE.
// HU-1205 · KIT_GAMIFICACION: insignias, plan y guía del LMS de `perfilLms`; sin él, el LMS del cliente que dicen los datos
// técnicos del proyecto (SUP-164). No se valida antes: `validar` sigue siendo de SCORM 1.2 y HTML. Con `mismo-paquete`
// los nombres van en los dos idiomas y lo que no tenga inglés queda en español con una advertencia (no bloquea).
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { TAREA_EXPORTAR } from '@aptio/colas';
import type { Exportacion } from '@aptio/db';
import { armarCreditos, codigoReproductor, cursoBilingue, type ModoIdioma, textosEnIngles, validarExportacion } from '@aptio/exporters';
import { erroresCurso } from '@aptio/schema';
import { perfilPropuesto } from '@aptio/schema/proyecto';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import { ColasService } from '../trabajos/colas.service.js';
import type { ExportacionDto, ExportacionEntradaDto, InformeExportacionDto, ValidacionDto } from './exportacion.dto.js';

/** Límite de subida que se usa para advertir cuando el cliente no tiene ficha de compatibilidad (configurable). */
export const LIMITE_REFERENCIA_MB = 100;
/** Peso del reproductor si no se pudo empaquetar para medirlo (hoy pesa menos que esto). */
const REPRODUCTOR_ESTIMADO = 200_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let pesoReproductor: Promise<number> | null = null;
/** El reproductor se empaqueta una vez por proceso para medir su peso. */
const medirReproductor = () => (pesoReproductor ??= codigoReproductor().then((c) => Buffer.byteLength(c), () => REPRODUCTOR_ESTIMADO));

@Injectable()
export class ExportacionesService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacenes: AlmacenService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private async curso(u: UsuarioSesion, cursoId: string) {
    const c = await this.bd.curso.findFirst({ where: { id: cursoId, organizacionId: organizacionDe(u) } });
    if (!c) throw new NotFoundException('Curso no encontrado');
    return c;
  }

  private formatoDisponible(dto: ExportacionEntradaDto, conKit = false): { formato: 'SCORM12' | 'HTML' | 'KIT_GAMIFICACION'; modoIdioma: ModoIdioma } {
    if (dto.formato !== 'SCORM12' && dto.formato !== 'HTML' && !(conKit && dto.formato === 'KIT_GAMIFICACION')) {
      throw new UnprocessableEntityException({ codigo: 'FORMATO_NO_DISPONIBLE', mensaje: `El formato ${dto.formato} todavía no está disponible: por ahora se exporta SCORM 1.2, HTML o el kit de gamificación` });
    }
    const modoIdioma = dto.modoIdioma ?? 'unico';
    if (modoIdioma === 'separados') {
      throw new UnprocessableEntityException({ codigo: 'IDIOMA_NO_DISPONIBLE', mensaje: 'Los paquetes separados por idioma todavía no están disponibles: exporta un idioma o los dos en el mismo paquete' });
    }
    return { formato: dto.formato, modoIdioma };
  }

  /** HU-1201 · Valida el curso actual para el formato pedido. Responde 200 aunque haya errores: la web los lista. */
  async validar(u: UsuarioSesion, cursoId: string, dto: ExportacionEntradaDto): Promise<ValidacionDto> {
    const c = await this.curso(u, cursoId);
    // Sin kit: el formato es SCORM12 o HTML.
    const { formato, modoIdioma } = this.formatoDisponible(dto) as { formato: 'SCORM12' | 'HTML'; modoIdioma: ModoIdioma };
    const doc = c.documento as { recursos?: { id?: unknown; tipo?: unknown; idioma?: unknown }[]; idiomas?: unknown[] } | null;
    const ids = (Array.isArray(doc?.recursos) ? doc.recursos : []).map((r) => r?.id).filter((id): id is string => typeof id === 'string' && UUID.test(id));
    const [filas, proyecto, organizacion] = await Promise.all([
      ids.length ? this.bd.recurso.findMany({ where: { id: { in: ids }, organizacionId: c.organizacionId }, select: { id: true, nombre: true, bytes: true, tipo: true, proveedor: true, modelo: true, licencia: true } }) : [],
      this.bd.proyecto.findFirst({ where: { id: c.proyectoId }, select: { clienteId: true } }),
      this.bd.organizacion.findUnique({ where: { id: c.organizacionId }, select: { nombre: true } }),
    ]);
    const ficha = proyecto && formato === 'SCORM12'
      ? await this.bd.fichaCompatibilidad.findFirst({ where: { clienteId: proyecto.clienteId, limiteSubidaMb: { not: null } }, orderBy: { actualizadoEn: 'desc' }, select: { limiteSubidaMb: true } })
      : null;
    const referencia = Number(process.env.LIMITE_SUBIDA_REFERENCIA_MB);
    const limiteMb = ficha?.limiteSubidaMb ?? (Number.isFinite(referencia) && referencia > 0 ? referencia : LIMITE_REFERENCIA_MB);
    const origenLimite = ficha?.limiteSubidaMb ? 'ficha' : 'referencia';
    const pesos = filas.map((r) => ({ id: r.id, nombre: r.nombre, bytes: Number(r.bytes) }));
    const bilingue = modoIdioma === 'mismo-paquete';
    const desbordes = bilingue ? await this.bd.traduccion.count({ where: { cursoId: c.id, idioma: 'en', estado: 'DESBORDE' } }) : 0;
    const v = validarExportacion(formato, c.documento, pesos, await medirReproductor(), limiteMb, { origenLimite, modoIdioma, desbordes });
    // HU-1406 · Los créditos con las mismas reglas que el worker: recursos de los idiomas del paquete, sin documentos del
    // cliente. En el bilingüe van en español, el idioma con que abre (HU-0804).
    const idioma = bilingue ? 'es' : doc?.idiomas?.[0] === 'en' ? 'en' : 'es';
    const idiomas: unknown[] = bilingue ? ['es', 'en'] : [idioma];
    const delPaquete = new Set((Array.isArray(doc?.recursos) ? doc.recursos : [])
      .filter((r) => r?.tipo !== 'documento' && (!r?.idioma || idiomas.includes(r.idioma))).map((r) => r?.id));
    const creditos = armarCreditos(filas.filter((f) => delPaquete.has(f.id)), organizacion?.nombre ?? '', idioma);
    return { ...v, origenLimite: formato === 'HTML' ? null : origenLimite, creditos };
  }

  async exportar(u: UsuarioSesion, cursoId: string, dto: ExportacionEntradaDto): Promise<ExportacionDto> {
    const c = await this.curso(u, cursoId);
    const { formato, modoIdioma } = this.formatoDisponible(dto, true);
    const html = formato === 'HTML';
    const kit = formato === 'KIT_GAMIFICACION';
    const errores = erroresCurso(c.documento);
    if (errores.length) {
      throw new UnprocessableEntityException({ codigo: 'ESQUEMA_NO_VALIDO', mensaje: 'El curso no cumple el esquema: corrígelo antes de exportar', detalles: errores.slice(0, 10).map((e) => ({ mensaje: e })) });
    }
    if (modoIdioma === 'mismo-paquete' && !kit) {
      const { traducidos, total } = textosEnIngles(c.documento);
      if (traducidos < total) {
        throw new UnprocessableEntityException({ codigo: 'TRADUCCION_INCOMPLETA', mensaje: `Faltan ${total - traducidos} textos en inglés: tradúcelos en Idiomas` });
      }
      const bilingues = erroresCurso(cursoBilingue(c.documento as unknown as Parameters<typeof cursoBilingue>[0]));
      if (bilingues.length) {
        throw new UnprocessableEntityException({ codigo: 'ESQUEMA_NO_VALIDO', mensaje: 'El curso bilingüe no cumple el esquema: corrígelo antes de exportar', detalles: bilingues.slice(0, 10).map((e) => ({ mensaje: e })) });
      }
    }
    let perfilLms: string = html ? 'generico' : (dto.perfilLms ?? 'generico');
    if (kit && !dto.perfilLms) {
      const p = await this.bd.proyecto.findFirst({ where: { id: c.proyectoId }, select: { datosTecnicos: true } });
      perfilLms = perfilPropuesto(p?.datosTecnicos as Parameters<typeof perfilPropuesto>[0]).toLowerCase();
    }
    const exp = await this.bd.exportacion.create({
      data: { organizacionId: c.organizacionId, cursoId: c.id, versionCurso: c.version, formato, perfilLms, modoIdioma, incluirDiagnostico: html || kit ? false : (dto.incluirDiagnostico ?? true), creadoPorId: u.id },
    });
    await this.colas.encolar('export', { trabajoId: exp.id, organizacionId: c.organizacionId, tarea: TAREA_EXPORTAR });
    return this.dto(exp, null, null);
  }

  async listar(u: UsuarioSesion, cursoId: string): Promise<ExportacionDto[]> {
    await this.curso(u, cursoId);
    const lista = await this.bd.exportacion.findMany({ where: { cursoId }, orderBy: { creadoEn: 'desc' }, take: 50 });
    const nombres = await this.nombres(lista);
    return lista.map((e) => this.dto(e, nombres.get(e.recursoId ?? '') ?? null, null));
  }

  async ver(u: UsuarioSesion, id: string): Promise<ExportacionDto> {
    const e = await this.bd.exportacion.findFirst({ where: { id, organizacionId: organizacionDe(u) } });
    if (!e) throw new NotFoundException('Exportación no encontrada');
    const r = e.estado === 'COMPLETADO' && e.recursoId
      ? await this.bd.recurso.findFirst({ where: { id: e.recursoId, organizacionId: e.organizacionId }, select: { claveS3: true, nombre: true } })
      : null;
    return this.dto(e, r?.nombre ?? null, r ? await this.almacenes.almacen.urlDescarga(r.claveS3, r.nombre) : null);
  }

  private async nombres(lista: Exportacion[]): Promise<Map<string, string>> {
    const ids = lista.map((e) => e.recursoId).filter((x): x is string => Boolean(x));
    if (!ids.length) return new Map();
    const filas = await this.bd.recurso.findMany({ where: { id: { in: ids } }, select: { id: true, nombre: true } });
    return new Map(filas.map((r) => [r.id, r.nombre]));
  }

  private dto(e: Exportacion, nombreArchivo: string | null, descargaUrl: string | null): ExportacionDto {
    return {
      id: e.id, cursoId: e.cursoId, formato: e.formato, perfilLms: e.perfilLms, modoIdioma: e.modoIdioma, versionCurso: e.versionCurso, estado: e.estado,
      bytes: e.bytes === null ? null : Number(e.bytes), informe: (e.informe as InformeExportacionDto | null) ?? null, motivo: e.motivo,
      nombreArchivo, descargaUrl, creadoEn: e.creadoEn.toISOString(),
    };
  }
}
