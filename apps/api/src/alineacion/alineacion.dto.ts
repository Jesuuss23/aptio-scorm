import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { NIVELES_BLOOM } from '@aptio/schema/alineacion';

const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

/** HU-1001 · Una pantalla o pregunta en la matriz, con su rol y su nivel de Bloom. */
export class ElementoAlineacionDto {
  @ApiProperty() pantallaId: string;
  @ApiProperty({ description: 'Número de la pantalla en el curso (1 = la primera)' }) numero: number;
  @ApiProperty() titulo: string;
  @ApiPropertyOptional({ description: 'Solo en una actividad sumativa: cada pregunta cuenta con su objetivo' }) preguntaId?: string;
  @ApiProperty({ enum: ['P', 'A', 'E'], description: 'P presenta (contenido y video), A practica (formativa), E evalúa (sumativa)' }) rol: string;
  @ApiProperty({ enum: NIVELES_BLOOM }) nivelBloom: string;
  @ApiProperty({ description: 'El nivel está escrito; si no, sale de la disposición' }) nivelEscrito: boolean;
  @ApiProperty({ type: [String] }) objetivoIds: string[];
}

export class ObjetivoAlineacionDto {
  @ApiProperty() id: string;
  @ApiProperty() texto: string;
  @ApiProperty({ enum: NIVELES_BLOOM }) nivelBloom: string;
  @ApiProperty({ type: [ElementoAlineacionDto] }) presenta: ElementoAlineacionDto[];
  @ApiProperty({ type: [ElementoAlineacionDto] }) practica: ElementoAlineacionDto[];
  @ApiProperty({ type: [ElementoAlineacionDto] }) evalua: ElementoAlineacionDto[];
  @ApiProperty({ type: [String], description: 'RN-10-2; no bloquean la entrega' }) alertas: string[];
}

export class EquilibrioDto {
  @ApiProperty() presenta: number;
  @ApiProperty() practica: number;
  @ApiProperty() evalua: number;
}

export class IndicadoresAlineacionDto {
  @ApiProperty() objetivosAlineados: number;
  @ApiProperty({ description: 'Pantallas o preguntas que cuentan pero no tienen objetivo' }) elementosSinObjetivo: number;
  @ApiProperty({ type: EquilibrioDto }) equilibrio: EquilibrioDto;
}

export class AlineacionInformeDto {
  @ApiProperty({ description: 'Versión del curso con la que se calculó (para el PATCH)' }) version: number;
  @ApiProperty({ type: [ObjetivoAlineacionDto] }) objetivos: ObjetivoAlineacionDto[];
  @ApiProperty() totalAlertas: number;
  @ApiProperty({ type: IndicadoresAlineacionDto }) indicadores: IndicadoresAlineacionDto;
}

export class NivelObjetivoDto {
  @ApiProperty() @IsString() @Matches(ID) id: string;
  @ApiProperty({ enum: NIVELES_BLOOM }) @IsIn(NIVELES_BLOOM) nivelBloom: string;
}

export class NivelElementoDto {
  @ApiProperty() @IsString() @Matches(ID) pantallaId: string;
  @ApiPropertyOptional({ description: 'Para una pregunta de una actividad sumativa' }) @IsOptional() @IsString() @Matches(ID) preguntaId?: string;
  @ApiProperty({ enum: NIVELES_BLOOM }) @IsIn(NIVELES_BLOOM) nivelBloom: string;
}

/** Cambiar el nivel de Bloom de objetivos, pantallas o preguntas; crea una versión con motivo «alineación». */
export class AlineacionCambioDto {
  @ApiProperty({ description: 'Versión del curso leída (bloqueo optimista)' }) @IsInt() @Min(1) version: number;
  @ApiPropertyOptional({ type: [NivelObjetivoDto] }) @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => NivelObjetivoDto) objetivos?: NivelObjetivoDto[];
  @ApiPropertyOptional({ type: [NivelElementoDto] }) @IsOptional() @IsArray() @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => NivelElementoDto) elementos?: NivelElementoDto[];
}
