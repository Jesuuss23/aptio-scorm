import { ApiProperty } from '@nestjs/swagger';
import { ORIGENES_LEAD } from '@aptio/schema/leads';
import { PERIODOS_RESUMEN } from '@aptio/schema/resumen-sitio';

class IndicadorDto {
  @ApiProperty({ example: 10 }) actual: number;
  @ApiProperty({ example: 8, description: 'El período anterior del mismo largo' }) anterior: number;
  @ApiProperty({ type: Number, nullable: true, example: 25, description: 'Variación en %, con un decimal; null si el período anterior fue 0' }) variacion: number | null;
}

class IndicadoresDto {
  @ApiProperty({ type: IndicadorDto, description: 'Sesiones que empezaron en el sitio (SitioVisitaDia.visitas)' }) visitas: IndicadorDto;
  @ApiProperty({ type: IndicadorDto, description: 'Leads creados en el período (tabla Lead, por creadoEn)' }) leads: IndicadorDto;
  @ApiProperty({ type: IndicadorDto, description: 'Citas creadas en el período, con cualquier estado (tabla AgendaCita, por creadoEn)' }) demos: IndicadorDto;
  @ApiProperty({ type: IndicadorDto, nullable: true, description: 'Llega con las suscripciones (S13): hoy siempre null' }) suscripciones: IndicadorDto | null;
}

class DiaResumenDto {
  @ApiProperty({ format: 'date', example: '2026-11-16', description: 'Día de Lima' }) dia: string;
  @ApiProperty() visitas: number;
  @ApiProperty() leads: number;
  @ApiProperty() demos: number;
}

class OrigenResumenDto {
  @ApiProperty({ enum: ORIGENES_LEAD }) origen: string;
  @ApiProperty({ example: 'Formulario' }) etiqueta: string;
  @ApiProperty() leads: number;
  @ApiProperty({ description: 'Entero; la lista suma 100 (0 sin leads), por el método del mayor resto' }) porcentaje: number;
}

class PaginaConversionDto {
  @ApiProperty({ example: '/precios' }) ruta: string;
  @ApiProperty({ description: 'Visitas que empezaron en la página' }) visitas: number;
  @ApiProperty({ description: 'Leads con esa página de entrada' }) leads: number;
  @ApiProperty({ example: 6.5, description: 'leads / visitas en %, con un decimal' }) conversion: number;
}

class ProximaDemoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date', description: 'Fecha de Lima' }) fecha: string;
  @ApiProperty({ example: '10:30', description: 'Hora de Lima' }) hora: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ type: String, nullable: true }) empresa: string | null;
  @ApiProperty({ example: 'Demo de 30 minutos' }) tipo: string;
  @ApiProperty() asesor: string;
  @ApiProperty({ enum: ['confirmada'] }) estado: string;
}

/** HU-1607 · Sitio web › Resumen (REQ-080, PNT-24, CP-138). */
export class ResumenSitioDto {
  @ApiProperty({ enum: PERIODOS_RESUMEN }) periodo: string;
  @ApiProperty({ format: 'date', description: 'Primer día del período (Lima)' }) desde: string;
  @ApiProperty({ format: 'date', description: 'Último día del período, hoy (Lima)' }) hasta: string;
  @ApiProperty({ type: IndicadoresDto }) indicadores: IndicadoresDto;
  @ApiProperty({ type: [DiaResumenDto] }) serie: DiaResumenDto[];
  @ApiProperty({ type: [OrigenResumenDto] }) origenes: OrigenResumenDto[];
  @ApiProperty({ type: [PaginaConversionDto], description: 'Hasta 5' }) paginas: PaginaConversionDto[];
  @ApiProperty({ type: [ProximaDemoDto], description: 'Las 5 siguientes confirmadas' }) proximasDemos: ProximaDemoDto[];
}

/** `POST /s/_visita`: la vista anónima de una página. */
export class VisitaSitioDto {
  @ApiProperty({ example: '/precios', description: 'Ruta sin la base, la consulta ni el ancla' }) ruta: string;
  @ApiProperty({ enum: ['es', 'en'] }) idioma: string;
  @ApiProperty({ description: 'true en la primera página de la sesión del navegador' }) primeraPagina: boolean;
  @ApiProperty({ type: String, nullable: true, example: 'linkedin', description: 'Se valida y no se guarda' }) origen: string | null;
}
