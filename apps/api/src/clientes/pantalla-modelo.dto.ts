import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { DISPOSICIONES } from '@aptio/schema/marca';

export class PantallaModeloEntradaDto {
  @ApiProperty({ enum: DISPOSICIONES }) @IsIn(DISPOSICIONES) disposicion: string;
  @ApiProperty({ example: 'Idea + ilustración' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value)) @IsString() @MinLength(2) @MaxLength(80) nombre: string;
  @ApiProperty({ description: 'Fondo (rol del kit) y zonas en porcentaje del lienzo para celular y escritorio' }) @IsObject() definicion: Record<string, unknown>;
  @ApiPropertyOptional({ default: 0 }) @IsOptional() @IsInt() @Min(0) @Max(999) orden?: number;
  @ApiPropertyOptional({ default: true }) @IsOptional() @IsBoolean() activa?: boolean;
}

export class PantallaModeloDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: DISPOSICIONES }) disposicion: string;
  @ApiProperty() nombre: string;
  @ApiProperty() definicion: Record<string, unknown>;
  @ApiProperty({ format: 'uuid', nullable: true }) miniaturaRecursoId: string | null;
  @ApiProperty() orden: number;
  @ApiProperty() activa: boolean;
}
