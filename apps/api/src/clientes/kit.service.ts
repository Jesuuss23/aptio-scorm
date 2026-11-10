import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { KitMarca, Prisma } from '@aptio/db';
import { type Paleta, revisarPaleta, revisarPersonaje } from '@aptio/schema/marca';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import type { KitDto, KitEntradaDto, PersonajeDto, PersonajeEntradaDto } from './kit.dto.js';

/** Kit de marca del cliente (HU-0202). Cambiar la paleta no regenera contenido: el reproductor la aplica al mostrar (RN-02-1). */
@Injectable()
export class KitService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacenes: AlmacenService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async ver(u: UsuarioSesion, clienteId: string): Promise<KitDto> {
    await this.cliente(u, clienteId);
    const kit = await this.bd.kitMarca.findUnique({ where: { clienteId } });
    if (!kit) throw new NotFoundException({ codigo: 'SIN_KIT', mensaje: 'El cliente todavía no tiene kit' });
    return this.aDto(kit);
  }

  async guardar(u: UsuarioSesion, clienteId: string, dto: KitEntradaDto): Promise<KitDto> {
    const organizacionId = await this.cliente(u, clienteId);
    if (dto.logoRecursoId) await this.logoValido(organizacionId, clienteId, dto.logoRecursoId);
    const datos = {
      estilo: dto.estilo,
      paleta: { ...dto.paleta } as Prisma.InputJsonValue,
      tipografias: { ...dto.tipografias } as Prisma.InputJsonValue,
      logoRecursoId: dto.logoRecursoId ?? null,
      voces: JSON.parse(JSON.stringify(dto.voces)) as Prisma.InputJsonValue,
    };

    const actual = await this.bd.kitMarca.findUnique({ where: { clienteId }, select: { version: true } });
    let kit: KitMarca;
    if (!actual) {
      if (dto.version !== 0) throw this.conflicto(0);
      try {
        kit = await this.bd.kitMarca.create({ data: { clienteId, ...datos } });
      } catch (e) {
        // Otra persona creó el kit al mismo tiempo.
        if ((e as { code?: string }).code === 'P2002') throw this.conflicto(1);
        throw e;
      }
    } else {
      // Bloqueo optimista (RN-02-3, CP-022): solo guarda si nadie cambió el kit desde que se leyó.
      const { count } = await this.bd.kitMarca.updateMany({
        where: { clienteId, version: dto.version },
        data: { ...datos, version: { increment: 1 } },
      });
      if (count === 0) throw this.conflicto(actual.version);
      kit = await this.bd.kitMarca.findUniqueOrThrow({ where: { clienteId } });
    }
    const resultado = await this.aDto(kit);
    await this.bd.auditoria.create({
      data: {
        organizacionId, usuarioId: u.id, accion: 'KIT_GUARDADO', entidad: 'KitMarca', entidadId: kit.id,
        datos: { clienteId, version: kit.version, advertencias: resultado.advertencias.map((a) => a.codigo) },
      },
    });
    return resultado;
  }

  /**
   * Personaje del kit (HU-0203): revisa las capas del SVG ya saneado y guarda qué bocas tiene, cuáles faltan
   * y con cuál se reemplazan (CP-023). Sin las capas obligatorias no se puede usar.
   */
  async guardarPersonaje(u: UsuarioSesion, clienteId: string, dto: PersonajeEntradaDto): Promise<KitDto> {
    const organizacionId = await this.cliente(u, clienteId);
    const actual = await this.bd.kitMarca.findUnique({ where: { clienteId }, select: { version: true } });
    if (!actual) throw new NotFoundException({ codigo: 'SIN_KIT', mensaje: 'Crea el kit antes de subir el personaje' });
    const recurso = await this.bd.recurso.findFirst({ where: { id: dto.recursoId, organizacionId, clienteId } });
    const svg = (recurso?.metadatos as { svg?: { ids: string[]; viewBox: string | null; eliminados: string[] } } | null)?.svg;
    if (!recurso || recurso.tipo !== 'SVG' || !svg) {
      throw new UnprocessableEntityException({ codigo: 'PERSONAJE_NO_VALIDO', mensaje: 'El personaje debe ser un SVG subido para este cliente' });
    }
    const revision = revisarPersonaje({ ids: svg.ids, viewBox: svg.viewBox, bytes: Number(recurso.bytes) });
    if (revision.errores.length) {
      throw new UnprocessableEntityException({
        codigo: 'PERSONAJE_INCOMPLETO',
        mensaje: 'Al personaje le faltan capas obligatorias. Revísalo con docs/diseno/personaje/validar-personaje.mjs',
        detalles: revision.errores.map((error) => ({ error })),
      });
    }
    const personaje: Omit<PersonajeDto, 'url'> = {
      recursoId: recurso.id,
      nombre: dto.nombre.trim() || 'Personaje',
      bocasDisponibles: revision.bocasDisponibles,
      bocasFaltantes: revision.bocasFaltantes,
      reemplazos: revision.reemplazos as Record<string, string>,
      poses: revision.poses,
      avisos: revision.avisos,
      eliminadosAlSanear: svg.eliminados,
    };
    const { count } = await this.bd.kitMarca.updateMany({
      where: { clienteId, version: dto.version },
      data: { personaje: personaje as unknown as Prisma.InputJsonValue, version: { increment: 1 } },
    });
    if (count === 0) throw this.conflicto(actual.version);
    const kit = await this.bd.kitMarca.findUniqueOrThrow({ where: { clienteId } });
    await this.bd.auditoria.create({
      data: {
        organizacionId, usuarioId: u.id, accion: 'PERSONAJE_GUARDADO', entidad: 'KitMarca', entidadId: kit.id,
        datos: { clienteId, recursoId: recurso.id, bocasFaltantes: revision.bocasFaltantes, eliminadosAlSanear: svg.eliminados },
      },
    });
    return this.aDto(kit);
  }

  private conflicto(versionActual: number) {
    return new ConflictException({
      codigo: 'KIT_DESACTUALIZADO',
      mensaje: 'Otra persona guardó el kit mientras lo editabas. Recarga para ver sus cambios.',
      detalles: [{ versionActual }],
    });
  }

  /** Organización del cliente; 404 si es de otra organización. */
  private async cliente(u: UsuarioSesion, clienteId: string): Promise<string> {
    const organizacionId = organizacionDe(u);
    const c = await this.bd.cliente.findFirst({ where: { id: clienteId, organizacionId }, select: { id: true } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return organizacionId;
  }

  private async logoValido(organizacionId: string, clienteId: string, recursoId: string): Promise<void> {
    const r = await this.bd.recurso.findFirst({ where: { id: recursoId, organizacionId, clienteId }, select: { tipo: true } });
    if (!r || r.tipo !== 'IMAGEN') {
      throw new UnprocessableEntityException({ codigo: 'LOGO_NO_VALIDO', mensaje: 'El logo debe ser una imagen subida para este cliente' });
    }
  }

  private async personajeDto(p: Omit<PersonajeDto, 'url'> | null): Promise<PersonajeDto | null> {
    if (!p?.recursoId) return null;
    const svg = await this.bd.recurso.findUnique({ where: { id: p.recursoId }, select: { claveS3: true, nombre: true } });
    return svg ? { ...p, url: await this.almacenes.almacen.urlDescarga(svg.claveS3, svg.nombre) } : p;
  }

  private async aDto(k: KitMarca): Promise<KitDto> {
    const paleta = k.paleta as unknown as Paleta;
    const { textoFondo, cumpleAA, advertencias } = revisarPaleta(paleta);
    let logoUrl: string | undefined;
    if (k.logoRecursoId) {
      const logo = await this.bd.recurso.findUnique({ where: { id: k.logoRecursoId }, select: { claveS3: true, nombre: true } });
      if (logo) logoUrl = await this.almacenes.almacen.urlDescarga(logo.claveS3, logo.nombre);
    }
    return {
      id: k.id,
      clienteId: k.clienteId,
      estilo: k.estilo,
      paleta,
      tipografias: k.tipografias as unknown as KitDto['tipografias'],
      logoRecursoId: k.logoRecursoId,
      ...(logoUrl ? { logoUrl } : {}),
      personaje: await this.personajeDto(k.personaje as Omit<PersonajeDto, 'url'> | null),
      voces: k.voces as unknown as KitDto['voces'],
      version: k.version,
      actualizadoEn: k.actualizadoEn.toISOString(),
      contraste: { textoFondo, cumpleAA },
      advertencias,
    };
  }
}
