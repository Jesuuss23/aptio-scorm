import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { COLA_MANTENIMIENTO, type DatosPrerender, idPrerender, opcionesRedis, prefijoColas, TAREA_PRERENDER } from '@aptio/colas';
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

  async encolar(numero: number): Promise<void> {
    this.cola ??= new Queue(COLA_MANTENIMIENTO, { connection: opcionesRedis(), prefix: prefijoColas() });
    let reloj: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.cola.add(TAREA_PRERENDER, { numero } satisfies DatosPrerender, { jobId: idPrerender(numero), removeOnComplete: true, removeOnFail: 100 }),
        new Promise<never>((_, rechazar) => { reloj = setTimeout(() => rechazar(new Error('Redis no respondió a tiempo')), PLAZO_REDIS_MS); }),
      ]);
    } catch (e) {
      const error = `No se pudo pedir el pre-render: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500);
      this.log.warn(error);
      await this.baseDatos.cliente.sitioVersion.update({ where: { numero }, data: { prerenderEstado: 'error', prerenderEn: new Date(), prerenderError: error } });
    } finally {
      clearTimeout(reloj);
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.cola?.close();
  }
}
