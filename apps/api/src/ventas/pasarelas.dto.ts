import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString } from 'class-validator';

/** HU-1704 · Una pasarela como la ve el superadmin (Ventas › Pasarelas). Nunca lleva llaves ni secretos. */
export class PasarelaDto {
  @ApiProperty({ enum: ['pruebas', 'culqi', 'stripe'] }) codigo: 'pruebas' | 'culqi' | 'stripe';
  @ApiProperty({ example: 'Culqi' }) nombre: string;
  @ApiProperty({ description: 'Se ofrece en el pago (si además está activa)' }) visible: boolean;
  @ApiProperty() orden: number;
  @ApiProperty({ enum: ['pruebas', 'produccion'], description: 'Qué juego de llaves usa (variables *_PRUEBAS o *_PRODUCCION)' }) modo: 'pruebas' | 'produccion';
  @ApiProperty({ type: [String], enum: ['PEN', 'USD'], example: ['PEN'] }) monedas: ('PEN' | 'USD')[];
  @ApiProperty({ enum: ['simulado', 'redireccion', 'formulario'], description: 'Formulario simulado, página alojada (Stripe Checkout) o formulario incrustado (Culqi Checkout)' }) flujo: 'simulado' | 'redireccion' | 'formulario';
  @ApiProperty({ description: 'La pasarela de pruebas: solo existe con SITIO_ENTORNO=pruebas' }) simulada: boolean;
  @ApiProperty({ description: 'Sus variables de entorno del modo están y el entorno la admite' }) activa: boolean;
  @ApiProperty({ type: [String], example: ['STRIPE_LLAVE_SECRETA_PRUEBAS'], description: 'Los nombres de las variables que faltan (nunca sus valores)' }) variablesFaltantes: string[];
}

export class PasarelasDto {
  @ApiProperty({ type: [PasarelaDto] }) pasarelas: PasarelaDto[];
}

/** Solo lo que cambia. La validación es de `@aptio/schema/pasarelas`. */
export class CambioPasarelaDto {
  @ApiPropertyOptional({ maxLength: 40 }) @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional({ enum: ['pruebas', 'produccion'] }) @IsOptional() @IsString() modo?: string;
}

export class OrdenPasarelasDto {
  @ApiProperty({ type: [String], enum: ['pruebas', 'culqi', 'stripe'], description: 'Todas las pasarelas, en el orden nuevo' }) @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) codigos: string[];
}

/** HU-1704 · Un cobro aprobado (sin datos de tarjeta: solo la referencia y los 4 últimos dígitos, REQ-110). */
export class CobroDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) solicitudId: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true, description: 'null = pago aprobado sin alta (SUP-291)' }) suscripcionId: string | null;
  @ApiProperty({ example: 'Minera Andina SAC' }) razonSocial: string;
  @ApiProperty({ example: 'ana@minera.pe' }) correoAdmin: string;
  @ApiProperty({ example: 'Productora' }) nombrePlan: string;
  @ApiProperty({ example: 1522.2, description: 'Con IGV' }) monto: number;
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ example: 'stripe' }) pasarela: string;
  @ApiProperty({ type: String, nullable: true, example: '4242' }) ultimos4Digitos: string | null;
  @ApiProperty({ enum: ['APROBADO', 'REEMBOLSADO'] }) estado: 'APROBADO' | 'REEMBOLSADO';
  @ApiProperty({ type: String, nullable: true, description: 'Por qué el pago no creó la cuenta (correo en uso, monto distinto…)' }) motivoSinAlta: string | null;
  @ApiProperty({ description: 'Aprobado y sin alta: se puede reembolsar' }) reembolsable: boolean;
  @ApiProperty({ type: String, nullable: true }) reembolsoId: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) reembolsadoEn: string | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}

export class CobrosDto {
  @ApiProperty({ type: [CobroDto] }) cobros: CobroDto[];
}

export class FiltroCobrosDto {
  @ApiPropertyOptional({ enum: ['APROBADO', 'REEMBOLSADO'] }) @IsOptional() @IsIn(['APROBADO', 'REEMBOLSADO']) estado?: 'APROBADO' | 'REEMBOLSADO';
  @ApiPropertyOptional({ enum: ['true', 'false'], description: 'Solo los pagos aprobados sin alta' }) @IsOptional() @IsIn(['true', 'false']) sinAlta?: 'true' | 'false';
}
