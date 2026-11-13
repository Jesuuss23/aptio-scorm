import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma, TrabajoIA } from '@aptio/db';
import { avisosTipografia, type ResultadoKit, TAREA_KIT } from '@aptio/schema/extraccion-kit';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { Trabajo202Dto } from '../cursos/propuesta.dto.js';
import { ColasService } from '../trabajos/colas.service.js';
import type { ExtraerKitEntradaDto, PropuestaKitDto } from './kit-extraccion.dto.js';

/** Formatos de los que se extrae el kit: un curso anterior empaquetado o el manual de marca. */
export const FORMATOS_KIT = ['application/zip', 'application/pdf'];

type Resultado = ResultadoKit & { error?: { codigo: string; mensaje: string } };

/** HU-0206 · Proponer el kit desde un curso anterior o un manual de marca (CP-028, IA-18 v2). */
@Injectable()
export class KitExtraccionService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly colas: ColasService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private async cliente(u: UsuarioSesion, clienteId: string): Promise<string> {
    const organizacionId = organizacionDe(u);
    const c = await this.bd.cliente.findFirst({ where: { id: clienteId, organizacionId }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return organizacionId;
  }

  async extraer(u: UsuarioSesion, clienteId: string, dto: ExtraerKitEntradaDto): Promise<Trabajo202Dto> {
    const organizacionId = await this.cliente(u, clienteId);
    const r = await this.bd.recurso.findFirst({ where: { id: dto.recursoId, organizacionId, clienteId } });
    if (!r) throw new NotFoundException('Material no encontrado para este cliente');
    if (!FORMATOS_KIT.includes(r.mime) || r.tipo !== 'DOCUMENTO') {
      throw new UnprocessableEntityException({
        codigo: 'FORMATO_NO_VALIDO',
        mensaje: 'El kit se extrae de un ZIP de un curso anterior o de un PDF del manual de marca',
        detalles: [{ mime: r.mime, permitidos: FORMATOS_KIT }],
      });
    }
    const resultado: ResultadoKit = { tipo: 'kit', clienteId, recursoId: r.id, nombreArchivo: r.nombre };
    const t = await this.bd.trabajoIA.create({
      data: { organizacionId, tarea: TAREA_KIT, tipo: 'TEXTO', proveedor: '-', modelo: '-', resultado: resultado as unknown as Prisma.InputJsonValue },
    });
    try {
      await this.colas.encolar('ia', { trabajoId: t.id, organizacionId, tarea: TAREA_KIT, kit: { clienteId, recursoId: r.id } });
    } catch (e) {
      await this.bd.trabajoIA.update({ where: { id: t.id }, data: { estado: 'ERROR', error: 'No se pudo encolar' } });
      throw e;
    }
    return { id: t.id, estado: 'EN_COLA', eventos: '/api/v1/eventos' };
  }

  /** La última propuesta del cliente; si se descartó, ninguna (una extracción nueva vuelve a ofrecer). */
  private async ultima(organizacionId: string, clienteId: string): Promise<TrabajoIA | null> {
    // TrabajoIA no tiene cliente: se filtra por el JSON de `resultado` (SUP-136).
    const t = await this.bd.trabajoIA.findFirst({
      where: { organizacionId, tarea: TAREA_KIT, AND: [{ resultado: { path: ['tipo'], equals: 'kit' } }, { resultado: { path: ['clienteId'], equals: clienteId } }] },
      orderBy: [{ creadoEn: 'desc' }, { id: 'desc' }],
    });
    return t && !(t.resultado as unknown as Resultado).descartadaEn ? t : null;
  }

  async propuesta(u: UsuarioSesion, clienteId: string): Promise<PropuestaKitDto> {
    const organizacionId = await this.cliente(u, clienteId);
    const t = await this.ultima(organizacionId, clienteId);
    if (!t) throw new NotFoundException('El cliente no tiene una propuesta de kit');
    return aDto(t);
  }

  async descartar(u: UsuarioSesion, clienteId: string): Promise<void> {
    const organizacionId = await this.cliente(u, clienteId);
    const t = await this.ultima(organizacionId, clienteId);
    if (!t) throw new NotFoundException('El cliente no tiene una propuesta de kit');
    const resultado = { ...(t.resultado as object), descartadaEn: new Date().toISOString() } as Prisma.InputJsonValue;
    await this.bd.trabajoIA.update({ where: { id: t.id }, data: { resultado } });
    await this.bd.auditoria.create({
      data: { organizacionId, usuarioId: u.id, accion: 'KIT_PROPUESTA_DESCARTADA', entidad: 'Cliente', entidadId: clienteId, datos: { trabajoId: t.id } },
    });
  }
}

function aDto(t: TrabajoIA): PropuestaKitDto {
  const r = t.resultado as unknown as Resultado;
  const estado = r.propuesta && t.estado === 'COMPLETADO' ? 'lista' : t.estado === 'ERROR' ? 'error' : 'procesando';
  return {
    trabajoId: t.id, estado, recursoId: r.recursoId, nombreArchivo: r.nombreArchivo, creadoEn: t.creadoEn.toISOString(),
    ...(r.evidencias ? { evidencias: r.evidencias } : {}),
    ...(r.propuesta && estado === 'lista' ? { propuesta: r.propuesta } : {}),
    avisosTipografia: r.propuesta && estado === 'lista' ? avisosTipografia(r.propuesta) : [],
    ...(estado === 'error' ? { error: r.error ?? { codigo: 'ERROR', mensaje: 'No se pudo proponer el kit; vuelve a intentarlo' } } : {}),
  } as PropuestaKitDto;
}
