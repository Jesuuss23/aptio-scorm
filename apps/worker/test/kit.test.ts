// HU-0206 · Kit propuesto desde un curso anterior o un manual de marca (CP-028, IA-18 v2). Las evidencias salen de un
// ZIP y de un PDF armados en la prueba, sin ejecutar nada: colores por frecuencia y tipografías. El ZIP se lee con topes
// (entradas, bytes descomprimidos por archivo y en total) y solo sus archivos de texto con ruta segura. La propuesta se
// guarda en TrabajoIA.resultado; si la paleta no cumple el contraste WCAG se reintenta con los errores.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { prisma } from '@aptio/db';
import type { ProveedorTexto } from '@aptio/ai';
import { LIMITES_ZIP, TAREA_KIT } from '@aptio/schema/extraccion-kit';
import { FAMILIAS_KIT } from '@aptio/schema/marca';
import JSZip from 'jszip';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import type { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evidenciasDeMaterial, evidenciasDePdf, evidenciasDeZip, MaterialKitNoValido } from '../src/extraer/kit.js';
import { crearExtraccionKit } from '../src/kit.js';
import { AI, baseLista, comoReal, escenario, leerCaso } from './apoyo-generacion.js';

const CSS = `@font-face{font-family:"Archivo";src:url(../fuentes/archivo.woff2)}
:root{--marino:#0F2A44}
h1,h2{font-family:'Archivo',Arial,sans-serif;color:#0F2A44}
body{font-family:"Source Sans 3",sans-serif;color:#102033;background:#F5F7FA}
.boton{background:#0f2a44;color:#fff}.acento{background:#F2A900}.ok{color:rgb(31,122,92)}`;

/** Un SCORM anterior: estilos, HTML, JS, una imagen y una entrada con path traversal. */
export async function zipCurso(extra: Record<string, string | Uint8Array> = {}): Promise<Uint8Array> {
  const z = new JSZip();
  z.file('imsmanifest.xml', '<manifest/>');
  z.file('scormcontent/css/marca.css', CSS);
  z.file('scormcontent/index.html', '<html><body style="background:#F5F7FA"><h1 style="color:#0F2A44">Curso</h1>&#123;</body></html>');
  z.file('scormcontent/js/tema.js', 'const tema = { fontFamily: "Archivo", primario: "#0F2A44" };');
  // Colores que no deben contarse: están en una imagen y en una ruta que sale de la carpeta.
  z.file('scormcontent/img/logo.png', '#FF00FF #FF00FF #FF00FF');
  z.file('../../fuera.css', 'a{color:#FF00FF}');
  for (const [n, c] of Object.entries(extra)) z.file(n, c);
  return z.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
}

/** Un manual de marca: rectángulos en azul marino y amarillo y texto en Helvetica. */
export async function pdfManual(): Promise<Uint8Array> {
  const d = await PDFDocument.create();
  const negrita = await d.embedFont(StandardFonts.HelveticaBold);
  const texto = await d.embedFont(StandardFonts.TimesRoman);
  for (let i = 0; i < 2; i++) {
    const p = d.addPage([400, 400]);
    p.drawRectangle({ x: 0, y: 300, width: 400, height: 100, color: rgb(15 / 255, 42 / 255, 68 / 255) });
    p.drawRectangle({ x: 0, y: 0, width: 400, height: 40, color: rgb(242 / 255, 169 / 255, 0) });
    p.drawText('Manual de marca', { x: 20, y: 340, font: negrita, size: 24, color: rgb(1, 1, 1) });
    p.drawText('Colores corporativos', { x: 20, y: 200, font: texto, size: 12, color: rgb(16 / 255, 32 / 255, 51 / 255) });
  }
  return d.save();
}

describe('evidencias del kit sin IA (HU-0206)', () => {
  it('del ZIP: colores por frecuencia, @font-face y font-family; ignora imágenes y rutas fuera de la carpeta', async () => {
    const e = await evidenciasDeZip(await zipCurso());
    expect(e.origen).toBe('zip');
    expect(e.leidos).toBe(3);
    expect(e.colores[0]).toEqual({ valor: '#0F2A44', veces: 5 });
    expect(e.colores.map((c) => c.valor)).toEqual(expect.arrayContaining(['#102033', '#F5F7FA', '#F2A900', '#FFFFFF', '#1F7A5C']));
    expect(e.colores.map((c) => c.valor)).not.toContain('#FF00FF');
    expect(e.fuentes).toEqual([{ valor: 'Archivo', veces: 3 }, { valor: 'Arial', veces: 1 }, { valor: 'Source Sans 3', veces: 1 }]);
    expect(e.avisos).toContain('3 archivos que no son de texto (imágenes, fuentes, rutas no seguras) no se abrieron');
  });

  it('del PDF: las tipografías del operador setFont y los colores de relleno más usados', async () => {
    const e = await evidenciasDePdf(await pdfManual());
    expect(e).toMatchObject({ origen: 'pdf', leidos: 2 });
    expect(e.colores.map((c) => c.valor)).toEqual(expect.arrayContaining(['#0F2A44', '#F2A900', '#FFFFFF', '#102033']));
    expect(e.fuentes.map((f) => f.valor).sort()).toEqual(['Helvetica', 'Times']);
  });

  it('rechaza un ZIP con demasiadas entradas', async () => {
    const extra = Object.fromEntries(Array.from({ length: 6 }, (_, i) => [`x/${i}.css`, 'a{color:#000}']));
    const error = await evidenciasDeZip(await zipCurso(extra), { ...LIMITES_ZIP, entradas: 10 }).catch((x) => x);
    expect(error).toBeInstanceOf(MaterialKitNoValido);
    expect(error).toMatchObject({ codigo: 'ZIP_NO_VALIDO', message: expect.stringMatching(/^El ZIP tiene \d+ entradas; se leen como mucho 10$/) });
  });

  it('una ZIP bomb no se expande: corta en el tope por archivo y en el total', async () => {
    // 8 MB de relleno muy comprimible con un color al final: nunca se llega a leer.
    const bomba = `${'a'.repeat(8 * 1024 * 1024)}{color:#ABCDEF}`;
    const zip = await zipCurso({ 'scormcontent/css/bomba.css': bomba, 'scormcontent/css/zz.css': 'b{color:#123456}' });
    expect(zip.byteLength).toBeLessThan(100 * 1024);
    const e = await evidenciasDeZip(zip, { ...LIMITES_ZIP, bytesArchivo: 64 * 1024 });
    expect(e.colores.map((c) => c.valor)).not.toContain('#ABCDEF');
    expect(e.colores.map((c) => c.valor)).toContain('#123456');
    expect(e.avisos).toContain('scormcontent/css/bomba.css supera 0.0625 MB y se leyó solo el comienzo');
    const total = await evidenciasDeZip(zip, { ...LIMITES_ZIP, bytesArchivo: 64 * 1024, bytesTotal: 64 * 1024 });
    expect(total.avisos.some((a) => a.startsWith('Se alcanzó el tope de'))).toBe(true);
  });

  it('solo abre archivos .css, .html, .js y .json', async () => {
    const zip = await zipCurso({ 'a.svg': '<svg fill="#AA0000"/>', 'b.txt': '#BB0000', 'c.json': '{"color":"#CC0000"}' });
    const valores = (await evidenciasDeZip(zip)).colores.map((c) => c.valor);
    expect(valores).toContain('#CC0000');
    expect(valores).not.toContain('#AA0000');
    expect(valores).not.toContain('#BB0000');
  });

  it('sin colores o con otro formato es un error controlado con un mensaje legible', async () => {
    const z = new JSZip();
    z.file('index.html', '<p>sin estilos</p>');
    const vacio = await z.generateAsync({ type: 'uint8array' });
    await expect(evidenciasDeMaterial(vacio, 'application/zip')).rejects.toMatchObject({ codigo: 'SIN_COLORES', message: expect.stringMatching(/^No se encontraron colores en los estilos del curso/) });
    await expect(evidenciasDeMaterial(vacio, 'image/png')).rejects.toMatchObject({ codigo: 'FORMATO_NO_VALIDO' });
    await expect(evidenciasDeMaterial(new Uint8Array([1, 2, 3]), 'application/zip')).rejects.toMatchObject({ codigo: 'ZIP_NO_VALIDO' });
  });

  it('el esquema de IA-18 solo acepta las tipografías de la lista del kit', () => {
    const esquema = JSON.parse(readFileSync(join(AI, 'esquemas/IA-18.salida.schema.json'), 'utf8'));
    expect(esquema.properties.tipografias.properties.titulos.enum).toEqual(FAMILIAS_KIT);
    expect(esquema.properties.tipografias.properties.texto.enum).toEqual(FAMILIAS_KIT);
  });
});

const redis = { publish: async () => 1 } as unknown as Redis;

describe.skipIf(!baseLista && !process.env.CI)('propuesta de kit en el worker (HU-0206)', () => {
  const e = escenario('kit');
  const archivos = new Map<string, Uint8Array>();
  const recursos: Record<'zip' | 'pdf' | 'vacio', string> = { zip: '', pdf: '', vacio: '' };
  beforeAll(async () => {
    await e.crear();
    const vacio = new JSZip();
    vacio.file('index.html', '<p>sin estilos</p>');
    const datos = { zip: [await zipCurso(), 'application/zip', 'curso-anterior.zip'], pdf: [await pdfManual(), 'application/pdf', 'manual-marca.pdf'], vacio: [await vacio.generateAsync({ type: 'uint8array' }), 'application/zip', 'vacio.zip'] } as const;
    for (const [k, [bytes, mime, nombre]] of Object.entries(datos)) {
      const clave = `kit/${e.ids.clienteId}/${k}`;
      archivos.set(clave, bytes);
      recursos[k as keyof typeof recursos] = (await prisma.recurso.create({
        data: { organizacionId: e.ids.orgId, clienteId: e.ids.clienteId, tipo: 'DOCUMENTO', origen: 'CLIENTE', claveS3: clave, mime, bytes: bytes.byteLength, hash: 'x', nombre },
      })).id;
    }
  });
  afterAll(() => e.borrar());

  const pedir = async (proveedor: ProveedorTexto, recurso: keyof typeof recursos) => {
    const t = await prisma.trabajoIA.create({
      data: { organizacionId: e.ids.orgId, tarea: TAREA_KIT, tipo: 'TEXTO', proveedor: '-', modelo: '-', resultado: { tipo: 'kit', clienteId: e.ids.clienteId, recursoId: recursos[recurso], nombreArchivo: `${recurso}` } },
    });
    const correr = crearExtraccionKit({ bd: prisma, redis, proveedor, leer: async (c) => archivos.get(c)! });
    await correr({ data: { trabajoId: t.id, organizacionId: e.ids.orgId, tarea: TAREA_KIT, kit: { clienteId: e.ids.clienteId, recursoId: recursos[recurso] } }, queueName: 'ia', updateProgress: async () => undefined });
    return prisma.trabajoIA.findUniqueOrThrow({ where: { id: t.id } });
  };

  it('CP-028 · del ZIP de un curso anterior propone paleta, tipografías libres y estilo, con evidencias y costo', async () => {
    const proveedor = comoReal();
    const t = await pedir(proveedor, 'zip');
    expect(t).toMatchObject({ estado: 'COMPLETADO', versionPrompt: 'IA-18.v2', intentos: 1, proveedor: 'anthropic', tokensEntrada: 12_000 });
    expect(Number(t.costoUsd)).toBeGreaterThan(0);
    const r = t.resultado as { clienteId: string; evidencias: { colores: { valor: string }[] }; propuesta: Record<string, unknown> };
    expect(r.clienteId).toBe(e.ids.clienteId);
    expect(r.evidencias.colores[0]!.valor).toBe('#0F2A44');
    expect(r.propuesta).toEqual({ ...(leerCaso('X-IA-18-kit.json') as object), contrasteOk: true });
    // Las evidencias del cliente van dentro de <material_cliente>, con la tipografía más parecida de la lista.
    const mensaje = proveedor.llamadas[0]!.mensajes[0]!.texto;
    expect(mensaje).toContain('<material_cliente archivo="material de marca" tipo="evidencias">\nOrigen: 3 archivos de texto de un curso anterior (ZIP).\nColores (hex, veces): #0F2A44 ×5, #F5F7FA ×2');
    expect(mensaje).not.toContain('#FF00FF');
    expect(mensaje).toContain('- Archivo: títulos Montserrat, textos Lato');
    expect(mensaje).toContain('Tipografías permitidas en el kit: Barlow Condensed, Montserrat');
    // El kit del cliente no cambia hasta que el equipo guarda.
    expect(await prisma.kitMarca.count({ where: { clienteId: e.ids.clienteId } })).toBe(0);
  });

  it('una paleta sin contraste WCAG se reintenta con los errores de contraste', async () => {
    const grabada = leerCaso('X-IA-18-kit.json') as { paleta: Record<string, string> };
    const sinContraste = { ...grabada, paleta: { ...grabada.paleta, primario: '#F2A900', texto: '#9AA5B1' } };
    const proveedor = comoReal({ [TAREA_KIT]: [JSON.stringify(sinContraste)] });
    const t = await pedir(proveedor, 'pdf');
    expect(proveedor.llamadas).toHaveLength(2);
    const correccion = proveedor.llamadas[1]!.mensajes.at(-1)!.texto;
    expect(correccion).toMatch(/el texto \(#9AA5B1\) sobre el fondo \(#F5F7FA\) tiene contraste 2,\d\d:1; debe ser al menos 4,5:1/);
    expect(correccion).toMatch(/el blanco sobre el primario \(#F2A900\) tiene contraste/);
    expect(t).toMatchObject({ estado: 'COMPLETADO', intentos: 2 });
    expect((t.resultado as { propuesta: { paleta: { primario: string } } }).propuesta.paleta.primario).toBe('#0F2A44');
  });

  it('un ZIP sin colores deja el trabajo en error con el motivo, sin llamar a la IA', async () => {
    const proveedor = comoReal();
    const t = await pedir(proveedor, 'vacio');
    expect(proveedor.llamadas).toHaveLength(0);
    expect(t.estado).toBe('ERROR');
    expect((t.resultado as { error: { codigo: string } }).error.codigo).toBe('SIN_COLORES');
  });
});
