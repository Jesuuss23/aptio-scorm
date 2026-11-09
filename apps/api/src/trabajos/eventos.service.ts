import { Injectable, Logger, type OnModuleDestroy } from '@nestjs/common';
import { CANAL_EVENTOS, crearRedis, type EventoTrabajo, leerEvento } from '@aptio/colas';
import type { Redis } from 'ioredis';
import { filter, type Observable, Subject } from 'rxjs';

/**
 * Una sola suscripción a Redis por proceso de la API; reparte los eventos a cada conexión SSE
 * filtrando por organización. Se suscribe con la primera conexión.
 */
@Injectable()
export class EventosService implements OnModuleDestroy {
  private readonly log = new Logger('Eventos');
  private readonly eventos = new Subject<EventoTrabajo>();
  private redis?: Redis;
  private suscripcion?: Promise<void>;

  private suscribir(): Promise<void> {
    if (!this.suscripcion) {
      const redis = crearRedis();
      this.redis = redis;
      redis.on('message', (_canal: string, mensaje: string) => {
        const evento = leerEvento(mensaje);
        if (evento) this.eventos.next(evento);
      });
      redis.on('error', (e: Error) => this.log.warn(`Redis: ${e.message}`));
      this.suscripcion = redis.subscribe(CANAL_EVENTOS).then(() => undefined);
    }
    return this.suscripcion;
  }

  /** Eventos de los trabajos de una organización. Resuelve cuando la suscripción está activa. */
  async flujo(organizacionId: string): Promise<Observable<EventoTrabajo>> {
    await this.suscribir();
    return this.eventos.pipe(filter((e) => e.organizacionId === organizacionId));
  }

  onModuleDestroy(): void {
    this.eventos.complete();
    this.redis?.disconnect();
  }
}
