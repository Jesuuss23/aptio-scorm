import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, ValidateIf, ValidateNested } from 'class-validator';

const opcional = (_o: object, v: unknown) => v !== null && v !== undefined;

class ArchivoMarcaDto {
  @ApiProperty({ example: 'logo-1a2b3c4d.svg', description: 'Se sirve en /s/_marca/{archivo}' }) archivo: string;
  @ApiProperty({ enum: ['image/svg+xml', 'image/png'] }) mime: string;
}

class AnaliticaDto {
  @ApiProperty({ type: String, nullable: true, example: 'G-AB12CD34EF' }) ga4: string | null;
  @ApiProperty({ type: String, nullable: true, example: 'GTM-AB12CD3' }) gtm: string | null;
  @ApiProperty({ type: String, nullable: true, example: '123456789012345' }) metaPixel: string | null;
}

class WhatsappDto {
  @ApiProperty() visible: boolean;
  @ApiProperty({ type: String, nullable: true, example: '+51987654321' }) numero: string | null;
  @ApiProperty({ type: String, nullable: true }) mensaje: string | null;
}

class MantenimientoDto {
  @ApiProperty() activo: boolean;
  @ApiProperty({ type: String, nullable: true }) mensaje: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) desde: string | null;
}

/** HU-1509 · Ajustes del sitio (REQ-073, PNT-38). */
export class AjustesSitioDto {
  @ApiProperty({ type: String, nullable: true, example: 'aptioscorm.com', description: 'Sin protocolo; null = SITIO_URL' }) dominio: string | null;
  @ApiProperty({ example: 'Aptio SCORM' }) nombre: string;
  @ApiProperty({ type: ArchivoMarcaDto, nullable: true }) logo: ArchivoMarcaDto | null;
  @ApiProperty({ type: ArchivoMarcaDto, nullable: true }) favicon: ArchivoMarcaDto | null;
  @ApiProperty({ type: AnaliticaDto, description: 'Se guardan; se activan con el banner de cookies (SUP-200)' }) analitica: AnaliticaDto;
  @ApiProperty({ type: WhatsappDto }) whatsapp: WhatsappDto;
  @ApiProperty({ type: String, nullable: true }) correoLeads: string | null;
  @ApiProperty({ type: MantenimientoDto, description: 'Vale al instante, sin publicar (CP-121)' }) mantenimiento: MantenimientoDto;
  @ApiProperty({ default: true, description: 'HU-1510 · El sitio muestra el selector ES · EN; sale al sitio con «Publicar cambios»' }) mostrarSelectorIdioma: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true, description: 'null si nunca se guardaron' }) actualizadoEn: string | null;
}

class AnaliticaCambioDto {
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() ga4?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() gtm?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() metaPixel?: string | null;
}

class WhatsappCambioDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() numero?: string | null;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() mensaje?: string | null;
}

class MantenimientoCambioDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() activo?: boolean;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() mensaje?: string | null;
}

export class AjustesSitioCambioDto {
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() dominio?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional({ type: AnaliticaCambioDto }) @IsOptional() @ValidateNested() @Type(() => AnaliticaCambioDto) analitica?: AnaliticaCambioDto;
  @ApiPropertyOptional({ type: WhatsappCambioDto }) @IsOptional() @ValidateNested() @Type(() => WhatsappCambioDto) whatsapp?: WhatsappCambioDto;
  @ApiPropertyOptional({ type: String, nullable: true }) @IsOptional() @ValidateIf(opcional) @IsString() correoLeads?: string | null;
  @ApiPropertyOptional({ type: MantenimientoCambioDto }) @IsOptional() @ValidateNested() @Type(() => MantenimientoCambioDto) mantenimiento?: MantenimientoCambioDto;
  @ApiPropertyOptional({ description: 'HU-1510 · Mostrar el selector ES · EN en la cabecera y el menú de celular' }) @IsOptional() @IsBoolean() mostrarSelectorIdioma?: boolean;
}

/** HU-1509 · Resultado de «Comprobar» el dominio: el certificado que presenta por HTTPS. */
export class ComprobacionDominioDto {
  @ApiProperty() dominio: string;
  @ApiProperty({ description: 'true si respondió por HTTPS con un certificado válido para el dominio' }) ok: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) venceEn: string | null;
  @ApiProperty({ type: String, nullable: true, example: "Let's Encrypt" }) emisor: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Con ok=false: el motivo' }) error: string | null;
}
