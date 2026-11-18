import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { UsuarioDto } from '../usuarios/usuario.dto.js';

export class IngresoDto {
  @ApiProperty({ format: 'email' }) @IsEmail() email: string;
  @ApiProperty() @IsString() @MaxLength(200) clave: string;
}

export class SolicitudClaveDto {
  @ApiProperty({ format: 'email' }) @IsEmail() email: string;
}

export class NuevaClaveDto {
  @ApiProperty({ description: 'Token del enlace (un solo uso, 60 minutos)' }) @IsString() @MaxLength(200) token: string;
  @ApiProperty({ minLength: 10 }) @IsString() @MinLength(10) @MaxLength(200) clave: string;
}

export class SesionDto {
  @ApiProperty({ type: UsuarioDto }) usuario: UsuarioDto;
  @ApiProperty({ format: 'date-time' }) expira: string;
}

/** HU-1515 · Respuesta de `auth/ingresar` para el superadmin: no hay sesión hasta pasar el segundo factor. */
export class DesafioDto {
  @ApiProperty({ enum: ['verificar', 'configurar'], description: '`configurar` la primera vez; luego `verificar`' })
  segundoFactor: 'verificar' | 'configurar';
  @ApiProperty({ format: 'date-time', description: 'Vence el paso del segundo factor (5 minutos)' }) expira: string;
}

export class EstadoSegundoFactorDto {
  @ApiProperty({ enum: ['verificar', 'configurar'] }) segundoFactor: 'verificar' | 'configurar';
  @ApiProperty({ format: 'email' }) email: string;
}

export class ConfiguracionSegundoFactorDto {
  @ApiProperty({ description: 'Secreto en base32, para escribirlo a mano si no se puede escanear' }) secreto: string;
  @ApiProperty({ description: 'URI otpauth:// que contiene el código QR' }) uri: string;
  @ApiProperty({ description: 'Código QR en SVG' }) qrSvg: string;
}

export class CodigoTotpDto {
  @ApiProperty({ pattern: '^\\d{6}$', example: '123456' }) @IsString() @Matches(/^\s*\d{3}\s?\d{3}\s*$/) codigo: string;
}

export class VerificacionSegundoFactorDto {
  @ApiPropertyOptional({ pattern: '^\\d{6}$', description: 'Código de 6 dígitos de la aplicación' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  codigo?: string;
  @ApiPropertyOptional({ example: 'ABCDE-FGHJK', description: 'Uno de los 10 códigos de recuperación (un solo uso)' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoRecuperacion?: string;
}

export class SesionConCodigosDto extends SesionDto {
  @ApiProperty({ type: [String], description: 'Se muestran una sola vez: guárdalos fuera del sistema' }) codigosRecuperacion: string[];
}

export class SesionRecuperacionDto extends SesionDto {
  @ApiPropertyOptional({ description: 'Códigos de recuperación sin usar, cuando se ingresó con uno' }) codigosRestantes?: number;
}
