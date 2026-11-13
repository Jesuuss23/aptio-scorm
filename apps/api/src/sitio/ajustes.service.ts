import { createHash } from 'node:crypto';
import { connect, type PeerCertificate } from 'node:tls';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { sanearSvg, SvgNoValido } from '@aptio/almacen';
import { ID_AJUSTES, Prisma } from '@aptio/db';
import {
  AJUSTES_POR_DEFECTO, type AjustesSitio, aplicarCambiosAjustes, type CambiosAjustes, esPng, LIMITES_AJUSTES, leerAjustes, type MimeMarca,
  nombreArchivoMarca, type TipoMarca,
} from '@aptio/schema/sitio-ajustes';
import { claveMarca } from '@aptio/sitio';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { CorreoService } from '../correo/correo.service.js';
import { AlmacenService } from '../recursos/almacen.service.js';
import type { AjustesSitioDto, ComprobacionDominioDto } from './ajustes.dto.js';

/** Cuánto se confía en el estado de mantenimiento leído antes de volver a la base (lo consulta cada `GET /s/*`). */
export const PLAZO_MANTENIMIENTO_MS = 5000;
const PLAZO_TLS_MS = 5000;

const CAMPOS_PUBLICADOS = ['dominio', 'nombre', 'whatsapp', 'mostrarSelectorIdioma'] as const;

/**
 * HU-1509 · Ajustes del sitio (REQ-073, PNT-38): una sola fila. Nombre, dominio, logo, favicon y WhatsApp salen al sitio
 * con «Publicar cambios» (entran en la instantánea); el mantenimiento y el correo de leads valen al instante.
 */
@Injectable()
export class AjustesService {
  private leidos: { valor: AjustesSitio; hasta: number } | null = null;
  /** Puerto de «Comprobar» (las pruebas lo cambian). */
  puertoTls = 443;

  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly almacen: AlmacenService,
    private readonly correo: CorreoService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private async fila(): Promise<{ ajustes: AjustesSitio; actualizadoEn: Date | null }> {
    const f = await this.bd.sitioAjustes.findUnique({ where: { id: ID_AJUSTES } });
    return { ajustes: f ? leerAjustes(f.datos) : structuredClone(AJUSTES_POR_DEFECTO), actualizadoEn: f?.actualizadoEn ?? null };
  }

  private async guardar(u: UsuarioSesion, ajustes: AjustesSitio): Promise<AjustesSitioDto> {
    const datos = ajustes as unknown as Prisma.InputJsonValue;
    const f = await this.bd.sitioAjustes.upsert({ where: { id: ID_AJUSTES }, create: { id: ID_AJUSTES, datos, actualizadoPorId: u.id }, update: { datos, actualizadoPorId: u.id } });
    this.leidos = null;
    return { ...ajustes, actualizadoEn: f.actualizadoEn.toISOString() };
  }

  private auditar(u: UsuarioSesion, accion: string, datos: Record<string, unknown>) {
    return this.bd.auditoria.create({ data: { usuarioId: u.id, organizacionId: null, accion, entidad: 'SitioAjustes', entidadId: null, datos: datos as Prisma.InputJsonValue } });
  }

  async ver(): Promise<AjustesSitioDto> {
    const { ajustes, actualizadoEn } = await this.fila();
    return { ...ajustes, actualizadoEn: actualizadoEn?.toISOString() ?? null };
  }

  async actualizar(u: UsuarioSesion, cambios: CambiosAjustes): Promise<AjustesSitioDto> {
    const claves = Object.keys(cambios).filter((k) => (cambios as Record<string, unknown>)[k] !== undefined);
    if (!claves.length) throw new UnprocessableEntityException({ codigo: 'SIN_CAMBIOS', mensaje: 'Indica al menos un ajuste' });
    const { ajustes: antes } = await this.fila();
    const r = aplicarCambiosAjustes(antes, cambios);
    if (!r.ok) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: r.errores.map((e) => e.mensaje).join('. '), detalles: r.errores });
    const dto = await this.guardar(u, r.ajustes);
    await this.auditar(u, 'SITIO_AJUSTES_ACTUALIZADOS', { campos: claves, publicar: claves.some((c) => (CAMPOS_PUBLICADOS as readonly string[]).includes(c)) });
    if (antes.mantenimiento.activo !== r.ajustes.mantenimiento.activo) {
      await this.auditar(u, r.ajustes.mantenimiento.activo ? 'SITIO_MANTENIMIENTO_ACTIVADO' : 'SITIO_MANTENIMIENTO_DESACTIVADO', { mensaje: r.ajustes.mantenimiento.mensaje });
    }
    return dto;
  }

  /** Logo o favicon: SVG saneado o PNG, hasta 200 KB. Se guarda con su hash en el nombre; sale al sitio al publicar. */
  async subirMarca(u: UsuarioSesion, tipo: TipoMarca, mime: string, cuerpo: unknown): Promise<AjustesSitioDto> {
    if (!(cuerpo instanceof Buffer) || cuerpo.length === 0) {
      throw new UnprocessableEntityException({ codigo: 'ARCHIVO_NO_VALIDO', mensaje: 'Envía el archivo como image/svg+xml o image/png' });
    }
    if (cuerpo.length > LIMITES_AJUSTES.marcaBytes) throw new UnprocessableEntityException({ codigo: 'DEMASIADO_GRANDE', mensaje: 'El archivo supera los 200 KB' });
    let contenido: Buffer;
    let tipoMime: MimeMarca;
    if (mime === 'image/png') {
      if (!esPng(cuerpo)) throw new UnprocessableEntityException({ codigo: 'ARCHIVO_NO_VALIDO', mensaje: 'El archivo no es un PNG' });
      contenido = cuerpo;
      tipoMime = 'image/png';
    } else if (mime === 'image/svg+xml') {
      try {
        contenido = Buffer.from(sanearSvg(cuerpo.toString('utf8')).svg, 'utf8');
      } catch (e) {
        if (e instanceof SvgNoValido) throw new UnprocessableEntityException({ codigo: 'ARCHIVO_NO_VALIDO', mensaje: e.message });
        throw e;
      }
      tipoMime = 'image/svg+xml';
    } else {
      throw new UnprocessableEntityException({ codigo: 'ARCHIVO_NO_VALIDO', mensaje: 'Solo se aceptan SVG o PNG' });
    }
    const archivo = nombreArchivoMarca(tipo, createHash('sha256').update(contenido).digest('hex'), tipoMime);
    await this.almacen.almacen.subir(claveMarca(archivo), contenido, tipoMime);
    const { ajustes } = await this.fila();
    ajustes[tipo] = { archivo, mime: tipoMime };
    const dto = await this.guardar(u, ajustes);
    await this.auditar(u, 'SITIO_AJUSTES_ACTUALIZADOS', { campos: [tipo], archivo, publicar: true });
    return dto;
  }

  async quitarMarca(u: UsuarioSesion, tipo: TipoMarca): Promise<AjustesSitioDto> {
    const { ajustes } = await this.fila();
    ajustes[tipo] = null;
    const dto = await this.guardar(u, ajustes);
    await this.auditar(u, 'SITIO_AJUSTES_ACTUALIZADOS', { campos: [tipo], publicar: true });
    return dto;
  }

  /** «Enviar correo de prueba» al correo de leads guardado. */
  async correoPrueba(u: UsuarioSesion): Promise<{ para: string }> {
    const { ajustes } = await this.fila();
    if (!ajustes.correoLeads) throw new UnprocessableEntityException({ codigo: 'SIN_CORREO_LEADS', mensaje: 'Guarda primero el correo que recibe los leads' });
    await this.correo.enviar({
      para: ajustes.correoLeads, asunto: `Prueba de correo de leads · ${ajustes.nombre}`,
      texto: `Este es un correo de prueba de los Ajustes del sitio. Los leads del sitio (formularios, chatbot y agenda) llegarán a esta dirección cuando estén activos.`,
    });
    await this.auditar(u, 'SITIO_CORREO_PRUEBA', { para: ajustes.correoLeads });
    return { para: ajustes.correoLeads };
  }

  /** «Comprobar»: se conecta por HTTPS al dominio y lee el certificado (válido para el dominio, emisor y vencimiento). */
  async comprobarDominio(): Promise<ComprobacionDominioDto> {
    const { ajustes } = await this.fila();
    const dominio = ajustes.dominio;
    if (!dominio) throw new UnprocessableEntityException({ codigo: 'SIN_DOMINIO', mensaje: 'Guarda primero el dominio' });
    return new Promise((resolver) => {
      const fin = (r: Omit<ComprobacionDominioDto, 'dominio'>) => { socket.destroy(); resolver({ dominio, ...r }); };
      const socket = connect({ host: dominio, port: this.puertoTls, servername: dominio, timeout: PLAZO_TLS_MS }, () => {
        const c: PeerCertificate = socket.getPeerCertificate();
        const venceEn = c?.valid_to ? new Date(c.valid_to).toISOString() : null;
        const emisor = (c?.issuer?.O as string | undefined) ?? (c?.issuer?.CN as string | undefined) ?? null;
        fin(socket.authorized
          ? { ok: true, venceEn, emisor, error: null }
          : { ok: false, venceEn, emisor, error: `El certificado no es válido: ${String(socket.authorizationError ?? 'desconocido')}` });
      });
      socket.on('timeout', () => fin({ ok: false, venceEn: null, emisor: null, error: 'El dominio no respondió por HTTPS a tiempo' }));
      socket.on('error', (e: NodeJS.ErrnoException) => fin({
        ok: false, venceEn: null, emisor: null,
        error: e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN' ? 'El dominio no existe o su DNS aún no apunta al sitio' : `No se pudo conectar por HTTPS: ${e.code ?? e.message}`,
      }));
    });
  }

  /** CP-121 · Los ajustes para `GET /s/*` (mantenimiento y marca del aviso), leídos de la base como mucho cada 5 s. */
  async paraSitio(): Promise<AjustesSitio> {
    const ahora = Date.now();
    if (!this.leidos || this.leidos.hasta < ahora) this.leidos = { valor: (await this.fila()).ajustes, hasta: ahora + PLAZO_MANTENIMIENTO_MS };
    return this.leidos.valor;
  }

  /** Para las pruebas: olvidar el estado leído. */
  olvidar(): void {
    this.leidos = null;
  }
}
