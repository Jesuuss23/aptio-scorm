// HU-1203 · CP-093 · HTML autocontenido del caso LOTO: la misma carpeta que el SCORM sin `imsmanifest.xml`, con LEEME.txt y
// `modo: 'html'`; rutas relativas sin URL externas, ZIP determinista y recursos del idioma exportado (SUP-49, SUP-52).
// La validación para HTML no compara contra un límite de subida ni revisa suspend_data.
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { codigoReproductor, construirHtml, construirScorm12, MB, type PaqueteScorm12, validarExportacion } from '../src/index.ts';
import { cursoLoto, recursosLoto } from './loto.ts';

/** URL que pueden aparecer sin ser descargas: espacios de nombres de SVG y XML. */
const ESPACIOS = /^https?:\/\/www\.w3\.org\/(2000\/svg|1999\/xlink|2001\/XMLSchema-instance|XML\/1998\/namespace)/;
const tamano = (d: Uint8Array | string) => (typeof d === 'string' ? Buffer.byteLength(d) : d.byteLength);

let reproductor: string;
let paquete: PaqueteScorm12;
let zip: JSZip;
const texto = (ruta: string) => zip.file(ruta)!.async('string');

beforeAll(async () => {
  reproductor = await codigoReproductor();
  paquete = await construirHtml({ curso: cursoLoto(), recursos: recursosLoto(), reproductor });
  zip = await JSZip.loadAsync(paquete.zip);
}, 60_000);

describe('HTML autocontenido del caso LOTO (HU-1203, CP-093)', () => {
  it('no lleva manifiesto: index.html primero, LEEME.txt y los mismos archivos que el SCORM', async () => {
    const scorm = await construirScorm12({ curso: cursoLoto(), recursos: recursosLoto(), reproductor });
    expect(zip.file('imsmanifest.xml')).toBeNull();
    expect(paquete.archivos.slice(0, 2)).toEqual(['index.html', 'LEEME.txt']);
    expect(Object.keys(zip.files).sort()).toEqual([...paquete.archivos].sort());
    expect(paquete.archivos.filter((a) => a !== 'LEEME.txt').sort()).toEqual(scorm.archivos.filter((a) => a !== 'imsmanifest.xml').sort());
    expect(await texto('LEEME.txt')).toContain('Descomprime y abre index.html con doble clic.');
  });

  it('datos.js lleva modo html; index.html y los scripts usan solo rutas relativas y ninguna URL externa', async () => {
    const datos = await texto('datos.js');
    expect(datos).toContain('"modo":"html"');
    expect(datos).not.toContain('"diagnostico":false');
    const html = await texto('index.html');
    expect(html.match(/<script src="[^"]+"><\/script>/g)).toEqual(['<script src="aptio-reproductor.js"></script>', '<script src="datos.js"></script>', '<script src="iniciar.js"></script>']);
    const rutas = Object.values(JSON.parse(datos.replace(/^window\.APTIO_DATOS = /, '').replace(/;\n$/, '')).rutas as Record<string, string>);
    expect(rutas.every((r) => r.startsWith('recursos/') && zip.file(r))).toBe(true);
    for (const ruta of ['index.html', 'datos.js', 'iniciar.js', 'aptio-reproductor.js']) {
      const urls = (await texto(ruta)).match(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi) ?? [];
      expect({ ruta, externas: urls.filter((u) => !ESPACIOS.test(u)) }).toEqual({ ruta, externas: [] });
    }
  });

  it('lleva los recursos del idioma exportado y nunca el material del cliente', () => {
    expect(paquete.idioma).toBe('es');
    expect(paquete.faltantes).toEqual([]);
    expect(paquete.archivos).not.toContain('recursos/doc-pets-seg-014.pdf');
    expect(paquete.archivos.filter((a) => a.startsWith('recursos/'))).toHaveLength(67);
  });

  it('el ZIP es determinista: la misma entrada da los mismos bytes', async () => {
    const otro = await construirHtml({ curso: cursoLoto(), recursos: recursosLoto(), reproductor });
    expect(Buffer.from(otro.zip).equals(Buffer.from(paquete.zip))).toBe(true);
  });
});

describe('validarExportacion para HTML (HU-1203)', () => {
  const pesos = (extra = 0) => recursosLoto().map((r) => ({ id: r.id, nombre: r.nombre, bytes: tamano(r.datos) + (r.id === 'vid-procedimiento' ? extra : 0) }));

  it('con 300 MB no advierte por límite de subida ni calcula suspend_data; el peso queda como dato', () => {
    const v = validarExportacion('HTML', cursoLoto(), pesos(300 * MB), 50_000, 100);
    expect(v).toMatchObject({ formato: 'HTML', errores: [], limiteMb: null, superaLimite: false, alternativas: [], suspendDataCaracteres: null });
    expect(v.pesoEstimadoMb).toBeGreaterThanOrEqual(300);
    expect(v.recursosPesados[0]?.id).toBe('vid-procedimiento');
    expect(v.advertencias.some((a) => a.includes('límite de subida') || a.includes('suspend_data'))).toBe(false);
    // El mismo curso en SCORM 1.2 sí advierte.
    expect(validarExportacion('SCORM12', cursoLoto(), pesos(300 * MB), 50_000, 100)).toMatchObject({ formato: 'SCORM12', superaLimite: true, limiteMb: 100 });
  });

  it('sigue avisando las pantallas sin aprobar y los archivos que faltan, y da los errores de esquema', () => {
    const v = validarExportacion('HTML', cursoLoto(), pesos().filter((r) => !r.nombre.endsWith('.mp3')), 0, null);
    expect(v.pantallasSinAprobar).toBe(30);
    expect(v.recursosFaltantes).toHaveLength(30);
    expect(v.advertencias.map((a) => a.slice(0, 12))).toEqual(['Faltan 30 ar', '30 de 30 pan']);
    const roto = { ...cursoLoto(), version: undefined };
    expect(validarExportacion('HTML', roto, [], 0, null).errores.length).toBeGreaterThan(0);
  });
});
