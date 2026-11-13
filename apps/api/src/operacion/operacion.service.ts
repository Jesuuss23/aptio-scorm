import { ConflictException, Injectable, type OnModuleDestroy, ServiceUnavailableException } from '@nestjs/common';
import {
  COLA_MANTENIMIENTO, COLAS, type DatosRespaldo, ID_RESPALDO_MANUAL, opcionesRedis, prefijoColas, TAREA_RESPALDO,
} from '@aptio/colas';
import {
  agruparErrores, DIAS_ETAPAS, type EstadoCola, type FalloCola, inicioDiaLima, type Operacion, RETENCION_RESPALDOS_DIAS, resumirEtapas,
  ventanasErrores,
} from '@aptio/schema/operacion';
import { Queue } from 'bullmq';
import { BaseDatosService } from '../base-datos/base-datos.service.js';
import { organizacionDe } from '../comun/organizacion.js';
import type { UsuarioSesion } from '../comun/roles.js';

const PLAZO_REDIS_MS = 2000;
const NOMBRES = [...COLAS, COLA_MANTENIMIENTO];

/** La promesa, o el error de plazo si Redis no responde a tiempo (la vista se muestra igual, sin colas). */
function conPlazo<T>(p: Promise<T>, ms = PLAZO_REDIS_MS): Promise<T> {
  let reloj: NodeJS.Timeout;
  return Promise.race([p, new Promise<never>((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error('Redis no respondió a tiempo')), ms);
  })]).finally(() => clearTimeout(reloj));
}

/**
 * HU-1403 · Empresa › Operación (M15): errores por proveedor (24 h y 7 días de Lima) desde TrabajoIA y los fallos de
 * BullMQ de la organización, el estado de las colas, el tiempo y el costo por etapa (30 días) y las copias de seguridad
 * de los últimos 14 días. Errores y etapas son de la organización; colas y copias, de la plataforma (SUP-159).
 */
@Injectable()
export class OperacionService implements OnModuleDestroy {
  private readonly colas = new Map<string, Queue>();

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get bd() {
    return this.baseDatos.cliente;
  }

  private cola(nombre: string): Queue {
    let q = this.colas.get(nombre);
    if (!q) {
      q = new Queue(nombre, { connection: opcionesRedis(), prefix: prefijoColas() });
      this.colas.set(nombre, q);
    }
    return q;
  }

  async ver(u: UsuarioSesion, ahora = new Date()): Promise<Operacion> {
    const organizacionId = organizacionDe(u);
    const { desde24h, desde7d } = ventanasErrores(ahora);
    const desdeEtapas = inicioDiaLima(ahora, DIAS_ETAPAS - 1);
    const desdeRespaldos = new Date(ahora.getTime() - RETENCION_RESPALDOS_DIAS * 24 * 3600_000);

    const [trabajos, etapas, respaldos, ultimoExitoso, estadoColas] = await Promise.all([
      this.bd.trabajoIA.findMany({
        where: { organizacionId, creadoEn: { gte: desde7d } },
        select: { id: true, proveedor: true, estado: true, error: true, creadoEn: true, generacionId: true, proyectoId: true },
      }),
      this.bd.generacionEtapa.findMany({
        where: { generacion: { organizacionId }, inicio: { gte: desdeEtapas } },
        select: { etapa: true, estado: true, inicio: true, fin: true, costoUsd: true },
      }),
      this.bd.respaldo.findMany({ where: { fecha: { gte: desdeRespaldos } }, orderBy: { fecha: 'desc' } }),
      this.bd.respaldo.findFirst({ where: { estado: 'EXITOSO' }, orderBy: { fecha: 'desc' }, select: { fecha: true } }),
      this.leerColas(organizacionId, desde7d).catch(() => null),
    ]);

    // Un fallo de BullMQ que ya dejó su TrabajoIA (o es el de su generación o su proyecto) no se cuenta dos veces.
    const conocidos = new Set(trabajos.flatMap((t) => [t.id, t.generacionId, t.proyectoId].filter((x): x is string => Boolean(x))));
    const fallos = (estadoColas?.fallos ?? []).filter((f) => !f.trabajoId || !conocidos.has(f.trabajoId));

    return {
      generadoEn: ahora.toISOString(),
      errores: { desde24h: desde24h.toISOString(), desde7d: desde7d.toISOString(), porProveedor: agruparErrores(trabajos, fallos, ahora) },
      colas: estadoColas?.colas ?? null,
      etapas: { desde: desdeEtapas.toISOString(), porEtapa: resumirEtapas(etapas.map((e) => ({ ...e, costoUsd: Number(e.costoUsd) }))) },
      respaldos: {
        retencionDias: RETENCION_RESPALDOS_DIAS,
        ultimoExitoso: ultimoExitoso?.fecha.toISOString() ?? null,
        enCurso: respaldos.some((r) => r.estado === 'EN_CURSO'),
        lista: respaldos.map((r) => ({
          id: r.id, fecha: r.fecha.toISOString(), estado: r.estado, origen: r.origen === 'manual' ? 'manual' : 'programado',
          tamanoBytes: r.tamanoBytes === null ? null : Number(r.tamanoBytes), duracionMs: r.duracionMs, objetos: r.objetos, error: r.error,
        })),
      },
    };
  }

  private async leerColas(organizacionId: string, desde: Date): Promise<{ colas: EstadoCola[]; fallos: (FalloCola & { trabajoId: string | undefined })[] }> {
    return conPlazo(Promise.all(NOMBRES.map(async (nombre) => {
      const q = this.cola(nombre);
      const c = await q.getJobCounts('waiting', 'delayed', 'prioritized', 'waiting-children', 'active', 'failed');
      const fallidos = nombre === COLA_MANTENIMIENTO ? [] : await q.getFailed(0, 499);
      return {
        cola: { nombre, pendientes: (c.waiting ?? 0) + (c.delayed ?? 0) + (c.prioritized ?? 0) + (c['waiting-children'] ?? 0), activos: c.active ?? 0, fallidos: c.failed ?? 0 },
        fallos: fallidos
          .filter((j) => (j.data as { organizacionId?: string } | undefined)?.organizacionId === organizacionId && (j.finishedOn ?? 0) >= desde.getTime())
          .map((j) => ({ cola: nombre, error: j.failedReason || 'Falló sin detalle', en: new Date(j.finishedOn!), trabajoId: (j.data as { trabajoId?: string }).trabajoId })),
      };
    }))).then((r) => ({ colas: r.map((x) => x.cola), fallos: r.flatMap((x) => x.fallos) }));
  }

  /** «Respaldar ahora»: encola una copia manual. Si ya hay una copia corriendo o la manual sigue pendiente, 409. */
  async respaldar(u: UsuarioSesion): Promise<{ encolado: boolean }> {
    const organizacionId = organizacionDe(u);
    const q = this.cola(COLA_MANTENIMIENTO);
    try {
      await conPlazo((async () => {
        // La programada de las 03:00 vive como trabajo con demora: solo cuenta si ya está corriendo.
        const corriendo = (await q.getJobs(['active'])).some((j) => j.name === TAREA_RESPALDO);
        const previo = await q.getJob(ID_RESPALDO_MANUAL);
        const estado = previo ? await previo.getState() : null;
        if (corriendo || (estado && ['waiting', 'active', 'delayed', 'prioritized'].includes(estado))) {
          throw new ConflictException({ codigo: 'RESPALDO_EN_CURSO', mensaje: 'Ya hay una copia de seguridad en curso: espera a que termine' });
        }
        if (previo) await previo.remove();
        const datos: DatosRespaldo = { origen: 'manual', solicitadoPorId: u.id };
        await q.add(TAREA_RESPALDO, datos, { jobId: ID_RESPALDO_MANUAL, removeOnComplete: true, removeOnFail: true });
      })());
    } catch (e) {
      if (e instanceof ConflictException) throw e;
      throw new ServiceUnavailableException({ codigo: 'COLAS_NO_DISPONIBLES', mensaje: 'La cola de mantenimiento no responde: intenta en un momento' });
    }
    await this.bd.auditoria.create({ data: { organizacionId, usuarioId: u.id, accion: 'RESPALDO_SOLICITADO', entidad: 'Respaldo', datos: { origen: 'manual' } } });
    return { encolado: true };
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all([...this.colas.values()].map((q) => q.close()));
  }
}
