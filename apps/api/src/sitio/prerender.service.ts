import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { COLA_MANTENIMIENTO, type DatosBlog, type DatosPrerender, ID_BLOG_MANUAL, idPrerender, idRehacerPrerender, opcionesRedis, prefijoColas, TAREA_BLOG, TAREA_PRERENDER } from '@aptio/colas';
import { Queue } from 'bullmq';
import { BaseDatosService } from '../base-datos/base-datos.service.js';

const PLAZO_REDIS_MS = 2000;

/**
 * HU-1508 · Pide al worker el pre-render de una versión del sitio (DA-08). Si Redis no responde, la versión queda en
 * error con el motivo: el panel lo muestra y el worker la retoma al arrancar si es la última.
 */
@Injectable()
export class PrerenderService implements OnModuleDestroy {
  private readonly log = new Logger('PrerenderService');
  private cola?: Queue;

  constructor(private readonly baseDatos: BaseDatosService) {}

  private get mantenimiento(): Queue {
    this.cola ??= new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    return this.cola;
  }

  /** La promesa, o un error si Redis no responde en 2 s. */
  private async conPlazo<T>(p: Promise<T>): Promise<T> {
    let reloj: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([p, new Promise<never>((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('Redis no respondió a tiempo')), PLAZO_REDIS_MS); })]);
    } finally {
      clearTimeout(reloj);
    }
  }

  /**
   * HU-1511 · `rehacer`: la versión ya se renderizó, pero cambió algo de fuera de la instantánea (el blog), así que se
   * vuelve a renderizar con un id de trabajo propio.
   */
  async encolar(numero: number, opciones: { rehacer?: boolean } = {}): Promise<void> {
    try {
      await this.conPlazo(this.mantenimiento.add(TAREA_PRERENDER, { numero } satisfies DatosPrerender, {
        jobId: opciones.rehacer ? idRehacerPrerender(numero) : idPrerender(numero), removeOnComplete: true, removeOnFail: 100,
      }));
    } catch (e) {
      const error = `No se pudo pedir el pre-render: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
      this.log.warn(error);
      await this.baseDatos.cliente.sitioVersion.update({ where: { numero }, data: { prerenderEstado: 'error', prerenderEn: new Date(), prerenderError: error } });
    }
  }

  /** HU-1511 · «Sincronizar ahora»: encola la lectura de WordPress sin esperar la frecuencia. Lanza si Redis no responde. */
  async sincronizarBlog(datos: DatosBlog): Promise<void> {
    await this.conPlazo((async () => {
      const previo = await this.mantenimiento.getJob(ID_BLOG_MANUAL);
      const estado = previo ? await previo.getState() : null;
      // Si la pedida antes sigue en espera o corriendo, esa misma sirve.
      if (estado === 'waiting' || estado === 'active' || estado === 'delayed' || estado === 'prioritized') return;
      if (previo) await previo.remove();
      await this.mantenimiento.add(TAREA_BLOG, { ...datos, forzar: true } satisfies DatosBlog, { jobId: ID_BLOG_MANUAL, removeOnComplete: true, removeOnFail: true });
    })());
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }
}
