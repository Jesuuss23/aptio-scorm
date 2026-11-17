import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_CITA, ESTADOS_PANEL, LMS_AGENDA } from '@aptio/schema/agenda';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches } from 'class-validator';

/** HU-1605 · Ajustes del agendador (REQ-078, PNT-33, RN-17-5). */
export class AjustesAgendaDto {
  @ApiProperty({ type: [String], example: ['09:00', '10:00', '11:30', '15:00', '16:30'], description: 'Horas de inicio de lunes a viernes, en hora de Lima' }) franjas: string[];
  @ApiProperty({ minimum: 0, maximum: 72, example: 4 }) anticipacionHoras: number;
  @ApiProperty({ minimum: 1, maximum: 90, example: 30 }) horizonteDias: number;
  @ApiProperty({ type: [String], example: ['2026-12-24'], description: 'Fechas AAAA-MM-DD de Lima que no se ofrecen (además de los feriados)' }) diasBloqueados: string[];
  @ApiProperty({ description: 'Recordatorios por correo a las 24 h y a 1 h' }) recordatoriosCorreo: boolean;
}

export class FeriadoDto {
  @ApiProperty({ example: '2026-12-08' }) fecha: string;
  @ApiProperty({ example: 'Inmaculada Concepción' }) nombre: string;
}

export class TipoReunionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Demo del generador' }) nombreEs: string;
  @ApiProperty({ example: 'Generator demo' }) nombreEn: string;
  @ApiProperty({ minimum: 15, maximum: 120, example: 30 }) minutos: number;
  @ApiProperty({ type: [String], format: 'uuid' }) asesorIds: string[];
  @ApiProperty({ description: 'Ofrecido en el sitio' }) visible: boolean;
  @ApiProperty() orden: number;
  @ApiProperty({ description: 'Dato inventado: nunca se ofrece en producción' }) ficticio: boolean;
}

export class AsesorDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'Carla Montoya' }) nombre: string;
  @ApiProperty({ example: 'carla@aptioscorm.com' }) correo: string;
  @ApiProperty({ example: 'https://meet.google.com/abc-defg-hij' }) enlaceVideollamada: string;
  @ApiProperty() visible: boolean;
  @ApiProperty() ficticio: boolean;
  @ApiProperty({ description: 'Citas confirmadas por delante' }) citasProximas: number;
}

export class AgendaDto {
  @ApiProperty({ type: AjustesAgendaDto }) ajustes: AjustesAgendaDto;
  @ApiProperty({ type: [FeriadoDto], description: 'Feriados nacionales de Perú de este año y el siguiente' }) feriados: FeriadoDto[];
  @ApiProperty({ type: [TipoReunionDto] }) tipos: TipoReunionDto[];
  @ApiProperty({ type: [AsesorDto] }) asesores: AsesorDto[];
}

export class AjustesAgendaCambioDto {
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(50) franjas?: unknown[];
  @ApiPropertyOptional() @IsOptional() @IsInt() anticipacionHoras?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() horizonteDias?: number;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @ArrayMaxSize(400) diasBloqueados?: unknown[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() recordatoriosCorreo?: boolean;
}

export class TipoReunionEntradaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nombreEs?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nombreEn?: string;
  @ApiPropertyOptional({ minimum: 15, maximum: 120 }) @IsOptional() @IsInt() minutos?: number;
  @ApiPropertyOptional({ type: [String], format: 'uuid' }) @IsOptional() @IsArray() @ArrayMaxSize(20) @IsUUID('all', { each: true }) asesorIds?: string[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ficticio?: boolean;
}

export class AsesorEntradaDto {
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() correo?: string;
  @ApiPropertyOptional({ description: 'https://, sin usuario ni clave' }) @IsOptional() @IsString() enlaceVideollamada?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ficticio?: boolean;
}

export class OrdenTiposDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todos los tipos, en el orden nuevo' }) @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) ids: string[];
}

export class CitaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date-time' }) fin: string;
  @ApiProperty({ example: '2026-11-17' }) fecha: string;
  @ApiProperty({ example: '10:00' }) hora: string;
  @ApiProperty({ enum: ESTADOS_CITA }) estado: string;
  @ApiProperty({ format: 'uuid' }) tipoId: string;
  @ApiProperty({ example: 'Demo del generador' }) tipo: string;
  @ApiProperty({ format: 'uuid' }) asesorId: string;
  @ApiProperty({ example: 'Carla Montoya' }) asesor: string;
  @ApiProperty() nombre: string;
  @ApiProperty() correo: string;
  @ApiProperty({ type: String, nullable: true }) empresa: string | null;
  @ApiProperty({ type: String, nullable: true, enum: LMS_AGENDA }) lms: string | null;
  @ApiProperty({ enum: ['es', 'en'] }) idioma: string;
  @ApiProperty({ type: String, nullable: true, format: 'uuid' }) leadId: string | null;
  @ApiProperty({ type: String, nullable: true, enum: ['visitante', 'superadmin'] }) canceladaPor: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) invitacionEnviadaEn: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) recordatorio24hEnviadoEn: string | null;
  @ApiProperty({ type: String, nullable: true, format: 'date-time' }) recordatorio1hEnviadoEn: string | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}

export class CitasDto {
  @ApiProperty({ type: [CitaDto] }) citas: CitaDto[];
  @ApiProperty() total: number;
}

export class ConsultaCitasDto {
  @ApiPropertyOptional({ enum: ESTADOS_CITA }) @IsOptional() @IsIn(ESTADOS_CITA) estado?: string;
  @ApiPropertyOptional({ example: '2026-11-01', description: 'Fecha de Lima, incluida' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) desde?: string;
  @ApiPropertyOptional({ example: '2026-11-30', description: 'Fecha de Lima, incluida' }) @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) hasta?: string;
}

export class CambioCitaDto {
  @ApiProperty({ enum: ESTADOS_PANEL }) @IsIn(ESTADOS_PANEL) estado: string;
}

/** `POST /publico/citas`: la franja elegida y los datos del lead (Ley 29733: consentimiento obligatorio). */
export class ReservaEntradaDto {
  @ApiProperty({ format: 'uuid' }) tipoId: string;
  @ApiProperty({ format: 'date-time', example: '2026-11-17T15:00:00.000Z', description: 'Una franja de `GET /s/_agenda.json`, en UTC' }) inicio: string;
  @ApiProperty() nombre: string;
  @ApiProperty() correo: string;
  @ApiPropertyOptional() empresa?: string;
  @ApiPropertyOptional({ enum: LMS_AGENDA }) lms?: string;
  @ApiProperty({ example: true }) consentimiento: boolean;
  @ApiPropertyOptional({ enum: ['es', 'en'] }) idioma?: string;
  @ApiPropertyOptional() paginaFormulario?: string;
  @ApiPropertyOptional() paginaEntrada?: string;
  @ApiPropertyOptional() referente?: string;
  @ApiPropertyOptional() utm_source?: string;
  @ApiPropertyOptional() utm_medium?: string;
  @ApiPropertyOptional() utm_campaign?: string;
  @ApiPropertyOptional() utm_term?: string;
  @ApiPropertyOptional() utm_content?: string;
  @ApiPropertyOptional({ description: 'Campo trampa: vacío' }) website?: string;
}

export class CitaConfirmadaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'date-time' }) inicio: string;
  @ApiProperty({ format: 'date-time' }) fin: string;
  @ApiProperty({ example: 'Demo del generador' }) tipo: string;
  @ApiProperty({ example: 'https://meet.google.com/abc-defg-hij' }) enlace: string;
  @ApiProperty({ description: 'Añadir a Google Calendar' }) google: string;
  @ApiProperty({ description: 'La invitación iCalendar (METHOD:REQUEST)' }) ics: string;
  @ApiProperty({ example: 'martes 17 de noviembre de 2026, 10:00 (hora de Lima)' }) texto: string;
}

export class ReservaRecibidaDto {
  @ApiProperty({ example: true }) recibido: boolean;
  @ApiProperty({ type: CitaConfirmadaDto, nullable: true }) cita: CitaConfirmadaDto | null;
}

export class CancelacionEntradaDto {
  @ApiProperty({ description: 'El token del enlace de la invitación' }) token: string;
}

export class CancelacionDto {
  @ApiProperty({ example: true }) cancelada: boolean;
  @ApiProperty({ example: 'martes 17 de noviembre de 2026, 10:00 (hora de Lima)' }) texto: string;
}
