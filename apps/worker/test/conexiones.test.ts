// HU-1304 · Conexiones IA: cambio de proveedor y modelo en caliente entre dos trabajos (CP-099), voz de Google o de
// ElevenLabs con `fetch` simulado (voz del kit o de la conexión) y el límite de gasto mensual que detiene y reanuda (CP-100).
import { proveedorSimulado, type ProveedorTexto, sintetizadorDesdeEntorno } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { inicioMesLima } from '@aptio/schema/conexiones';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { gastoDelMes } from '../src/conexiones.js';
import { EJECUTORES } from '../src/etapas/index.js';
import { crearEtapaVoz } from '../src/etapas/voz.js';
import { conModeloDe, tareaRegistrada } from '../src/ia.js';
import { baseLista, escenario, etapaDe } from './apoyo-generacion.js';

const variables = { cliente: { nombre: 'Minera Andina' }, documento: { id: 'doc-1', nombre: 'm.pdf', rango: '1-2', texto_por_pagina: 'x' } };

/** Un proveedor «real» que responde con el modelo que le pidieron, como la API de Anthropic. */
function anthropicFalso() {
  const base = proveedorSimulado();
  const pedidos: string[] = [];
  const p: ProveedorTexto = {
    nombre: 'anthropic', modeloPara: () => 'claude-opus-5-5',
    async completar(x) {
      pedidos.push(x.modelo);
      return { ...(await base.completar(x)), modelo: x.modelo, consumo: { tokensEntrada: 1_000, tokensSalida: 500, tokensCacheLeidos: 0, tokensCacheEscritos: 0 } };
    },
  };
  return { p, pedidos };
}

/** 10 cuadros MP3 (MPEG1 capa III, 128 kbps, 44,1 kHz): un audio que `duracionAudio` reconoce. */
function mp3(): Uint8Array {
  const cuadro = new Uint8Array(417);
  cuadro.set([0xff, 0xfb, 0x90, 0x64]);
  const b = new Uint8Array(cuadro.length * 10);
  for (let i = 0; i < 10; i++) b.set(cuadro, i * cuadro.length);
  return b;
}

describe('conModeloDe', () => {
  it('reemplaza el modelo del entorno por el de la conexión y rechaza un modelo sin tarifa', () => {
    const { p } = anthropicFalso();
    expect(conModeloDe(p, 'claude-sonnet-5-5').modeloPara('ANTHROPIC_MODEL_TEXTO')).toBe('claude-sonnet-5-5');
    expect(conModeloDe(p, null)).toBe(p);
    expect(() => conModeloDe(p, 'modelo-inventado')).toThrow(/No hay tarifa registrada para el modelo modelo-inventado/);
    // El modo simulado no llama a nadie: el modelo no cambia.
    const simulado = proveedorSimulado();
    expect(conModeloDe(simulado, 'modelo-inventado')).toBe(simulado);
  });

  it('el mes de Lima empieza el día 1 a las 05:00 UTC', () => {
    expect(inicioMesLima(new Date('2026-11-13T12:00:00Z')).toISOString()).toBe('2026-11-01T05:00:00.000Z');
    // A las 02:00 UTC del 1 de diciembre en Lima todavía es 30 de noviembre.
    expect(inicioMesLima(new Date('2026-12-01T02:00:00Z')).toISOString()).toBe('2026-11-01T05:00:00.000Z');
  });
});

describe.skipIf(!baseLista && !process.env.CI)('conexiones IA en el worker', () => {
  const e = escenario('conexiones');
  beforeAll(e.crear);
  afterAll(e.borrar);
  const conexion = (tarea: 'TEXTO' | 'VOZ' | 'TRADUCCION', datos: { proveedor: string; modelo: string; limiteGastoMensualUsd?: number | null; parametros?: object }) =>
    prisma.configProveedor.upsert({
      where: { organizacionId_tarea: { organizacionId: e.ids.orgId, tarea } },
      create: { organizacionId: e.ids.orgId, tarea, ...datos },
      update: datos,
    });

  it('CP-099 · cambiar el modelo aplica al siguiente trabajo sin reiniciar el worker', async () => {
    const { p, pedidos } = anthropicFalso();
    const contexto = { organizacionId: e.ids.orgId };
    await conexion('TEXTO', { proveedor: 'anthropic', modelo: 'claude-opus-5-5' });
    const a = await tareaRegistrada(prisma, contexto, p, 'IA-01', variables);
    // El administrador cambia el modelo; el mismo proveedor (el mismo proceso) atiende el siguiente trabajo.
    await conexion('TEXTO', { proveedor: 'anthropic', modelo: 'claude-sonnet-5-5' });
    const b = await tareaRegistrada(prisma, contexto, p, 'IA-01', variables);
    expect(pedidos).toEqual(['claude-opus-5-5', 'claude-sonnet-5-5']);
    const [ta, tb] = await Promise.all([a, b].map((r) => prisma.trabajoIA.findUniqueOrThrow({ where: { id: r.trabajoId } })));
    expect(ta).toMatchObject({ tipo: 'TEXTO', modelo: 'claude-opus-5-5' });
    expect(tb).toMatchObject({ tipo: 'TEXTO', modelo: 'claude-sonnet-5-5' });
    // Cada uno con la tarifa de su modelo: Sonnet cuesta la mitad que Opus 5.5 en este consumo.
    expect(Number(tb!.costoUsd)).toBeLessThan(Number(ta!.costoUsd));
  });

  it('cada trabajo queda con su tipo real (traducción con IA-10) y usa la conexión de ese tipo', async () => {
    const { p, pedidos } = anthropicFalso();
    await conexion('TRADUCCION', { proveedor: 'anthropic', modelo: 'claude-haiku-5-5' });
    const vars = { ...variables, glosario: [], textos: [{ id: 't1', es: 'Hola' }] };
    // La salida simulada puede no validar con estas variables: lo que importa es el modelo pedido y el tipo registrado.
    await tareaRegistrada(prisma, { organizacionId: e.ids.orgId }, p, 'IA-10', vars, { version: 'v2' }).catch(() => null);
    expect(pedidos.at(-1)).toBe('claude-haiku-5-5');
    const t = await prisma.trabajoIA.findFirstOrThrow({ where: { organizacionId: e.ids.orgId, tarea: 'IA-10' }, orderBy: { creadoEn: 'desc' } });
    expect(t.tipo).toBe('TRADUCCION');
  });

  it('CP-100 · con el límite del mes alcanzado no se llama al proveedor; al subirlo, el trabajo sigue', async () => {
    const { p, pedidos } = anthropicFalso();
    const contexto = { organizacionId: e.ids.orgId };
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: e.ids.orgId } });
    // Gasto de este mes (cuenta) y del mes pasado (no cuenta).
    await prisma.trabajoIA.createMany({
      data: [
        { organizacionId: e.ids.orgId, tarea: 'IA-04', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', costoUsd: 3, estado: 'COMPLETADO' },
        { organizacionId: e.ids.orgId, tarea: 'IA-04', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', costoUsd: 50, estado: 'COMPLETADO', creadoEn: new Date(inicioMesLima(new Date()).getTime() - 1000) },
        { organizacionId: e.ids.orgId, tarea: 'VOZ', tipo: 'VOZ', proveedor: 'google', modelo: 'es-US-Neural2-A', costoUsd: 9, estado: 'COMPLETADO' },
      ],
    });
    expect(await gastoDelMes(prisma, e.ids.orgId, 'TEXTO')).toBe(3);
    const c = await conexion('TEXTO', { proveedor: 'anthropic', modelo: 'claude-opus-5-5', limiteGastoMensualUsd: 3 });

    await expect(tareaRegistrada(prisma, contexto, p, 'IA-01', variables)).rejects.toThrow(/^LIMITE_GASTO: la tarea «Resumen, estructura y guion» llegó a su límite de gasto del mes \(USD 3\.00 de 3\.00\)/);
    expect(pedidos).toHaveLength(0);
    const detenido = await prisma.trabajoIA.findFirstOrThrow({ where: { organizacionId: e.ids.orgId, tarea: 'IA-01' } });
    expect(detenido).toMatchObject({ estado: 'ERROR', error: expect.stringMatching(/^LIMITE_GASTO:/) });
    const auditoria = await prisma.auditoria.findFirstOrThrow({ where: { organizacionId: e.ids.orgId, accion: 'LIMITE_GASTO_ALCANZADO' } });
    expect(auditoria).toMatchObject({ entidad: 'ConfigProveedor', entidadId: c.id, datos: { tarea: 'TEXTO', gastoUsd: 3, limiteUsd: 3 } });

    // Sin límite (o con uno mayor) el siguiente trabajo llama al proveedor.
    await conexion('TEXTO', { proveedor: 'anthropic', modelo: 'claude-opus-5-5', limiteGastoMensualUsd: 10 });
    await tareaRegistrada(prisma, contexto, p, 'IA-01', variables);
    expect(pedidos).toHaveLength(1);
  });

  it('CP-100 · en la generación la etapa queda en error LIMITE_GASTO y «Continuar» sigue al subir el límite', async () => {
    await prisma.trabajoIA.deleteMany({ where: { organizacionId: e.ids.orgId } });
    await prisma.trabajoIA.create({ data: { organizacionId: e.ids.orgId, tarea: 'IA-04', tipo: 'TEXTO', proveedor: 'anthropic', modelo: 'claude-opus-5-5', costoUsd: 5, estado: 'COMPLETADO' } });
    await conexion('TEXTO', { proveedor: 'anthropic', modelo: 'claude-opus-5-5', limiteGastoMensualUsd: 5 });
    const { generacionId } = await e.preparar();
    const una = { RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL! };
    expect(await e.correr(generacionId, proveedorSimulado(), una)).toEqual({ estado: 'ERROR' });
    expect((await etapaDe(generacionId, 'RESUMEN_MATERIAL'))).toMatchObject({ estado: 'ERROR', detalle: { texto: expect.stringMatching(/^LIMITE_GASTO:/) } });

    // Lo que hace la API al continuar, con el límite ya subido.
    await conexion('TEXTO', { proveedor: 'anthropic', modelo: 'claude-opus-5-5', limiteGastoMensualUsd: 50 });
    await prisma.generacionEtapa.updateMany({ where: { generacionId, estado: 'ERROR' }, data: { estado: 'EN_COLA' } });
    await prisma.generacion.update({ where: { id: generacionId }, data: { estado: 'EN_COLA' } });
    await e.correr(generacionId, proveedorSimulado(), una);
    expect((await etapaDe(generacionId, 'RESUMEN_MATERIAL')).estado).toBe('COMPLETADO');
  });

  describe('voz con fetch simulado', () => {
    const hasta4 = { RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION!, PANTALLAS: EJECUTORES.PANTALLAS! };
    const subir = async () => undefined;
    const llamadas: { url: string; headers: Record<string, string>; cuerpo: Record<string, unknown> }[] = [];
    const falso = (async (url: string, init: RequestInit) => {
      llamadas.push({ url, headers: init.headers as Record<string, string>, cuerpo: JSON.parse(init.body as string) });
      const audio = mp3();
      if (url.startsWith('https://texttospeech.googleapis.com/')) return new Response(JSON.stringify({ audioContent: Buffer.from(audio).toString('base64') }));
      return new Response(audio.buffer as ArrayBuffer, { headers: { 'Content-Type': 'audio/mpeg' } });
    }) as unknown as typeof fetch;
    const sintetizar = sintetizadorDesdeEntorno({ PROVEEDORES_MODO: 'real', GOOGLE_TTS_API_KEY: 'clave-google-falsa', ELEVENLABS_API_KEY: 'clave-eleven-falsa' }, { fetch: falso });
    const generarVoz = async () => {
      const { generacionId } = await e.preparar();
      expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta4, VOZ_ES: crearEtapaVoz({ sintetizar, subir, esperaMs: 0 }) })).toEqual({ estado: 'COMPLETADO' });
      return generacionId;
    };

    beforeAll(() => prisma.trabajoIA.deleteMany({ where: { organizacionId: e.ids.orgId } }));

    it('con Google activo se usa la voz del kit (mismo proveedor), no la de la conexión', async () => {
      await conexion('VOZ', { proveedor: 'google', modelo: 'tts-v1', parametros: { voces: { es: 'es-US-Neural2-B' } } });
      llamadas.length = 0;
      const generacionId = await generarVoz();
      expect(llamadas.length).toBeGreaterThan(0);
      expect(llamadas.every((l) => l.url.startsWith('https://texttospeech.googleapis.com/v1/text:synthesize?key=clave-google-falsa'))).toBe(true);
      expect(llamadas.every((l) => (l.cuerpo.voice as { name: string }).name === 'es-US-Neural2-A')).toBe(true);
      const trabajos = await prisma.trabajoIA.findMany({ where: { generacionId, tarea: 'VOZ' } });
      expect(trabajos.every((t) => t.proveedor === 'google' && t.modelo === 'es-US-Neural2-A' && Number(t.costoUsd) > 0)).toBe(true);
    });

    it('CP-099 · al cambiar a ElevenLabs la siguiente generación usa la voz de la conexión y su clave', async () => {
      await conexion('VOZ', { proveedor: 'elevenlabs', modelo: 'eleven_multilingual_v2', parametros: { voces: { es: 'voz-eleven-es', en: 'voz-eleven-en' } } });
      llamadas.length = 0;
      const generacionId = await generarVoz();
      expect(llamadas.length).toBeGreaterThan(0);
      for (const l of llamadas) {
        expect(l.url).toBe('https://api.elevenlabs.io/v1/text-to-speech/voz-eleven-es?output_format=mp3_44100_128');
        expect(l.headers['xi-api-key']).toBe('clave-eleven-falsa');
        expect(l.cuerpo.model_id).toBe('eleven_multilingual_v2');
        // ElevenLabs recibe el texto hablado, sin etiquetas SSML.
        expect(String(l.cuerpo.text)).not.toMatch(/</);
      }
      const trabajos = await prisma.trabajoIA.findMany({ where: { generacionId, tarea: 'VOZ' } });
      expect(trabajos.every((t) => t.proveedor === 'elevenlabs' && t.modelo === 'eleven_multilingual_v2' && Number(t.costoUsd) > 0)).toBe(true);
      const audio = await prisma.recurso.findFirstOrThrow({ where: { organizacionId: e.ids.orgId, tipo: 'AUDIO', proveedor: 'elevenlabs' } });
      expect(audio.licencia).toBe('ElevenLabs · uso comercial (plan de pago)');
    });

    it('CP-100 · con el límite de voz alcanzado la etapa se detiene antes de sintetizar', async () => {
      await conexion('VOZ', { proveedor: 'elevenlabs', modelo: 'eleven_multilingual_v2', limiteGastoMensualUsd: 0.01, parametros: { voces: { es: 'voz-eleven-es' } } });
      llamadas.length = 0;
      const { generacionId } = await e.preparar();
      expect(await e.correr(generacionId, proveedorSimulado(), { ...hasta4, VOZ_ES: crearEtapaVoz({ sintetizar, subir, esperaMs: 0 }) })).toEqual({ estado: 'ERROR' });
      expect(llamadas).toHaveLength(0);
      expect((await etapaDe(generacionId, 'VOZ_ES')).detalle).toMatchObject({ texto: expect.stringMatching(/^LIMITE_GASTO: la tarea «Voz»/) });
    });
  });
});
