import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** Un archivo ya subido (recursoId) o solo el tema, si el cliente no tiene material. */
export class MaterialEntradaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Documento subido para este proyecto con origen CLIENTE' }) @IsOptional() @IsUUID() recursoId?: string;
  @ApiPropertyOptional({ example: 'Uso correcto de extintores para personal de oficina' })
  @IsOptional() @Transform(recortar) @IsString() @MinLength(3) @MaxLength(500) tema?: string;
}

class PaginaDto {
  @ApiProperty() n: number;
  @ApiProperty() texto: string;
  @ApiProperty({ description: 'El texto salió del OCR' }) escaneada: boolean;
  @ApiPropertyOptional({ description: 'El texto parece dar órdenes a la IA: se trata como dato y se avisa (HU-1402)' }) posibleInstruccion?: boolean;
}

class SegmentoDto {
  @ApiProperty({ description: 'Segundo de inicio (con un decimal)' }) desde: number;
  @ApiProperty({ description: 'Segundo de fin (con un decimal)' }) hasta: number;
  @ApiProperty() texto: string;
  @ApiPropertyOptional({ description: 'El texto parece dar órdenes a la IA: se trata como dato y se avisa (HU-1402)' }) posibleInstruccion?: boolean;
}

export class MaterialDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['PDF', 'WORD', 'POWERPOINT', 'VIDEO', 'AUDIO', 'IMAGEN', 'TEMA'] }) tipo: string;
  @ApiProperty({ format: 'uuid', nullable: true }) recursoId: string | null;
  @ApiProperty({ nullable: true }) nombre: string | null;
  @ApiProperty({ nullable: true }) tema: string | null;
  @ApiProperty({ enum: ['pendiente', 'procesando', 'listo', 'error'] }) estado: string;
  @ApiProperty({ nullable: true }) error: string | null;
  @ApiProperty({ type: [PaginaDto] }) paginas: PaginaDto[];
  @ApiProperty({ type: [SegmentoDto], description: 'Video o audio: transcripción con marcas de tiempo (HU-0305)' }) transcripcion: SegmentoDto[];
  @ApiProperty({ nullable: true, description: 'Video o audio: duración en segundos' }) duracionS: number | null;
  @ApiProperty() creadoEn: string;
}
