import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ESTADOS_TRABAJO } from '@aptio/schema/generacion';
import { IsBoolean, IsIn, IsOptional } from 'class-validator';

export const FORMATOS = ['SCORM12', 'SCORM2004', 'HTML', 'JSON', 'KIT_GAMIFICACION'] as const;
export const PERFILES_LMS = ['generico', 'moodle', 'blackboard', 'chamilo', 'canvas'] as const;
export const MODOS_IDIOMA = ['unico', 'separados', 'mismo-paquete'] as const;

/** HU-1202 · Por ahora solo SCORM12 en un idioma (SUP-49); el perfil no cambia el paquete (RN-12-1). */
export class ExportacionEntradaDto {
  @ApiProperty({ enum: FORMATOS, description: 'Solo SCORM12 por ahora; los demás responden 422 FORMATO_NO_DISPONIBLE' })
  @IsIn(FORMATOS) formato: (typeof FORMATOS)[number];
  @ApiPropertyOptional({ enum: PERFILES_LMS, default: 'generico', description: 'Solo agrega recomendaciones; el paquete es el mismo' })
  @IsOptional() @IsIn(PERFILES_LMS) perfilLms?: (typeof PERFILES_LMS)[number];
  @ApiPropertyOptional({ enum: MODOS_IDIOMA, default: 'unico', description: 'Solo unico por ahora (el primer idioma del curso); los demás responden 422 IDIOMA_NO_DISPONIBLE' })
  @IsOptional() @IsIn(MODOS_IDIOMA) modoIdioma?: (typeof MODOS_IDIOMA)[number];
  @ApiPropertyOptional({ default: true, description: 'Modo diagnóstico en el paquete (HU-1204): con false no se abre ni con el atajo ni con ?diagnostico=1' })
  @IsOptional() @IsBoolean() incluirDiagnostico?: boolean;
  @ApiPropertyOptional({ default: true, description: 'Informe para el cliente; todavía no cambia nada' })
  @IsOptional() @IsBoolean() incluirInforme?: boolean;
}

export class InformeExportacionDto {
  @ApiProperty({ type: [String] }) errores: string[];
  @ApiProperty({ type: [String], description: 'Recursos que faltan: el paquete muestra su texto alternativo' }) advertencias: string[];
  @ApiPropertyOptional({ type: [String] }) recursosFaltantes?: string[];
  @ApiPropertyOptional() idioma?: string;
  @ApiPropertyOptional({ description: 'Archivos dentro del ZIP' }) archivos?: number;
}

export class ExportacionDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) cursoId: string;
  @ApiProperty({ enum: FORMATOS }) formato: string;
  @ApiProperty({ enum: PERFILES_LMS }) perfilLms: string;
  @ApiProperty({ enum: MODOS_IDIOMA }) modoIdioma: string;
  @ApiProperty({ description: 'Versión del curso exportada; volver a exportar no cambia esta (RN-12-4)' }) versionCurso: number;
  @ApiProperty({ enum: ESTADOS_TRABAJO }) estado: string;
  @ApiProperty({ nullable: true, description: 'Peso del ZIP' }) bytes: number | null;
  @ApiProperty({ type: InformeExportacionDto, nullable: true }) informe: InformeExportacionDto | null;
  @ApiProperty({ nullable: true, description: 'Por qué terminó en ERROR' }) motivo: string | null;
  @ApiProperty({ nullable: true, description: 'Nombre del archivo: <proyecto>-scorm12-v<versión>.zip' }) nombreArchivo: string | null;
  @ApiProperty({ nullable: true, format: 'uri', description: 'Solo en COMPLETADO y en GET /exportaciones/{id}: descarga firmada por 15 minutos' }) descargaUrl: string | null;
  @ApiProperty() creadoEn: string;
}

export class RecursoPesadoDto {
  @ApiProperty() id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() bytes: number;
}

/** HU-1201 · Resultado de validar antes de exportar. Nunca bloquea por tamaño (RN-12-2): solo los errores impiden exportar. */
export class ValidacionDto {
  @ApiProperty({ type: [String], description: 'Impiden exportar (el curso no cumple el esquema)' }) errores: string[];
  @ApiProperty({ type: [String], description: 'No impiden exportar: peso sobre el límite, archivos faltantes, suspend_data, pantallas sin aprobar' }) advertencias: string[];
  @ApiProperty({ description: 'Peso estimado del paquete en MB (1 MB = 1.048.576 bytes)' }) pesoEstimadoMb: number;
  @ApiProperty() pesoEstimadoBytes: number;
  @ApiProperty({ description: 'Límite de subida del destino en MB' }) limiteMb: number;
  @ApiProperty({ enum: ['ficha', 'referencia'], description: 'ficha: la ficha de compatibilidad del cliente; referencia: LIMITE_SUBIDA_REFERENCIA_MB' }) origenLimite: 'ficha' | 'referencia';
  @ApiProperty() superaLimite: boolean;
  @ApiProperty({ type: [String], description: 'Las 5 alternativas de docs/08 cuando se pasa el límite' }) alternativas: string[];
  @ApiProperty({ type: [RecursoPesadoDto], description: 'Los 5 recursos que más pesan' }) recursosPesados: RecursoPesadoDto[];
  @ApiProperty({ description: 'Peor caso de cmi.suspend_data v2 (límite 4096)' }) suspendDataCaracteres: number;
  @ApiProperty() pantallasTotal: number;
  @ApiProperty() pantallasSinAprobar: number;
  @ApiProperty({ type: [String] }) recursosFaltantes: string[];
}
