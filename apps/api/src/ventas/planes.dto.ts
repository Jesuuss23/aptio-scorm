import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, IsUUID, ValidateIf } from 'class-validator';

export class CaracteristicaDto {
  @ApiProperty({ example: '20 cápsulas al mes' }) texto: string;
  @ApiProperty() visible: boolean;
}

/** HU-1702 · Un plan como lo ve el panel (PNT-35). Precios en soles enteros, sin IGV. */
export class PlanDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'productora', description: 'Estable para la URL' }) slug: string;
  @ApiProperty({ example: 'Productora' }) nombre: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ type: Number, nullable: true, example: 1290, description: 'null = a medida' }) precioMes: number | null;
  @ApiProperty({ type: Number, nullable: true, description: 'Precio anual propio; null = precioMes × 12 × (1 − descuentoAnual / 100)' }) precioAnual: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 12384, description: 'El anual que se cobra (el propio o el calculado); null si es a medida' }) precioAnualEfectivo: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 20 }) capsulasMes: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 10, description: 'null = ilimitados o según contrato' }) usuarios: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 69 }) capsulaAdicional: number | null;
  @ApiProperty({ example: 'Suscribirme' }) textoBoton: string;
  @ApiProperty({ description: '«Más elegido»: solo uno a la vez' }) destacado: boolean;
  @ApiProperty({ description: 'Mostrar en /precios (nace oculto)' }) visible: boolean;
  @ApiProperty() orden: number;
  @ApiProperty({ type: [CaracteristicaDto] }) caracteristicas: CaracteristicaDto[];
  @ApiProperty({ description: 'Dato inventado: un ficticio visible bloquea publicar en producción' }) ficticio: boolean;
  @ApiProperty({ format: 'date-time' }) actualizadoEn: string;
}

export class AjustesPlanesDto {
  @ApiProperty({ example: true }) @IsBoolean() mostrarAnual: boolean;
  @ApiProperty({ example: 20, minimum: 0, maximum: 90 }) @IsInt() descuentoAnual: number;
  @ApiProperty({ example: false, description: 'Mostrar los precios con IGV (18 %)' }) @IsBoolean() conIgv: boolean;
}

export class PlanesDto {
  @ApiProperty({ type: [PlanDto] }) planes: PlanDto[];
  @ApiProperty({ type: AjustesPlanesDto }) ajustes: AjustesPlanesDto;
}

/** Alta (con slug y nombre) o cambio (solo lo que cambia). La validación de cada campo es de `@aptio/schema/planes`. */
export class PlanEntradaDto {
  @ApiPropertyOptional({ example: 'productora', description: 'Solo al crear; después no cambia' }) @IsOptional() @IsString() slug?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() nombre?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() descripcion?: string;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() precioMes?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() precioAnual?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() capsulasMes?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() usuarios?: number | null;
  @ApiPropertyOptional({ type: Number, nullable: true }) @IsOptional() @ValidateIf((_, v) => v !== null) @IsInt() capsulaAdicional?: number | null;
  @ApiPropertyOptional() @IsOptional() @IsString() textoBoton?: string;
  @ApiPropertyOptional({ description: 'Al destacarlo, los demás dejan de estarlo' }) @IsOptional() @IsBoolean() destacado?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() visible?: boolean;
  @ApiPropertyOptional({ type: [CaracteristicaDto] }) @IsOptional() @IsArray() @ArrayMaxSize(50) caracteristicas?: unknown[];
  @ApiPropertyOptional() @IsOptional() @IsBoolean() ficticio?: boolean;
}

export class OrdenPlanesDto {
  @ApiProperty({ type: [String], format: 'uuid', description: 'Todos los planes, en el orden nuevo' }) @IsArray() @ArrayMaxSize(100) @IsUUID('4', { each: true }) ids: string[];
}

/** HU-1702 · El plan publicado como lo ve el visitante y el resumen del pago (CP-141). */
export class PlanPublicoDto {
  @ApiProperty({ example: 'productora' }) slug: string;
  @ApiProperty() nombre: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ description: 'Sin precio: el botón lleva a agendar' }) aMedida: boolean;
  @ApiProperty({ type: Number, nullable: true, example: 1390 }) precioMes: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 13344 }) precioAnual: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 3336, description: 'Frente a pagar 12 meses' }) ahorroAnual: number | null;
  @ApiProperty({ type: Number, nullable: true, example: 1640.2, description: 'Precio al mes con IGV (18 %)' }) precioMesConIgv: number | null;
  @ApiProperty({ type: Number, nullable: true }) capsulasMes: number | null;
  @ApiProperty({ type: Number, nullable: true }) usuarios: number | null;
  @ApiProperty({ type: Number, nullable: true }) capsulaAdicional: number | null;
  @ApiProperty() textoBoton: string;
  @ApiProperty() destacado: boolean;
  @ApiProperty({ type: [String] }) caracteristicas: string[];
  @ApiProperty({ example: '/agendar-demo?plan=productora', description: 'HU-1702 · Hasta la HU-1703, agendar con el plan elegido' }) enlace: string;
  @ApiProperty({ type: AjustesPlanesDto }) ajustes: AjustesPlanesDto;
}
