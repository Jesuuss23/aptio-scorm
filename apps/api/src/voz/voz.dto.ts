import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { IDIOMAS_VOZ } from '@aptio/schema/voz';

export class MuestraVozDto {
  @ApiProperty({ maxLength: 600, example: 'Aplica el LOTO antes de abrir el tablero.' }) @IsString() @MinLength(1) @MaxLength(600) texto: string;
  @ApiProperty({ enum: IDIOMAS_VOZ }) @IsIn(IDIOMAS_VOZ) idioma: 'es' | 'en';
  @ApiPropertyOptional({ format: 'uuid', description: 'Toma la voz del kit y el diccionario de pronunciación de este cliente' })
  @IsOptional() @IsUUID() clienteId?: string;
  @ApiPropertyOptional({ example: 'es-US-Neural2-A' }) @IsOptional() @IsString() @Matches(/^[A-Za-z0-9-]{3,60}$/) voz?: string;
  @ApiPropertyOptional({ minimum: 0.5, maximum: 2 }) @IsOptional() @IsNumber() @Min(0.5) @Max(2) velocidad?: number;
}

export class MuestraVozResultadoDto {
  @ApiProperty({ description: 'Audio como data URI: la muestra no se guarda en el curso' }) audioUrl: string;
  @ApiProperty({ type: 'array', items: {}, description: 'Marcas de boca; vacío hasta M07 (S4)' }) bocas: unknown[];
  @ApiProperty({ description: 'SSML enviado a la voz' }) ssml: string;
  @ApiProperty({ example: 'Aplica el lo-to antes de abrir el tablero.', description: 'Lo que dirá la voz' }) dicho: string;
  @ApiProperty({ type: [String], description: 'Términos del diccionario que se aplicaron' }) aplicados: string[];
  @ApiProperty({ example: 'google' }) proveedor: string;
  @ApiProperty({ example: 'es-US-Neural2-A' }) voz: string;
  @ApiProperty({ description: 'true con PROVEEDORES_MODO=simulado: silencio en lugar de voz' }) simulada: boolean;
}
