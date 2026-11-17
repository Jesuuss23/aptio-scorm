import { ApiProperty } from '@nestjs/swagger';

/** HU-1710 · El ingreso de una moneda (sin tipo de cambio: soles y dólares por separado, SUP-329). */
export class IngresoMonedaDto {
  @ApiProperty({ enum: ['PEN', 'USD'] }) moneda: 'PEN' | 'USD';
  @ApiProperty({ example: 13834, description: 'Ingreso mensual recurrente neto sin IGV: el anual entre 12 y menos el cupón vigente' }) mrr: number;
  @ApiProperty({ example: 2990, description: 'La parte del MRR de las suscripciones que pidieron cancelar al fin del período' }) enRiesgo: number;
  @ApiProperty({ example: 7, description: 'Suscripciones vigentes (ACTIVA o PAGO_PENDIENTE) en el corte' }) activas: number;
  @ApiProperty({ example: 1976.29, description: 'MRR entre las organizaciones vigentes de esa moneda (0 sin ninguna)' }) arpu: number;
}

export class ResumenIngresosMesDto {
  @ApiProperty({ example: '2026-11' }) mes: string;
  @ApiProperty({ format: 'date-time', description: 'El primer instante del mes en Lima' }) inicio: string;
  @ApiProperty({ format: 'date-time', description: 'El fin del mes o, en el mes en curso, el momento de la consulta' }) corte: string;
  @ApiProperty({ type: [IngresoMonedaDto] }) monedas: IngresoMonedaDto[];
  @ApiProperty({ example: 8 }) activas: number;
  @ApiProperty({ example: 9, description: 'Vigentes al empezar el mes: la base de la cancelación' }) vigentesAlInicio: number;
  @ApiProperty({ example: 1, description: 'Pasaron a CANCELADA dentro del mes' }) canceladas: number;
  @ApiProperty({ example: 11.1, description: 'Porcentaje con un decimal (0 sin base)' }) tasaCancelacion: number;
}

/** HU-1710 · El panel de ingresos de Ventas › Planes (REQ-090, PNT-35). */
export class PanelIngresosDto {
  @ApiProperty({ type: ResumenIngresosMesDto }) actual: ResumenIngresosMesDto;
  @ApiProperty({ type: ResumenIngresosMesDto }) anterior: ResumenIngresosMesDto;
  @ApiProperty({ example: -7.1, description: 'La cancelación del mes menos la del anterior, en puntos' }) variacionCancelacion: number;
}
