import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { fechaLima, horaLima } from '@aptio/schema/agenda';
import {
  conversionPaginas, contarPorDia, indicador, repartoOrigen, serieDiaria, TOPE_DEMOS_RESUMEN, type PeriodoResumen, type Tramo, validarVisita, ventanaResumen,
} from '@aptio/schema/resumen-sitio';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import type { ResumenSitioDto } from './resumen.dto.js';

/** Visitas por IP y por minuto en `POST /s/_visita`: una persona real manda una por página. */
export const LIMITE_VISITAS_POR_MINUTO = 60;
const VENTANA_MS = 60_000;

/** `dia` es una columna DATE: Prisma la lee y la escribe como medianoche UTC de esa fecha. */
const diaUtc = (fecha: string) => new Date(`${fecha}T00:00:00.000Z`);
const fechaDe = (d: Date) => d.toISOString().slice(0, 10);

/**
 * HU-1607 · Resumen del sitio (REQ-080, PNT-24, CP-138). Las cifras salen de las mismas tablas que ven Captación ›
 * Leads (Lead) y Agendamiento (AgendaCita), y las visitas del contador anónimo propio (SitioVisitaDia).
 */
@Injectable()
export class ResumenService {
  private readonly ventanas = new Map<string, { inicio: number; cuenta: number }>();

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  async resumen(periodo: PeriodoResumen, ahora = new Date()): Promise<ResumenSitioDto> {
    const v = ventanaResumen(periodo, ahora);
    const enTramo = (t: Tramo) => ({ creadoEn: { gte: t.inicio, lt: t.fin } });
    const visitasTramo = (t: Tramo) => ({ dia: { gte: diaUtc(t.desde), lte: diaUtc(t.hasta) } });
    const [visitas, visitasAntes, leads, leadsAntes, demos, demosAntes, porOrigen, proximas] = await Promise.all([
      this.bd.sitioVisitaDia.findMany({ where: visitasTramo(v.actual), select: { dia: true, ruta: true, visitas: true } }),
      this.bd.sitioVisitaDia.aggregate({ where: visitasTramo(v.anterior), _sum: { visitas: true } }),
      this.bd.lead.findMany({ where: enTramo(v.actual), select: { creadoEn: true, paginaEntrada: true } }),
      this.bd.lead.count({ where: enTramo(v.anterior) }),
      this.bd.agendaCita.findMany({ where: enTramo(v.actual), select: { creadoEn: true } }),
      this.bd.agendaCita.count({ where: enTramo(v.anterior) }),
      this.bd.lead.groupBy({ by: ['origen'], where: enTramo(v.actual), _count: { _all: true } }),
      this.bd.agendaCita.findMany({
        where: { estado: 'confirmada', inicio: { gte: ahora } }, orderBy: { inicio: 'asc' }, take: TOPE_DEMOS_RESUMEN,
        include: { tipo: { select: { nombreEs: true } }, asesor: { select: { nombre: true } } },
      }),
    ]);
    const visitasPorDia: Record<string, number> = {};
    const visitasPorRuta = new Map<string, number>();
    for (const f of visitas) {
      const d = fechaDe(f.dia);
      visitasPorDia[d] = (visitasPorDia[d] ?? 0) + f.visitas;
      visitasPorRuta.set(f.ruta, (visitasPorRuta.get(f.ruta) ?? 0) + f.visitas);
    }
    const leadsPorRuta = new Map<string, number>();
    for (const l of leads) leadsPorRuta.set(l.paginaEntrada, (leadsPorRuta.get(l.paginaEntrada) ?? 0) + 1);
    const totalVisitas = Object.values(visitasPorDia).reduce((s, n) => s + n, 0);
    return {
      periodo, desde: v.actual.desde, hasta: v.actual.hasta,
      indicadores: {
        visitas: indicador(totalVisitas, visitasAntes._sum.visitas ?? 0),
        leads: indicador(leads.length, leadsAntes),
        demos: indicador(demos.length, demosAntes),
        suscripciones: null,
      },
      serie: serieDiaria(v.actual, { visitas: visitasPorDia, leads: contarPorDia(leads.map((l) => l.creadoEn)), demos: contarPorDia(demos.map((d) => d.creadoEn)) }),
      origenes: repartoOrigen(Object.fromEntries(porOrigen.map((o) => [o.origen, o._count._all]))),
      paginas: conversionPaginas(visitasPorRuta, leadsPorRuta),
      proximasDemos: proximas.map((c) => ({
        id: c.id, inicio: c.inicio.toISOString(), fecha: fechaLima(c.inicio), hora: horaLima(c.inicio), nombre: c.nombre, empresa: c.empresa, tipo: c.tipo.nombreEs, asesor: c.asesor.nombre, estado: c.estado,
      })),
    };
  }

  /**
   * `POST /s/_visita`: suma la vista de una página (y la visita, si es la primera de la sesión) al contador del día de
   * Lima, con un solo `INSERT … ON CONFLICT` atómico. Sin datos personales: la IP solo sirve para el límite en memoria y
   * el origen se valida pero no se guarda. Los bots y el superadmin con sesión no cuentan. Devuelve si contó.
   */
  async registrar(cuerpo: unknown, d: { ip: string; agente: string | null | undefined; superadmin: boolean; bot: boolean }, ahora = new Date()): Promise<boolean> {
    this.contar(d.ip, ahora.getTime());
    const v = validarVisita(cuerpo);
    if (!v || d.bot || d.superadmin) return false;
    const dia = diaUtc(fechaLima(ahora));
    const visitas = v.primeraPagina ? 1 : 0;
    await this.bd.$executeRaw`
      INSERT INTO "SitioVisitaDia" ("id", "dia", "ruta", "idioma", "visitas", "paginasVistas")
      VALUES (gen_random_uuid(), ${dia}::date, ${v.ruta}, ${v.idioma}, ${visitas}, 1)
      ON CONFLICT ("dia", "ruta", "idioma")
      DO UPDATE SET "visitas" = "SitioVisitaDia"."visitas" + EXCLUDED."visitas", "paginasVistas" = "SitioVisitaDia"."paginasVistas" + 1`;
    return true;
  }

  /** Vacía las ventanas del límite (pruebas). */
  reiniciarLimite(): void {
    this.ventanas.clear();
  }

  private contar(ip: string, ahora: number): void {
    let w = this.ventanas.get(ip);
    if (!w || ahora - w.inicio >= VENTANA_MS) {
      w = { inicio: ahora, cuenta: 0 };
      this.ventanas.set(ip, w);
      if (this.ventanas.size > 10_000) for (const [k, x] of this.ventanas) if (ahora - x.inicio >= VENTANA_MS) this.ventanas.delete(k);
    }
    w.cuenta += 1;
    if (w.cuenta > LIMITE_VISITAS_POR_MINUTO) {
      throw new HttpException({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje: 'Demasiadas solicitudes: espera un minuto', reintentarEn: Math.ceil((w.inicio + VENTANA_MS - ahora) / 1000) }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }
}
