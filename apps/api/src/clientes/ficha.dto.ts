// HU-1204 · Ficha de compatibilidad del LMS de un cliente (docs/08-entregas-y-lms.md): qué LMS usa, su límite de subida
// (lo usa la validación de la HU-1201) y, si se pegó, el informe del modo diagnóstico del paquete.
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class FichaCompatibilidadDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Moodle' }) lmsNombre: string;
  @ApiProperty({ nullable: true, example: '4.5' }) lmsVersion: string | null;
  @ApiProperty({ nullable: true, description: 'Límite de subida en MB; la validación antes de exportar lo usa (HU-1201)' }) limiteSubidaMb: number | null;
  @ApiProperty({ nullable: true }) notas: string | null;
  @ApiProperty({ nullable: true, type: 'object', additionalProperties: true, description: 'Informe del modo diagnóstico del paquete (HU-1204)' }) resultadoDiagnostico: Record<string, unknown> | null;
  @ApiProperty() actualizadoEn: string;
}

export class FichaCompatibilidadEntradaDto {
  @ApiProperty({ minLength: 2, example: 'Moodle' }) @Transform(recortar) @IsString() @MinLength(2) @MaxLength(80) lmsNombre: string;
  @ApiPropertyOptional({ example: '4.5' }) @IsOptional() @Transform(recortar) @IsString() @MaxLength(40) lmsVersion?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100000 }) @IsOptional() @IsInt() @Min(1) @Max(100_000) limiteSubidaMb?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(2000) notas?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: true, description: 'El JSON que copia «Copiar informe» en el modo diagnóstico; debe ser un objeto' })
  @IsOptional() @IsObject() resultadoDiagnostico?: Record<string, unknown>;
}
