// HU-0405 y HU-1301 · Tareas de texto validadas con reintentos y costo por consumo.
import type Anthropic from '@anthropic-ai/sdk';
import { describe, expect, it } from 'vitest';
import { proveedorAnthropic } from '../src/anthropic.js';
import { leerSalidaSimulada } from '../src/simulado.js';
import { armarPrompt, costoTexto, ejecutarTarea, proveedorSimulado, SalidaNoValida } from '../src/texto.js';

const variables = {
  cliente: { nombre: 'Minera Andina' }, glosario: [{ termino: 'LOTO', noTraducir: true }],
  proyecto: { tema: 'Bloqueo y etiquetado', publico: 'Operarios', metaMinutos: 8 },
  documento: { id: 'doc-1', nombre: 'manual.pdf', rango: '1-84', texto_por_pagina: '[p. 1] Aplica el candado.' },
};

describe('prompts versionados', () => {
  it('arma IA-01 con el bloque común, las variables y el material delimitado', () => {
    const p = armarPrompt('IA-01', variables);
    expect(p).toMatchObject({ tarea: 'IA-01', version: 'v1', variableModelo: 'ANTHROPIC_MODEL_TEXTO', maxTokens: 6000 });
    expect(p.sistema).toContain('Eres parte de Aptio SCORM');
    expect(p.sistema).toContain('para Minera Andina.');
    expect(p.sistema).toContain('"termino": "LOTO"');
    expect(p.sistema).not.toContain('{{');
    expect(p.usuario).toContain('<material_cliente archivo="manual.pdf" paginas="1-84">\n[p. 1] Aplica el candado.');
    expect(p.usuario).toContain('Objetivos dados por el cliente (pueden faltar): (no indicado)');
  });
});

describe('salidas validadas y reintentos (CP-041)', () => {
  const valida = leerSalidaSimulada('IA-01').datos as Record<string, unknown>;
  const sinTemas = JSON.stringify({ ...valida, temas: undefined });

  it('una salida válida se acepta al primer intento', async () => {
    const r = await ejecutarTarea(proveedorSimulado(), 'IA-01', variables);
    expect(r).toMatchObject({ proveedor: 'simulado', modelo: 'simulado-loto', versionPrompt: 'IA-01.v1', intentos: 1, costoUsd: 0 });
    // El modo simulado responde el caso LOTO con el documentoId pedido.
    expect(r.datos).toEqual({ ...valida, documentoId: 'doc-1' });
  });

  it('una lista en vez de un objeto no se acepta', async () => {
    const prov = proveedorSimulado({ 'IA-01': [JSON.stringify([valida, valida])] });
    const r = await ejecutarTarea(prov, 'IA-01', variables);
    expect(r.intentos).toBe(2);
    expect(prov.llamadas[1]!.mensajes.at(-1)!.texto).toContain('La respuesta debe ser un objeto JSON, no una lista');
  });

  it('sin un campo obligatorio, reintenta con el error y acepta la corrección', async () => {
    const prov = proveedorSimulado({ 'IA-01': [sinTemas, '{ no es json'] });
    const r = await ejecutarTarea(prov, 'IA-01', variables);
    expect(r.intentos).toBe(3);
    expect(prov.llamadas).toHaveLength(3);
    const segundo = prov.llamadas[1]!.mensajes;
    expect(segundo.map((m) => m.rol)).toEqual(['user', 'assistant', 'user']);
    expect(segundo[2]!.texto).toContain("must have required property 'temas'");
    expect(prov.llamadas[2]!.mensajes.at(-1)!.texto).toContain('no es JSON válido');
  });

  it('si falla 3 veces, lanza SalidaNoValida con el consumo y nada se devuelve', async () => {
    const prov = proveedorSimulado({ 'IA-01': [sinTemas, sinTemas, sinTemas] });
    const e = await ejecutarTarea(prov, 'IA-01', variables).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(SalidaNoValida);
    expect((e as SalidaNoValida).registro.intentos).toBe(3);
    expect((e as SalidaNoValida).errores[0]).toContain("'temas'");
  });

  it('acepta reglas propias además del esquema', async () => {
    const e = await ejecutarTarea(proveedorSimulado(), 'IA-01', variables, { validarExtra: () => ['faltan páginas'] }).catch((x: unknown) => x);
    expect((e as SalidaNoValida).errores).toEqual(['faltan páginas']);
  });
});

describe('modo simulado ajustado al pedido', () => {
  const tema = (id: string) => ({ ...variables, tema: { id, titulo: 'Tema' } });

  it('IA-03 responde el resumen del tema pedido', async () => {
    const r = await ejecutarTarea<{ temaId: string; fragmentos: { id: string }[] }>(proveedorSimulado(), 'IA-03', tema('t06'));
    expect(r.datos.temaId).toBe('t06');
  });

  it('IA-03 de un tema sin grabación usa la primera con el id del tema', async () => {
    const r = await ejecutarTarea<{ temaId: string; fragmentos: { id: string }[] }>(proveedorSimulado(), 'IA-03', tema('d2-t04'));
    expect(r.datos.temaId).toBe('d2-t04');
    expect(r.datos.fragmentos[0]!.id).toBe('d2-t04-f01');
  });
});

describe('costo por trabajo (CP-096)', () => {
  it('calcula el costo con la tarifa del modelo que respondió', () => {
    expect(costoTexto('claude-opus-5-5', { tokensEntrada: 1_000_000, tokensSalida: 100_000, tokensCacheLeidos: 0, tokensCacheEscritos: 0 })).toBe(6);
    expect(costoTexto('claude-opus-5-5', { tokensEntrada: 0, tokensSalida: 0, tokensCacheLeidos: 1_000_000, tokensCacheEscritos: 1_000_000 })).toBe(5.2);
    expect(costoTexto('simulado-loto', { tokensEntrada: 9, tokensSalida: 9, tokensCacheLeidos: 0, tokensCacheEscritos: 0 })).toBe(0);
    expect(() => costoTexto('modelo-raro', { tokensEntrada: 1, tokensSalida: 1, tokensCacheLeidos: 0, tokensCacheEscritos: 0 })).toThrow('No hay tarifa');
  });

  it('el proveedor de Anthropic informa consumo y modelo, y se cobra con el modelo que respondió', async () => {
    const pedidos: unknown[] = [];
    const respuesta = JSON.stringify(leerSalidaSimulada('IA-01').datos);
    const cliente = {
      beta: { messages: { stream: (p: unknown) => {
        pedidos.push(p);
        return { finalMessage: async () => ({
          model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_details: null,
          content: [{ type: 'text', text: `\`\`\`json\n${respuesta}\n\`\`\`` }],
          usage: { input_tokens: 20_000, output_tokens: 3_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 2_000 },
        }) };
      } } },
    } as unknown as Anthropic;
    const r = await ejecutarTarea(proveedorAnthropic({ cliente }), 'IA-01', variables);
    expect(r).toMatchObject({ proveedor: 'anthropic', modelo: 'claude-opus-5-5', intentos: 1 });
    expect(r.consumo).toEqual({ tokensEntrada: 20_000, tokensSalida: 3_000, tokensCacheLeidos: 0, tokensCacheEscritos: 2_000 });
    expect(r.costoUsd).toBe(0.15);
    expect(pedidos[0]).toMatchObject({ model: 'claude-opus-5-5', fallbacks: 'default', output_config: { effort: 'medium' } });
  });

  it('una negativa del modelo no se toma como salida', async () => {
    const cliente = { beta: { messages: { stream: () => ({ finalMessage: async () => ({
      model: 'claude-opus-5-5', stop_reason: 'refusal', stop_details: { category: 'cyber' }, content: [], usage: { input_tokens: 1, output_tokens: 0 },
    }) }) } } } as unknown as Anthropic;
    await expect(ejecutarTarea(proveedorAnthropic({ cliente }), 'IA-01', variables)).rejects.toThrow('declinó la tarea (cyber)');
  });
});
