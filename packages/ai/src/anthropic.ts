// Proveedor de texto con la API de Anthropic (Claude). Responde JSON en texto: el esquema se valida con Ajv en
// ejecutarTarea, porque los modelos actuales no aceptan forzar una herramienta y los esquemas usan $ref al del curso.
import Anthropic from '@anthropic-ai/sdk';
import type { MensajeProveedor, ProveedorTexto, RespuestaProveedor } from './texto.js';

/** Modelo por defecto de todas las variables de modelo, salvo que el entorno indique otro. */
export const MODELO_POR_DEFECTO = 'claude-opus-5-5';
type Esfuerzo = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface OpcionesAnthropic {
  apiKey?: string;
  /** Valores de ANTHROPIC_MODEL_TEXTO, ANTHROPIC_MODEL_RAPIDO y ANTHROPIC_MODEL_PANTALLAS. */
  modelos?: Partial<Record<string, string>>;
  esfuerzo?: Esfuerzo;
  /** Para pruebas: un cliente ya construido. */
  cliente?: Anthropic;
}

export function proveedorAnthropic(o: OpcionesAnthropic = {}): ProveedorTexto {
  const cliente = o.cliente ?? new Anthropic(o.apiKey ? { apiKey: o.apiKey } : {});
  return {
    nombre: 'anthropic',
    modeloPara: (variable) => o.modelos?.[variable] || MODELO_POR_DEFECTO,
    async completar({ modelo, sistema, mensajes, maxTokens }): Promise<RespuestaProveedor> {
      const r = await cliente.beta.messages
        .stream({
          model: modelo,
          max_tokens: Math.max(maxTokens, 16000),
          system: [{ type: 'text', text: sistema, cache_control: { type: 'ephemeral' } }],
          messages: mensajes.map((m: MensajeProveedor) => ({ role: m.rol, content: m.texto })),
          output_config: { effort: o.esfuerzo ?? 'medium' },
          // Si el modelo declina por sus filtros de seguridad, la API reintenta con un modelo de respaldo.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
        })
        .finalMessage();
      if (r.stop_reason === 'refusal') throw new Error(`El modelo declinó la tarea (${r.stop_details?.category ?? 'sin categoría'})`);
      if (r.stop_reason === 'max_tokens') throw new Error('La respuesta se cortó por el límite de tokens');
      const texto = r.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('');
      return {
        texto,
        modelo: r.model,
        consumo: {
          tokensEntrada: r.usage.input_tokens,
          tokensSalida: r.usage.output_tokens,
          tokensCacheLeidos: r.usage.cache_read_input_tokens ?? 0,
          tokensCacheEscritos: r.usage.cache_creation_input_tokens ?? 0,
        },
      };
    },
  };
}

/** Elige el proveedor según PROVEEDORES_MODO: `simulado` (por defecto, sin red) o `real` (necesita ANTHROPIC_API_KEY). */
export function proveedorDesdeEntorno(entorno: NodeJS.ProcessEnv, simulado: () => ProveedorTexto): ProveedorTexto {
  if ((entorno.PROVEEDORES_MODO ?? 'simulado') === 'simulado') return simulado();
  return proveedorAnthropic({
    ...(entorno.ANTHROPIC_API_KEY ? { apiKey: entorno.ANTHROPIC_API_KEY } : {}),
    modelos: {
      ANTHROPIC_MODEL_TEXTO: entorno.ANTHROPIC_MODEL_TEXTO,
      ANTHROPIC_MODEL_RAPIDO: entorno.ANTHROPIC_MODEL_RAPIDO,
      ANTHROPIC_MODEL_PANTALLAS: entorno.ANTHROPIC_MODEL_PANTALLAS,
    },
    ...(entorno.ANTHROPIC_ESFUERZO ? { esfuerzo: entorno.ANTHROPIC_ESFUERZO as Esfuerzo } : {}),
  });
}
