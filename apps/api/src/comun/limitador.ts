// Límites por IP de las rutas sin sesión (sitio, chatbot, popups, leads, citas, pago, cupones, visitas e ingreso), en
// Redis: todas las instancias de la API cuentan en la misma ventana, así que el límite no se multiplica al escalar. Si
// Redis no responde, cada instancia sigue contando en su memoria (como antes) hasta que vuelva, para no dejar las rutas
// sin límite ni tumbarlas.
import { Global, HttpException, HttpStatus, Injectable, Logger, Module, type OnModuleDestroy } from '@nestjs/common';
import { opcionesRedis } from '@aptio/colas';
import { Redis } from 'ioredis';

export interface Limite {
  /** Peticiones permitidas en cada ventana. */
  envios: number;
  ventanaMs: number;
}

export interface Conteo {
  /** Peticiones en la ventana actual, contando esta. */
  cuenta: number;
  /** Milisegundos que faltan para que la ventana se reinicie. */
  restanteMs: number;
}

/**
 * Ventana fija atómica: la primera petición crea la clave con su vencimiento; las siguientes solo suman. Si la clave
 * quedó sin vencimiento (no debería), se le pone.
 */
const SCRIPT = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
if ttl < 0 then redis.call('PEXPIRE', KEYS[1], ARGV[1]); ttl = tonumber(ARGV[1]) end
return {n, ttl}
`;

/** Prefijo de las claves; las pruebas usan uno propio por archivo para no contarse entre ellas. */
export const prefijoLimites = (env: NodeJS.ProcessEnv = process.env): string => env.LIMITES_PREFIJO ?? 'aptio:limite';

@Injectable()
export class LimitadorService implements OnModuleDestroy {
  private readonly log = new Logger('Limites');
  private readonly redis: Redis | null;
  private readonly memoria = new Map<string, { inicio: number; cuenta: number }>();
  /** Época de cada grupo: `reiniciar` la cambia y las claves anteriores vencen solas. */
  private readonly epocas = new Map<string, string>();
  private avisado = false;
  readonly prefijo = prefijoLimites();

  constructor() {
    // LIMITES_EN_MEMORIA=true (desarrollo sin Redis): cada instancia cuenta por su cuenta, como antes.
    if (process.env.LIMITES_EN_MEMORIA === 'true') {
      this.redis = null;
      return;
    }
    // Sin cola de espera ni reintentos: si Redis no está, la petición no espera; cuenta en memoria.
    this.redis = new Redis({ ...opcionesRedis(), lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, commandTimeout: 500 });
    this.redis.on('error', (e: Error) => this.avisar(e));
    this.redis.on('ready', () => { this.avisado = false; });
    this.redis.connect().catch((e: unknown) => this.avisar(e));
  }

  /** Dónde se cuenta ahora (para la salud y las pruebas). */
  get almacen(): 'redis' | 'memoria' {
    return this.redis?.status === 'ready' ? 'redis' : 'memoria';
  }

  /** Suma una petición de `ip` al grupo y devuelve cuántas van en la ventana. */
  async contar(grupo: string, ip: string, limite: Limite): Promise<Conteo> {
    const clave = `${this.prefijo}:${grupo}:${this.epocas.get(grupo) ?? '0'}:${ip}`;
    if (this.redis?.status === 'ready') {
      try {
        const [cuenta, restanteMs] = (await this.redis.eval(SCRIPT, 1, clave, String(limite.ventanaMs))) as [number, number];
        return { cuenta, restanteMs };
      } catch (e) {
        this.avisar(e);
      }
    }
    return this.enMemoria(clave, limite);
  }

  /** Cuenta la petición y, si pasa el límite, responde 429 DEMASIADAS_SOLICITUDES con los segundos que faltan. */
  async exigir(grupo: string, ip: string, limite: Limite, mensaje: string): Promise<void> {
    const { cuenta, restanteMs } = await this.contar(grupo, ip, limite);
    if (cuenta > limite.envios) {
      throw new HttpException({ codigo: 'DEMASIADAS_SOLICITUDES', mensaje, reintentarEn: Math.max(1, Math.ceil(restanteMs / 1000)) }, HttpStatus.TOO_MANY_REQUESTS);
    }
  }

  /** Empieza de cero las ventanas de un grupo (pruebas). */
  reiniciar(grupo: string): void {
    this.epocas.set(grupo, Math.random().toString(36).slice(2, 10));
    for (const k of this.memoria.keys()) if (k.startsWith(`${this.prefijo}:${grupo}:`)) this.memoria.delete(k);
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
  }

  private enMemoria(clave: string, limite: Limite): Conteo {
    const ahora = Date.now();
    let v = this.memoria.get(clave);
    if (!v || ahora - v.inicio >= limite.ventanaMs) {
      v = { inicio: ahora, cuenta: 0 };
      this.memoria.set(clave, v);
      if (this.memoria.size > 10_000) for (const [k, x] of this.memoria) if (ahora - x.inicio >= limite.ventanaMs) this.memoria.delete(k);
    }
    v.cuenta += 1;
    return { cuenta: v.cuenta, restanteMs: v.inicio + limite.ventanaMs - ahora };
  }

  private avisar(e: unknown): void {
    if (this.avisado) return;
    this.avisado = true;
    this.log.warn(`Redis no responde: los límites por IP cuentan en la memoria de esta instancia (${e instanceof Error ? e.message : String(e)})`);
  }
}

@Global()
@Module({ providers: [LimitadorService], exports: [LimitadorService] })
export class LimitadorModule {}
