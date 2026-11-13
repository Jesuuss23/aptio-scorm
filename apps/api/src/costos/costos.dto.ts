import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID, Matches } from 'class-validator';

const DIA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** HU-1302 · Filtros del resumen. Las fechas son días de Lima (UTC−05:00, sin horario de verano), ambos incluidos. */
export class CostosConsultaDto {
  @ApiPropertyOptional({ format: 'date', description: 'Primer día incluido (hora de Lima)' })
  @IsOptional() @Matches(DIA, { message: 'desde debe ser una fecha AAAA-MM-DD' }) desde?: string;
  @ApiPropertyOptional({ format: 'date', description: 'Último día incluido (hora de Lima)' })
  @IsOptional() @Matches(DIA, { message: 'hasta debe ser una fecha AAAA-MM-DD' }) hasta?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() clienteId?: string;
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional() @IsUUID() proyectoId?: string;
}

export class CostoProyectoDto {
  @ApiProperty({ format: 'uuid' }) proyectoId: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ format: 'uuid' }) clienteId: string;
  @ApiProperty() cliente: string;
  @ApiProperty({ description: 'Llamadas a proveedores registradas' }) llamadas: number;
  @ApiProperty() usd: number;
  @ApiProperty({ description: 'Tiene al menos un paquete exportado' }) exportado: boolean;
}

export class CostoClienteDto {
  @ApiProperty({ format: 'uuid' }) clienteId: string;
  @ApiProperty() nombre: string;
  @ApiProperty({ description: 'Costo de sus proyectos' }) proyectosUsd: number;
  @ApiProperty({ description: 'Costo de trabajos del cliente sin proyecto, p. ej. la propuesta del kit (IA-18)' }) sinProyectoUsd: number;
  @ApiProperty() usd: number;
}

export class CostoProveedorTareaDto {
  @ApiProperty() proveedor: string;
  @ApiProperty({ description: 'IA-##' }) tarea: string;
  @ApiProperty() llamadas: number;
  @ApiProperty() usd: number;
}

export class ResumenCostosDto {
  @ApiProperty() totalUsd: number;
  @ApiProperty({ description: 'SCORM sobre los que se calcula el promedio' }) scormContados: number;
  @ApiProperty() promedioPorScormUsd: number;
  @ApiProperty({ enum: ['exportados', 'con-gasto'], description: 'exportados: proyectos con al menos un paquete exportado; con-gasto: aún no hay exportaciones' })
  criterioPromedio: 'exportados' | 'con-gasto';
  @ApiProperty({ type: [CostoProyectoDto] }) porProyecto: CostoProyectoDto[];
  @ApiProperty({ type: [CostoClienteDto] }) porCliente: CostoClienteDto[];
  @ApiProperty({ type: [CostoProveedorTareaDto] }) porProveedorTarea: CostoProveedorTareaDto[];
}
