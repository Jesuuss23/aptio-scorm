// HU-0802 · «✦ Traducir pendientes» en el worker (IA-10 v2): solo lo Pendiente, en lotes de 60, con el glosario del
// cliente y guardando cada lote entero o nada (CP-076, CP-077). PostgreSQL real; IA con el modo simulado.
// HU-0803 · Desbordes (CP-078): lo que no cabe queda en Desborde con una versión corta propuesta.
import { readFileSync } from 'node:fs';
import { proveedorSimulado } from '@aptio/ai';
import { prisma } from '@aptio/db';
import { huellaTexto, TAREA_TRADUCIR, textosDe } from '@aptio/schema/traduccion';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearTraductor, sincronizarTraducciones } from '../src/traducir.js';
import { AI, baseLista, escenario } from './apoyo-generacion.js';

const loto = () => JSON.parse(readFileSync(`${AI}/casos/loto/curso-esperado-es.json`, 'utf8'));
const eventos: { estado: string; progreso: number; mensaje?: string }[] = [];
const redis = { publish: async (_c: string, m: string) => { eventos.push(JSON.parse(m)); return 1; } } as unknown as Redis;
const TITULO = '/modulos/0/capsulas/0/pantallas/0/titulo';
const SUBTITULO = '/modulos/0/capsulas/0/pantallas/0/bloques/1/contenido';
const TARJETA = '/modulos/0/capsulas/0/pantallas/6/bloques/1/interaccion/datos/pares/2/b/texto';
const leer = (doc: unknown, ruta: string) => textosDe(doc).find((t) => t.ruta === ruta)!;

describe.skipIf(!baseLista && !process.env.CI)('traducir pendientes (HU-0802)', () => {
  const e = escenario('traducir');
  let proyectoId = '';
  beforeAll(async () => {
    await e.crear();
    proyectoId = (await e.preparar()).proyectoId;
  });
  afterAll(async () => { await e.borrar(); });

  /** Un curso nuevo en el proyecto (uno por prueba: el proyecto admite un curso). */
  async function nuevoCurso(cambiar: (doc: ReturnType<typeof loto>) => void = () => undefined) {
    await prisma.curso.deleteMany({ where: { proyectoId } });
    const doc = loto();
    cambiar(doc);
    return prisma.curso.create({ data: { organizacionId: e.ids.orgId, proyectoId, versionEsquema: '0.2.0', documento: doc, version: 3 } });
  }
  /** Lo que hace la API: el TrabajoIA en cola y el trabajo con el curso. */
  async function traducir(cursoId: string, proveedor = proveedorSimulado()) {
    eventos.length = 0;
    const t = await prisma.trabajoIA.create({ data: { organizacionId: e.ids.orgId, proyectoId, tarea: TAREA_TRADUCIR, tipo: 'TEXTO', proveedor: '-', modelo: '-' } });
    const progresos: number[] = [];
    const r = crearTraductor({ bd: prisma, redis, proveedor })({
      data: { trabajoId: t.id, organizacionId: e.ids.orgId, tarea: TAREA_TRADUCIR, traduccion: { cursoId } }, queueName: 'ia',
      updateProgress: async (p: number) => { progresos.push(p); },
    });
    return { trabajoId: t.id, r, progresos, proveedor };
  }

  it('traduce los 291 textos de LOTO en 5 lotes: cada lote es una versión del curso y sus filas quedan en Traducido por IA', async () => {
    const curso = await nuevoCurso();
    const { trabajoId, r, progresos, proveedor } = await traducir(curso.id);
    // La tarjeta de memoria «Cilindros y mangueras» no cabe en inglés simulado: 5 lotes y 1 pasada de versión corta.
    expect(await r).toEqual({ traducidos: 291, lotes: 5, desbordes: 1, propuestas: 1 });
    expect(proveedor.llamadas.map((l) => l.tarea)).toEqual(Array(6).fill('IA-10'));
    // Los textos van neutralizados dentro de <material_cliente>, con el glosario del cliente en el sistema.
    expect(proveedor.llamadas[0]!.mensajes[0]!.texto).toMatch(/<material_cliente archivo="textos del curso">\n\[/);
    expect(progresos).toEqual([20, 40, 60, 80, 100, 100]);
    expect(eventos.map((x) => x.estado)).toEqual(['EN_CURSO', 'EN_CURSO', 'EN_CURSO', 'EN_CURSO', 'EN_CURSO', 'COMPLETADO']);
    expect(eventos.at(-1)?.mensaje).toBe('291 textos traducidos; 1 no caben en su espacio');

    const final = await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } });
    expect(final.version).toBe(8);
    expect((await prisma.cursoVersion.findMany({ where: { cursoId: curso.id }, select: { motivo: true } })).map((v) => v.motivo)).toEqual(Array(5).fill('traducción'));
    // p01 a p06 usan la traducción grabada del caso; el resto, la simulada.
    expect(leer(final.documento, TITULO)).toMatchObject({ es: 'Bloqueo y etiquetado', en: 'Lockout/tagout' });
    expect(textosDe(final.documento).every((t) => t.en)).toBe(true);
    expect(leer(final.documento, '/modulos/0/capsulas/0/pantallas/29/titulo').en).toMatch(/^\[EN\] /);
    const estados = await prisma.traduccion.groupBy({ by: ['estado'], where: { cursoId: curso.id }, _count: true, orderBy: { estado: 'asc' } });
    expect(estados).toEqual([{ estado: 'TRADUCIDA_IA', _count: 290 }, { estado: 'DESBORDE', _count: 1 }]);

    // El trabajo de la API queda completado; cada lote registra su consumo como IA-10 con el prompt v2.
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).estado).toBe('COMPLETADO');
    const lotes = await prisma.trabajoIA.findMany({ where: { proyectoId, tarea: 'IA-10', versionPrompt: 'IA-10.v2' } });
    expect(lotes).toHaveLength(6);

    // Una segunda pasada no tiene nada que traducir.
    const otra = await traducir(curso.id);
    expect(await otra.r).toEqual({ traducidos: 0, lotes: 0, desbordes: 0, propuestas: 0 });
    expect(otra.proveedor.llamadas).toEqual([]);
    expect(eventos.at(-1)?.mensaje).toBe('No había textos pendientes');
  });

  it('CP-076 · con «LOTO» como «no traducir», si la IA responde «Lockout» se reintenta con el error y se guarda «LOTO»', async () => {
    const curso = await nuevoCurso((doc) => { doc.modulos[0].capsulas[0].pantallas[0].titulo.es = 'Bloqueo y etiquetado (LOTO)'; });
    // Solo el título queda Pendiente; el resto ya está revisado.
    await sincronizarTraducciones(prisma, curso.id, textosDe(curso.documento));
    await prisma.traduccion.updateMany({ where: { cursoId: curso.id, ruta: { not: TITULO } }, data: { estado: 'REVISADA' } });
    const respuesta = (texto: string) => JSON.stringify({ idiomaDestino: 'en', traducciones: [{ ruta: TITULO, texto }] });
    const proveedor = proveedorSimulado({ 'IA-10': [respuesta('Lockout and tagout (Lockout)'), respuesta('Lockout and tagout (LOTO)')] });
    const { r } = await traducir(curso.id, proveedor);
    expect(await r).toEqual({ traducidos: 1, lotes: 1, desbordes: 0, propuestas: 0 });
    expect(proveedor.llamadas).toHaveLength(2);
    const reintento = proveedor.llamadas[1]!.mensajes.at(-1)!.texto;
    expect(reintento).toContain(`${TITULO}: «LOTO» no se traduce: debe quedar igual`);
    const final = await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } });
    expect(leer(final.documento, TITULO).en).toBe('Lockout and tagout (LOTO)');
    expect((await prisma.traduccion.findFirstOrThrow({ where: { cursoId: curso.id, ruta: TITULO } })).estado).toBe('TRADUCIDA_IA');
  });

  it('CP-077 · un texto Revisado con su inglés no se manda a la IA ni cambia al traducir los pendientes', async () => {
    const curso = await nuevoCurso((doc) => { doc.modulos[0].capsulas[0].pantallas[0].bloques[1].contenido.en = 'Safety capsule, reviewed by hand'; });
    await sincronizarTraducciones(prisma, curso.id, textosDe(curso.documento));
    await prisma.traduccion.updateMany({ where: { cursoId: curso.id, ruta: SUBTITULO }, data: { estado: 'REVISADA' } });
    const { r, proveedor } = await traducir(curso.id);
    expect(await r).toEqual({ traducidos: 290, lotes: 5, desbordes: 1, propuestas: 1 });
    expect(proveedor.llamadas.some((l) => l.mensajes[0]!.texto.includes(SUBTITULO))).toBe(false);
    const final = await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } });
    expect(leer(final.documento, SUBTITULO).en).toBe('Safety capsule, reviewed by hand');
    expect((await prisma.traduccion.findFirstOrThrow({ where: { cursoId: curso.id, ruta: SUBTITULO } })).estado).toBe('REVISADA');
  });

  it('si la salida no respeta el glosario en los 3 intentos, el trabajo queda en error y el lote no se guarda', async () => {
    const curso = await nuevoCurso((doc) => { doc.modulos[0].capsulas[0].pantallas[0].titulo.es = 'Bloqueo y etiquetado (LOTO)'; });
    await sincronizarTraducciones(prisma, curso.id, textosDe(curso.documento));
    await prisma.traduccion.updateMany({ where: { cursoId: curso.id, ruta: { not: TITULO } }, data: { estado: 'REVISADA' } });
    const mala = JSON.stringify({ idiomaDestino: 'en', traducciones: [{ ruta: TITULO, texto: 'Lockout' }, { ruta: '/inventada', texto: 'x' }] });
    const { trabajoId, r } = await traducir(curso.id, proveedorSimulado({ 'IA-10': [mala, mala, mala] }));
    await expect(r).rejects.toThrow(/no validó tras 3 intentos/);
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).estado).toBe('ERROR');
    expect(eventos.at(-1)?.estado).toBe('ERROR');
    const final = await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } });
    expect(final.version).toBe(3);
    expect(leer(final.documento, TITULO).en).toBeNull();
    expect((await prisma.traduccion.findFirstOrThrow({ where: { cursoId: curso.id, ruta: TITULO } })).estado).toBe('PENDIENTE');
  });

  it('un texto que cambió en español después de revisarlo vuelve a Pendiente y se traduce de nuevo', async () => {
    const curso = await nuevoCurso();
    await sincronizarTraducciones(prisma, curso.id, textosDe(curso.documento));
    await prisma.traduccion.updateMany({ where: { cursoId: curso.id }, data: { estado: 'REVISADA' } });
    const doc = loto();
    doc.modulos[0].capsulas[0].pantallas[0].titulo = { es: 'Bloqueo, etiquetado y prueba', en: 'Lockout and tagout' };
    await prisma.curso.update({ where: { id: curso.id }, data: { documento: doc } });
    const { r } = await traducir(curso.id);
    expect(await r).toEqual({ traducidos: 1, lotes: 1, desbordes: 0, propuestas: 0 });
    const fila = await prisma.traduccion.findFirstOrThrow({ where: { cursoId: curso.id, ruta: TITULO } });
    expect(fila).toMatchObject({ estado: 'TRADUCIDA_IA', textoOrigenHash: huellaTexto('Bloqueo, etiquetado y prueba') });
    const final = await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } });
    // El inglés anterior (de otro texto) se reemplaza: el modo simulado responde la traducción grabada de esa ruta.
    expect(leer(final.documento, TITULO).en).toBe('Lockout/tagout');
  });

  /** Todo revisado salvo la tarjeta de memoria (límite 24), que queda Pendiente. */
  async function soloTarjeta() {
    const curso = await nuevoCurso();
    await sincronizarTraducciones(prisma, curso.id, textosDe(curso.documento));
    await prisma.traduccion.updateMany({ where: { cursoId: curso.id, ruta: { not: TARJETA } }, data: { estado: 'REVISADA' } });
    return curso;
  }
  const una = (ruta: string, texto: string) => JSON.stringify({ idiomaDestino: 'en', traducciones: [{ ruta, texto }] });

  it('CP-078 · una tarjeta cuyo inglés no cabe queda en Desborde con una versión corta que sí cabe; el curso conserva el inglés largo', async () => {
    const curso = await soloTarjeta();
    const largo = 'Cylinders and pressure hoses';
    const proveedor = proveedorSimulado({ 'IA-10': [una(TARJETA, largo)] });
    const { r } = await traducir(curso.id, proveedor);
    expect(await r).toEqual({ traducidos: 1, lotes: 1, desbordes: 1, propuestas: 1 });
    // La traducción va con su límite; la versión corta, además, con la traducción que no cupo.
    const [primera, corta] = proveedor.llamadas.map((l) => l.mensajes[0]!.texto);
    expect(primera).toContain('"limite": 24');
    expect(primera).not.toContain('"actual"');
    expect(corta).toContain(`"actual": "${largo}"`);
    const fila = await prisma.traduccion.findFirstOrThrow({ where: { cursoId: curso.id, ruta: TARJETA } });
    expect(fila.estado).toBe('DESBORDE');
    expect(fila.propuesta).toBe('[EN] Cilindros y');
    expect(fila.propuesta!.length).toBeLessThanOrEqual(24);
    const final = await prisma.curso.findUniqueOrThrow({ where: { id: curso.id } });
    expect(leer(final.documento, TARJETA).en).toBe(largo);
    expect(eventos.at(-1)?.mensaje).toBe('1 textos traducidos; 1 no caben en su espacio');
  });

  it('una versión corta que tampoco cabe se reintenta; si no lo logra, el Desborde queda sin propuesta y el trabajo termina bien', async () => {
    const curso = await soloTarjeta();
    const largo = 'Cylinders and pressure hoses';
    const proveedor = proveedorSimulado({ 'IA-10': [una(TARJETA, largo), una(TARJETA, largo), una(TARJETA, 'Cylinders & pressure hoses'), una(TARJETA, largo)] });
    const { trabajoId, r } = await traducir(curso.id, proveedor);
    expect(await r).toEqual({ traducidos: 1, lotes: 1, desbordes: 1, propuestas: 0 });
    expect(proveedor.llamadas).toHaveLength(4);
    expect(proveedor.llamadas[2]!.mensajes.at(-1)!.texto).toContain(`${TARJETA}: tiene 28 caracteres y caben 24: acórtalo`);
    expect((await prisma.traduccion.findFirstOrThrow({ where: { cursoId: curso.id, ruta: TARJETA } }))).toMatchObject({ estado: 'DESBORDE', propuesta: null });
    expect((await prisma.trabajoIA.findUniqueOrThrow({ where: { id: trabajoId } })).estado).toBe('COMPLETADO');

    // «Traducir pendientes» sin pendientes propone la versión corta de los Desbordes que no la tienen.
    const otra = await traducir(curso.id);
    expect(await otra.r).toEqual({ traducidos: 0, lotes: 0, desbordes: 1, propuestas: 1 });
    expect(eventos.at(-1)?.mensaje).toBe('Versiones cortas propuestas');
    expect((await prisma.traduccion.findFirstOrThrow({ where: { cursoId: curso.id, ruta: TARJETA } }))).toMatchObject({ estado: 'DESBORDE', propuesta: '[EN] Cilindros y' });
  });
});
