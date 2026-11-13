import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf, ValidateNested } from 'class-validator';
import { CLAVES_ETAPA, ESCENARIOS } from '@aptio/schema/rentabilidad';

const HORAS_MAX = 9999.99;
const MONTO_MAX = 10_000_000;

export class HorasEtapaDto {
  @ApiProperty({ enum: CLAVES_ETAPA }) @IsIn(CLAVES_ETAPA) etapa: string;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) @Max(HORAS_MAX) horasHoy: number;
  @ApiProperty({ minimum: 0 }) @IsNumber() @Min(0) @Max(HORAS_MAX) horasGenerador: number;
}

/** HU-1303 · Datos del negocio (montos en soles salvo `iaPorScormUsd`). */
export class ParametrosNegocioDto {
  @ApiProperty({ description: 'Tu precio hoy (S/)' }) @IsNumber() @Min(0) @Max(MONTO_MAX) precioHoy: number;
  @ApiProperty({ description: 'Precio de la competencia (S/)' }) @IsNumber() @Min(0) @Max(MONTO_MAX) precioCompetencia: number;
  @ApiProperty({ description: 'Tu nuevo precio (S/)' }) @IsNumber() @Min(0) @Max(MONTO_MAX) precioNuevo: number;
  @ApiProperty({ minimum: 1 }) @IsInt() @Min(1) @Max(1000) personas: number;
  @ApiProperty({ minimum: 0.5, maximum: 24 }) @IsNumber() @Min(0.5) @Max(24) horasProductivasDia: number;
  @ApiProperty({ description: 'Costo hora del equipo (S/)' }) @IsNumber() @Min(0) @Max(MONTO_MAX) tarifaHora: number;
  @ApiProperty({ description: 'Soles por dólar', exclusiveMinimum: true, minimum: 0 }) @IsNumber() @Min(0.01) @Max(1000) tipoCambio: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(365) diasEsperaHoy: number;
  @ApiProperty() @IsNumber() @Min(0) @Max(365) diasEsperaGenerador: number;
  @ApiProperty({ description: 'Licencias y suscripciones al mes hoy (S/)' }) @IsNumber() @Min(0) @Max(MONTO_MAX) licenciasMesHoy: number;
  @ApiProperty({ description: 'Licencias, API y servidor al mes con el generador (S/)' }) @IsNumber() @Min(0) @Max(MONTO_MAX) licenciasMesGenerador: number;
  @ApiProperty({ description: 'IA por API por SCORM (US$)' }) @IsNumber() @Min(0) @Max(MONTO_MAX) iaPorScormUsd: number;
  @ApiProperty({ type: [HorasEtapaDto], description: 'Las 8 etapas fijas; las que falten toman el ejemplo' })
  @IsArray() @ArrayMaxSize(8) @ValidateNested({ each: true }) @Type(() => HorasEtapaDto) etapas: HorasEtapaDto[];
}

export class ParametrosNegocioRespuestaDto extends ParametrosNegocioDto {
  @ApiProperty({ description: 'true mientras la organización no guarde los suyos (valores de ejemplo del prototipo)' }) ejemplo: boolean;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) actualizadoEn: string | null;
}

export class MedicionEntradaDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'Proyecto de la herramienta (422 si es de otra organización)' })
  @IsOptional() @IsUUID() proyectoId?: string;
  @ApiPropertyOptional({ description: 'Nombre del proyecto medido; obligatorio sin proyectoId (puede ser anterior a la herramienta)', maxLength: 120 })
  @ValidateIf((o: MedicionEntradaDto) => !o.proyectoId || o.proyectoRef !== undefined) @IsString() @MinLength(2) @MaxLength(120) proyectoRef?: string;
  @ApiProperty({ enum: ESCENARIOS }) @IsIn(ESCENARIOS) escenario: string;
  @ApiProperty({ enum: CLAVES_ETAPA }) @IsIn(CLAVES_ETAPA) etapa: string;
  @ApiProperty({ minimum: 0, maximum: HORAS_MAX }) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(HORAS_MAX) horas: number;
  @ApiPropertyOptional({ maxLength: 500 }) @IsOptional() @IsString() @MaxLength(500) notas?: string;
}

export class MedicionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() proyectoRef: string;
  @ApiProperty({ format: 'uuid', nullable: true, type: String }) proyectoId: string | null;
  @ApiProperty({ enum: ESCENARIOS }) escenario: string;
  @ApiProperty({ enum: CLAVES_ETAPA }) etapa: string;
  @ApiProperty() horas: number;
  @ApiProperty({ nullable: true, type: String }) notas: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Nombre de quien la registró' }) registradoPor: string | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}

export class RentabilidadConsultaDto {
  @ApiPropertyOptional({ enum: ['supuestos', 'mediciones'], default: 'supuestos' }) @IsOptional() @IsIn(['supuestos', 'mediciones']) fuente?: 'supuestos' | 'mediciones';
}

class EtapaCalculadaDto extends HorasEtapaDto {
  @ApiProperty() nombre: string;
}
class PorEscenarioNumeroDto {
  @ApiProperty() hoy: number;
  @ApiProperty() generador: number;
}
class PorEscenarioFuenteDto {
  @ApiProperty({ enum: ['supuestos', 'mediciones'] }) hoy: string;
  @ApiProperty({ enum: ['supuestos', 'mediciones'] }) generador: string;
}

export class RentabilidadDto {
  @ApiProperty({ enum: ['supuestos', 'mediciones'] }) fuente: string;
  @ApiProperty({ type: [EtapaCalculadaDto] }) etapas: EtapaCalculadaDto[];
  @ApiProperty() horasHoy: number;
  @ApiProperty() horasGenerador: number;
  @ApiProperty() diasHoy: number;
  @ApiProperty() diasGenerador: number;
  @ApiProperty() scormMesHoy: number;
  @ApiProperty() scormMesGenerador: number;
  @ApiProperty({ description: 'S/' }) costoHoy: number;
  @ApiProperty({ description: 'S/' }) costoGenerador: number;
  @ApiProperty() margenCompetenciaHoy: number;
  @ApiProperty() margenCompetenciaGenerador: number;
  @ApiProperty() margenPrecioNuevo: number;
  @ApiProperty({ type: PorEscenarioNumeroDto }) proyectosMedidos: PorEscenarioNumeroDto;
  @ApiProperty({ type: PorEscenarioFuenteDto, description: 'Con «mediciones», un escenario sin mediciones usa los supuestos' }) respaldo: PorEscenarioFuenteDto;
}
