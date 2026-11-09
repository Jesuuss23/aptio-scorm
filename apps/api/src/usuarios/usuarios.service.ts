import {
  UnprocessableEntityException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Rol } from '@aptio/db';
import { AuthService } from '../auth/auth.service.js';
import { TokensService } from '../auth/tokens.service.js';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { UsuarioSesion } from '../comun/roles.js';
import { CorreoService } from '../correo/correo.service.js';
import { aUsuarioDto, type UsuarioCambioDto, type UsuarioDto, type UsuarioEntradaDto } from './usuario.dto.js';

/** Usuarios de la organización del administrador (M01). Nunca cruza organizaciones. */
@Injectable()
export class UsuariosService {
  constructor(
    private readonly baseDatos: BaseDatosService,
    private readonly tokens: TokensService,
    private readonly correo: CorreoService,
    private readonly auth: AuthService,
  ) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private organizacion(admin: UsuarioSesion): string {
    if (!admin.organizacionId) throw new ForbiddenException('Tu usuario no pertenece a una organización');
    return admin.organizacionId;
  }

  async listar(admin: UsuarioSesion): Promise<UsuarioDto[]> {
    const usuarios = await this.bd.usuario.findMany({
      where: { organizacionId: this.organizacion(admin) },
      orderBy: { nombre: 'asc' },
    });
    return usuarios.map(aUsuarioDto);
  }

  /** Crea el usuario sin clave y le envía la invitación: enlace de un solo uso por 60 minutos (CP-010). */
  async invitar(admin: UsuarioSesion, dto: UsuarioEntradaDto): Promise<UsuarioDto> {
    const organizacionId = this.organizacion(admin);
    const clienteId = await this.clienteValido(organizacionId, dto.rol, dto.clienteId ?? null);
    const email = dto.email.trim().toLowerCase();
    let u;
    try {
      u = await this.bd.usuario.create({
        data: { email, nombre: dto.nombre.trim(), rol: dto.rol, clienteId, organizacionId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException({ codigo: 'CORREO_EN_USO', mensaje: 'Ya existe un usuario con ese correo' });
      }
      throw e;
    }
    const token = await this.tokens.crear(u.id, 'INVITACION');
    await this.correo.enviar({
      para: u.email,
      asunto: 'Te invitaron a Aptio SCORM',
      texto: `Hola ${u.nombre}:\n\nTe invitaron a Aptio SCORM. Crea tu clave con este enlace (vale 60 minutos y un solo uso):\n${this.auth.enlace(token)}`,
    });
    await this.auth.auditar(admin.id, organizacionId, 'USUARIO_INVITADO', { usuarioId: u.id, rol: u.rol });
    return aUsuarioDto(u);
  }

  async actualizar(admin: UsuarioSesion, id: string, dto: UsuarioCambioDto): Promise<UsuarioDto> {
    const organizacionId = this.organizacion(admin);
    const actual = await this.bd.usuario.findFirst({ where: { id, organizacionId } });
    if (!actual) throw new NotFoundException('Usuario no encontrado');
    if (id === admin.id && (dto.activo === false || (dto.rol && dto.rol !== Rol.ADMINISTRADOR))) {
      throw new UnprocessableEntityException('No puedes desactivarte ni quitarte el rol de administrador');
    }
    const rol = dto.rol ?? actual.rol;
    const clienteId = await this.clienteValido(
      organizacionId,
      rol,
      dto.clienteId !== undefined ? dto.clienteId : rol === Rol.REVISOR_CLIENTE ? actual.clienteId : null,
    );
    const cierraSesiones = dto.activo === false || rol !== actual.rol;
    const u = await this.bd.usuario.update({
      where: { id },
      data: {
        ...(dto.nombre !== undefined ? { nombre: dto.nombre.trim() } : {}),
        rol,
        clienteId,
        ...(dto.activo !== undefined ? { activo: dto.activo } : {}),
        ...(cierraSesiones ? { versionSesion: { increment: 1 } } : {}),
      },
    });
    await this.auth.auditar(admin.id, organizacionId, 'USUARIO_ACTUALIZADO', { usuarioId: id, cambios: { ...dto } });
    return aUsuarioDto(u);
  }

  /** RN-01-3: el revisor del cliente queda ligado a un cliente de la misma organización; los demás roles a ninguno. */
  private async clienteValido(organizacionId: string, rol: Rol, clienteId: string | null): Promise<string | null> {
    if (rol !== Rol.REVISOR_CLIENTE) return null;
    if (!clienteId) throw new UnprocessableEntityException('El revisor del cliente necesita un cliente');
    const cliente = await this.bd.cliente.findFirst({ where: { id: clienteId, organizacionId } });
    if (!cliente) throw new UnprocessableEntityException('El cliente no existe en tu organización');
    return clienteId;
  }
}
