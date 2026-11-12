// HU-1201 · Validar antes de exportar (CP-090). Función pura: con el curso, el peso de sus recursos, el peso del
// reproductor y el límite de subida del destino, dice qué impide exportar (`errores`) y qué conviene revisar
// (`advertencias`). Nunca bloquea por tamaño (RN-12-2): si el paquete pasa el límite, advierte con las alternativas de
// docs/08-entregas-y-lms.md. Las pantallas sin aprobar son advertencia (RN-12-3); la confirmación la pide la web.
// El peso es una estimación: los recursos (MP3, WebP, MP4) casi no se comprimen en el ZIP, así que se suman tal cual.
// HU-1203 · Para HTML no hay LMS: no hay límite de subida ni suspend_data; el peso queda solo como dato.
// HU-0804 · Paquete bilingüe: falta de inglés en un texto impide exportar; los desbordes y la falta de voz en inglés
// solo advierten. El peso suma los recursos de los dos idiomas.
import { aplanar, codificarSuspend, huellaCurso, LIMITE_SUSPEND, type CursoReproductor, type ResultadoActividad } from '@aptio/player';
import { erroresCurso } from '@aptio/schema';
import { informeAlineacion } from '@aptio/schema/alineacion';
import type { CursoDoc } from '@aptio/schema/revision';
import { cursoBilingue, IDIOMAS_BILINGUE, type ModoIdioma, pantallasSinVozIngles, textosEnIngles } from './bilingue.ts';
import { LEEME_HTML } from './html.ts';
import { indexHtml, INICIAR_JS } from './scorm12.ts';
import { manifiestoScorm12 } from './manifiesto.ts';

/** Peso de un recurso del curso; `bytes: null` si no hay archivo (el paquete muestra su texto alternativo). */
export interface PesoRecurso {
  id: string;
  nombre: string;
  bytes: number | null;
}

export interface RecursoPesado {
  id: string;
  nombre: string;
  bytes: number;
}

export type FormatoValidable = 'SCORM12' | 'HTML';

export interface ValidacionScorm12 {
  formato: FormatoValidable;
  errores: string[];
  advertencias: string[];
  /** Peso estimado del ZIP. */
  pesoEstimadoBytes: number;
  pesoEstimadoMb: number;
  /** Límite de subida del destino; null en HTML (no hay LMS). */
  limiteMb: number | null;
  superaLimite: boolean;
  /** Las 5 alternativas de docs/08 cuando se pasa el límite; vacío si no. */
  alternativas: string[];
  /** Los 5 recursos que más pesan, del más pesado al más liviano. */
  recursosPesados: RecursoPesado[];
  /** Peor caso de `cmi.suspend_data` v2: todo visto y todas las actividades con nota e intentos. null en HTML. */
  suspendDataCaracteres: number | null;
  pantallasTotal: number;
  pantallasSinAprobar: number;
  /** Ids de los recursos del paquete que no tienen archivo. */
  recursosFaltantes: string[];
  /** HU-0804 · Idiomas del paquete y, en el bilingüe, cuántos textos tienen su inglés. */
  modoIdioma: ModoIdioma;
  textosIngles: { traducidos: number; total: number } | null;
  /** HU-1001 · Objetivos con alertas de alineación (advertencia, no bloquea). */
  objetivosSinAlinear: number;
}

/** Opciones de la validación: el origen del límite (solo el texto), el idioma o el paquete bilingüe. */
export interface OpcionesValidacion {
  origenLimite?: 'ficha' | 'referencia';
  idioma?: string;
  modoIdioma?: ModoIdioma;
  /** HU-0804 · Textos en Desborde sin revisar (filas de Traduccion), para advertir en el bilingüe. */
  desbordes?: number;
}

export const MB = 1024 * 1024;

/** HU-0804 · Advertencia del bilingüe cuando hay pantallas narradas sin audio en inglés (no impide exportar). */
export const avisoSinVozIngles = (n: number): string =>
  `Sin voz en inglés en ${n} ${n === 1 ? 'pantalla' : 'pantallas'}: en inglés ${n === 1 ? 'esa pantalla muestra' : 'esas pantallas muestran'} la narración como texto. Genérala en Idiomas.`;

/** Alternativas de docs/08-entregas-y-lms.md («Tamaño del paquete»), en ese orden. */
export const ALTERNATIVAS_PESO = [
  'Exportar igual, con la recomendación de que el administrador del LMS amplíe el límite de subida.',
  'Comprimir más el video y las imágenes.',
  'Dividir el curso en varios paquetes (por módulo o cápsula).',
  'Alojar el video fuera del paquete (servidor del cliente, plataforma de video o almacenamiento propio).',
  'Usar el paquete de distribución (dispatch), cuando exista.',
] as const;

/** Intentos que se suponen para el peor caso de suspend_data cuando el curso no limita los intentos. */
export const INTENTOS_PEOR_CASO = 99;

type RecursoCurso = { id: string; tipo?: string; nombre?: string; idioma?: string };
type PantallaEstado = { id: string; estado?: string };

const redondear = (mb: number) => Math.round(mb * 10) / 10;
const mbTexto = (mb: number) => redondear(mb).toLocaleString('es-PE', { maximumFractionDigits: 1 });
const esTexto = (r: RecursoCurso, nombre: string) => r.tipo === 'svg' || r.tipo === 'subtitulos' || /\.(svg|vtt)$/i.test(nombre);

/** Valida el curso para SCORM 1.2 (atajo de `validarExportacion('SCORM12', …)`). */
export function validarScorm12(
  curso: unknown,
  pesosRecursos: readonly PesoRecurso[],
  pesoReproductor: number,
  limiteMb: number,
  opciones: OpcionesValidacion = {},
): ValidacionScorm12 {
  return validarExportacion('SCORM12', curso, pesosRecursos, pesoReproductor, limiteMb, opciones);
}

/**
 * Valida el curso para el formato pedido. En SCORM 1.2, `limiteMb` es el límite de subida del destino (la ficha del
 * cliente o el valor de referencia) y `origenLimite` solo cambia el texto de la advertencia. En HTML se ignora el límite.
 */
export function validarExportacion(
  formato: FormatoValidable,
  curso: unknown,
  pesosRecursos: readonly PesoRecurso[],
  pesoReproductor: number,
  limiteMb: number | null,
  opciones: OpcionesValidacion = {},
): ValidacionScorm12 {
  const html = formato === 'HTML';
  const bilingue = opciones.modoIdioma === 'mismo-paquete';
  const errores = erroresCurso(curso);
  const advertencias: string[] = [];
  const textosIngles = bilingue ? textosEnIngles(curso) : null;
  if (textosIngles && textosIngles.traducidos < textosIngles.total) {
    errores.push(`Faltan ${textosIngles.total - textosIngles.traducidos} textos en inglés: tradúcelos en Idiomas`);
  } else if (textosIngles && !errores.length) {
    // Con todo traducido, el curso del paquete (con los dos idiomas) también debe cumplir el esquema.
    errores.push(...erroresCurso(cursoBilingue(curso as CursoReproductor)));
  }
  const resultado: ValidacionScorm12 = {
    formato, errores, advertencias, pesoEstimadoBytes: 0, pesoEstimadoMb: 0, limiteMb: html ? null : limiteMb, superaLimite: false, alternativas: [],
    recursosPesados: [], suspendDataCaracteres: html ? null : 0, pantallasTotal: 0, pantallasSinAprobar: 0, recursosFaltantes: [],
    modoIdioma: bilingue ? 'mismo-paquete' : 'unico', textosIngles, objetivosSinAlinear: 0,
  };
  // Con errores de esquema se calcula lo que se pueda; si el documento no tiene ni la forma básica, solo los errores.
  let c: CursoReproductor;
  let pantallas: ReturnType<typeof aplanar>;
  try {
    c = curso as CursoReproductor;
    pantallas = aplanar(c);
  } catch {
    return resultado;
  }

  // ---------- Peso estimado ----------
  const idioma = bilingue ? 'es' : opciones.idioma ?? c.idiomas?.[0] ?? 'es';
  const idiomas: string[] = bilingue ? [...IDIOMAS_BILINGUE] : [idioma];
  const pesos = new Map(pesosRecursos.map((r) => [r.id, r]));
  let bytesRecursos = 0;
  let bytesEnDatos = 0;
  const conArchivo: RecursoPesado[] = [];
  for (const r of (Array.isArray(c.recursos) ? c.recursos : []) as RecursoCurso[]) {
    // Igual que construirScorm12: sin documentos del cliente (SUP-52) ni recursos de otro idioma (SUP-49).
    if (r.tipo === 'documento' || (r.idioma && !idiomas.includes(r.idioma))) continue;
    const p = pesos.get(r.id);
    const nombre = p?.nombre ?? r.nombre ?? r.id;
    if (!p || p.bytes === null) {
      resultado.recursosFaltantes.push(r.id);
      continue;
    }
    bytesRecursos += p.bytes;
    // Los SVG y los WebVTT también van como texto dentro de datos.js.
    if (esTexto(r, nombre)) bytesEnDatos += p.bytes;
    conArchivo.push({ id: r.id, nombre, bytes: p.bytes });
  }
  const datosJs = 40 + Buffer.byteLength(JSON.stringify(curso)) + bytesEnDatos;
  const fijos = Buffer.byteLength(indexHtml(String(c.id ?? ''), idioma)) + INICIAR_JS.length
    + (html
      ? Buffer.byteLength(LEEME_HTML(String(c.id ?? '')))
      : Buffer.byteLength(manifiestoScorm12({ cursoId: String(c.id ?? 'curso'), titulo: '', masteryscore: null, archivos: conArchivo.map((r) => `recursos/${r.id}.xxxx`) })));
  resultado.pesoEstimadoBytes = bytesRecursos + datosJs + pesoReproductor + fijos;
  resultado.pesoEstimadoMb = redondear(resultado.pesoEstimadoBytes / MB);
  resultado.recursosPesados = conArchivo.sort((a, b) => b.bytes - a.bytes).slice(0, 5);
  resultado.superaLimite = !html && limiteMb !== null && resultado.pesoEstimadoBytes > limiteMb * MB;
  if (resultado.superaLimite) {
    resultado.alternativas = [...ALTERNATIVAS_PESO];
    const origen = opciones.origenLimite === 'ficha' ? 'según la ficha de compatibilidad del cliente' : 'valor de referencia, el LMS del cliente puede aceptar más';
    advertencias.push(`El paquete pesaría unos ${mbTexto(resultado.pesoEstimadoBytes / MB)} MB y el límite de subida del destino es ${limiteMb} MB (${origen}). Puedes exportar igual; revisa las alternativas.`);
  }

  // ---------- suspend_data en el peor caso (solo SCORM: en HTML no hay LMS que lo guarde) ----------
  if (!html) {
    const orden = pantallas.map((x) => x.pantalla.id);
    const intentos = c.seguimiento?.intentosMaximos ?? INTENTOS_PEOR_CASO;
    const resultados: Record<string, ResultadoActividad> = Object.fromEntries(
      pantallas.filter((x) => x.pantalla.bloques?.some((b) => b.tipo === 'interaccion')).map((x) => [x.pantalla.id, { completada: true, puntaje: 100, intentos }]),
    );
    const caracteres = codificarSuspend(orden, { idioma, vistas: orden, resultados }, huellaCurso(String(c.id ?? ''), orden)).length;
    resultado.suspendDataCaracteres = caracteres;
    if (caracteres > LIMITE_SUSPEND) {
      advertencias.push(`El avance completo ocuparía ${caracteres} caracteres de suspend_data y SCORM 1.2 admite ${LIMITE_SUSPEND}: el LMS guardará la pantalla, la nota y el estado, pero no el avance detallado para reanudar.`);
    }
  }

  // ---------- Recursos sin archivo ----------
  if (resultado.recursosFaltantes.length) {
    const nombres = resultado.recursosFaltantes.map((id) => `«${pesos.get(id)?.nombre ?? (c.recursos as RecursoCurso[]).find((r) => r.id === id)?.nombre ?? id}»`);
    const n = nombres.length;
    advertencias.push(`${n === 1 ? 'Falta el archivo de' : `Faltan ${n} archivos:`} ${nombres.slice(0, 5).join(', ')}${n > 5 ? ` y ${n - 5} más` : ''}. El paquete muestra su texto alternativo.`);
  }

  // ---------- Paquete bilingüe (HU-0804): desbordes y voz en inglés solo advierten ----------
  if (bilingue) {
    if (opciones.desbordes) advertencias.push(`${opciones.desbordes} ${opciones.desbordes === 1 ? 'texto en inglés no cabe' : 'textos en inglés no caben'} en su espacio (Desborde): revísalos en Idiomas.`);
    const sinVoz = pantallasSinVozIngles(c);
    if (sinVoz) advertencias.push(avisoSinVozIngles(sinVoz));
  }

  // ---------- Alineación pedagógica (HU-1001, PNT-18): los objetivos con alertas solo advierten ----------
  try {
    resultado.objetivosSinAlinear = informeAlineacion(c as unknown as CursoDoc).objetivos.filter((o) => o.alertas.length).length;
  } catch {
    resultado.objetivosSinAlinear = 0;
  }
  if (resultado.objetivosSinAlinear) {
    const n = resultado.objetivosSinAlinear;
    advertencias.push(`${n} ${n === 1 ? 'objetivo sin alinear' : 'objetivos sin alinear'}: revísalos en Alineación pedagógica.`);
  }

  // ---------- Pantallas sin aprobar (RN-12-3) ----------
  resultado.pantallasTotal = pantallas.length;
  resultado.pantallasSinAprobar = pantallas.filter((x) => (x.pantalla as PantallaEstado).estado !== 'aprobado').length;
  if (resultado.pantallasSinAprobar) {
    advertencias.push(`${resultado.pantallasSinAprobar} de ${resultado.pantallasTotal} pantallas sin aprobar: revísalas antes de entregar al cliente.`);
  }
  return resultado;
}
