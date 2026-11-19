import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_ENVIO, TIPOS_CRM } from '@aptio/schema/crm';
import { ETAPAS_LEAD, LIMITES_LEAD, ORIGENES_LEAD, VIAS_LEAD } from '@aptio/schema/leads';
import { Type } from 'class-transformer';
import { IsEmail, IsIn, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';

/** HU-1601 · Lo que envía el sitio (JSON o formulario HTML). Todo es texto no confiable: lo valida `@aptio/schema/leads`. */
export class LeadEntradaDto {
  @ApiProperty({ maxLength: LIMITES_LEAD.correo, example: 'rmendoza@nuevohorizonte.example' }) correo: string;
  @ApiPropertyOptional({ maxLength: LIMITES_LEAD.nombre, description: 'Obligatorio en el formulario y el agendador' }) nombre?: string;
  @ApiPropertyOptional({ maxLength: LIMITES_LEAD.empresa }) empresa?: string;
  @ApiPropertyOptional({ maxLength: LIMITES_LEAD.mensaje }) mensaje?: string;
  @ApiProperty({ description: 'Ley 29733: debe ser true (o «on» desde el formulario HTML)', example: true }) consentimiento: boolean | string;
  @ApiPropertyOptional({ enum: VIAS_LEAD, default: 'formulario', description: 'El canal que captura el lead' }) via?: string;
  @ApiPropertyOptional({ example: '/', description: 'La primera página de la sesión' }) paginaEntrada?: string;
  @ApiPropertyOptional({ example: '/precios', description: 'La página donde se envió' }) paginaFormulario?: string;
  @ApiPropertyOptional({ example: 'https://www.linkedin.com/' }) referente?: string;
  @ApiPropertyOptional({ enum: ['es', 'en'] }) idioma?: string;
  @ApiPropertyOptional({ format: 'uuid', description: 'HU-1603 · Con vía popup: el popup donde se dejó el correo (suma su conversión)' }) popupId?: string;
  @ApiPropertyOptional({ example: 'linkedin' }) utm_source?: string;
  @ApiPropertyOptional() utm_medium?: string;
  @ApiPropertyOptional() utm_campaign?: string;
  @ApiPropertyOptional() utm_term?: string;
  @ApiPropertyOptional() utm_content?: string;
  @ApiPropertyOptional({ description: 'Campo trampa: debe llegar vacío. Lleno, se responde igual y no se guarda nada' }) website?: string;
}

export class LeadRecibidoDto {
  @ApiProperty({ description: 'Siempre true: la respuesta no dice si el correo ya existía ni si se descartó' }) recibido: true;
}

export class ContactoLeadDto {
  @ApiProperty({ format: 'date-time' }) en: string;
  @ApiProperty({ enum: VIAS_LEAD }) via: string;
  @ApiProperty() pagina: string;
  @ApiPropertyOptional() mensaje?: string;
}

/** HU-1602 · El envío del lead a una conexión activa. */
export class EnvioCrmDto {
  @ApiProperty({ enum: TIPOS_CRM }) tipo: string;
  @ApiProperty({ enum: ESTADOS_ENVIO }) estado: string;
  @ApiProperty() intentos: number;
  @ApiProperty({ type: String, nullable: true, description: 'El motivo del último error, sin claves' }) motivo: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) enviadoEn: string | null;
}

/** HU-1602 · La columna «CRM» del lead: un error manda, luego lo pendiente; todo enviado es «Sincronizado» (RN-17-2). */
export class CrmLeadDto {
  @ApiProperty({ enum: ['sincronizado', 'pendiente', 'error', 'sin_envio'] }) estado: string;
  @ApiProperty({ example: 'Error: HubSpot respondió 500' }) texto: string;
  @ApiProperty({ type: [EnvioCrmDto], description: 'Solo las conexiones activas' }) envios: EnvioCrmDto[];
}

/** HU-1601 · Un lead con su atribución de primer contacto (PNT-34). */
export class LeadDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() correo: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ type: String, nullable: true }) empresa: string | null;
  @ApiProperty({ type: String, nullable: true }) mensaje: string | null;
  @ApiProperty({ enum: ORIGENES_LEAD }) origen: string;
  @ApiProperty({ enum: VIAS_LEAD }) via: string;
  @ApiProperty() paginaEntrada: string;
  @ApiProperty({ type: String, nullable: true }) paginaFormulario: string | null;
  @ApiProperty({ type: String, nullable: true }) utmSource: string | null;
  @ApiProperty({ type: String, nullable: true }) utmMedium: string | null;
  @ApiProperty({ type: String, nullable: true }) utmCampaign: string | null;
  @ApiProperty({ type: String, nullable: true }) utmTerm: string | null;
  @ApiProperty({ type: String, nullable: true }) utmContent: string | null;
  @ApiProperty({ type: String, nullable: true }) referente: string | null;
  @ApiProperty({ enum: ['es', 'en'] }) idioma: string;
  @ApiProperty({ enum: ETAPAS_LEAD }) etapa: string;
  @ApiProperty() consentimiento: boolean;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) consentimientoEn: string | null;
  @ApiProperty() totalContactos: number;
  @ApiProperty({ type: [ContactoLeadDto] }) historialContactos: ContactoLeadDto[];
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
  @ApiProperty({ type: CrmLeadDto }) crm: CrmLeadDto;
}

export class FiltroLeadsDto {
  @ApiPropertyOptional({ enum: ORIGENES_LEAD }) @IsOptional() @IsIn(ORIGENES_LEAD, { message: 'origen no está en el catálogo' }) origen?: string;
  @ApiPropertyOptional({ enum: ETAPAS_LEAD }) @IsOptional() @IsIn(ETAPAS_LEAD, { message: 'etapa no está en el catálogo' }) etapa?: string;
}

export class ConsultaLeadsDto extends FiltroLeadsDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) pagina?: number;
  @ApiPropertyOptional({ minimum: 1, maximum: LIMITES_LEAD.porPagina, default: 25 }) @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(LIMITES_LEAD.porPagina) porPagina?: number;
}

export class ListaLeadsDto {
  @ApiProperty({ type: [LeadDto], description: 'Del más nuevo al más antiguo' }) leads: LeadDto[];
  @ApiProperty({ description: 'Leads que cumplen los filtros' }) total: number;
  @ApiProperty() pagina: number;
  @ApiProperty() porPagina: number;
}

export class LeadCambioDto {
  @ApiProperty({ enum: ETAPAS_LEAD }) @IsIn(ETAPAS_LEAD, { message: 'etapa no está en el catálogo' }) etapa: string;
}

/** SUP-237 · Pedido del titular (Ley 29733): borrar sus datos del sitio. */
export class TitularEliminacionDto {
  @ApiProperty({ example: 'rmendoza@nuevohorizonte.example', description: 'El correo con el que dejó sus datos' })
  @IsEmail({}, { message: 'correo no es un correo válido' }) @MaxLength(LIMITES_LEAD.correo) correo: string;
  @ApiProperty({ minLength: 5, maxLength: 300, example: 'Pidió por correo el 19/11 que borremos sus datos' })
  @IsString() @Length(5, 300, { message: 'motivo lleva de 5 a 300 caracteres' }) motivo: string;
}

export class CopiaCrmDto {
  @ApiProperty({ enum: TIPOS_CRM }) tipo: string;
  @ApiProperty({ nullable: true, description: 'El id del contacto en ese CRM, para pedir allí su borrado' }) idExterno: string | null;
}

export class TitularEliminadoDto {
  @ApiProperty({ description: 'Había un lead con ese correo y se borró' }) lead: boolean;
  @ApiProperty({ description: 'Citas del agendador anonimizadas' }) citas: number;
  @ApiProperty({ description: 'De ellas, las que venían y quedaron canceladas' }) citasCanceladas: number;
  @ApiProperty({ type: [CopiaCrmDto], description: 'Copias en los CRM conectados: el sitio no las borra, hay que pedirlo allí' }) crm: CopiaCrmDto[];
}
