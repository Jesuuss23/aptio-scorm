import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';
import { ESTILOS_KIT, FAMILIAS_KIT } from '@aptio/schema/marca';
import { PaletaDto } from './kit.dto.js';

/** HU-0206 · El material del que se propone el kit: un ZIP de un curso anterior o un PDF del manual de marca. */
export class ExtraerKitEntradaDto {
  @ApiProperty({ format: 'uuid', description: 'Recurso del cliente (subido con origen CLIENTE): application/zip o application/pdf' })
  @IsUUID() recursoId: string;
}

class FrecuenciaDto {
  @ApiProperty() valor: string;
  @ApiProperty() veces: number;
}

export class EvidenciasKitDto {
  @ApiProperty({ enum: ['zip', 'pdf'] }) origen: string;
  @ApiProperty({ description: 'Archivos de texto leídos del ZIP o páginas revisadas del PDF' }) leidos: number;
  @ApiProperty({ type: [FrecuenciaDto], description: 'Colores #RRGGBB, del más usado al menos usado' }) colores: FrecuenciaDto[];
  @ApiProperty({ type: [FrecuenciaDto], description: 'Tipografías encontradas' }) fuentes: FrecuenciaDto[];
  @ApiProperty({ type: [String], description: 'Límites alcanzados y entradas que no se abrieron' }) avisos: string[];
}

class TipografiasPropuestasDto {
  @ApiProperty({ enum: FAMILIAS_KIT }) titulos: string;
  @ApiProperty({ enum: FAMILIAS_KIT }) texto: string;
  @ApiPropertyOptional({ type: [String] }) alternativasLibres?: string[];
}

class TipografiaMarcaDto {
  @ApiProperty() titulos: string;
  @ApiProperty() texto: string;
}

class EstiloPropuestoDto {
  @ApiProperty({ enum: ['plana', 'lineal', 'isometrica', 'semirrealista', 'fotografia'] }) ilustracion: string;
  @ApiProperty({ enum: ['rectas', 'suaves', 'redondeadas'] }) esquinas: string;
  @ApiProperty() tono: string;
  @ApiProperty({ enum: ESTILOS_KIT }) kit: string;
}

export class PropuestaKitIADto {
  @ApiProperty({ type: PaletaDto }) paleta: PaletaDto;
  @ApiProperty({ type: TipografiasPropuestasDto }) tipografias: TipografiasPropuestasDto;
  @ApiProperty({ type: TipografiaMarcaDto, description: 'Las que usa la marca, aunque no sean libres' }) tipografiaMarca: TipografiaMarcaDto;
  @ApiProperty({ type: EstiloPropuestoDto }) estilo: EstiloPropuestoDto;
  @ApiProperty({ description: 'Calculado en el backend: texto/fondo y blanco/primario cumplen 4,5:1' }) contrasteOk: boolean;
  @ApiProperty({ type: [String] }) evidencias: string[];
  @ApiProperty({ minimum: 0, maximum: 1 }) confianza: number;
}

class ErrorKitDto {
  @ApiProperty({ enum: ['FORMATO_NO_VALIDO', 'ZIP_NO_VALIDO', 'SIN_COLORES', 'PROPUESTA_NO_VALIDA', 'ERROR'] }) codigo: string;
  @ApiProperty() mensaje: string;
}

/** La última propuesta de kit del cliente (HU-0206), guardada en `TrabajoIA.resultado`. */
export class PropuestaKitDto {
  @ApiProperty({ format: 'uuid', description: 'El TrabajoIA (GET /trabajos/{id})' }) trabajoId: string;
  @ApiProperty({ enum: ['procesando', 'lista', 'error'] }) estado: string;
  @ApiProperty({ format: 'uuid' }) recursoId: string;
  @ApiProperty({ description: 'Nombre del archivo del que se extrajo' }) nombreArchivo: string;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiPropertyOptional({ type: EvidenciasKitDto }) evidencias?: EvidenciasKitDto;
  @ApiPropertyOptional({ type: PropuestaKitIADto }) propuesta?: PropuestaKitIADto;
  @ApiProperty({ type: [String], description: '«La marca usa X en títulos; se propone Y (libre)»' }) avisosTipografia: string[];
  @ApiPropertyOptional({ type: ErrorKitDto }) error?: ErrorKitDto;
}
