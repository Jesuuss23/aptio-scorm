import { randomUUID } from 'node:crypto';
import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PERMITIDOS, sanearSvg, SvgNoValido, VIGENCIA_URL_S, verificarContenido } from '@aptio/almacen';
import type { Prisma, Recurso } from '@aptio/db';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { AlmacenService } from './almacen.service.js';
import type { FiltroRecursosDto, RecursoDto, SubidaSolicitudDto, SubidaUrlDto } from './recurso.dto.js';

const NINGUNO = '00000000-0000-0000-0000-000000000000';
const MB = 1024 * 1024;

/** Lo que se quitó al sanear un SVG, para avisar al diseñador. */
function svgEliminados(r: Recurso): string[] | null {
  const m = r.metadatos as { svg?: { eliminados?: string[] } } | null;
  return m?.svg?.eliminados ?? null;
}

function aDto(r: Recurso, url?: string): RecursoDto {
  return {
    id: r.id,
    tipo: r.tipo,
    origen: r.origen,
    nombre: r.nombre,
    mime: r.mime,
    bytes: Number(r.bytes),
    hash: r.hash,
    clienteId: r.clienteId,
    proyectoId: r.proyectoId,
    proveedor: r.proveedor,
    modelo: r.modelo,
    licencia: r.licencia,
    eliminarEn: r.eliminarEn?.toISOString() ?? null,
    creadoEn: r.creadoEn.toISOString(),
    ...(svgEliminados(r) ? { eliminadosAlSanear: svgEliminados(r)! } : {}),
    ...(url ? { url } : {}),
  };
}

const rechazo = (codigo: string, mensaje: string, detalles?: object) =>
  new UnprocessableEntityException({ codigo, mensaje, ...(detalles ? { detalles: [detalles] } : {}) });

/** Subidas con URL firmada y recursos cifrados (HU-1404, RN-14-1). */
@Injectable()
export class RecursosService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacenes: AlmacenService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private get almacen() {
    return this.almacenes.almacen;
  }

  /** El revisor del cliente solo ve los recursos de su cliente (RN-01-3). */
  private alcance(u: UsuarioSesion): Prisma.RecursoWhereInput {
    const organizacionId = organizacionDe(u);
    return u.rol === 'REVISOR_CLIENTE' ? { organizacionId, clienteId: u.clienteId ?? NINGUNO } : { organizacionId };
  }

  async pedirSubida(u: UsuarioSesion, dto: SubidaSolicitudDto): Promise<SubidaUrlDto> {
    const organizacionId = organizacionDe(u);
    const permitido = PERMITIDOS[dto.mime];
    if (!permitido) throw rechazo('TIPO_NO_PERMITIDO', `No se aceptan archivos ${dto.mime}`, { permitidos: Object.keys(PERMITIDOS) });
    if (dto.bytes > permitido.maxBytes) {
      throw rechazo('ARCHIVO_GRANDE', `El archivo supera ${permitido.maxBytes / MB} MB para este tipo`, { maxBytes: permitido.maxBytes });
    }
    const { clienteId, proyectoId } = await this.destino(organizacionId, dto.clienteId, dto.proyectoId);
    const origen = dto.origen ?? 'SUBIDO';
    if (origen === 'CLIENTE' && !clienteId) throw rechazo('SIN_CLIENTE', 'Un documento del cliente necesita su cliente o proyecto');

    const id = randomUUID();
    // La clave no lleva el nombre del archivo: el nombre es dato del cliente y va solo a la base.
    const claveS3 = `org/${organizacionId}/${clienteId ?? 'general'}/${id}`;
    const expira = new Date(Date.now() + VIGENCIA_URL_S * 1000);
    await this.bd.subida.create({
      data: {
        id, organizacionId, usuarioId: u.id, clienteId, proyectoId, origen,
        nombre: dto.nombre, mime: dto.mime, bytes: BigInt(dto.bytes), claveS3, expira,
      },
    });
    const { url, cabeceras } = await this.almacen.urlSubida(claveS3, dto.mime);
    return { subidaId: id, url, cabeceras, expira: expira.toISOString() };
  }

  async confirmar(u: UsuarioSesion, subidaId: string): Promise<RecursoDto> {
    const organizacionId = organizacionDe(u);
    const subida = await this.bd.subida.findFirst({ where: { id: subidaId, organizacionId, usuarioId: u.id } });
    if (!subida) throw new NotFoundException('Subida no encontrada');
    if (subida.recursoId) {
      const ya = await this.bd.recurso.findFirst({ where: { id: subida.recursoId, organizacionId } });
      if (ya) return aDto(ya, await this.almacen.urlDescarga(ya.claveS3, ya.nombre));
    }

    const info = await this.almacen.info(subida.claveS3);
    if (!info) throw rechazo('SUBIDA_INCOMPLETA', 'El archivo todavía no llegó al almacenamiento');
    const permitido = PERMITIDOS[subida.mime]!;
    const descartar = async (codigo: string, mensaje: string, detalles: object) => {
      await this.almacen.borrar([subida.claveS3]);
      await this.bd.subida.delete({ where: { id: subida.id } });
      await this.bd.auditoria.create({
        data: {
          organizacionId, usuarioId: u.id, accion: 'ARCHIVO_RECHAZADO', entidad: 'Subida', entidadId: subida.id,
          datos: { nombre: subida.nombre, mime: subida.mime, codigo, ...detalles },
        },
      });
      return rechazo(codigo, mensaje, detalles);
    };

    if (info.cifrado !== 'aws:kms') throw await descartar('SIN_CIFRADO', 'El archivo no quedó cifrado con KMS', { cifrado: info.cifrado ?? null });
    if (info.bytes > permitido.maxBytes) {
      throw await descartar('ARCHIVO_GRANDE', `El archivo supera ${permitido.maxBytes / MB} MB para este tipo`, { bytes: info.bytes });
    }
    let bytes = info.bytes;
    let hash: string;
    let metadatos: Prisma.InputJsonValue | undefined;
    if (subida.mime === 'image/svg+xml') {
      // CP-024: el SVG se reconstruye sin scripts ni atributos on* y solo se guarda la versión limpia.
      let saneado;
      try {
        saneado = sanearSvg(new TextDecoder().decode(await this.almacen.leer(subida.claveS3)));
      } catch (e) {
        if (!(e instanceof SvgNoValido)) throw e;
        throw await descartar('TIPO_NO_COINCIDE', e.message, { declarado: subida.mime, real: null });
      }
      await this.almacen.subir(subida.claveS3, saneado.svg, subida.mime);
      bytes = Buffer.byteLength(saneado.svg);
      hash = createHash('sha256').update(saneado.svg).digest('hex');
      metadatos = { svg: { eliminados: saneado.eliminados, ids: saneado.ids, viewBox: saneado.viewBox } };
    } else {
      const verificacion = await verificarContenido((n) => this.almacen.cabecera(subida.claveS3, n), subida.mime);
      if (!verificacion.valido) {
        throw await descartar('TIPO_NO_COINCIDE', verificacion.motivo ?? 'El contenido no coincide con el tipo', {
          declarado: subida.mime, real: verificacion.mimeReal ?? null,
        });
      }
      hash = await this.almacen.hash(subida.claveS3);
    }

    const recurso = await this.bd.$transaction(async (tx) => {
      const r = await tx.recurso.create({
        data: {
          organizacionId, clienteId: subida.clienteId, proyectoId: subida.proyectoId,
          tipo: permitido.tipo, origen: subida.origen, claveS3: subida.claveS3,
          mime: subida.mime, bytes: BigInt(bytes), hash, nombre: subida.nombre,
          ...(metadatos ? { metadatos } : {}),
        },
      });
      await tx.subida.update({ where: { id: subida.id }, data: { recursoId: r.id } });
      await tx.auditoria.create({
        data: { organizacionId, usuarioId: u.id, accion: 'RECURSO_SUBIDO', entidad: 'Recurso', entidadId: r.id, datos: { nombre: r.nombre, mime: r.mime, origen: r.origen } },
      });
      return r;
    });
    return aDto(recurso, await this.almacen.urlDescarga(recurso.claveS3, recurso.nombre));
  }

  async listar(u: UsuarioSesion, f: FiltroRecursosDto): Promise<RecursoDto[]> {
    const recursos = await this.bd.recurso.findMany({
      where: {
        AND: [
          this.alcance(u),
          {
            ...(f.clienteId ? { clienteId: f.clienteId } : {}),
            ...(f.proyectoId ? { proyectoId: f.proyectoId } : {}),
            ...(f.tipo ? { tipo: f.tipo } : {}),
            ...(f.origen ? { origen: f.origen } : {}),
          },
        ],
      },
      orderBy: { creadoEn: 'desc' },
      take: 500,
    });
    return recursos.map((r) => aDto(r));
  }

  async ver(u: UsuarioSesion, id: string): Promise<RecursoDto> {
    const r = await this.bd.recurso.findFirst({ where: { AND: [this.alcance(u), { id }] } });
    if (!r) throw new NotFoundException('Recurso no encontrado');
    return aDto(r, await this.almacen.urlDescarga(r.claveS3, r.nombre));
  }

  /** Cliente y proyecto de la subida, de la organización y coherentes entre sí. */
  private async destino(organizacionId: string, clienteId?: string, proyectoId?: string) {
    if (proyectoId) {
      const p = await this.bd.proyecto.findFirst({ where: { id: proyectoId, organizacionId }, select: { clienteId: true } });
      if (!p) throw new NotFoundException('Proyecto no encontrado');
      if (clienteId && clienteId !== p.clienteId) throw rechazo('CLIENTE_NO_COINCIDE', 'El proyecto es de otro cliente');
      return { clienteId: p.clienteId, proyectoId };
    }
    if (clienteId) {
      const c = await this.bd.cliente.findFirst({ where: { id: clienteId, organizacionId }, select: { id: true } });
      if (!c) throw new NotFoundException('Cliente no encontrado');
    }
    return { clienteId: clienteId ?? null, proyectoId: null };
  }
}
