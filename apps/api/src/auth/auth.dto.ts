import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';
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
