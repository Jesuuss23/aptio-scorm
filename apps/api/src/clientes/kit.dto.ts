import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';
import { ESTILOS_KIT, FAMILIAS_KIT, HEX } from '@aptio/schema/marca';

export const PROVEEDORES_VOZ = ['google', 'azure', 'elevenlabs'] as const;
const hex = { message: '$property debe ser un color #RRGGBB' };

export class PaletaDto {
  @ApiProperty({ example: '#12355B' }) @Matches(HEX, hex) primario: string;
  @ApiProperty({ example: '#2E7D6B' }) @Matches(HEX, hex) secundario: string;
  @ApiProperty({ example: '#F2A900' }) @Matches(HEX, hex) acento: string;
  @ApiProperty({ example: '#F5F7FA' }) @Matches(HEX, hex) fondo: string;
  @ApiProperty({ example: '#102033' }) @Matches(HEX, hex) texto: string;
}

export class TipografiasDto {
  @ApiProperty({ enum: FAMILIAS_KIT }) @IsIn(FAMILIAS_KIT) titulos: string;
  @ApiProperty({ enum: FAMILIAS_KIT }) @IsIn(FAMILIAS_KIT) textos: string;
}

export class VozDto {
  @ApiProperty({ enum: PROVEEDORES_VOZ, example: 'google' }) @IsIn(PROVEEDORES_VOZ) proveedor: string;
  @ApiProperty({ example: 'es-US-Neural2-A' }) @IsString() @MaxLength(80) voz: string;
  @ApiPropertyOptional({ minimum: 0.5, maximum: 2, default: 1 }) @IsOptional() @IsNumber() @Min(0.5) @Max(2) velocidad?: number;
}

export class VocesDto {
  @ApiPropertyOptional({ type: VozDto }) @IsOptional() @ValidateNested() @Type(() => VozDto) es?: VozDto;
  @ApiPropertyOptional({ type: VozDto }) @IsOptional() @ValidateNested() @Type(() => VozDto) en?: VozDto;
}

export class KitEntradaDto {
  @ApiProperty({ enum: ESTILOS_KIT }) @IsIn(ESTILOS_KIT) estilo: string;
  @ApiProperty({ type: PaletaDto }) @ValidateNested() @Type(() => PaletaDto) paleta: PaletaDto;
  @ApiProperty({ type: TipografiasDto }) @ValidateNested() @Type(() => TipografiasDto) tipografias: TipografiasDto;
  @ApiPropertyOptional({ format: 'uuid', nullable: true, description: 'Imagen PNG, JPEG o WebP subida para este cliente' })
  @IsOptional() @ValidateIf((_o, v) => v !== null) @IsUUID() logoRecursoId?: string | null;
  @ApiProperty({ type: VocesDto }) @ValidateNested() @Type(() => VocesDto) voces: VocesDto;
  @ApiProperty({ description: 'Versión leída (bloqueo optimista, RN-02-3). 0 para crear el kit.' }) @IsInt() @Min(0) version: number;
}

export class PersonajeEntradaDto {
  @ApiProperty({ format: 'uuid', description: 'SVG subido (y saneado) para este cliente' }) @IsUUID() recursoId: string;
  @ApiProperty({ example: 'Ana' }) @IsString() @MaxLength(60) nombre: string;
  @ApiProperty({ description: 'Versión leída del kit (RN-02-3)' }) @IsInt() @Min(1) version: number;
}

export class PersonajeDto {
  @ApiProperty({ format: 'uuid' }) recursoId: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ type: [String], example: ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'X'] }) bocasDisponibles: string[];
  @ApiProperty({ type: [String], example: ['G'] }) bocasFaltantes: string[];
  @ApiProperty({ example: { G: 'B' }, description: 'Boca que reemplaza a la que falta (RN-07-3)' }) reemplazos: Record<string, string>;
  @ApiProperty({ type: [String] }) poses: string[];
  @ApiProperty({ type: [String] }) avisos: string[];
  @ApiProperty({ type: [String], description: 'Lo que se quitó al sanear el SVG' }) eliminadosAlSanear: string[];
  @ApiPropertyOptional({ format: 'uri', description: 'URL firmada de 15 minutos del SVG saneado' }) url?: string;
}

export class ContrasteDto {
  @ApiProperty() textoFondo: number;
  @ApiProperty() cumpleAA: boolean;
}

export class AdvertenciaKitDto {
  @ApiProperty({ example: 'CONTRASTE_BAJO' }) codigo: string;
  @ApiProperty() mensaje: string;
  @ApiProperty({ type: [String] }) colores: string[];
  @ApiProperty() relacion: number;
}

export class KitDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) clienteId: string;
  @ApiProperty({ enum: ESTILOS_KIT }) estilo: string;
  @ApiProperty({ type: PaletaDto }) paleta: PaletaDto;
  @ApiProperty({ type: TipografiasDto }) tipografias: TipografiasDto;
  @ApiProperty({ format: 'uuid', nullable: true }) logoRecursoId: string | null;
  @ApiPropertyOptional({ format: 'uri', description: 'URL firmada de 15 minutos del logo' }) logoUrl?: string;
  @ApiProperty({ type: PersonajeDto, nullable: true }) personaje: PersonajeDto | null;
  @ApiProperty({ type: VocesDto }) voces: VocesDto;
  @ApiProperty() version: number;
  @ApiProperty() actualizadoEn: string;
  @ApiProperty({ type: ContrasteDto }) contraste: ContrasteDto;
  @ApiProperty({ type: [AdvertenciaKitDto], description: 'Avisos que no bloquean el guardado (RN-02-2)' }) advertencias: AdvertenciaKitDto[];
}
