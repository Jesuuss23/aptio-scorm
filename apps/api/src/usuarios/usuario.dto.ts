import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Rol } from '@aptio/db';
import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** Roles que un administrador puede asignar dentro de su organización (SUPERADMIN no). */
export const ROLES_ORGANIZACION = [
  Rol.ADMINISTRADOR,
  Rol.DISENADOR_INSTRUCCIONAL,
  Rol.DISENADOR_GRAFICO,
  Rol.PRODUCTOR,
  Rol.REVISOR_CLIENTE,
] as const;
export type RolOrganizacion = (typeof ROLES_ORGANIZACION)[number];

export class UsuarioDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'email' }) email: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ enum: Rol }) rol: Rol;
  @ApiProperty({ format: 'uuid', nullable: true }) clienteId: string | null;
  @ApiProperty() activo: boolean;
  @ApiProperty({ enum: ['clave', 'google'], isArray: true }) metodos: ('clave' | 'google')[];
}

export class UsuarioEntradaDto {
  @ApiProperty({ format: 'email' }) @IsEmail() @MaxLength(254) email: string;
  @ApiProperty() @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @ApiProperty({ enum: ROLES_ORGANIZACION }) @IsEnum(ROLES_ORGANIZACION) rol: RolOrganizacion;
  @ApiPropertyOptional({ format: 'uuid', description: 'Obligatorio para REVISOR_CLIENTE' })
  @IsOptional()
  @IsUUID()
  clienteId?: string;
}

export class UsuarioCambioDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @MinLength(2) @MaxLength(120) nombre?: string;
  @ApiPropertyOptional({ enum: ROLES_ORGANIZACION }) @IsOptional() @IsEnum(ROLES_ORGANIZACION) rol?: RolOrganizacion;
  @ApiPropertyOptional({ format: 'uuid', nullable: true }) @IsOptional() @IsUUID() clienteId?: string;
  @ApiPropertyOptional({ description: 'false desactiva al usuario y cierra sus sesiones' })
  @IsOptional()
  @IsBoolean()
  activo?: boolean;
}

type UsuarioBd = {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  clienteId: string | null;
  activo: boolean;
  hashClave: string | null;
  googleSub: string | null;
};

/** Nunca expone el hash de la clave. */
export function aUsuarioDto(u: UsuarioBd): UsuarioDto {
  const metodos: ('clave' | 'google')[] = [];
  if (u.hashClave) metodos.push('clave');
  if (u.googleSub) metodos.push('google');
  return { id: u.id, email: u.email, nombre: u.nombre, rol: u.rol, clienteId: u.clienteId, activo: u.activo, metodos };
}
