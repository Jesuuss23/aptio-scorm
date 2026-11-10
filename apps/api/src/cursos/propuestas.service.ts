// HU-0504 · Propuestas de la IA (M05, RN-05-3, RN-05-4, SUP-39): pedir una propuesta encola IA-16 en la cola ia; el
// worker la guarda con su versión base. Aplicar cambia la pantalla y crea una versión; vence si la pantalla cambió.
// Deshacer restaura la versión anterior conservando la narración actual (su audio, boca y subtítulos).
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma, Propuesta } from '@aptio/db';
import type { OperacionPatch } from '@aptio/schema/patch';
import { aplicarEnPantalla, type CambiosPropuesta, huellaPantalla, patchDe, TAREA_PROPUESTA, TIPOS_PROPUESTA, type Variante } from '@aptio/schema/propuesta';
import { type CursoDoc, pantallasDe } from '@aptio/schema/revision';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { ColasService } from '../trabajos/colas.service.js';
import type { CambioResultadoDto } from './curso.dto.js';
import { CursosService } from './cursos.service.js';
import type { AplicarPropuestaDto, CursoRestauradoDto, FiltroPropuestasDto, PropuestaDto, PropuestaSolicitudDto, Trabajo202Dto } from './propuesta.dto.js';

type Guardado = CambiosPropuesta & { huella: string | null };
const VENCIDA = { codigo: 'PROPUESTA_VENCIDA', mensaje: 'La pantalla cambió desde que se calculó esta propuesta. Recalcular propuesta.' };

/** Reemplaza la pantalla en el documento (lo modifica). */
function reemplazar(doc: CursoDoc, pantallaId: string, cambiar: (p: CursoDoc['modulos'][number]['capsulas'][number]['pantallas'][number]) => typeof p) {
  for (const m of doc.modulos) {
    for (const c of m.capsulas) {
      const i = c.pantallas.findIndex((p) => p.id === pantallaId);
      if (i >= 0) {
        c.pantallas[i] = cambiar(c.pantallas[i]!);
        return c.pantallas[i]!;
      }
    }
  }
  throw new NotFoundException('Pantalla no encontrada');
}

@Injectable()
export class PropuestasService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly cursos: CursosService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async pedir(u: UsuarioSesion, cursoId: string, dto: PropuestaSolicitudDto): Promise<Trabajo202Dto> {
    const c = await this.cursos.buscar(u, cursoId);
    if (!(TIPOS_PROPUESTA as readonly string[]).includes(dto.tipo)) {
      throw new UnprocessableEntityException({
        codigo: 'TIPO_NO_DISPONIBLE',
        mensaje: dto.tipo === 'otra-ilustracion' ? 'Otra ilustración llega con las ilustraciones' : 'Este pedido todavía no está disponible',
      });
    }
    if (!dto.pantallaId) throw new UnprocessableEntityException({ codigo: 'PANTALLA_REQUERIDA', mensaje: 'Indica la pantalla' });
    if (!pantallasDe(c.documento as unknown as CursoDoc).some((p) => p.id === dto.pantallaId)) throw new NotFoundException('Pantalla no encontrada');
    if (dto.tipo === 'libre' && !dto.pedido) throw new UnprocessableEntityException({ codigo: 'PEDIDO_VACIO', mensaje: 'Escribe qué quieres cambiar' });
    const t = await this.bd.trabajoIA.create({
      data: { organizacionId: c.organizacionId, proyectoId: c.proyectoId, tarea: TAREA_PROPUESTA, tipo: 'TEXTO', proveedor: '-', modelo: '-' },
    });
    try {
      await this.colas.encolar('ia', {
        trabajoId: t.id, organizacionId: c.organizacionId, tarea: TAREA_PROPUESTA, pantallaId: dto.pantallaId,
        propuesta: { cursoId: c.id, tipo: dto.tipo, ...(dto.pedido ? { texto: dto.pedido } : {}) },
      });
    } catch (e) {
      // Sin Redis no queda un trabajo EN_COLA que nadie va a procesar.
      await this.bd.trabajoIA.update({ where: { id: t.id }, data: { estado: 'ERROR', error: 'No se pudo encolar' } });
      throw e;
    }
    return { id: t.id, estado: 'EN_COLA', eventos: '/api/v1/eventos' };
  }

  /** RN-05-4: al listar, una pendiente cuya pantalla cambió pasa a VENCIDA. */
  async listar(u: UsuarioSesion, cursoId: string, f: FiltroPropuestasDto): Promise<PropuestaDto[]> {
    const c = await this.cursos.buscar(u, cursoId);
    const doc = c.documento as unknown as CursoDoc;
    const filas = await this.bd.propuesta.findMany({
      where: { cursoId, ...(f.pantallaId ? { pantallaId: f.pantallaId } : {}) },
      include: { trabajoIA: { select: { costoUsd: true } } },
      orderBy: { creadoEn: 'desc' },
    });
    const vencidas = filas.filter((p) => p.estado === 'PENDIENTE' && p.pantallaId && huellaPantalla(doc, p.pantallaId) !== (p.cambios as unknown as Guardado).huella);
    if (vencidas.length) await this.bd.propuesta.updateMany({ where: { id: { in: vencidas.map((p) => p.id) }, estado: 'PENDIENTE' }, data: { estado: 'VENCIDA' } });
    for (const p of vencidas) p.estado = 'VENCIDA';
    return filas.filter((p) => !f.estado || p.estado === f.estado).map((p) => PropuestasService.aDto(p, Number(p.trabajoIA?.costoUsd ?? 0)));
  }

  private static aDto(p: Propuesta, costoUsd: number): PropuestaDto {
    const cambios = p.cambios as unknown as Guardado;
    return {
      id: p.id, tipo: p.tipo, pantallaId: p.pantallaId, titulo: p.titulo, descripcion: p.descripcion,
      cambios: 'patch' in cambios ? cambios.patch : [], ...('variantes' in cambios ? { vistaPrevia: cambios.variantes as Variante[] } : {}),
      versionBase: p.versionBase, estado: p.estado, costoUsd, creadoEn: p.creadoEn.toISOString(),
    };
  }

  /** La propuesta, si es de un curso de la organización. */
  private async buscar(u: UsuarioSesion, propuestaId: string) {
    const p = await this.bd.propuesta.findFirst({ where: { id: propuestaId, curso: { organizacionId: organizacionDe(u) } } });
    if (!p) throw new NotFoundException('Propuesta no encontrada');
    return p;
  }

  /** CP-052 y CP-053: aplica el patch (o la variante) si la pantalla no cambió; crea una versión y vuelve a borrador. */
  async aplicar(u: UsuarioSesion, propuestaId: string, dto: AplicarPropuestaDto): Promise<CambioResultadoDto> {
    const p = await this.buscar(u, propuestaId);
    if (p.estado === 'VENCIDA') throw new ConflictException(VENCIDA);
    if (p.estado !== 'PENDIENTE') throw new ConflictException({ codigo: 'PROPUESTA_RESUELTA', mensaje: p.estado === 'APLICADA' ? 'Esta propuesta ya se aplicó' : 'Esta propuesta se descartó' });
    const guardado = p.cambios as unknown as Guardado;
    let patch: OperacionPatch[];
    try {
      patch = patchDe(guardado, dto.varianteIndice);
    } catch {
      throw new UnprocessableEntityException({ codigo: 'VARIANTE_REQUERIDA', mensaje: 'Elige una de las 3 variantes' });
    }
    let vencida = false;
    try {
      const r = await this.cursos.guardar(u, p.cursoId, null, 'propuesta', (doc) => {
        // Se compara dentro del guardado, con el documento que se va a cambiar: nada se cuela entre la revisión y el cambio.
        if (huellaPantalla(doc, p.pantallaId!) !== guardado.huella) {
          vencida = true;
          throw new ConflictException(VENCIDA);
        }
        const nueva = reemplazar(doc, p.pantallaId!, (pantalla) => {
          try {
            return aplicarEnPantalla(pantalla, patch);
          } catch (e) {
            throw new UnprocessableEntityException({ codigo: 'PROPUESTA_NO_APLICA', mensaje: `La propuesta no se puede aplicar: ${(e as Error).message}` });
          }
        });
        nueva.estado = 'borrador';
        return { regenerando: [] as string[], estado: nueva.estado };
      });
      await this.bd.propuesta.update({ where: { id: p.id }, data: { estado: 'APLICADA', resueltoPorId: u.id, resueltoEn: new Date() } });
      return r;
    } catch (e) {
      if (vencida) await this.bd.propuesta.update({ where: { id: p.id }, data: { estado: 'VENCIDA' } });
      throw e;
    }
  }

  async descartar(u: UsuarioSesion, propuestaId: string): Promise<void> {
    const p = await this.buscar(u, propuestaId);
    if (p.estado === 'APLICADA') throw new ConflictException({ codigo: 'PROPUESTA_RESUELTA', mensaje: 'Esta propuesta ya se aplicó' });
    await this.bd.propuesta.update({ where: { id: p.id }, data: { estado: 'DESCARTADA', resueltoPorId: u.id, resueltoEn: new Date() } });
  }

  /**
   * Deshacer (RN-05-3): crea una versión nueva con el documento de `version`. La narración de cada pantalla y los
   * recursos se conservan como están ahora, para no desligar los audios, las bocas y los subtítulos (SUP-39).
   */
  async restaurar(u: UsuarioSesion, cursoId: string, version: number): Promise<CursoRestauradoDto> {
    const c = await this.cursos.buscar(u, cursoId);
    if (version >= c.version) throw new UnprocessableEntityException({ codigo: 'VERSION_NO_ANTERIOR', mensaje: 'Solo se restaura una versión anterior' });
    const vieja = await this.bd.cursoVersion.findFirst({ where: { cursoId, version } });
    if (!vieja) throw new NotFoundException('Versión no encontrada');
    const r = await this.cursos.guardar(u, cursoId, c.version, 'restauración', (doc) => {
      const restaurado = structuredClone(vieja.documento) as unknown as CursoDoc & Record<string, unknown>;
      const actuales = new Map(pantallasDe(doc).map((p) => [p.id, (p as { narracion?: unknown }).narracion]));
      for (const p of pantallasDe(restaurado) as { id: string; narracion?: unknown }[]) {
        const narracion = actuales.get(p.id);
        if (narracion) p.narracion = narracion;
      }
      if ('recursos' in doc) restaurado.recursos = doc.recursos;
      for (const k of Object.keys(doc)) delete (doc as Record<string, unknown>)[k];
      Object.assign(doc, restaurado);
      return {};
    });
    const nuevo = await this.bd.curso.findUniqueOrThrow({ where: { id: cursoId } });
    return {
      id: nuevo.id, proyectoId: nuevo.proyectoId, versionEsquema: nuevo.versionEsquema, version: r.version,
      documento: nuevo.documento as Prisma.JsonObject, actualizadoEn: nuevo.actualizadoEn.toISOString(),
    };
  }
}
