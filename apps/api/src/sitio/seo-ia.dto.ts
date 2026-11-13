import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ASISTENTES_IA, ESTADOS_MENCION, ESTADOS_PROPUESTA_IA, LIMITES_SEO_IA, RASTREADORES_IA, TIPOS_PROPUESTA_IA } from '@aptio/schema/sitio-seo-ia';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/** HU-1513 · Un rastreador de IA del catálogo y si puede leer el sitio (CP-126). */
export class RastreadorIaDto {
  @ApiProperty({ enum: RASTREADORES_IA }) nombre: string;
  @ApiProperty({ description: 'false = bloqueado: robots.txt lleva su grupo con «Disallow: /» al publicar' }) permitido: boolean;
}

export class AsistenteIaDto {
  @ApiProperty({ enum: ASISTENTES_IA.map((a) => a.id) }) id: string;
  @ApiProperty({ example: 'ChatGPT' }) nombre: string;
}

export class MencionIaDto {
  @ApiProperty({ enum: ESTADOS_MENCION, description: '¿El asistente menciona la marca al responder la pregunta? Lo marca el superadmin a mano' }) estado: string;
  @ApiProperty({ format: 'date-time', nullable: true, description: 'Cuándo se marcó Sí o No; null si está sin revisar' }) revisadoEn: string | null;
}

export class MencionesIaDto {
  @ApiProperty({ type: MencionIaDto }) chatgpt: MencionIaDto;
  @ApiProperty({ type: MencionIaDto }) claude: MencionIaDto;
  @ApiProperty({ type: MencionIaDto }) gemini: MencionIaDto;
  @ApiProperty({ type: MencionIaDto }) perplexity: MencionIaDto;
}

/** HU-1513 · Una pregunta objetivo con la marca de cada asistente. */
export class PreguntaIaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'mejor herramienta para crear cursos SCORM con IA' }) pregunta: string;
  @ApiProperty({ type: MencionesIaDto }) menciones: MencionesIaDto;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

/** HU-1513 · Una propuesta de contenido de la IA (IA-19, CP-127). */
export class PropuestaIaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: TIPOS_PROPUESTA_IA }) tipo: string;
  @ApiProperty({
    type: 'object', additionalProperties: true,
    description: 'pagina: titulo, ruta, metaTitulo, metaDescripcion y motivo. pregunta: pregunta, respuesta, pagina (opcional) y motivo',
    example: { titulo: 'SCORM 1.2 vs. cmi5', ruta: '/scorm-vs-cmi5', metaTitulo: 'SCORM 1.2 vs. cmi5: cuál elegir', metaDescripcion: 'Compara SCORM 1.2 y cmi5 en una tabla.', motivo: 'Ninguna página responde esa comparación.' },
  })
  datos: Record<string, string>;
  @ApiProperty({ enum: ESTADOS_PROPUESTA_IA }) estado: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'La página en borrador o la pregunta oculta que creó «Crear borrador»' }) creadoId?: string;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}

export class PaginasFaqDto {
  @ApiProperty({ description: 'Páginas publicadas con datos estructurados FAQPage' }) conFaq: number;
  @ApiProperty({ description: 'Páginas publicadas' }) publicadas: number;
}

/** HU-1513 · Sitio web › SEO para IA (PNT-30). */
export class SeoIaDto {
  @ApiProperty({ description: 'El contenido de /llms.txt (texto plano). Vacío: el sitio responde 404', maxLength: LIMITES_SEO_IA.llmsTxt }) llmsTxt: string;
  @ApiProperty({ type: [RastreadorIaDto] }) rastreadores: RastreadorIaDto[];
  @ApiProperty({ type: [AsistenteIaDto] }) asistentes: AsistenteIaDto[];
  @ApiProperty({ type: [PreguntaIaDto] }) preguntas: PreguntaIaDto[];
  @ApiProperty({ type: [PropuestaIaDto], description: 'Solo las pendientes, de la más nueva a la más vieja' }) propuestas: PropuestaIaDto[];
  @ApiProperty({ type: PaginasFaqDto }) paginasFaq: PaginasFaqDto;
}

export class SeoIaCambioDto {
  @ApiPropertyOptional({ maxLength: LIMITES_SEO_IA.llmsTxt, description: 'Texto plano, sin HTML. Vacío quita el archivo' })
  @IsOptional() @IsString() @MaxLength(LIMITES_SEO_IA.llmsTxt * 2) llmsTxt?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'boolean' }, example: { GPTBot: false }, description: 'Por rastreador: true permite y false bloquea. Los que no llegan no cambian' })
  @IsOptional() @IsObject() rastreadores?: Record<string, unknown>;
}

export class PreguntaIaEntradaDto {
  @ApiProperty({ minLength: LIMITES_SEO_IA.preguntaMin, maxLength: LIMITES_SEO_IA.pregunta, example: 'cómo convertir un PDF en curso SCORM' })
  @IsString() @MaxLength(LIMITES_SEO_IA.pregunta * 2) pregunta: string;
}

export class PreguntaIaCambioDto {
  @ApiPropertyOptional({ minLength: LIMITES_SEO_IA.preguntaMin, maxLength: LIMITES_SEO_IA.pregunta })
  @IsOptional() @IsString() @MaxLength(LIMITES_SEO_IA.pregunta * 2) pregunta?: string;
  @ApiPropertyOptional({ type: 'object', additionalProperties: { type: 'string', enum: [...ESTADOS_MENCION] }, example: { chatgpt: 'si', gemini: 'no' }, description: 'Por asistente: si, no o sin_revisar. Sí y No guardan la fecha de la revisión' })
  @IsOptional() @IsObject() menciones?: Record<string, unknown>;
}

/** Lo que devuelve «✦ Proponer contenido». */
export class PropuestasPedidasDto {
  @ApiProperty({ description: 'Cuántas propuestas nuevas se guardaron (las que repetían una página, una pregunta u otra propuesta no entran)' }) nuevas: number;
  @ApiProperty({ type: [String], description: 'Lo que la IA pide completar o verificar antes de publicar' }) observaciones: string[];
  @ApiProperty({ type: [PropuestaIaDto], description: 'Todas las pendientes' }) propuestas: PropuestaIaDto[];
  @ApiProperty({ format: 'uuid', description: 'El registro del consumo (TrabajoIA de la plataforma)' }) trabajoId: string;
}
