/**
 * HU-1710 · Panel de ingresos (REQ-090, CP-152, PNT-35). Vista de plataforma del superadmin: lee las suscripciones de
 * todas las organizaciones y aplica `panelIngresos` de `@aptio/schema/ingresos` (MRR neto por moneda, activas,
 * cancelación mensual y su variación, e ingreso promedio por cliente, por mes de Lima).
 */
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { normalizarMes, panelIngresos, type ResumenMes } from '@aptio/schema/ingresos';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { PanelIngresosDto, ResumenIngresosMesDto } from './ingresos.dto.js';

const aMesDto = (r: ResumenMes): ResumenIngresosMesDto => ({ ...r, inicio: r.inicio.toISOString(), corte: r.corte.toISOString() });

@Injectable()
export class IngresosService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  async panel(mes: unknown, ahora = new Date()): Promise<PanelIngresosDto> {
    const m = normalizarMes(mes, ahora);
    if (!m) throw new UnprocessableEntityException({ codigo: 'NO_VALIDO', mensaje: 'El mes va como AAAA-MM', detalles: [{ campo: 'mes', mensaje: 'El mes va como AAAA-MM' }] });
    const filas = await this.baseDatos.cliente.suscripcion.findMany({
      select: {
        organizacionId: true, estado: true, ciclo: true, precioPactadoSinIgv: true, moneda: true, cancelarAlFin: true, canceladaEn: true, creadoEn: true, porcentajeDescuento: true, ciclosDescuentoRestantes: true,
      },
    });
    const p = panelIngresos(filas, m, ahora);
    return { actual: aMesDto(p.actual), anterior: aMesDto(p.anterior), variacionCancelacion: p.variacionCancelacion };
  }
}
