// HU-0406 · Etapa 4 «Pantallas con el kit» (IA-15 v2): disposición del kit y campos por pantalla, convertidos a bloques
// del curso sin HTML; las pantallas listas se ven mientras la etapa corre (CP-043) y el curso armado valida (CP-042).
import { type CursoDoc, observacionesRegla } from '@aptio/schema/revision';
import { type ProveedorTexto, proveedorSimulado } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { esCursoValido } from '@aptio/schema';
import { ETAPAS, type PantallaCompuesta, type PantallasCurso, repeticionesSeguidas } from '@aptio/schema/generacion';
import { DISPOSICIONES } from '@aptio/schema/marca';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { EJECUTORES } from '../src/etapas/index.js';
import { bloquesDe, revisarPantalla, textoPantallas } from '../src/etapas/pantallas.js';
import { baseLista, comoReal, conteo, escenario, etapaDe, leerCaso } from './apoyo-generacion.js';

type Salida = Omit<PantallaCompuesta, 'id' | 'orden' | 'capsulaId' | 'titulo'> & { pantallaId: string; actividad?: { tipo: string } };
const SALIDAS = leerCaso('04-IA-15-pantallas.json') as Salida[];
const CURSO = leerCaso('../curso-esperado-es.json') as { modulos: { capsulas: { pantallas: { id: string; bloques: { tipo: string }[] }[] }[] }[] };
const salida = (id: string) => SALIDAS.find((s) => s.pantallaId === id)!;
const referencia = (id: string) => CURSO.modulos[0]!.capsulas[0]!.pantallas.find((p) => p.id === id)!;
const TODAS = [...DISPOSICIONES];

describe('reglas de la etapa 4', () => {
  it('convierte los campos de IA-15 en los mismos bloques de texto que el curso de referencia LOTO', () => {
    const origen = { tipo: 'ia' as const, revisado: false };
    for (const id of SALIDAS.map((x) => x.pantallaId)) {
      const s = salida(id);
      const textos = (b: Record<string, unknown>[]) => b.filter((x) => x.tipo === 'texto').map((x) => ({ ...x, origen }));
      expect(textos(bloquesDe({ ...s, id }, origen, { personajeRecursoId: null, videoRecursoId: null }))).toEqual(textos(referencia(id).bloques));
    }
    // El personaje es un bloque propio, solo si el kit tiene uno.
    const p04 = salida('p04');
    expect(bloquesDe({ ...p04, id: 'p04' }, { tipo: 'ia', revisado: false }, { personajeRecursoId: 'svg-ana', videoRecursoId: null }).at(-1))
      .toEqual({ id: 'p04-personaje', tipo: 'personaje', recursoId: 'svg-ana', pose: 'advirtiendo', lado: 'derecha' });
    expect(bloquesDe({ ...p04, id: 'p04' }, { tipo: 'ia', revisado: false }, { personajeRecursoId: null, videoRecursoId: null }).some((b) => b.tipo === 'personaje')).toBe(false);
  });

  it('acepta las 30 pantallas LOTO y rechaza otra pantalla, la disposición sin actividad o fuera del kit y tres iguales seguidas', () => {
    const storyboard = (leerCaso('03-IA-05-storyboard.json') as { pantallas: { id: string; actividad?: { tipo: string; consigna: string } }[] }).pantallas;
    for (const p of storyboard) expect(revisarPantalla({ pantalla: p, permitidas: TODAS, vecinas: [] })(salida(p.id))).toEqual([]);

    const p08 = storyboard.find((p) => p.id === 'p08')!;
    const mala = { ...salida('p08'), pantallaId: 'p09', disposicion: 'memoria', fondo: 'primario' };
    expect(revisarPantalla({ pantalla: p08, permitidas: TODAS, vecinas: [] })(mala)).toEqual([
      'pantallaId debe ser "p08"',
      'La pantalla no tiene actividad en el guion: no uses la disposición memoria',
      'El fondo primario es solo para portada, sección y cierre',
    ]);
    expect(revisarPantalla({ pantalla: p08, permitidas: ['portada', 'lista'], vecinas: ['idea', 'idea'] })(salida('p08'))).toEqual([
      'La disposición idea no está en el kit: usa una de portada, lista',
      'Las dos pantallas anteriores ya usan idea: elige otra disposición',
    ]);
    const p10 = storyboard.find((p) => p.id === 'p10')!;
    expect(revisarPantalla({ pantalla: p10, permitidas: TODAS, vecinas: [] })({ ...salida('p10'), disposicion: 'quiz', actividad: { tipo: 'INT-05' } })).toEqual([
      'La actividad INT-02 del guion va con la disposición clasificar',
      'actividad.tipo debe ser INT-02, la del guion',
    ]);
    const p22 = storyboard.find((p) => p.id === 'p22')!;
    expect(revisarPantalla({ pantalla: p22, permitidas: TODAS, vecinas: [] })({ ...salida('p22'), campos: { ...salida('p22').campos, correcta: 3 } }))
      .toEqual(['correcta (3) no es una opción de la pantalla']);
  });

  it('marca los tramos de tres o más disposiciones iguales seguidas', () => {
    const lista = ['lista', 'lista', 'idea', 'lista', 'lista', 'lista', 'lista'].map((d, i) => ({ id: `p0${i + 1}`, disposicion: d as 'lista' }));
    expect(repeticionesSeguidas(lista)).toEqual([{ ids: ['p04', 'p05', 'p06', 'p07'], disposicion: 'lista' }]);
    expect(repeticionesSeguidas(SALIDAS.map((s) => ({ id: s.pantallaId, disposicion: s.disposicion })))).toEqual([]);
    expect(textoPantallas(12, 30, false)).toBe('12 de 30 pantallas listas');
    expect(textoPantallas(30, 30, true)).toBe('30 pantallas armadas con el kit · curso validado');
    expect(textoPantallas(30, 30, true, 1)).toBe('30 pantallas armadas con el kit · 1 actividad con sus datos · curso validado');
  });
});

describe.skipIf(!baseLista && !process.env.CI)('etapa 4 en el generador', () => {
  const e = escenario('pantallas');
  beforeAll(e.crear);
  afterAll(e.borrar);
  const hasta3 = { RESUMEN_MATERIAL: EJECUTORES.RESUMEN_MATERIAL!, OBJETIVOS_ESTRUCTURA: EJECUTORES.OBJETIVOS_ESTRUCTURA!, STORYBOARD_GUION: EJECUTORES.STORYBOARD_GUION! };
  const hasta4 = { ...hasta3, PANTALLAS: EJECUTORES.PANTALLAS! };

  /** Etapas 1 a 3 en modo simulado; la generación queda lista para correr la etapa 4 con otro proveedor. */
  async function conGuion() {
    const preparado = await e.preparar();
    expect(await e.correr(preparado.generacionId, proveedorSimulado(), hasta3)).toEqual({ estado: 'COMPLETADO' });
    await prisma.generacion.update({ where: { id: preparado.generacionId }, data: { estado: 'EN_COLA' } });
    return preparado;
  }

  it('CP-042 · en modo simulado las 30 pantallas tienen disposición válida y el curso armado valida', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), hasta4)).toEqual({ estado: 'COMPLETADO' });
    const etapa = await etapaDe(generacionId, 'PANTALLAS');
    const { texto, datos } = etapa.detalle as unknown as { texto: string; datos: PantallasCurso };
    expect(texto).toBe('30 pantallas armadas con el kit · 9 actividades con sus datos · curso validado');
    expect(datos.pantallas.map((p) => p.id)).toEqual(SALIDAS.map((s) => s.pantallaId));
    expect(datos.pantallas.every((p) => (DISPOSICIONES as readonly string[]).includes(p.disposicion))).toBe(true);
    expect(Object.keys(datos.modelos)).toHaveLength(18);
    // Sin kit: estilo base y ningún personaje inventado.
    expect(datos.advertencias).toEqual(['El cliente no tiene kit: las pantallas usan los colores y modelos del estilo base']);
    expect(datos.pantallas.some((p) => p.personaje)).toBe(false);
    expect(datos.pantallas.find((p) => p.id === 'p10')).toMatchObject({ disposicion: 'clasificar', actividad: { tipo: 'INT-02' } });

    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    expect(datos.curso).toEqual({ id: curso.id, version: 1 });
    expect(esCursoValido(curso.documento)).toBe(true);
    const doc = curso.documento as { modulos: { capsulas: { pantallas: { id: string; tipo: string; plantilla: string; estado: string; bloques: { id: string; origen?: unknown }[]; narracion?: { porIdioma: { es: { estado: string } } } }[] }[] }[] };
    const pantallas = doc.modulos[0]!.capsulas[0]!.pantallas;
    expect(pantallas).toHaveLength(30);
    expect(pantallas.every((p) => p.estado === 'propuesta-ia' && p.narracion?.porIdioma.es.estado === 'pendiente')).toBe(true);
    expect(pantallas.find((p) => p.id === 'p06')).toMatchObject({ tipo: 'contenido', plantilla: 'base-lista' });
    // El texto del documento del cliente guarda su archivo y página.
    expect(pantallas.find((p) => p.id === 'p06')!.bloques[0]!.origen).toMatchObject({ tipo: 'documento', paginas: [13], revisado: false });
    expect(await prisma.cursoVersion.count({ where: { cursoId: curso.id } })).toBe(1);
    // HU-0501: las observaciones por reglas quedan guardadas con el curso.
    const reglas = observacionesRegla(curso.documento as unknown as CursoDoc);
    expect(await prisma.observacion.count({ where: { cursoId: curso.id, origen: 'regla' } })).toBe(reglas.length);
  });

  it('HU-0604 · Generar de nuevo conserva los retoques: extras siempre y ajustes si la disposición sigue igual', async () => {
    const { generacionId, proyectoId } = await e.preparar();
    expect(await e.correr(generacionId, proveedorSimulado(), hasta4)).toEqual({ estado: 'COMPLETADO' });
    type Pd = { id: string; disposicion: string; ajustes?: object; extras?: object[] };
    const pantallasDe = (d: unknown) => (d as { modulos: { capsulas: { pantallas: Pd[] }[] }[] }).modulos[0]!.capsulas[0]!.pantallas;
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    const doc = structuredClone(curso.documento) as object;
    const extras = [{ id: 'p05-boton', tipo: 'boton', texto: { es: 'Ver ejemplo' }, x: 70, y: 80, ancho: 20, alClic: 'retroalimentacion' }];
    const p05 = pantallasDe(doc).find((p) => p.id === 'p05')!;
    Object.assign(p05, { ajustes: { 'p05-texto': { desplazamiento: { x: 12.5, y: -3, dispositivo: 'todos' } }, 'p05-boton': { color: 'acento' }, 'ya-no-existe': { escala: 2 } }, extras });
    // p06 se retocó con otra disposición: al volver la del generador, sus ajustes se reinician y el extra queda.
    const p06 = pantallasDe(doc).find((p) => p.id === 'p06')!;
    Object.assign(p06, { disposicion: 'idea', ajustes: { 'p06-titulo': { color: 'acento' } }, extras: [{ ...extras[0], id: 'p06-boton' }] });
    await prisma.curso.update({ where: { id: curso.id }, data: { documento: doc } });

    const otra = await prisma.generacion.create({
      data: { organizacionId: e.ids.orgId, proyectoId, iniciadoPorId: e.ids.usuarioId, parametros: { pantallas: 30, publico: 'Operarios de planta', porcentajeActividades: 40 }, etapas: { create: ETAPAS.map((etapa, i) => ({ etapa, orden: i + 1 })) } },
    });
    expect(await e.correr(otra.id, proveedorSimulado(), hasta4)).toEqual({ estado: 'COMPLETADO' });
    const nuevo = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    expect(nuevo.version).toBe(curso.version + 1);
    expect(esCursoValido(nuevo.documento)).toBe(true);
    const n05 = pantallasDe(nuevo.documento).find((p) => p.id === 'p05')!;
    expect(n05.ajustes).toEqual({ 'p05-texto': { desplazamiento: { x: 12.5, y: -3, dispositivo: 'todos' } }, 'p05-boton': { color: 'acento' } });
    expect(n05.extras).toEqual(extras);
    const n06 = pantallasDe(nuevo.documento).find((p) => p.id === 'p06')!;
    expect(n06.disposicion).toBe('lista');
    expect(n06.ajustes).toBeUndefined();
    expect(n06.extras).toEqual([{ ...extras[0], id: 'p06-boton' }]);
    expect(pantallasDe(nuevo.documento).filter((p) => p.ajustes || p.extras).map((p) => p.id)).toEqual(['p05', 'p06']);
  });

  it('CP-043 · cada pantalla lista se guarda mientras la etapa corre; con proveedor real se reintenta la que rompe una regla', async () => {
    const { generacionId, proyectoId } = await conGuion();
    // El cliente tiene kit con personaje y el proyecto, un video: aparecen el personaje y el bloque de video.
    const svg = await prisma.recurso.create({ data: { organizacionId: e.ids.orgId, clienteId: e.ids.clienteId, tipo: 'SVG', origen: 'SUBIDO', claveS3: `k/${generacionId}`, mime: 'image/svg+xml', bytes: 1, hash: 'x', nombre: 'ana.svg' } });
    await prisma.kitMarca.create({
      data: {
        clienteId: e.ids.clienteId, estilo: 'Industrial', paleta: { primario: '#0F2A44', secundario: '#1F7A5C', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033' },
        tipografias: { titulos: 'Archivo', textos: 'Source Sans 3' }, voces: { es: { proveedor: 'google', voz: 'es-US-Neural2-A', velocidad: 1 } },
        personaje: { recursoId: svg.id, nombre: 'Ana', poses: ['explicando', 'advirtiendo', 'celebrando'] },
      },
    });
    const video = await prisma.recurso.create({ data: { organizacionId: e.ids.orgId, proyectoId, tipo: 'VIDEO', origen: 'CLIENTE', claveS3: `v/${generacionId}`, mime: 'video/mp4', bytes: 1, hash: 'x', nombre: 'procedimiento.mp4' } });
    await prisma.materialFuente.create({ data: { proyectoId, tipo: 'VIDEO', recursoId: video.id, estado: 'listo' } });

    const vistas: number[] = [];
    const base = comoReal({}, async (tarea) => {
      if (tarea !== 'IA-15') return;
      const d = (await etapaDe(generacionId, 'PANTALLAS')).detalle as { datos?: PantallasCurso } | null;
      vistas.push(d?.datos?.pantallas.length ?? -1);
    });
    let forzada = false;
    const proveedor: ProveedorTexto = {
      ...base,
      async completar(x) {
        const r = await base.completar(x);
        if (x.tarea === 'IA-15' && !forzada && x.mensajes[0]!.texto.includes('pantallaId = "p08"')) {
          forzada = true;
          return { ...r, texto: r.texto.replace('"fondo":"fondo"', '"fondo":"primario"') };
        }
        return r;
      },
    };
    expect(await e.correr(generacionId, proveedor, hasta4)).toEqual({ estado: 'COMPLETADO' });

    // Antes de terminar ya había pantallas guardadas, y su número solo crece.
    expect(vistas.some((n) => n > 0 && n < 30)).toBe(true);
    expect(vistas).toEqual([...vistas].sort((a, b) => a - b));
    const p08 = base.llamadas.filter((l) => l.tarea === 'IA-15' && l.mensajes[0]!.texto.includes('pantallaId = "p08"'));
    expect(p08).toHaveLength(2);
    expect(p08[1]!.mensajes.at(-1)!.texto).toContain('El fondo primario es solo para portada, sección y cierre');
    const pedido = p08[0]!.mensajes[0]!.texto;
    expect(pedido).toContain('Personaje del kit: Ana (poses: explicando, advirtiendo, celebrando)');
    expect(pedido).toContain('<material_cliente archivo="guion de la etapa 3">');
    expect(pedido).toMatch(/Disposiciones permitidas por el kit Minera Andina: portada, .*video/);

    const { datos } = (await etapaDe(generacionId, 'PANTALLAS')).detalle as unknown as { datos: PantallasCurso };
    expect(datos.kit).toMatchObject({ personaje: 'Ana', tipografias: { titulos: 'Archivo' } });
    expect(datos.advertencias).toEqual([]);
    const curso = await prisma.curso.findUniqueOrThrow({ where: { proyectoId } });
    expect(esCursoValido(curso.documento)).toBe(true);
    const pantallas = (curso.documento as { modulos: { capsulas: { pantallas: { id: string; bloques: Record<string, unknown>[]; narracion?: { personajeBloqueId?: string } }[] }[] }[] }).modulos[0]!.capsulas[0]!.pantallas;
    expect(pantallas.find((p) => p.id === 'p04')!.bloques.at(-1)).toEqual({ id: 'p04-personaje', tipo: 'personaje', recursoId: svg.id, pose: 'advirtiendo', lado: 'derecha' });
    expect(pantallas.find((p) => p.id === 'p04')!.narracion?.personajeBloqueId).toBe('p04-personaje');
    expect(pantallas.find((p) => p.id === 'p18')!.bloques.at(-1)).toMatchObject({ tipo: 'video', recursoId: video.id });

    const trabajos = await prisma.trabajoIA.findMany({ where: { generacionId, tarea: 'IA-15' } });
    expect(trabajos).toHaveLength(30);
    expect(trabajos.every((t) => t.versionPrompt === 'IA-15.v2' && t.estado === 'COMPLETADO')).toBe(true);
    expect(await conteo(generacionId)).toMatchObject({ 'IA-15': 30, 'IA-07': 9 });
    await prisma.kitMarca.delete({ where: { clienteId: e.ids.clienteId } });
  });

  it('sin el guion de la etapa 3 la etapa 4 queda en error y no llama a la IA', async () => {
    const { generacionId } = await e.preparar();
    const sinGuion = { ...hasta3, STORYBOARD_GUION: async () => ({ texto: 'sin datos' }), PANTALLAS: EJECUTORES.PANTALLAS! };
    const proveedor = proveedorSimulado();
    expect(await e.correr(generacionId, proveedor, sinGuion)).toEqual({ estado: 'ERROR' });
    expect(await etapaDe(generacionId, 'PANTALLAS')).toMatchObject({ estado: 'ERROR', detalle: { texto: 'Falta el resultado de la etapa 3 (Storyboard y guion)' } });
    expect(proveedor.llamadas.some((l) => l.tarea === 'IA-15')).toBe(false);
  });
});
