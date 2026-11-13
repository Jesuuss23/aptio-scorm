// HU-1205 · Kit de gamificación para el LMS del cliente (PNT-16, REQ-036, CP-095). Constructor puro: del curso, el kit de
// marca del cliente y el LMS elegido arma un ZIP con
//   - insignias/svg/*.svg e insignias/png/*.png (512 × 512) con la paleta y el logo del kit: un anillo para la cápsula,
//     dos para el módulo, y tres y una cinta para el curso;
//   - plan.json: qué otorga cada insignia, la nota mínima del curso, niveles sugeridos y orden de desbloqueo;
//   - guia-<lms>.html, imprimible, con el plan y los pasos en el LMS elegido; y LEEME.txt con el contenido y los créditos.
// Si el curso define `gamificacion.insignias` se respetan; si no, se proponen por plantilla, sin IA y siempre iguales
// para el mismo curso (SUP-161). El PNG lo hace el renderizador que se inyecta (el worker usa @resvg/resvg-js).
import type { CursoReproductor, TextoI18n } from '@aptio/player';
import { type IdiomaGuia, type LmsKit, LMS_KIT, nombreLms, pasosGuia, VERIFICAR } from './kit-guias.ts';
import { escaparXml } from './manifiesto.ts';
import { comprimir } from './scorm12.ts';

export { LMS_KIT, type LmsKit, NOMBRE_LMS, nombreLms } from './kit-guias.ts';

export const LADO_INSIGNIA = 512;
export type IdiomaKit = 'es' | 'en' | 'ambos';
export type NivelInsignia = 'capsula' | 'modulo' | 'curso';
export const ANILLOS: Record<NivelInsignia, number> = { capsula: 1, modulo: 2, curso: 3 };

type RolPaleta = 'primario' | 'secundario' | 'acento' | 'fondo' | 'texto';
/** Estilo base (el mismo del reproductor) para lo que el kit no defina. */
export const PALETA_KIT_BASE: Record<RolPaleta, string> = { primario: '#12355B', secundario: '#2E7D6B', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033' };

export interface MarcaKit {
  nombreCliente?: string;
  paleta?: Partial<Record<string, string>> | null;
  /** `textos` (reproductor) o `texto` (kit del caso): se acepta cualquiera. */
  tipografias?: { titulos?: string; textos?: string; texto?: string } | null;
  logo?: { datos: Uint8Array; mime: string } | null;
}

type CondicionCurso = { tipo: 'completar-capsula' | 'completar-modulo' | 'nota-minima-interaccion'; refId: string; valor?: number };
type InsigniaCurso = { id: string; nombre: TextoI18n; recursoId?: string; condicion: CondicionCurso };
export type CursoKit = CursoReproductor & { gamificacion?: { nivel?: string; puntosPorAcierto?: number; insignias?: InsigniaCurso[] } };

export interface EntradaKitGamificacion {
  curso: CursoKit;
  marca?: MarcaKit;
  lms: LmsKit;
  idioma: IdiomaKit;
  /** SVG → PNG de `lado` × `lado`. */
  png: (svg: string, lado: number) => Uint8Array | Promise<Uint8Array>;
  organizacion?: string;
  proyecto?: string;
  generadoEn?: Date;
}

export interface InsigniaKit {
  id: string;
  nivel: NivelInsignia;
  nombre: TextoI18n;
  /** Cápsula, módulo o curso al que pertenece. */
  refId: string;
  condicion: { tipo: 'completar-capsula' | 'completar-modulo' | 'completar-curso' | 'nota-minima-interaccion'; refId: string; notaMinima: number | null };
  /** Cómo se obtiene, en el idioma de la guía. */
  criterio: string;
  origen: 'curso' | 'plantilla';
  archivos: { svg: string; png: string };
}

export interface PlanGamificacion {
  version: 1;
  curso: { id: string; titulo: TextoI18n };
  lms: LmsKit;
  idioma: IdiomaKit;
  notaMinima: number | null;
  criterioCompletado: string;
  puntosPorAcierto: number | null;
  insignias: InsigniaKit[];
  niveles: { nivel: number; nombre: string; requisito: string; insignias: string[] }[];
  ordenDesbloqueo: { paso: number; capsulaId: string; moduloId: string; titulo: TextoI18n; requiere: string | null }[];
}

export interface KitGamificacion {
  zip: Uint8Array;
  archivos: string[];
  plan: PlanGamificacion;
  guia: string;
  advertencias: string[];
}

const T = {
  es: {
    capsula: 'CÁPSULA', modulo: 'MÓDULO', curso: 'CURSO', titulo: 'Kit de gamificación', guia: 'Guía de configuración en',
    criterio: { capsula: 'Completar la cápsula «{t}»', modulo: 'Completar todas las cápsulas del módulo «{t}»', curso: 'Completar el curso «{t}»', interaccion: 'Lograr al menos {n} en la actividad «{t}»' },
    conNota: ' con nota de al menos {n}',
    niveles: [['Inicial', 'Primera insignia de cápsula'], ['Avanzado', 'Todas las insignias de módulo'], ['Experto', 'La insignia del curso']],
    plan: 'Plan de gamificación', insignia: 'Insignia', nivel: 'Nivel', como: 'Cómo se obtiene', archivo: 'Archivo', orden: 'Orden de desbloqueo',
    paso: 'Paso', requiere: 'Se abre al completar', primera: 'Abierta desde el inicio', nivelesT: 'Niveles sugeridos', pasos: 'Pasos en', nota: 'Nota mínima del curso',
    sinNota: 'el curso no pide nota', contenido: 'Contenido', imprimir: 'Imprime esta guía o guárdala como PDF desde el navegador.',
  },
  en: {
    capsula: 'CAPSULE', modulo: 'MODULE', curso: 'COURSE', titulo: 'Gamification kit', guia: 'Setup guide for',
    criterio: { capsula: 'Complete the capsule «{t}»', modulo: 'Complete every capsule of the module «{t}»', curso: 'Complete the course «{t}»', interaccion: 'Score at least {n} in the activity «{t}»' },
    conNota: ' with a score of at least {n}',
    niveles: [['Beginner', 'First capsule badge'], ['Advanced', 'Every module badge'], ['Expert', 'The course badge']],
    plan: 'Gamification plan', insignia: 'Badge', nivel: 'Level', como: 'How to earn it', archivo: 'File', orden: 'Unlock order',
    paso: 'Step', requiere: 'Opens after completing', primera: 'Open from the start', nivelesT: 'Suggested levels', pasos: 'Steps in', nota: 'Course passing score',
    sinNota: 'the course does not require a score', contenido: 'Contents', imprimir: 'Print this guide or save it as PDF from the browser.',
  },
} as const;

const seguro = (id: string): string => id.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'insignia';

/** El texto en el idioma pedido, o en el otro si falta. */
export const enIdioma = (t: TextoI18n | undefined, idioma: IdiomaGuia): string => t?.[idioma] ?? t?.[idioma === 'es' ? 'en' : 'es'] ?? '';

function paletaDe(marca: MarcaKit | undefined): Record<RolPaleta, string> {
  const p = { ...PALETA_KIT_BASE };
  for (const rol of Object.keys(p) as RolPaleta[]) {
    const v = marca?.paleta?.[rol];
    if (typeof v === 'string' && /^#[0-9a-f]{3,8}$/i.test(v)) p[rol] = v;
  }
  return p;
}

/** Corta el nombre en líneas de ~`ancho` letras, como mucho `max` (la última con «…» si no cabe). */
export function lineas(texto: string, ancho = 16, max = 3): string[] {
  const salida: string[] = [];
  let actual = '';
  for (const palabra of texto.split(/\s+/).filter(Boolean)) {
    if (!actual) actual = palabra;
    else if (actual.length + 1 + palabra.length <= ancho) actual += ` ${palabra}`;
    else { salida.push(actual); actual = palabra; }
  }
  if (actual) salida.push(actual);
  if (salida.length > max) {
    const ultima = salida.slice(max - 1).join(' ');
    salida.splice(max - 1, salida.length, ultima.length > ancho ? `${ultima.slice(0, ancho - 1).trimEnd()}…` : ultima);
  }
  return salida;
}

const base64 = (datos: Uint8Array): string => Buffer.from(datos).toString('base64');

/** SVG de una insignia: medallón con la paleta del kit; los anillos y la cinta dicen el nivel. */
export function svgInsignia(ins: Pick<InsigniaKit, 'nivel' | 'nombre'>, marca: MarcaKit | undefined, idioma: IdiomaKit): string {
  const c = paletaDe(marca);
  const letra = marca?.tipografias?.titulos?.trim() || 'sans-serif';
  const familia = `${escaparXml(letra)}, DejaVu Sans, Arial, sans-serif`;
  const principal: IdiomaGuia = idioma === 'en' ? 'en' : 'es';
  const nombre = enIdioma(ins.nombre, principal);
  const segundo = idioma === 'ambos' && ins.nombre.en && ins.nombre.en !== ins.nombre.es ? ins.nombre.en : '';
  const n = ANILLOS[ins.nivel];
  const colores = [c.acento, c.secundario, c.acento];
  const anillos = Array.from({ length: n }, (_, i) =>
    `<circle class="anillo" cx="256" cy="244" r="${226 - i * 20}" fill="none" stroke="${colores[i]}" stroke-width="10"/>`).join('');
  const interior = 214 - n * 20;
  const logo = marca?.logo
    ? `<image x="216" y="${244 - interior + 26}" width="80" height="80" preserveAspectRatio="xMidYMid meet" href="data:${escaparXml(marca.logo.mime)};base64,${base64(marca.logo.datos)}"/>`
    : `<path class="estrella" transform="translate(256 ${244 - interior + 62})" d="M0-34 10-11 35-11 15 4 22 29 0 14-22 29-15 4-35-11-10-11Z" fill="${c.acento}"/>`;
  const filas = lineas(nombre, segundo ? 18 : 16, 3);
  const tam = segundo ? (filas.length > 2 ? 26 : 30) : filas.length > 2 ? 32 : 36;
  const y0 = 252 - ((filas.length - 1) * tam * 1.15) / 2 - (segundo ? 18 : 0);
  const texto = filas.map((l, i) => `<tspan x="256" y="${Math.round(y0 + i * tam * 1.15)}">${escaparXml(l)}</tspan>`).join('');
  const sub = segundo
    ? `<text x="256" y="${Math.round(y0 + filas.length * tam * 1.15 + 6)}" text-anchor="middle" font-family="${familia}" font-size="20" font-style="italic" fill="${c.texto}" lang="en">${lineas(segundo, 26, 1).map(escaparXml).join('')}</text>`
    : '';
  const etiqueta = (idioma === 'en' ? T.en : T.es)[ins.nivel] + (idioma === 'ambos' ? ` · ${T.en[ins.nivel]}` : '');
  const cinta = ins.nivel === 'curso'
    ? `<g class="cinta"><path d="M96 392 H416 L392 424 L416 456 H96 L120 424 Z" fill="${c.secundario}"/><text x="256" y="433" text-anchor="middle" font-family="${familia}" font-size="24" font-weight="700" fill="#FFFFFF" letter-spacing="2">${escaparXml(etiqueta)}</text></g>`
    : `<text x="256" y="${Math.round(244 + interior * 0.66)}" text-anchor="middle" font-family="${familia}" font-size="${idioma === 'ambos' ? 16 : 20}" font-weight="700" fill="${c.primario}" letter-spacing="2">${escaparXml(etiqueta)}</text>`;
  const titulo = segundo ? `${nombre} / ${segundo}` : nombre;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${LADO_INSIGNIA}" height="${LADO_INSIGNIA}" viewBox="0 0 512 512" role="img" aria-label="${escaparXml(`${etiqueta}: ${titulo}`)}" data-nivel="${ins.nivel}">`
    + `<title>${escaparXml(titulo)}</title>`
    + `<circle cx="256" cy="244" r="240" fill="${c.primario}"/>${anillos}`
    + `<circle cx="256" cy="244" r="${interior}" fill="${c.fondo}"/>${logo}`
    + `<text text-anchor="middle" font-family="${familia}" font-size="${tam}" font-weight="700" fill="${c.texto}">${texto}</text>${sub}${cinta}</svg>`;
}

/** Las insignias del curso, o las de plantilla: una por cápsula, una por módulo y una del curso. */
export function insigniasDelCurso(curso: CursoKit, idioma: IdiomaKit): InsigniaKit[] {
  const guia: IdiomaGuia = idioma === 'en' ? 'en' : 'es';
  const t = T[guia];
  const nota = curso.seguimiento.criterioCompletado === 'sumativa' && Number.isFinite(curso.seguimiento.notaMinima) ? curso.seguimiento.notaMinima : null;
  const conNota = (s: string, n: number | null) => (n === null ? s : s + t.conNota.replace('{n}', String(n)));
  const archivos = (id: string) => ({ svg: `insignias/svg/${seguro(id)}.svg`, png: `insignias/png/${seguro(id)}.png` });
  const capsulas = new Map(curso.modulos.flatMap((m) => m.capsulas.map((c) => [c.id, c] as const)));
  const modulos = new Map(curso.modulos.map((m) => [m.id, m]));
  const tituloCurso = curso.metadatos.titulo;

  const definidas = curso.gamificacion?.insignias ?? [];
  if (definidas.length) {
    return definidas.map((d) => {
      const { tipo, refId } = d.condicion;
      const nivel: NivelInsignia = tipo === 'completar-modulo' ? 'modulo' : 'capsula';
      const ref = tipo === 'completar-modulo' ? modulos.get(refId)?.titulo : capsulas.get(refId)?.titulo;
      const titulo = enIdioma(ref ?? d.nombre, guia);
      const valor = d.condicion.valor ?? (tipo === 'nota-minima-interaccion' ? nota : null);
      const criterio = tipo === 'nota-minima-interaccion'
        ? t.criterio.interaccion.replace('{n}', String(valor ?? '')).replace('{t}', enIdioma(d.nombre, guia))
        : conNota((tipo === 'completar-modulo' ? t.criterio.modulo : t.criterio.capsula).replace('{t}', titulo), tipo === 'completar-capsula' ? nota : null);
      return { id: d.id, nivel, nombre: d.nombre, refId, condicion: { tipo, refId, notaMinima: valor ?? null }, criterio, origen: 'curso' as const, archivos: archivos(d.id) };
    });
  }

  const lista: InsigniaKit[] = [];
  for (const m of curso.modulos) {
    for (const c of m.capsulas) {
      const id = `ins-capsula-${c.id}`;
      lista.push({ id, nivel: 'capsula', nombre: c.titulo, refId: c.id, condicion: { tipo: 'completar-capsula', refId: c.id, notaMinima: nota }, criterio: conNota(t.criterio.capsula.replace('{t}', enIdioma(c.titulo, guia)), nota), origen: 'plantilla', archivos: archivos(id) });
    }
    const id = `ins-modulo-${m.id}`;
    lista.push({ id, nivel: 'modulo', nombre: m.titulo, refId: m.id, condicion: { tipo: 'completar-modulo', refId: m.id, notaMinima: nota }, criterio: conNota(t.criterio.modulo.replace('{t}', enIdioma(m.titulo, guia)), nota), origen: 'plantilla', archivos: archivos(id) });
  }
  lista.push({ id: 'ins-curso', nivel: 'curso', nombre: tituloCurso, refId: curso.id, condicion: { tipo: 'completar-curso', refId: curso.id, notaMinima: nota }, criterio: conNota(t.criterio.curso.replace('{t}', enIdioma(tituloCurso, guia)), nota), origen: 'plantilla', archivos: archivos('ins-curso') });
  return lista;
}

export function planGamificacion(curso: CursoKit, lms: LmsKit, idioma: IdiomaKit, insignias: InsigniaKit[]): PlanGamificacion {
  const t = T[idioma === 'en' ? 'en' : 'es'];
  const nota = curso.seguimiento.criterioCompletado === 'sumativa' && Number.isFinite(curso.seguimiento.notaMinima) ? curso.seguimiento.notaMinima : null;
  const de = (n: NivelInsignia) => insignias.filter((i) => i.nivel === n).map((i) => i.id);
  const grupos = [de('capsula').slice(0, 1), de('modulo'), de('curso')];
  const niveles = t.niveles
    .map(([nombre, requisito], i) => ({ nombre, requisito, insignias: grupos[i]! }))
    .filter((n) => n.insignias.length)
    .map((n, i) => ({ nivel: i + 1, ...n }));
  const capsulas = curso.modulos.flatMap((m) => m.capsulas.map((c) => ({ capsulaId: c.id, moduloId: m.id, titulo: c.titulo })));
  return {
    version: 1,
    curso: { id: curso.id, titulo: curso.metadatos.titulo },
    lms, idioma, notaMinima: nota, criterioCompletado: curso.seguimiento.criterioCompletado,
    puntosPorAcierto: curso.gamificacion?.puntosPorAcierto ?? null,
    insignias, niveles,
    ordenDesbloqueo: capsulas.map((c, i) => ({ paso: i + 1, ...c, requiere: i ? capsulas[i - 1]!.capsulaId : null })),
  };
}

const h = escaparXml;

export function guiaHtml(plan: PlanGamificacion, proyecto: string): string {
  const idioma: IdiomaGuia = plan.idioma === 'en' ? 'en' : 'es';
  const t = T[idioma];
  const lms = nombreLms(plan.lms, idioma);
  const tituloCurso = enIdioma(plan.curso.titulo, idioma);
  const nombreIns = (i: InsigniaKit) => {
    const a = enIdioma(i.nombre, idioma);
    return plan.idioma === 'ambos' && i.nombre.en && i.nombre.en !== a ? `${a} <span lang="en">/ ${h(i.nombre.en)}</span>` : h(a);
  };
  const nivel = (n: NivelInsignia) => t[n].charAt(0) + t[n].slice(1).toLowerCase();
  const capsulas = new Map(plan.ordenDesbloqueo.map((o) => [o.capsulaId, enIdioma(o.titulo, idioma)]));
  const filas = plan.insignias.map((i) => `<tr><td><img src="${h(i.archivos.png)}" alt="" width="64" height="64"></td><th scope="row">${nombreIns(i)}</th><td>${nivel(i.nivel)}</td><td>${h(i.criterio)}</td><td><code>${h(i.archivos.png)}</code></td></tr>`).join('\n');
  const orden = plan.ordenDesbloqueo.map((o) => `<tr><td>${o.paso}</td><th scope="row">${h(enIdioma(o.titulo, idioma))}</th><td>${o.requiere ? h(capsulas.get(o.requiere) ?? o.requiere) : t.primera}</td></tr>`).join('\n');
  const niveles = plan.niveles.map((n) => `<li><b>${t.nivel} ${n.nivel} · ${h(n.nombre)}</b>: ${h(n.requisito)}</li>`).join('');
  const pasos = pasosGuia(plan.lms, idioma, plan.notaMinima).map((s) => `<section><h3>${h(s.titulo)}</h3><ol>${s.pasos.map((p) => `<li>${h(p)}</li>`).join('')}</ol></section>`).join('\n');
  return `<!doctype html>
<html lang="${idioma}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${h(`${t.guia} ${lms} · ${tituloCurso}`)}</title>
<style>
body{font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#102033;background:#fff;margin:0;padding:32px;line-height:1.5;max-width:960px}
h1{font-size:28px;margin:0 0 4px}h2{font-size:22px;margin:32px 0 8px}h3{font-size:18px;margin:16px 0 4px}
.verificar{border-left:4px solid #B54708;background:#FFFAEB;padding:12px 16px;margin:16px 0}
table{border-collapse:collapse;width:100%}th,td{border:1px solid #CBD5E1;padding:8px;text-align:left;vertical-align:middle}thead th{background:#F1F5F9}
code{font-size:14px}.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}p.pie{color:#334155;font-size:14px}
@media print{body{padding:0}.verificar{break-inside:avoid}tr{break-inside:avoid}}
</style>
</head>
<body>
<main>
<h1>${h(`${t.guia} ${lms}`)}</h1>
<p>${h(t.titulo)} · ${h(tituloCurso)}${proyecto ? ` · ${h(proyecto)}` : ''}</p>
<p class="verificar" role="note"><strong>${h(VERIFICAR[idioma])}</strong></p>
<p>${t.nota}: <b>${plan.notaMinima ?? t.sinNota}</b></p>
<h2>${t.plan}</h2>
<table>
<thead><tr><th scope="col"><span class="sr">${t.insignia}</span></th><th scope="col">${t.insignia}</th><th scope="col">${t.nivel}</th><th scope="col">${t.como}</th><th scope="col">${t.archivo}</th></tr></thead>
<tbody>
${filas}
</tbody>
</table>
<h2>${t.orden}</h2>
<table>
<thead><tr><th scope="col">${t.paso}</th><th scope="col">${idioma === 'en' ? 'Capsule' : 'Cápsula'}</th><th scope="col">${t.requiere}</th></tr></thead>
<tbody>
${orden}
</tbody>
</table>
<h2>${t.nivelesT}</h2>
<ul>${niveles}</ul>
<h2>${h(`${t.pasos} ${lms}`)}</h2>
${pasos}
<p class="pie">${t.imprimir}</p>
</main>
</body>
</html>
`;
}

function leeme(plan: PlanGamificacion, archivos: string[], entrada: EntradaKitGamificacion): string {
  const en = plan.idioma === 'en';
  const fecha = (entrada.generadoEn ?? new Date()).toISOString().slice(0, 10);
  const marca = entrada.marca;
  const letra = marca?.tipografias?.titulos;
  const lineasTexto = en
    ? [
      `Gamification kit · ${enIdioma(plan.curso.titulo, 'en')}`,
      entrada.proyecto ? `Project: ${entrada.proyecto}` : '',
      `LMS: ${nombreLms(plan.lms, 'en')} · Generated on ${fecha}`,
      '',
      'Contents:',
      ...archivos.map((a) => `  ${a}`),
      '',
      'Credits:',
      `  Badges made by Aptio SCORM from a template with the brand kit${marca?.nombreCliente ? ` of ${marca.nombreCliente}` : ''}, without AI.`,
      letra ? `  Typeface: ${letra} (under the license recorded in the brand kit).` : '',
      entrada.organizacion ? `  Prepared and reviewed by ${entrada.organizacion}.` : '',
      '',
      VERIFICAR.en,
    ]
    : [
      `Kit de gamificación · ${enIdioma(plan.curso.titulo, 'es')}`,
      entrada.proyecto ? `Proyecto: ${entrada.proyecto}` : '',
      `LMS: ${nombreLms(plan.lms, 'es')} · Generado el ${fecha}`,
      '',
      'Contenido:',
      ...archivos.map((a) => `  ${a}`),
      '',
      'Créditos:',
      `  Insignias hechas por Aptio SCORM con plantilla y el kit de marca${marca?.nombreCliente ? ` de ${marca.nombreCliente}` : ''}, sin IA.`,
      letra ? `  Tipografía: ${letra} (con la licencia registrada en el kit de marca).` : '',
      entrada.organizacion ? `  Preparado y revisado por ${entrada.organizacion}.` : '',
      '',
      VERIFICAR.es,
    ];
  return `${lineasTexto.filter((l, i, a) => l !== '' || a[i - 1] !== '').join('\r\n')}\r\n`;
}

export async function construirKitGamificacion(entrada: EntradaKitGamificacion): Promise<KitGamificacion> {
  const { curso, marca, lms, idioma } = entrada;
  if (!LMS_KIT.includes(lms)) throw new Error(`LMS desconocido: ${String(lms)}`);
  const insignias = insigniasDelCurso(curso, idioma);
  const plan = planGamificacion(curso, lms, idioma, insignias);
  const advertencias: string[] = [];
  if (idioma === 'ambos') {
    const sinIngles = insignias.filter((i) => !i.nombre.en).length;
    if (sinIngles) advertencias.push(`${sinIngles} insignias no tienen nombre en inglés: llevan solo el español.`);
  }
  const archivos: [string, Uint8Array | string][] = [];
  for (const i of insignias) {
    const svg = svgInsignia(i, marca, idioma);
    archivos.push([i.archivos.svg, svg], [i.archivos.png, await entrada.png(svg, LADO_INSIGNIA)]);
  }
  const guia = guiaHtml(plan, entrada.proyecto ?? '');
  const nombreGuia = `guia-${lms}.html`;
  archivos.push(['plan.json', `${JSON.stringify(plan, null, 2)}\n`], [nombreGuia, guia]);
  const lista = ['LEEME.txt', ...archivos.map(([r]) => r)].sort((a, b) => (a === 'LEEME.txt' ? -1 : b === 'LEEME.txt' ? 1 : a.localeCompare(b)));
  archivos.unshift(['LEEME.txt', leeme(plan, lista, entrada)]);
  return { zip: await comprimir(archivos), archivos: lista, plan, guia, advertencias };
}
