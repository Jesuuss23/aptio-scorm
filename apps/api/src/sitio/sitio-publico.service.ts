import { Injectable } from '@nestjs/common';
import { CLAVE_ACTUAL, claveVersion, leerFuente, opcionesRenderDesdeEnv, type Pedido, type PunteroSitio, renderizar404 } from '@aptio/sitio';
import { AlmacenService } from '../recursos/almacen.service.js';

/** Cuánto se confía en el puntero leído antes de volver a leerlo del bucket. La CDN, delante, guarda las páginas un minuto. */
export const PLAZO_PUNTERO_MS = 5000;
const MAX_OBJETOS = 300;

const noExiste = (e: unknown) =>
  ['NoSuchKey', 'NotFound'].includes((e as { name?: string }).name ?? '') || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;

export interface Respuesta { estado: 200 | 404; tipo: Pedido['tipo'] | '404'; cuerpo: Uint8Array }

/**
 * HU-1508 · Sirve el sitio pre-renderizado (DA-08): lee `sitio/actual.json` para saber qué versión se ve y entrega el
 * archivo de esa versión. Las versiones son inmutables, así que lo leído se guarda en memoria por (versión, archivo);
 * el puntero, solo unos segundos. Las fuentes salen del paquete, igual que las que el worker sube al bucket.
 */
@Injectable()
export class SitioPublicoService {
  private puntero: { valor: PunteroSitio | null; hasta: number } | null = null;
  private readonly objetos = new Map<string, Uint8Array | null>();

  constructor(private readonly almacen: AlmacenService) {}

  /** Para las pruebas: olvidar el puntero leído. */
  olvidar(): void {
    this.puntero = null;
  }

  async version(): Promise<number | null> {
    const ahora = Date.now();
    if (!this.puntero || this.puntero.hasta < ahora) {
      const bruto = await this.leer(CLAVE_ACTUAL, false);
      let valor: PunteroSitio | null = null;
      try {
        const p = bruto ? (JSON.parse(new TextDecoder().decode(bruto)) as Partial<PunteroSitio>) : null;
        valor = p && typeof p.version === 'number' ? { version: p.version, generadoEn: String(p.generadoEn ?? '') } : null;
      } catch {
        valor = null;
      }
      this.puntero = { valor, hasta: ahora + PLAZO_PUNTERO_MS };
    }
    return this.puntero.valor?.version ?? null;
  }

  async servir(pedido: Pedido | null): Promise<Respuesta> {
    if (pedido?.tipo === 'fuente') {
      const f = leerFuente(pedido.archivo);
      return f ? { estado: 200, tipo: 'fuente', cuerpo: f } : this.noEncontrada(null);
    }
    const version = await this.version();
    if (version === null) return this.noEncontrada(null);
    if (pedido) {
      const cuerpo = await this.leer(claveVersion(version, pedido.archivo), true);
      if (cuerpo) return { estado: 200, tipo: pedido.tipo, cuerpo };
    }
    return this.noEncontrada(version);
  }

  private async noEncontrada(version: number | null): Promise<Respuesta> {
    const guardada = version === null ? null : await this.leer(claveVersion(version, '404.html'), true);
    return { estado: 404, tipo: '404', cuerpo: guardada ?? new TextEncoder().encode(renderizar404(null, opcionesRenderDesdeEnv())) };
  }

  /** El objeto, o `null` si no existe. Con `guardar`, se recuerda (también que no existe): la versión no cambia. */
  private async leer(clave: string, guardar: boolean): Promise<Uint8Array | null> {
    if (guardar && this.objetos.has(clave)) return this.objetos.get(clave)!;
    let cuerpo: Uint8Array | null;
    try {
      cuerpo = await this.almacen.almacen.leer(clave);
    } catch (e) {
      if (!noExiste(e)) throw e;
      cuerpo = null;
    }
    if (guardar) {
      if (this.objetos.size >= MAX_OBJETOS) this.objetos.delete(this.objetos.keys().next().value!);
      this.objetos.set(clave, cuerpo);
    }
    return cuerpo;
  }
}
