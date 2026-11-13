import { Injectable } from '@nestjs/common';
import type { Prisma } from '@aptio/db';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';
import type { CostoClienteDto, CostoProyectoDto, CostosConsultaDto, ResumenCostosDto } from './costos.dto.js';

/** Lima no cambia de hora: un día de Lima empieza a las 05:00 UTC. */
const DESFASE_LIMA_MS = 5 * 3600_000;
const DIA_MS = 24 * 3600_000;

/** Inicio (incluido) del día de Lima `dia` (AAAA-MM-DD), en UTC. */
export const inicioDiaLima = (dia: string) => new Date(Date.parse(`${dia}T00:00:00Z`) + DESFASE_LIMA_MS);

const usd = (n: number) => Math.round(n * 10_000) / 10_000;
const num = (d: Prisma.Decimal | null | undefined) => Number(d ?? 0);

/** HU-1302 · Suma lo que registra TrabajoIA (CP-096) por proyecto, cliente y proveedor/tarea (CP-097). */
@Injectable()
export class CostosService {
  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  /** Trabajos que cuentan: los de la organización que ya llamaron a un proveedor (los encolados llevan proveedor «-»). */
  private filtro(organizacionId: string, q: CostosConsultaDto): Prisma.TrabajoIAWhereInput {
    const y: Prisma.TrabajoIAWhereInput[] = [{ organizacionId, proveedor: { not: '-' } }];
    if (q.desde || q.hasta) {
      y.push({ creadoEn: { ...(q.desde ? { gte: inicioDiaLima(q.desde) } : {}), ...(q.hasta ? { lt: new Date(inicioDiaLima(q.hasta).getTime() + DIA_MS) } : {}) } });
    }
    if (q.proyectoId) y.push({ proyectoId: q.proyectoId });
    if (q.clienteId) {
      y.push({ OR: [{ proyecto: { clienteId: q.clienteId } }, { proyectoId: null, resultado: { path: ['clienteId'], equals: q.clienteId } }] });
    }
    return { AND: y };
  }

  async resumen(u: UsuarioSesion, q: CostosConsultaDto): Promise<ResumenCostosDto> {
    const organizacionId = organizacionDe(u);
    const where = this.filtro(organizacionId, q);
    const [porProyectoBd, porProveedorBd, sinProyecto] = await Promise.all([
      this.bd.trabajoIA.groupBy({ by: ['proyectoId'], where: { AND: [where, { proyectoId: { not: null } }] }, _sum: { costoUsd: true }, _count: { _all: true } }),
      this.bd.trabajoIA.groupBy({ by: ['proveedor', 'tarea'], where, _sum: { costoUsd: true }, _count: { _all: true } }),
      this.bd.trabajoIA.findMany({ where: { AND: [where, { proyectoId: null }] }, select: { costoUsd: true, resultado: true } }),
    ]);

    const ids = porProyectoBd.map((f) => f.proyectoId!);
    const proyectos = ids.length
      ? await this.bd.proyecto.findMany({
        where: { id: { in: ids }, organizacionId },
        select: { id: true, nombre: true, clienteId: true, cliente: { select: { nombre: true } }, curso: { select: { _count: { select: { exportaciones: { where: { estado: 'COMPLETADO' } } } } } } },
      })
      : [];
    const datos = new Map(proyectos.map((p) => [p.id, p]));
    const porProyecto: CostoProyectoDto[] = porProyectoBd.flatMap((f) => {
      const p = datos.get(f.proyectoId!);
      if (!p) return [];
      return [{ proyectoId: p.id, nombre: p.nombre, clienteId: p.clienteId, cliente: p.cliente.nombre, llamadas: f._count._all, usd: usd(num(f._sum.costoUsd)), exportado: (p.curso?._count.exportaciones ?? 0) > 0 }];
    }).sort((a, b) => b.usd - a.usd || a.nombre.localeCompare(b.nombre));

    // Por cliente: sus proyectos y lo que se hizo para el cliente sin proyecto (p. ej. la propuesta del kit, IA-18).
    const clientes = new Map<string, { proyectos: number; sinProyecto: number; nombre?: string }>();
    const sumar = (id: string, campo: 'proyectos' | 'sinProyecto', n: number, nombre?: string) => {
      const c = clientes.get(id) ?? { proyectos: 0, sinProyecto: 0 };
      c[campo] += n;
      if (nombre) c.nombre = nombre;
      clientes.set(id, c);
    };
    for (const p of porProyecto) sumar(p.clienteId, 'proyectos', p.usd, p.cliente);
    for (const t of sinProyecto) {
      const clienteId = (t.resultado as { clienteId?: unknown } | null)?.clienteId;
      if (typeof clienteId === 'string') sumar(clienteId, 'sinProyecto', num(t.costoUsd));
    }
    const faltan = [...clientes].filter(([, c]) => !c.nombre).map(([id]) => id);
    if (faltan.length) {
      for (const c of await this.bd.cliente.findMany({ where: { id: { in: faltan }, organizacionId }, select: { id: true, nombre: true } })) clientes.get(c.id)!.nombre = c.nombre;
    }
    const porCliente: CostoClienteDto[] = [...clientes].filter(([, c]) => c.nombre).map(([clienteId, c]) => ({
      clienteId, nombre: c.nombre!, proyectosUsd: usd(c.proyectos), sinProyectoUsd: usd(c.sinProyecto), usd: usd(c.proyectos + c.sinProyecto),
    })).sort((a, b) => b.usd - a.usd || a.nombre.localeCompare(b.nombre));

    const porProveedorTarea = porProveedorBd
      .map((f) => ({ proveedor: f.proveedor, tarea: f.tarea, llamadas: f._count._all, usd: usd(num(f._sum.costoUsd)) }))
      .sort((a, b) => b.usd - a.usd || a.proveedor.localeCompare(b.proveedor) || a.tarea.localeCompare(b.tarea));
    const totalUsd = usd(porProveedorBd.reduce((s, f) => s + num(f._sum.costoUsd), 0));

    // Promedio por SCORM: sobre los proyectos con paquete exportado; mientras no haya, sobre los que tienen gasto.
    const exportados = porProyecto.filter((p) => p.exportado);
    const criterioPromedio = exportados.length ? 'exportados' : 'con-gasto';
    const base = exportados.length ? exportados : porProyecto.filter((p) => p.usd > 0);
    const promedioPorScormUsd = base.length ? usd(base.reduce((s, p) => s + p.usd, 0) / base.length) : 0;

    return { totalUsd, scormContados: base.length, promedioPorScormUsd, criterioPromedio, porProyecto, porCliente, porProveedorTarea };
  }
}
