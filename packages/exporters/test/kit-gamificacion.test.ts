// HU-1205 · CP-095: con el kit de Minera Andina, el kit de gamificación trae las insignias con la paleta del cliente y
// un anillo por nivel (tres y una cinta en la del curso), plan.json con la nota mínima de LOTO (70), los nombres en los
// dos idiomas con «ambos» y la guía del LMS elegido con la nota de verificar con la versión del cliente.
import { readFileSync } from 'node:fs';
import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { construirKitGamificacion, type CursoKit, lineas, type MarcaKit, svgInsignia } from '../src/index.ts';
import { cursoLoto, traducirLoto } from './loto.ts';

const kitMinera = JSON.parse(readFileSync(new URL('../../ai/casos/loto/entrada/kit.json', import.meta.url), 'utf8')) as { nombre: string; paleta: Record<string, string>; tipografias: { titulos: string; texto: string } };
const marca: MarcaKit = { nombreCliente: kitMinera.nombre, paleta: kitMinera.paleta, tipografias: kitMinera.tipografias };
const PNG_FALSO = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const pedidos: number[] = [];
const png = (_svg: string, lado: number) => { pedidos.push(lado); return PNG_FALSO; };
const anillos = (svg: string) => svg.match(/class="anillo"/g)?.length ?? 0;

async function abrir(zip: Uint8Array) {
  const z = await JSZip.loadAsync(zip);
  return { nombres: Object.keys(z.files).sort(), texto: (r: string) => z.file(r)!.async('string') };
}

describe('kit de gamificación (CP-095)', () => {
  it('con el kit de Minera Andina: insignias por cápsula, módulo y curso con su paleta, plan con nota 70 y guía de Moodle', async () => {
    const kit = await construirKitGamificacion({ curso: cursoLoto(), marca, lms: 'moodle', idioma: 'es', png, proyecto: 'LOTO', organizacion: 'AulasEducativas', generadoEn: new Date('2026-11-13T12:00:00Z') });
    const { nombres, texto } = await abrir(kit.zip);
    expect(nombres).toEqual([
      'LEEME.txt', 'guia-moodle.html',
      'insignias/png/ins-capsula-cap-loto.png', 'insignias/png/ins-curso.png', 'insignias/png/ins-modulo-mod-1.png',
      'insignias/svg/ins-capsula-cap-loto.svg', 'insignias/svg/ins-curso.svg', 'insignias/svg/ins-modulo-mod-1.svg',
      'plan.json',
    ]);
    expect(pedidos.every((l) => l === 512)).toBe(true);

    // La paleta del cliente, no la base, y la tipografía de títulos.
    const capsula = await texto('insignias/svg/ins-capsula-cap-loto.svg');
    for (const color of [kitMinera.paleta.primario, kitMinera.paleta.acento, kitMinera.paleta.fondo]) expect(capsula).toContain(color);
    expect(capsula).not.toContain('#12355B');
    expect(capsula).toContain('font-family="Archivo,');
    expect(capsula).toContain('<title>Bloqueo y etiquetado</title>');
    // Un anillo la cápsula, dos el módulo, tres y la cinta el curso.
    const modulo = await texto('insignias/svg/ins-modulo-mod-1.svg');
    const curso = await texto('insignias/svg/ins-curso.svg');
    expect([anillos(capsula), anillos(modulo), anillos(curso)]).toEqual([1, 2, 3]);
    expect([capsula, modulo, curso].map((s) => s.includes('class="cinta"'))).toEqual([false, false, true]);
    expect(curso).toContain(kitMinera.paleta.secundario);
    expect(modulo).toContain('MÓDULO');

    const plan = JSON.parse(await texto('plan.json'));
    expect(plan).toMatchObject({ version: 1, lms: 'moodle', idioma: 'es', notaMinima: 70, criterioCompletado: 'sumativa' });
    expect(plan.insignias.map((i: { id: string; nivel: string; origen: string }) => [i.id, i.nivel, i.origen])).toEqual([
      ['ins-capsula-cap-loto', 'capsula', 'plantilla'], ['ins-modulo-mod-1', 'modulo', 'plantilla'], ['ins-curso', 'curso', 'plantilla'],
    ]);
    expect(plan.insignias[0].criterio).toBe('Completar la cápsula «Bloqueo y etiquetado» con nota de al menos 70');
    expect(plan.niveles.map((n: { nombre: string }) => n.nombre)).toEqual(['Inicial', 'Avanzado', 'Experto']);
    expect(plan.ordenDesbloqueo).toEqual([{ paso: 1, capsulaId: 'cap-loto', moduloId: 'mod-1', titulo: { es: 'Bloqueo y etiquetado' }, requiere: null }]);

    const guia = await texto('guia-moodle.html');
    expect(guia).toContain('<html lang="es">');
    expect(guia).toContain('Guía de configuración en Moodle 4.5');
    expect(guia).toContain('Verificar con la versión del cliente');
    expect(guia).toContain('Restricciones de acceso');
    expect(guia).toContain('deja como nota para aprobar 70');
    expect(guia).toContain('src="insignias/png/ins-curso.png"');
    expect(guia).toBe(kit.guia);

    const leeme = await texto('LEEME.txt');
    expect(leeme).toContain('kit de marca de Minera Andina, sin IA');
    expect(leeme).toContain('Tipografía: Archivo');
    expect(leeme).toContain('  guia-moodle.html');
    expect(kit.advertencias).toEqual([]);
  });

  it('es determinista: el mismo curso da el mismo ZIP', async () => {
    const entrada = { curso: cursoLoto(), marca, lms: 'canvas' as const, idioma: 'es' as const, png, generadoEn: new Date('2026-11-13T12:00:00Z') };
    const [a, b] = await Promise.all([construirKitGamificacion(entrada), construirKitGamificacion(entrada)]);
    expect(Buffer.from(a.zip).equals(Buffer.from(b.zip))).toBe(true);
  });

  it('en «ambos» las insignias llevan el nombre en español e inglés y la guía sale en español', async () => {
    const kit = await construirKitGamificacion({ curso: traducirLoto(cursoLoto()), marca, lms: 'chamilo', idioma: 'ambos', png });
    const { nombres, texto } = await abrir(kit.zip);
    expect(nombres).toContain('guia-chamilo.html');
    const svg = await texto('insignias/svg/ins-capsula-cap-loto.svg');
    expect(svg).toContain('Bloqueo y');
    expect(svg).toContain('lang="en">[EN] Bloqueo y etiquetado</text>');
    expect(svg).toContain('CÁPSULA · CAPSULE');
    const guia = await texto('guia-chamilo.html');
    expect(guia).toContain('<html lang="es">');
    expect(guia).toContain('<span lang="en">/ [EN] Bloqueo y etiquetado</span>');
    expect(guia).toContain('Competencias');
    expect(JSON.parse(await texto('plan.json')).insignias[0].nombre).toEqual({ es: 'Bloqueo y etiquetado', en: '[EN] Bloqueo y etiquetado' });
    // Sin el inglés escrito, avisa y deja el español.
    const sinIngles = await construirKitGamificacion({ curso: cursoLoto(), marca, lms: 'chamilo', idioma: 'ambos', png });
    expect(sinIngles.advertencias).toEqual(['3 insignias no tienen nombre en inglés: llevan solo el español.']);
  });

  it('en inglés la guía sale en inglés; con Genérico, la guía neutra', async () => {
    const en = await construirKitGamificacion({ curso: traducirLoto(cursoLoto()), marca, lms: 'blackboard', idioma: 'en', png });
    expect(en.guia).toContain('<html lang="en">');
    expect(en.guia).toContain('Setup guide for Blackboard');
    expect(en.guia).toContain('Check against the client’s version');
    expect(en.guia).toContain('Achievements');
    expect(svgInsignia(en.plan.insignias[2]!, marca, 'en')).toContain('COURSE');
    const generico = await construirKitGamificacion({ curso: cursoLoto(), lms: 'generico', idioma: 'es', png });
    expect((await abrir(generico.zip)).nombres).toContain('guia-generico.html');
    expect(generico.guia).toContain('Open Badges');
    expect(generico.guia).toContain('Verificar con la versión del cliente');
    // Sin kit, el estilo base.
    expect(svgInsignia(generico.plan.insignias[0]!, undefined, 'es')).toContain('#12355B');
  });

  it('respeta las insignias que define el curso y lleva el logo del kit', async () => {
    const curso: CursoKit = {
      ...cursoLoto(),
      gamificacion: {
        nivel: 'completa', puntosPorAcierto: 10,
        insignias: [
          { id: 'ins-guardian', nombre: { es: 'Guardián del candado' }, condicion: { tipo: 'completar-capsula', refId: 'cap-loto' } },
          { id: 'ins-modulo', nombre: { es: 'Experto en energías' }, condicion: { tipo: 'completar-modulo', refId: 'mod-1' } },
        ],
      },
    };
    const logo = { datos: new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), mime: 'image/svg+xml' };
    const kit = await construirKitGamificacion({ curso, marca: { ...marca, logo }, lms: 'moodle', idioma: 'es', png });
    expect(kit.plan.insignias.map((i) => [i.id, i.nivel, i.origen])).toEqual([['ins-guardian', 'capsula', 'curso'], ['ins-modulo', 'modulo', 'curso']]);
    expect(kit.plan.puntosPorAcierto).toBe(10);
    expect(kit.plan.niveles.map((n) => n.nombre)).toEqual(['Inicial', 'Avanzado']);
    const svg = svgInsignia(kit.plan.insignias[0]!, { ...marca, logo }, 'es');
    expect(svg).toContain('href="data:image/svg+xml;base64,');
    expect(svg).not.toContain('class="estrella"');
    expect(svg).toContain('Guardián del');
  });

  it('corta los nombres largos en tres líneas como mucho', () => {
    expect(lineas('Control de energías peligrosas en mantenimiento de equipos pesados')).toEqual(['Control de', 'energías', 'peligrosas en m…']);
    expect(lineas('Bloqueo y etiquetado')).toEqual(['Bloqueo y', 'etiquetado']);
  });
});
