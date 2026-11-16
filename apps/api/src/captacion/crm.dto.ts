import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CAMPOS_LEAD_CRM, TIPOS_CRM } from '@aptio/schema/crm';
import { IsBoolean, IsIn, IsObject, IsOptional, IsString, ValidateIf } from 'class-validator';

/** HU-1602 · Una conexión de Leads y CRM como la ve el panel (REQ-075, PNT-34). */
export class ConexionCrmDto {
  @ApiProperty({ enum: TIPOS_CRM }) tipo: string;
  @ApiProperty({ example: 'HubSpot' }) nombre: string;
  @ApiProperty({ example: 'Contactos' }) descripcion: string;
  @ApiProperty() activa: boolean;
  @ApiProperty({ description: 'CRM: las variables de entorno están definidas. Webhook: tiene URL y clave' }) configurada: boolean;
  @ApiProperty({ type: [String], description: 'Lo que falta para enviar: variables de entorno, o «url» y «secreto» del webhook', example: ['HUBSPOT_TOKEN'] }) faltan: string[];
  @ApiProperty({ type: Object, nullable: true, description: 'Campo del sitio → propiedad del CRM. null en el webhook', example: { correo: 'email', nombre: 'firstname' } }) mapeo: Record<string, string> | null;
  @ApiProperty({ type: Object, nullable: true, description: 'El mapeo de por defecto del CRM. null en el webhook' }) mapeoPorDefecto: Record<string, string> | null;
  @ApiProperty({ type: String, nullable: true, description: 'Solo el webhook' }) url: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'Solo el webhook: la clave HMAC-SHA256 para verificar la firma' }) secreto: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) actualizadoEn: string | null;
}

export class CampoCrmDto {
  @ApiProperty({ enum: CAMPOS_LEAD_CRM }) campo: string;
  @ApiProperty({ example: 'Correo' }) etiqueta: string;
}

export class CrmDto {
  @ApiProperty({ type: [ConexionCrmDto] }) conexiones: ConexionCrmDto[];
  @ApiProperty({ type: [CampoCrmDto], description: 'Los campos del lead que se pueden mapear' }) campos: CampoCrmDto[];
  @ApiProperty({ example: 'X-Aptio-Firma', description: 'Cabecera con `t=<unix>,v1=<hex>`: HMAC-SHA256 de `${t}.${cuerpo}`' }) cabeceraFirma: string;
  @ApiProperty({ example: 300, description: 'Antigüedad máxima de una firma que el receptor debería aceptar' }) toleranciaSegundos: number;
}

export class CrmCambioDto {
  @ApiProperty({ enum: TIPOS_CRM }) @IsIn(TIPOS_CRM, { message: 'tipo no está en el catálogo' }) tipo: string;
  @ApiPropertyOptional({ description: 'Activar no envía los leads anteriores' }) @IsOptional() @IsBoolean() activa?: boolean;
  @ApiPropertyOptional({ type: Object, description: 'Solo HubSpot, Pipedrive y Zoho. El correo va siempre a su propiedad' }) @IsOptional() @IsObject() mapeo?: Record<string, unknown>;
  @ApiPropertyOptional({ type: String, nullable: true, description: 'Solo el webhook: https:// con dominio público. Vacía = sin URL' }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() url?: string | null;
}

export class PruebaCrmDto {
  @ApiProperty() ok: boolean;
  @ApiProperty({ example: 'El webhook respondió 204 a la entrega 6f1c…', description: 'Qué pasó, o el motivo del error (sin claves)' }) mensaje: string;
}

export class SincronizacionDto {
  @ApiProperty({ type: [String], enum: TIPOS_CRM, description: 'Las conexiones a las que se volvió a encolar el lead' }) encolados: string[];
}
