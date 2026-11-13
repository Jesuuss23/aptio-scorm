import { ApiProperty } from '@nestjs/swagger';
import type { ErroresProveedor, EstadoCola, Operacion, RespaldoResumen, ResumenEtapa } from '@aptio/schema/operacion';

/** HU-1403 · Empresa › Operación: la forma completa está en `Operacion` de @aptio/schema/operacion y en openapi.yaml. */
export class OperacionDto implements Operacion {
  @ApiProperty({ format: 'date-time' }) generadoEn: string;
  @ApiProperty({ description: 'Errores por proveedor en las últimas 24 h y en los últimos 7 días de Lima' })
  errores: { desde24h: string; desde7d: string; porProveedor: ErroresProveedor[] };
  @ApiProperty({ nullable: true, description: 'Trabajos pendientes, activos y fallidos por cola; null si Redis no respondió' }) colas: EstadoCola[] | null;
  @ApiProperty({ description: 'Tiempo y costo promedio por etapa de la generación (30 días)' }) etapas: { desde: string; porEtapa: ResumenEtapa[] };
  @ApiProperty({ description: 'Copias de seguridad de los últimos 14 días' })
  respaldos: { retencionDias: number; ultimoExitoso: string | null; enCurso: boolean; lista: RespaldoResumen[] };
}

export class RespaldoSolicitadoDto {
  @ApiProperty({ description: 'La copia quedó en la cola de mantenimiento' }) encolado: boolean;
}
