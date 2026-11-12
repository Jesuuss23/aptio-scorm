// HU-1202 · CP-091 · El paquete SCORM 1.2 del caso LOTO: manifiesto de un solo SCO, todos los archivos listados y presentes,
// rutas relativas sin URL externas, ZIP determinista y recursos del idioma exportado (SUP-49, SUP-52).
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';
import { beforeAll, describe, expect, it } from 'vitest';
import { codigoReproductor, construirScorm12, type PaqueteScorm12 } from '../src/index.ts';
import { manifiestoScorm12 } from '../src/manifiesto.ts';
import { cursoLoto, recursosLoto } from './loto.ts';

const NS_CP = 'http://www.imsproject.org/xsd/imscp_rootv1p1p2';
const NS_ADL = 'http://www.adlnet.org/xsd/adlcp_rootv1p2';
/** URL que pueden aparecer sin ser descargas: espacios de nombres de XML y SVG. */
const ESPACIOS = /^https?:\/\/(www\.w3\.org\/(2000\/svg|1999\/xlink|2001\/XMLSchema-instance|XML\/1998\/namespace)|www\.imsproject\.org\/xsd\/|www\.imsglobal\.org\/xsd\/|www\.adlnet\.org\/xsd\/)/;

let reproductor: string;
let paquete: PaqueteScorm12;
let zip: JSZip;
const texto = (ruta: string) => zip.file(ruta)!.async('string');

beforeAll(async () => {
  reproductor = await codigoReproductor();
  paquete = await construirScorm12({ curso: cursoLoto(), recursos: recursosLoto(), reproductor });
  zip = await JSZip.loadAsync(paquete.zip);
}, 60_000);

describe('paquete SCORM 1.2 del caso LOTO (CP-091)', () => {
  it('el manifiesto declara SCORM 1.2 con una organización, un ítem y un solo SCO que abre index.html', async () => {
    const doc = new DOMParser().parseFromString(await texto('imsmanifest.xml'), 'text/xml');
    const raiz = doc.documentElement!;
    expect(raiz.namespaceURI).toBe(NS_CP);
    expect(raiz.getElementsByTagNameNS(NS_CP, 'schemaversion')[0]?.textContent).toBe('1.2');
    expect(raiz.getElementsByTagNameNS(NS_CP, 'schema')[0]?.textContent).toBe('ADL SCORM');

    const organizaciones = raiz.getElementsByTagNameNS(NS_CP, 'organization');
    expect(organizaciones).toHaveLength(1);
    expect(raiz.getElementsByTagNameNS(NS_CP, 'organizations')[0]?.getAttribute('default')).toBe(organizaciones[0]!.getAttribute('identifier'));
    const items = raiz.getElementsByTagNameNS(NS_CP, 'item');
    expect(items).toHaveLength(1);
    expect(items[0]!.getElementsByTagNameNS(NS_ADL, 'masteryscore')[0]?.textContent).toBe('70');

    const recursos = raiz.getElementsByTagNameNS(NS_CP, 'resource');
    expect(recursos).toHaveLength(1);
    const sco = recursos[0]!;
    expect(sco.getAttribute('identifier')).toBe(items[0]!.getAttribute('identifierref'));
    expect(sco.getAttribute('type')).toBe('webcontent');
    expect(sco.getAttributeNS(NS_ADL, 'scormtype')).toBe('sco');
    expect(sco.getAttribute('href')).toBe('index.html');
    expect(organizaciones[0]!.getElementsByTagNameNS(NS_CP, 'title')[0]?.textContent).toBe('Bloqueo y etiquetado');
  });

  it('cada archivo del ZIP está listado en <file> y cada <file> existe en el ZIP', async () => {
    const doc = new DOMParser().parseFromString(await texto('imsmanifest.xml'), 'text/xml');
    const listados = Array.from(doc.getElementsByTagNameNS(NS_CP, 'file')).map((f) => f.getAttribute('href')!);
    const enZip = Object.values(zip.files).filter((f) => !f.dir).map((f) => f.name).filter((n) => n !== 'imsmanifest.xml');
    expect(new Set(listados)).toEqual(new Set(enZip));
    expect(listados).toEqual(paquete.archivos.slice(1));
    expect(listados.slice(0, 5)).toEqual(['index.html', 'aptio-reproductor.js', 'datos.js', 'iniciar.js', 'recursos/aud-p01-es.mp3']);
    expect(Object.values(zip.files).some((f) => f.dir)).toBe(false);
  });

  it('todas las rutas son relativas y ningún archivo de texto descarga nada de internet', async () => {
    for (const ruta of paquete.archivos) {
      expect(ruta).not.toMatch(/^(\/|[a-z]+:)|\.\./i);
      if (!/\.(html|js|xml|svg|vtt)$/.test(ruta)) continue;
      const urls = (await texto(ruta)).match(/(https?:)?\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s"'<>)]*/gi) ?? [];
      expect({ ruta, externas: urls.filter((u) => !ESPACIOS.test(u)) }).toEqual({ ruta, externas: [] });
    }
    const datos = await texto('datos.js');
    expect(datos).toContain('"svg-ana":"recursos/svg-ana.svg"');
    expect(datos).toContain('"img-p20-faja":"recursos/img-p20-faja.png"');
  });

  it('index.html carga el reproductor, los datos y el arranque sin script en línea', async () => {
    const html = await texto('index.html');
    expect(html).toContain('<html lang="es">');
    expect(html.match(/<script src="[^"]+"><\/script>/g)).toEqual(['<script src="aptio-reproductor.js"></script>', '<script src="datos.js"></script>', '<script src="iniciar.js"></script>']);
    expect(await texto('aptio-reproductor.js')).toBe(reproductor);
    expect(await texto('iniciar.js')).toContain('iniciarPaquete');
  });

  it('lleva los recursos del idioma exportado y nunca el material del cliente', () => {
    expect(paquete.idioma).toBe('es');
    expect(paquete.faltantes).toEqual([]);
    expect(paquete.archivos).not.toContain('recursos/doc-pets-seg-014.pdf');
    expect(paquete.archivos.filter((a) => a.startsWith('recursos/'))).toHaveLength(67);
  });

  it('HU-1204 · lleva el modo diagnóstico por defecto; con incluirDiagnostico: false se desactiva en los datos', async () => {
    expect(await texto('datos.js')).not.toContain('"diagnostico":false');
    expect(reproductor).toContain('diagnostico-scorm12');
    const sin = await JSZip.loadAsync((await construirScorm12({ curso: cursoLoto(), recursos: recursosLoto(), reproductor, incluirDiagnostico: false })).zip);
    expect(await sin.file('datos.js')!.async('string')).toContain('"diagnostico":false');
  });

  it('el ZIP es determinista: la misma entrada da los mismos bytes', async () => {
    const otro = await construirScorm12({ curso: cursoLoto(), recursos: recursosLoto(), reproductor });
    expect(Buffer.from(otro.zip).equals(Buffer.from(paquete.zip))).toBe(true);
  });

  it('informa los recursos que faltan y deja fuera los de otro idioma', async () => {
    const curso = cursoLoto();
    curso.recursos.push({ id: 'aud-p01-en', tipo: 'audio', nombre: 'p01-en.mp3', idioma: 'en' } as (typeof curso.recursos)[number]);
    const sinAudio = await construirScorm12({ curso, recursos: recursosLoto({ sinAudio: true }), reproductor });
    expect(sinAudio.faltantes).toHaveLength(30);
    expect(sinAudio.faltantes[0]).toBe('aud-p01-es');
    expect(sinAudio.faltantes).not.toContain('aud-p01-en');
    expect(sinAudio.archivos.some((a) => a.endsWith('.mp3'))).toBe(false);
  });
});

describe('manifiesto', () => {
  it('sin evaluación sumativa no declara masteryscore y escapa el título', () => {
    const xml = manifiestoScorm12({ cursoId: 'c 1', titulo: 'Riesgos & <peligros>', masteryscore: null, archivos: ['index.html'] });
    expect(xml).not.toContain('masteryscore');
    expect(xml).toContain('<title>Riesgos &amp; &lt;peligros&gt;</title>');
    expect(xml).toContain('identifier="MANIFEST-c_1"');
    expect(new DOMParser().parseFromString(xml, 'text/xml').documentElement?.nodeName).toBe('manifest');
  });
});
