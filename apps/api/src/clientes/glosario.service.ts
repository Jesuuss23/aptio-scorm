import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import {
  contieneTermino, erroresGlosario, erroresPronunciacion, type IdiomaVoz, narracionesDe, terminosCambiados, textoOrigen,
} from '@aptio/schema/voz';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { GlosarioTerminoDto, PronunciacionTerminoDto } from './glosario.dto.js';

const noValido = (errores: string[]) =>
  new UnprocessableEntityException({ codigo: 'TERMINOS_NO_VALIDOS', mensaje: 'Revisa los términos', detalles: errores.map((error) => ({ error })) });

/** Glosario y diccionario de pronunciación del cliente (HU-0205). Cambiarlos marca en cascada lo afectado. */
@Injectable()
export class GlosarioService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async glosario(u: UsuarioSesion, clienteId: string): Promise<GlosarioTerminoDto[]> {
    await this.cliente(u, clienteId);
    const filas = await this.bd.glosarioTermino.findMany({ where: { clienteId }, orderBy: { termino: 'asc' } });
    return filas.map((t) => ({ termino: t.termino, traduccion: t.traduccion, noTraducir: t.noTraducir }));
  }

  /** Reemplaza el glosario. Las traducciones al inglés cuyo texto usa un término cambiado vuelven a PENDIENTE. */
  async reemplazarGlosario(u: UsuarioSesion, clienteId: string, terminos: GlosarioTerminoDto[]): Promise<GlosarioTerminoDto[]> {
    const organizacionId = await this.cliente(u, clienteId);
    const errores = erroresGlosario(terminos);
    if (errores.length) throw noValido(errores);
    const antes = await this.bd.glosarioTermino.findMany({ where: { clienteId } });
    const valor = (t: { traduccion?: string | null; noTraducir?: boolean | null }) => (t.noTraducir ? '∅' : (t.traduccion ?? ''));
    const cambiados = terminosCambiados(antes, terminos, (t) => t.termino, valor);

    await this.bd.$transaction(async (tx) => {
      await tx.glosarioTermino.deleteMany({ where: { clienteId } });
      await tx.glosarioTermino.createMany({
        data: terminos.map((t) => ({ clienteId, termino: t.termino, noTraducir: t.noTraducir ?? false, traduccion: t.noTraducir ? null : (t.traduccion ?? null) })),
      });
      let ids: string[] = [];
      if (cambiados.length) {
        const cursos = await tx.curso.findMany({
          where: { organizacionId, proyecto: { clienteId } },
          select: { id: true, documento: true, traducciones: { where: { estado: { not: 'PENDIENTE' } }, select: { id: true, ruta: true } } },
        });
        ids = cursos.flatMap((c) =>
          c.traducciones.filter((t) => {
            const texto = textoOrigen(c.documento, t.ruta);
            return texto !== null && cambiados.some((k) => contieneTermino(texto, k));
          }).map((t) => t.id));
        if (ids.length) await tx.traduccion.updateMany({ where: { id: { in: ids } }, data: { estado: 'PENDIENTE' } });
      }
      await tx.auditoria.create({
        data: {
          organizacionId, usuarioId: u.id, accion: 'GLOSARIO_GUARDADO', entidad: 'Cliente', entidadId: clienteId,
          datos: { terminos: terminos.length, cambiados, traduccionesPendientes: ids.length },
        },
      });
    });
    return this.glosario(u, clienteId);
  }

  async pronunciacion(u: UsuarioSesion, clienteId: string): Promise<PronunciacionTerminoDto[]> {
    await this.cliente(u, clienteId);
    const filas = await this.bd.pronunciacionTermino.findMany({ where: { clienteId }, orderBy: [{ idioma: 'asc' }, { escrito: 'asc' }] });
    return filas.map((t) => ({ idioma: t.idioma as IdiomaVoz, escrito: t.escrito, pronunciado: t.pronunciado }));
  }

  /** Reemplaza el diccionario. Las narraciones cuyo texto usa un término cambiado quedan DESACTUALIZADAS (RN-02-4). */
  async reemplazarPronunciacion(u: UsuarioSesion, clienteId: string, terminos: PronunciacionTerminoDto[]): Promise<PronunciacionTerminoDto[]> {
    const organizacionId = await this.cliente(u, clienteId);
    const errores = erroresPronunciacion(terminos);
    if (errores.length) throw noValido(errores);
    const antes = await this.bd.pronunciacionTermino.findMany({ where: { clienteId } });
    const claveDe = (t: { idioma: string; escrito: string; pronunciado: string }) => `${t.idioma}\u0000${t.escrito}`;
    const cambiados = terminosCambiados(antes, terminos, claveDe, (t) => t.pronunciado).map((k) => {
      const [idioma, escrito] = k.split('\u0000') as [IdiomaVoz, string];
      return { idioma, escrito };
    });

    await this.bd.$transaction(async (tx) => {
      await tx.pronunciacionTermino.deleteMany({ where: { clienteId } });
      await tx.pronunciacionTermino.createMany({ data: terminos.map((t) => ({ clienteId, idioma: t.idioma, escrito: t.escrito, pronunciado: t.pronunciado })) });
      let ids: string[] = [];
      if (cambiados.length) {
        const cursos = await tx.curso.findMany({
          where: { organizacionId, proyecto: { clienteId } },
          select: {
            documento: true,
            narraciones: { where: { estado: { not: 'DESACTUALIZADA' }, idioma: { in: [...new Set(cambiados.map((c) => c.idioma))] } }, select: { id: true, pantallaId: true, idioma: true } },
          },
        });
        ids = cursos.flatMap((c) => {
          const textos = narracionesDe(c.documento);
          return c.narraciones.filter((n) => {
            const texto = textos.get(n.pantallaId)?.[n.idioma as IdiomaVoz];
            return texto !== undefined && cambiados.some((k) => k.idioma === n.idioma && contieneTermino(texto, k.escrito));
          }).map((n) => n.id);
        });
        if (ids.length) await tx.narracion.updateMany({ where: { id: { in: ids } }, data: { estado: 'DESACTUALIZADA' } });
      }
      await tx.auditoria.create({
        data: {
          organizacionId, usuarioId: u.id, accion: 'PRONUNCIACION_GUARDADA', entidad: 'Cliente', entidadId: clienteId,
          datos: { terminos: terminos.length, cambiados: cambiados.map((c) => `${c.idioma}:${c.escrito}`), narracionesDesactualizadas: ids.length },
        },
      });
    });
    return this.pronunciacion(u, clienteId);
  }

  private async cliente(u: UsuarioSesion, clienteId: string): Promise<string> {
    const organizacionId = organizacionDe(u);
    const c = await this.bd.cliente.findFirst({ where: { id: clienteId, organizacionId }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return organizacionId;
  }
}
