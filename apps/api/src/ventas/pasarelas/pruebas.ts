/**
 * HU-1703 · HU-1704 · La pasarela de pruebas (código `pruebas`): solo existe con `SITIO_ENTORNO=pruebas`, cobra en soles
 * y en dólares con las tarjetas de prueba y firma sus eventos con HMAC-SHA256 (`X-Aptio-Firma: sha256=<hex>`) usando
 * `PAGO_PRUEBA_SECRETO` (sin la variable, un secreto local fijo que solo vale en pruebas).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ModoPasarela } from '@aptio/schema/pasarelas';
import { leerEventoPrueba } from '@aptio/schema/suscripciones';
import { type Cabeceras, cabecera, type EventoLeido, jsonDe, type Pasarela, type PagoCreado, type Reembolso } from './contrato.js';

export const CABECERA_FIRMA = 'x-aptio-firma';
const SECRETO_PRUEBA_LOCAL = 'secreto-local-de-la-pasarela-de-pruebas';

export const firmar = (secreto: string, cuerpo: Buffer | string) => `sha256=${createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

/** Compara la firma recibida con la esperada en tiempo constante. */
export function firmaValida(secreto: string, cuerpo: Buffer, recibida: string | undefined): boolean {
  if (!recibida) return false;
  const a = Buffer.from(firmar(secreto, cuerpo));
  const b = Buffer.from(recibida.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}

export class PasarelaPruebas implements Pasarela {
  readonly codigo = 'pruebas' as const;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {}

  secreto(): string {
    return this.env.PAGO_PRUEBA_SECRETO || SECRETO_PRUEBA_LOCAL;
  }

  variablesFaltantes(_modo: ModoPasarela): string[] {
    return [];
  }

  async crearPago(): Promise<PagoCreado> {
    return { tipo: 'simulado' };
  }

  verificarFirmaWebhook(_modo: ModoPasarela, cuerpo: Buffer, cabeceras: Cabeceras): boolean {
    return firmaValida(this.secreto(), cuerpo, cabecera(cabeceras, CABECERA_FIRMA));
  }

  leerEvento(cuerpo: Buffer): EventoLeido {
    const evento = leerEventoPrueba(jsonDe(cuerpo));
    return evento ? { tipo: 'evento', evento } : { tipo: 'invalido' };
  }

  async reembolsar(_modo: ModoPasarela, r: Reembolso): Promise<{ reembolsoId: string }> {
    return { reembolsoId: `prueba_reembolso_${r.idempotencia}` };
  }
}
