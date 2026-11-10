import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export const IDIOMAS = ['es', 'en'] as const;
const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ClienteDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ nullable: true, example: 'Moodle 4.5' }) lmsHabitual: string | null;
  @ApiProperty({ enum: IDIOMAS, isArray: true }) idiomas: string[];
  @ApiProperty({ nullable: true }) notas: string | null;
  @ApiProperty({ description: 'Días tras la entrega para borrar los documentos fuente (ADR-009)' }) retencionDocumentosDias: number;
  @ApiProperty() tieneKit: boolean;
  @ApiProperty() creadoEn: string;
}

export class ClienteEntradaDto {
  @ApiProperty({ minLength: 2 }) @Transform(recortar) @IsString() @MinLength(2) @MaxLength(120) nombre: string;
  @ApiPropertyOptional({ description: 'Texto libre: Moodle 4.5, Blackboard, Canvas, Chamilo u otro' })
  @IsOptional() @Transform(recortar) @IsString() @MaxLength(80) lmsHabitual?: string;
  @ApiPropertyOptional({ enum: IDIOMAS, isArray: true, default: ['es'] })
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(IDIOMAS, { each: true }) idiomas?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notas?: string;
  @ApiPropertyOptional({ default: 180, minimum: 1, maximum: 3650 })
  @IsOptional() @IsInt() @Min(1) @Max(3650) retencionDocumentosDias?: number;
}

/** PATCH: todos los campos son opcionales. */
export class ClienteCambioDto {
  @ApiPropertyOptional({ minLength: 2 }) @IsOptional() @Transform(recortar) @IsString() @MinLength(2) @MaxLength(120) nombre?: string;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @Transform(recortar) @IsString() @MaxLength(80) lmsHabitual?: string;
  @ApiPropertyOptional({ enum: IDIOMAS, isArray: true })
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(IDIOMAS, { each: true }) idiomas?: string[];
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notas?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 3650 }) @IsOptional() @IsInt() @Min(1) @Max(3650) retencionDocumentosDias?: number;
}
