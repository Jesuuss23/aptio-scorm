import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ACCIONES_RAPIDA, OBJETIVOS_CHATBOT, RESULTADOS_CONVERSACION, TONOS_CHATBOT } from '@aptio/schema/chatbot';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

/** HU-1604 · Ajustes del chatbot del sitio (REQ-077, PNT-32, RN-17-4). */
export class AjustesChatbotDto {
  @ApiProperty({ example: 'Ana' }) nombre: string;
  @ApiProperty({ example: 'Hola, soy Ana. ¿Quieres ver cómo convertir un manual en una cápsula SCORM?' }) saludoEs: string;
  @ApiProperty({ example: "Hi, I'm Ana. Want to see how to turn a manual into a SCORM capsule?" }) saludoEn: string;
  @ApiProperty({ enum: TONOS_CHATBOT }) tono: string;
  @ApiProperty({ enum: OBJETIVOS_CHATBOT }) objetivo: string;
  @ApiProperty({ example: '09:00', description: 'Inicio de la atención humana, hora de Lima' }) horarioInicio: string;
  @ApiProperty({ example: '18:00', description: 'Fin de la atención humana (excluido), hora de Lima' }) horarioFin: string;
  @ApiProperty({ type: [Number], example: [1, 2, 3, 4, 5], description: '1 (lunes) a 7 (domingo)' }) diasAtencion: number[];
  @ApiProperty({ description: 'Se muestra en el sitio (en vivo, sin republicar)' }) visible: boolean;
}

export class RapidaChatDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: '¿Funciona en Moodle?' }) textoEs: string;
  @ApiProperty({ example: 'Does it work in Moodle?' }) textoEn: string;
  @ApiProperty({ enum: ACCIONES_RAPIDA }) accion: string;
  @ApiProperty() visible: boolean;
  @ApiProperty() orden: number;
  @ApiProperty({ description: 'Dato inventado: nunca se sirve en producción' }) ficticio: boolean;
}

export class FuenteChatDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Tiempos de producción' }) titulo: string;
  @ApiProperty({ example: 'Una cápsula de 5 minutos se entrega en 3 días hábiles.' }) contenido: string;
  @ApiProperty({ enum: ['es', 'en'] }) idioma: string;
  @ApiProperty({ description: 'El chatbot la usa' }) visible: boolean;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

export class BaseConocimientoDto {
  @ApiProperty({ description: 'Páginas publicadas en español que el chatbot usa' }) paginasEs: number;
  @ApiProperty() paginasEn: number;
  @ApiProperty({ description: 'Preguntas frecuentes publicadas en español' }) preguntasEs: number;
  @ApiProperty() preguntasEn: number;
}

export class ChatbotDto {
  @ApiProperty({ type: AjustesChatbotDto }) ajustes: AjustesChatbotDto;
  @ApiProperty({ example: 'Lun a vie, 9:00 a 18:00' }) horario: string;
  @ApiProperty({ description: 'Si ahora hay atención humana (hora de Lima)' }) enHorario: boolean;
  @ApiProperty({ type: [RapidaChatDto] }) rapidas: RapidaChatDto[];
  @ApiProperty({ type: [FuenteChatDto] }) fuentes: FuenteChatDto[];
  @ApiProperty({ type: BaseConocimientoDto }) base: BaseConocimientoDto;
}

export class AjustesChatbotCambioDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() saludoEs?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() saludoEn?: string;
  @ApiPropertyOptional({ enum: TONOS_CHATBOT }) @IsOptional() @IsString() tono?: string;
  @ApiPropertyOptional({ enum: OBJETIVOS_CHATBOT }) @IsOptional() @IsString() objetivo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() horarioInicio?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() horarioFin?: string;
  @ApiPropertyOptional({ type: [Number] }) @IsOptional() @IsArray() @ArrayMaxSize(7) diasAtencion?: unknown[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
}

export class RapidaChatEntradaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() textoEs?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() textoEn?: string;
  @ApiPropertyOptional({ enum: ACCIONES_RAPIDA }) @IsOptional() @IsString() accion?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ficticio?: boolean;
}

export class OrdenRapidasDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todas las respuestas rápidas, en el orden nuevo' }) @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids: string[];
}

export class FuenteChatEntradaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() titulo?: string;
  @ApiPropertyOptional({ description: 'Texto plano, hasta 4 000 caracteres' }) @IsOptional() @IsString() contenido?: string;
  @ApiPropertyOptional({ enum: ['es', 'en'] }) @IsOptional() @IsString() idioma?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
}

export class MensajeConversacionDto {
  @ApiProperty({ enum: ['visitante', 'bot'] }) de: string;
  @ApiProperty() texto: string;
  @ApiProperty({ format: 'date-time' }) en: string;
  @ApiPropertyOptional({ type: [String], description: 'Ids de las fuentes citadas (solo el bot)' }) fuentes?: string[];
  @ApiPropertyOptional({ type: [String], enum: ACCIONES_RAPIDA, description: 'Botones que ofreció (solo el bot)' }) acciones?: string[];
}

export class ConversacionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ enum: ['es', 'en'] }) idioma: string;
  @ApiProperty({ enum: RESULTADOS_CONVERSACION }) resultado: string;
  @ApiProperty({ type: [MensajeConversacionDto] }) mensajes: MensajeConversacionDto[];
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
  @ApiProperty({ format: 'date-time', description: 'Se borra en esta fecha (90 días)' }) expiraEn: string;
}

export class ConversacionesDto {
  @ApiProperty({ type: [ConversacionDto], description: 'De la más reciente a la más antigua' }) conversaciones: ConversacionDto[];
  @ApiProperty({ description: 'Conversaciones guardadas (últimos 90 días)' }) total: number;
  @ApiProperty({ type: 'object', additionalProperties: { type: 'integer' }, description: 'Cuántas hay por resultado' }) porResultado: Record<string, number>;
}

export class ConsultaConversacionesDto {
  @ApiPropertyOptional({ enum: RESULTADOS_CONVERSACION }) @IsOptional() @IsIn(RESULTADOS_CONVERSACION) resultado?: string;
  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 50 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limite?: number;
}

// ── Público ──────────────────────────────────────────────────────────────────────────────────────────────────────────

export class ChatEntradaDto {
  @ApiPropertyOptional({ maxLength: 500, description: 'La pregunta del visitante (dato no confiable)' }) mensaje?: string;
  @ApiPropertyOptional({ enum: ['agendar_demo', 'hablar_persona'], description: 'En vez del mensaje: la respuesta rápida que el navegador resolvió (sin IA)' }) accion?: string;
  @ApiPropertyOptional({ enum: ['es', 'en'], default: 'es' }) idioma?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'La conversación que sigue (de sessionStorage)' }) conversacionId?: string;
}

export class FuenteCitadaDto {
  @ApiProperty({ example: 'pregunta:3f0c…' }) id: string;
  @ApiProperty({ example: '¿Funciona en Moodle?' }) titulo: string;
  @ApiPropertyOptional({ example: '/precios' }) ruta?: string;
}

export class RespuestaChatDto {
  @ApiProperty() texto: string;
  @ApiProperty({ type: [FuenteCitadaDto] }) fuentes: FuenteCitadaDto[];
  @ApiProperty({ type: [String], enum: ACCIONES_RAPIDA, description: 'Botones que ofrece («Agendar demo», «Hablar con una persona»)' }) acciones: string[];
  @ApiProperty({ description: 'La respuesta controlada «no lo sé» (CP-133)' }) controlada: boolean;
}

export class ChatRespuestaDto {
  @ApiProperty({ format: 'uuid' }) conversacionId: string;
  @ApiProperty({ type: RespuestaChatDto, nullable: true, description: 'Falta cuando llega una acción local (agendar o persona)' }) respuesta: RespuestaChatDto | null;
  @ApiProperty({ description: 'Mensajes que le quedan al visitante en esta conversación' }) quedan: number;
  @ApiProperty({ description: 'Si ahora hay atención humana (hora de Lima)' }) enHorario: boolean;
}
