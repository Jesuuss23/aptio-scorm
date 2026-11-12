// HU-0505 · Control de calidad automático (M05, CP-054, REQ-035, REQ-105): las reglas sin IA que corren al terminar la
// etapa 4, en cada guardado del curso, al traducir y al pedir «Revisar con IA». Cubren accesibilidad (texto alternativo en
// español e inglés, subtítulos, contraste del kit), longitud por idioma (palabras y caracteres por componente, SUP-72),
// alineación básica (actividad sin objetivo, objetivo sin actividad; la matriz por nivel de Bloom es la HU-1001) y
// faltantes (actividad sin retroalimentación). La ortografía, la coherencia, el tono y la exactitud son de IA-12.
import { CONTRASTE_AA, type Paleta, revisarPaleta } from './marca.js';
import type { CursoDoc, PantallaDoc } from './revision.js';
import { desborda, textosDe } from './traduccion.js';

export type SeveridadObservacion = 'info' | 'aviso' | 'bloquea-entrega';
export type TipoObservacion = 'CALIDAD' | 'ALINEACION' | 'IDIOMA' | 'ACCESIBILIDAD' | 'MATERIAL_FALTANTE';
/** Categoría que se muestra en Revisión: las de IA-12 más «diseño» (composición repetida). */
export const CATEGORIAS = ['ortografia', 'coherencia', 'alineacion', 'longitud', 'accesibilidad', 'faltante', 'tono', 'exactitud', 'diseno'] as const;
export type CategoriaObservacion = (typeof CATEGORIAS)[number];
export const NOMBRE_CATEGORIA: Record<CategoriaObservacion, string> = {
  ortografia: 'Ortografía', coherencia: 'Coherencia', alineacion: 'Alineación', longitud: 'Longitud', accesibilidad: 'Accesibilidad',
  faltante: 'Faltante', tono: 'Tono', exactitud: 'Exactitud', diseno: 'Diseño',
};

export interface ObservacionRegla {
  /** null: observación del curso (un objetivo sin actividad, el contraste del kit). */
  pantallaId: string | null;
  tipo: TipoObservacion;
  severidad: SeveridadObservacion;
  categoria: CategoriaObservacion;
  mensaje: string;
  /** JSON Pointer al texto o bloque, cuando la observación es de uno. */
  ruta?: string;
}

/** Lo que las reglas no pueden leer del documento: la paleta del kit del cliente y los textos en inglés en Desborde. */
export interface ContextoCalidad {
  paleta?: Paleta | null;
  /** Rutas de los textos cuya fila de Traduccion está en Desborde (HU-0803): lo aceptado largo por una persona no cuenta. */
  desbordesEn?: Iterable<string>;
}

/** HU-0505 · Tarea de la cola `ia` del control de calidad, lotes de pantallas por llamada y tope de observaciones de IA. */
export const TAREA_CALIDAD = 'IA-12';
export const LOTE_CALIDAD = 10;
export const TOPE_OBSERVACIONES_IA = 120;

/** Tipo de la observación (columna `tipo`) según la categoría de IA-12. */
export function tipoDeCategoria(c: CategoriaObservacion): TipoObservacion {
  if (c === 'accesibilidad') return 'ACCESIBILIDAD';
  if (c === 'alineacion') return 'ALINEACION';
  if (c === 'faltante') return 'MATERIAL_FALTANTE';
  return 'CALIDAD';
}
/** Gravedad de IA-12 → severidad: ninguna bloquea la aprobación (la IA propone y la persona decide). */
export const severidadDeGravedad = (g: 'alta' | 'media' | 'baja'): SeveridadObservacion => (g === 'baja' ? 'info' : 'aviso');

/** Límites de microaprendizaje (guía de disposiciones de IA-15 y docs/20-guia-diseno.md). */
export const LIMITES = { palabrasEnPantalla: 30, palabrasDatoGrande: 6, palabrasNarracion: 90 } as const;

const palabras = (t: string | undefined) => (t?.trim() ? t.trim().split(/\s+/).length : 0);
const vacio = (t: { es?: string } | undefined) => !t?.es?.trim();
const recortar = (t: string, n = 40) => (t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t);
const pantallasDe = (doc: CursoDoc): PantallaDoc[] => doc.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
/** Ruta JSON Pointer de cada pantalla, por id. */
function rutasPantallas(doc: CursoDoc): Map<string, string> {
  const rutas = new Map<string, string>();
  doc.modulos.forEach((m, i) => m.capsulas.forEach((c, j) => c.pantallas.forEach((p, k) => rutas.set(p.id, `/modulos/${i}/capsulas/${j}/pantallas/${k}`))));
  return rutas;
}

/** Observaciones por reglas de una pantalla; `anteriores` son las disposiciones de las dos pantallas previas. */
export function observacionesDePantalla(p: PantallaDoc, anteriores: (string | undefined)[] = [], opciones: { conIngles?: boolean; ruta?: string | undefined } = {}): ObservacionRegla[] {
  const obs: ObservacionRegla[] = [];
  const agregar = (tipo: TipoObservacion, severidad: SeveridadObservacion, categoria: CategoriaObservacion, mensaje: string, ruta?: string) =>
    obs.push({ pantallaId: p.id, tipo, severidad, categoria, mensaje, ...(ruta ? { ruta } : {}) });
  const rutaBloque = (id: string) => (opciones.ruta ? `${opciones.ruta}/bloques/${p.bloques.findIndex((b) => b.id === id)}` : undefined);
  const textos = p.bloques.filter((b) => b.tipo === 'texto');
  const enPantalla = textos.filter((b) => b.rol !== 'titulo').reduce((n, b) => n + palabras(b.contenido?.es), 0);
  if (enPantalla > LIMITES.palabrasEnPantalla) {
    agregar('CALIDAD', 'aviso', 'longitud', `Tiene ${enPantalla} palabras en pantalla; el máximo es ${LIMITES.palabrasEnPantalla}. Pasa el detalle a la narración.`);
  }
  for (const b of textos.filter((x) => x.id.endsWith('-dato-grande'))) {
    const n = palabras(b.contenido?.es);
    if (n > LIMITES.palabrasDatoGrande) agregar('CALIDAD', 'aviso', 'longitud', `El dato destacado tiene ${n} palabras; el máximo es ${LIMITES.palabrasDatoGrande}.`, rutaBloque(b.id));
  }
  const narracion = palabras(p.narracion?.texto.es);
  if (narracion > LIMITES.palabrasNarracion) {
    agregar('CALIDAD', 'aviso', 'longitud', `La narración tiene ${narracion} palabras (≈ ${Math.round(narracion / 2.5)} s); el máximo es ${LIMITES.palabrasNarracion}.`);
  }
  // CP-054 · Imagen no decorativa sin texto alternativo: bloquea la entrega (REQ-105).
  for (const b of p.bloques.filter((x) => x.tipo === 'imagen' && x.decorativa === false)) {
    if (vacio(b.alt)) agregar('ACCESIBILIDAD', 'bloquea-entrega', 'accesibilidad', `La imagen ${b.id} no tiene texto alternativo.`, rutaBloque(b.id));
    else if (opciones.conIngles && !b.alt?.en?.trim()) agregar('ACCESIBILIDAD', 'aviso', 'accesibilidad', `La imagen ${b.id} no tiene texto alternativo en inglés: tradúcelo en Idiomas.`, rutaBloque(b.id));
  }
  // Una narración con voz necesita subtítulos (REQ-105); antes de la etapa 6 aún no hay voz y no se avisa.
  for (const [idioma, nombre] of [['es', 'español'], ['en', 'inglés']] as const) {
    const pista = p.narracion?.porIdioma?.[idioma];
    if (pista?.recursoAudioId && !pista.subtitulosId) agregar('ACCESIBILIDAD', 'aviso', 'accesibilidad', `La narración en ${nombre} no tiene subtítulos: genéralos en Producción.`);
  }
  if (p.disposicion && anteriores.length === 2 && anteriores.every((d) => d === p.disposicion)) {
    agregar('CALIDAD', 'aviso', 'diseno', `Es la tercera pantalla seguida con la disposición «${p.disposicion}». Cambia la composición para que no canse.`);
  }
  // Alineación básica: una actividad practica un objetivo.
  const actividad = p.bloques.find((b) => b.tipo === 'interaccion');
  if (actividad && !p.objetivoIds?.length) {
    agregar('ALINEACION', 'aviso', 'alineacion', 'La actividad no está ligada a ningún objetivo: elige el objetivo que practica.', rutaBloque(actividad.id));
  }
  for (const b of p.bloques.filter((x) => x.tipo === 'interaccion' && x.interaccion)) {
    if (sinRetroalimentacion(b.interaccion!)) agregar('CALIDAD', 'aviso', 'faltante', 'La actividad no tiene retroalimentación: agrega qué decir al acertar y al fallar.', rutaBloque(b.id));
  }
  return obs;
}

type Lista = Record<string, unknown>[];
const lista = (v: unknown): Lista => (Array.isArray(v) ? (v as Lista) : []);
const texto = (v: unknown) => vacio(v as { es?: string } | undefined);

/** Quiz con una pregunta sin retroalimentación, clasificar o deslizar sin ninguna, o decisión con una opción sin consecuencia. */
function sinRetroalimentacion(i: { tipo: string; datos: Record<string, unknown> }): boolean {
  const d = i.datos;
  switch (i.tipo) {
    case 'INT-05': return lista(d.preguntas).some((q) => {
      const r = q.retroalimentacion as { correcta?: unknown; incorrecta?: unknown } | undefined;
      return texto(r?.correcta) || texto(r?.incorrecta);
    });
    case 'INT-02': return lista(d.elementos).length > 0 && lista(d.elementos).every((e) => texto(e.retroalimentacion));
    case 'INT-07': return lista(d.afirmaciones).length > 0 && lista(d.afirmaciones).every((a) => texto(a.retroalimentacion));
    case 'INT-08': return lista(d.nodos).some((n) => lista(n.opciones).some((o) => texto(o.consecuencia)));
    default: return false;
  }
}

/** Objetivos que practica o evalúa el curso: los de las pantallas con actividad y los de cada pregunta. */
function objetivosConActividad(doc: CursoDoc): Set<string> {
  const ids = new Set<string>();
  for (const p of pantallasDe(doc)) {
    for (const b of p.bloques.filter((x) => x.tipo === 'interaccion')) {
      for (const id of p.objetivoIds ?? []) ids.add(id);
      for (const q of lista(b.interaccion?.datos.preguntas)) if (typeof q.objetivoId === 'string') ids.add(q.objetivoId);
    }
  }
  return ids;
}

/** ¿El curso ya tiene algún texto en inglés? Las reglas de inglés solo aplican entonces. */
export const tieneIngles = (doc: unknown) => textosDe(doc).some((t) => Boolean(t.en?.trim()));

/** Observaciones por reglas de todo el curso: las de cada pantalla y las del curso. */
export function observacionesRegla(doc: CursoDoc, contexto: ContextoCalidad = {}): ObservacionRegla[] {
  const pantallas = pantallasDe(doc);
  const conIngles = tieneIngles(doc);
  const rutas = rutasPantallas(doc);
  const obs = pantallas.flatMap((p, i) => observacionesDePantalla(p, i >= 2 ? [pantallas[i - 2]!.disposicion, pantallas[i - 1]!.disposicion] : [], { conIngles, ruta: rutas.get(p.id) }));
  // Longitud por idioma (SUP-72): el español que no cabe en su componente, y el inglés que quedó en Desborde.
  const desbordesEn = new Set(contexto.desbordesEn ?? []);
  for (const t of textosDe(doc)) {
    if (!t.limite) continue;
    if (desborda(t.es, t.limite)) {
      obs.push({ pantallaId: t.pantallaId, tipo: 'CALIDAD', severidad: 'aviso', categoria: 'longitud', ruta: t.ruta,
        mensaje: `«${recortar(t.es.trim())}» no cabe en su espacio: ${t.es.trim().length} de ${t.limite} caracteres.` });
    }
    if (t.en && desbordesEn.has(t.ruta)) {
      obs.push({ pantallaId: t.pantallaId, tipo: 'IDIOMA', severidad: 'aviso', categoria: 'longitud', ruta: t.ruta,
        mensaje: `En inglés, «${recortar(t.en.trim())}» no cabe en su espacio (${t.en.trim().length} de ${t.limite} caracteres): revísalo en Idiomas.` });
    }
  }
  // Alineación básica: cada objetivo tiene al menos una actividad o pregunta (la matriz por nivel es la HU-1001).
  const practicados = objetivosConActividad(doc);
  for (const o of doc.objetivos ?? []) {
    if (!practicados.has(o.id)) {
      obs.push({ pantallaId: null, tipo: 'ALINEACION', severidad: 'aviso', categoria: 'alineacion', mensaje: `El objetivo «${recortar(o.texto.es?.trim() ?? o.id, 60)}» no tiene ninguna actividad ni pregunta.` });
    }
  }
  // Contraste del kit (SUP-63): el reproductor oscurece sus colores de texto, pero el equipo debe saberlo.
  if (contexto.paleta) {
    let advertencias: ReturnType<typeof revisarPaleta>['advertencias'] = [];
    try {
      advertencias = revisarPaleta(contexto.paleta).advertencias;
    } catch {
      // Una paleta con colores que no son #RRGGBB no se mide: el kit ya la valida al guardarse.
    }
    for (const a of advertencias) {
      obs.push({ pantallaId: null, tipo: 'ACCESIBILIDAD', severidad: 'aviso', categoria: 'accesibilidad',
        mensaje: `Kit de marca: ${a.mensaje.charAt(0).toLowerCase()}${a.mensaje.slice(1)} (WCAG AA pide ${String(CONTRASTE_AA).replace('.', ',')}:1). El reproductor oscurece el texto, pero revisa la paleta.` });
    }
  }
  return obs;
}
