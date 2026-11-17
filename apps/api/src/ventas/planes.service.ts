import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { ID_PLANES_AJUSTES, type Plan, Prisma, ultimaVersion } from '@aptio/db';
import {
  AJUSTES_PLANES_POR_DEFECTO, type AjustesPlanes, type Caracteristica, type DatosPlan, type ErrorCampo, precioAnualDe, validarAjustesPlanes, validarPlan, validarPlanCompleto,
} from '@aptio/schema/planes';
import { planesServidos } from '@aptio/schema/sitio-versiones';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { entornoActual } from '../sitio/entorno-sitio.js';
import type { AjustesPlanesDto, PlanDto, PlanEntradaDto, PlanesDto, PlanPublicoDto } from './planes.dto.js';

/** Un plan nuevo: oculto, sin destacar y con el texto de botón de siempre (solo faltan slug y nombre). */
const PLAN_NUEVO: Omit<DatosPlan, 'slug' | 'nombre'> = {
  descripcion: '', precioMes: null, precioAnual: null, capsulasMes: null, usuarios: null, capsulaAdicional: null, textoBoton: 'Suscribirme', destacado: false, visible: false, caracteristicas: [],
};
const CAMPOS: (keyof DatosPlan)[] = ['slug', 'nombre', 'descripcion', 'precioMes', 'precioAnual', 'capsulasMes', 'usuarios', 'capsulaAdicional', 'textoBoton', 'destacado', 'visible', 'caracteristicas'];

const caracteristicasDe = (v: unknown): Caracteristica[] => (Array.isArray(v) ? (v as Caracteristica[]) : []);
const datosDe = (p: Plan): DatosPlan => ({
  slug: p.slug, nombre: p.nombre, descripcion: p.descripcion, precioMes: p.precioMes, precioAnual: p.precioAnual, capsulasMes: p.capsulasMes, usuarios: p.usuarios,
  capsulaAdicional: p.capsulaAdicional, textoBoton: p.textoBoton, destacado: p.destacado, visible: p.visible, caracteristicas: caracteristicasDe(p.caracteristicas),
});
const presentes = (dto: PlanEntradaDto): Record<string, unknown> => Object.fromEntries(Object.entries(dto).filter(([, v]) => v !== undefined));
const limpio = (d: DatosPlan): DatosPlan => ({
  ...d, nombre: d.nombre.trim(), descripcion: d.descripcion.trim(), textoBoton: d.textoBoton.trim(), caracteristicas: d.caracteristicas.map((c) => ({ texto: c.texto.trim(), visible: c.visible })),
});
const noValido = (errores: ErrorCampo[]) => new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: errores.map((e) => e.mensaje).join('. '), detalles: errores });

/**
 * HU-1702 · Planes administrables (M18, REQ-082, PNT-35). El superadmin crea, edita, ordena, oculta y destaca los planes
 * (no se borran: las suscripciones los van a referir) y fija los ajustes de la página de precios. Lo que ve el público
 * sale de la versión publicada del sitio: un cambio se ve en /precios y en el pago al publicar (CP-141).
 */
@Injectable()
export class PlanesService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async listar(): Promise<PlanesDto> {
    const [filas, ajustes] = await Promise.all([this.bd.plan.findMany({ orderBy: [{ orden: 'asc' }, { nombre: 'asc' }] }), this.leerAjustes()]);
    return { planes: filas.map((p) => this.aDto(p, ajustes)), ajustes };
  }

  async crear(u: UsuarioSesion, dto: PlanEntradaDto): Promise<PlanDto> {
    const entrada = presentes(dto);
    const ficticio = entrada.ficticio === true;
    delete entrada.ficticio;
    const datos = this.validar({ ...PLAN_NUEVO, ...entrada } as DatosPlan);
    if (await this.bd.plan.findUnique({ where: { slug: datos.slug } })) throw new ConflictException({ codigo: 'SLUG_EN_USO', mensaje: `Ya hay un plan con el identificador «${datos.slug}»` });
    const ultimo = await this.bd.plan.aggregate({ _max: { orden: true } });
    const p = await this.bd.$transaction(async (tx) => {
      if (datos.destacado) await tx.plan.updateMany({ where: { destacado: true }, data: { destacado: false } });
      return tx.plan.create({ data: { ...datos, caracteristicas: datos.caracteristicas as unknown as Prisma.InputJsonValue, ficticio, orden: (ultimo._max.orden ?? -1) + 1 } });
    });
    await this.auditar(u, 'PLAN_CREADO', p.id, { slug: p.slug, nombre: p.nombre, visible: p.visible, precioMes: p.precioMes });
    return this.aDto(p, await this.leerAjustes());
  }

  async cambiar(u: UsuarioSesion, id: string, dto: PlanEntradaDto): Promise<PlanDto> {
    const actual = await this.buscar(id);
    const cambios = presentes(dto);
    if (cambios.slug !== undefined && cambios.slug !== actual.slug) {
      throw new UnprocessableEntityException({ codigo: 'SLUG_FIJO', mensaje: 'El identificador del plan no cambia: lo usan las URL y las suscripciones' });
    }
    delete cambios.slug;
    const ficticio = typeof cambios.ficticio === 'boolean' ? cambios.ficticio : actual.ficticio;
    delete cambios.ficticio;
    const parcial = validarPlan(cambios as Partial<Record<keyof DatosPlan, unknown>>, { parcial: true });
    if (parcial.length) throw noValido(parcial);
    const datos = this.validar({ ...datosDe(actual), ...cambios } as DatosPlan);
    const p = await this.bd.$transaction(async (tx) => {
      if (datos.destacado && !actual.destacado) await tx.plan.updateMany({ where: { destacado: true, id: { not: id } }, data: { destacado: false } });
      return tx.plan.update({ where: { id }, data: { ...datos, caracteristicas: datos.caracteristicas as unknown as Prisma.InputJsonValue, ficticio } });
    });
    const precio = cambios.precioMes !== undefined && cambios.precioMes !== actual.precioMes ? { precioMesAntes: actual.precioMes, precioMes: p.precioMes } : {};
    await this.auditar(u, 'PLAN_EDITADO', id, {
      slug: p.slug, campos: [...Object.keys(cambios), ...(ficticio !== actual.ficticio ? ['ficticio'] : [])], ...precio,
      ...(cambios.visible !== undefined ? { visible: p.visible } : {}), ...(cambios.destacado !== undefined ? { destacado: p.destacado } : {}),
    });
    return this.aDto(p, await this.leerAjustes());
  }

  async ordenar(u: UsuarioSesion, ids: string[]): Promise<PlanesDto> {
    const todos = await this.bd.plan.findMany({ select: { id: true } });
    const existentes = new Set(todos.map((p) => p.id));
    if (new Set(ids).size !== ids.length || ids.length !== existentes.size || ids.some((i) => !existentes.has(i))) {
      throw new UnprocessableEntityException({ codigo: 'ORDEN_INCOMPLETO', mensaje: 'El orden lleva todos los planes, una vez cada uno' });
    }
    await this.bd.$transaction(ids.map((id, orden) => this.bd.plan.update({ where: { id }, data: { orden } })));
    await this.auditar(u, 'PLAN_ORDEN_CAMBIADO', null, { ids });
    return this.listar();
  }

  async leerAjustes(): Promise<AjustesPlanesDto> {
    const f = await this.bd.planesAjustes.findUnique({ where: { id: ID_PLANES_AJUSTES } });
    return f ? { mostrarAnual: f.mostrarAnual, descuentoAnual: f.descuentoAnual, conIgv: f.conIgv } : { ...AJUSTES_PLANES_POR_DEFECTO };
  }

  async guardarAjustes(u: UsuarioSesion, dto: AjustesPlanesDto): Promise<AjustesPlanesDto> {
    const errores = validarAjustesPlanes(dto);
    if (errores.length) throw noValido(errores);
    const antes = await this.leerAjustes();
    const datos: AjustesPlanes = { mostrarAnual: dto.mostrarAnual, descuentoAnual: dto.descuentoAnual, conIgv: dto.conIgv };
    await this.bd.planesAjustes.upsert({ where: { id: ID_PLANES_AJUSTES }, create: { id: ID_PLANES_AJUSTES, ...datos }, update: datos });
    await this.auditar(u, 'PLAN_AJUSTES_ACTUALIZADOS', ID_PLANES_AJUSTES, { antes, despues: datos } as unknown as Prisma.InputJsonValue);
    return datos;
  }

  /** CP-141 · CP-142 · El plan de la versión publicada: 404 si está oculto, no existe o la versión no publica planes. */
  async publico(slug: string): Promise<PlanPublicoDto> {
    const v = await ultimaVersion(this.bd);
    const servidos = v ? planesServidos(v.instantanea, entornoActual()) : null;
    const plan = servidos?.planes.find((p) => p.slug === slug);
    if (!servidos || !plan) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El plan no existe o no está publicado' });
    return { ...plan, ajustes: servidos.ajustes };
  }

  private validar(d: DatosPlan): DatosPlan {
    const tipos = validarPlan(d);
    if (tipos.length) throw noValido(tipos);
    const datos = limpio(Object.fromEntries(CAMPOS.map((k) => [k, d[k]])) as unknown as DatosPlan);
    const errores = validarPlanCompleto(datos);
    if (errores.length) throw noValido(errores);
    return datos;
  }

  private async buscar(id: string): Promise<Plan> {
    const p = await this.bd.plan.findUnique({ where: { id } });
    if (!p) throw new NotFoundException({ codigo: 'NO_ENCONTRADO', mensaje: 'El plan no existe' });
    return p;
  }

  private aDto(p: Plan, ajustes: AjustesPlanes): PlanDto {
    return { id: p.id, ...datosDe(p), precioAnualEfectivo: precioAnualDe(p, ajustes.descuentoAnual), orden: p.orden, ficticio: p.ficticio, actualizadoEn: p.actualizadoEn.toISOString() };
  }

  private async auditar(u: UsuarioSesion, accion: string, entidadId: string | null, datos: Prisma.InputJsonValue) {
    await this.bd.auditoria.create({ data: { organizacionId: null, usuarioId: u.id, accion, entidad: 'Plan', entidadId, datos } });
  }
}
