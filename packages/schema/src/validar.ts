// Validación del documento del curso: esquema v0.2 (Ajv, JSON Schema 2020-12) más las reglas
// que JSON Schema no puede expresar. La usan por igual la API, el worker y la web (CP-002).
import { Ajv2020, type ValidateFunction } from 'ajv/dist/2020.js';
import formatosModulo, { type FormatsPlugin } from 'ajv-formats';
import esquema from '../esquemas/curso-v0.schema.json' with { type: 'json' };
import type { CursoDeCapsulasEsquemaV0 as Curso } from './curso.generado.js';
import { erroresDisparadores } from './disparadores.js';

// ajv-formats se publica como CommonJS: según el cargador, el plugin llega directo o envuelto en `default`.
const agregarFormatos = ((formatosModulo as unknown as { default?: FormatsPlugin }).default ??
  formatosModulo) as unknown as FormatsPlugin;

export const VERSION_ESQUEMA = '0.2.0';
export { esquema as esquemaCurso };

let validadorEsquema: ValidateFunction | undefined;
function compilar() {
  if (!validadorEsquema) {
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    agregarFormatos(ajv);
    validadorEsquema = ajv.compile(esquema);
  }
  return validadorEsquema;
}

export interface ResultadoValidacion {
  valido: boolean;
  /** Errores que impiden guardar el curso. */
  errores: string[];
  /** Avisos para exportar (pantallas sin aprobar, narraciones pendientes). Solo si es válido. */
  advertencias: string[];
}

type Nodo = Record<string, unknown>;
const esObjeto = (v: unknown): v is Nodo => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Errores del curso. Lista vacía = válido. */
export function erroresCurso(documento: unknown): string[] {
  const validar = compilar();
  const errores: string[] = [];
  if (!validar(documento)) {
    for (const e of validar.errors ?? []) errores.push(`esquema ${e.instancePath || '/'}: ${e.message ?? 'no válido'}`);
    return errores; // las reglas siguientes asumen estructura válida
  }
  const curso = documento as Curso;

  const idsRecursos = new Set((curso.recursos ?? []).map((r) => r.id));
  const idsObjetivos = new Set((curso.objetivos ?? []).map((o) => o.id));

  // 1. Identificadores únicos en todo el documento
  const vistos = new Map<string, string>();
  (function recorrer(nodo: unknown, ruta: string): void {
    if (Array.isArray(nodo)) return nodo.forEach((n, i) => recorrer(n, `${ruta}/${i}`));
    if (!esObjeto(nodo)) return;
    if (typeof nodo.id === 'string' && !ruta.endsWith('/cliente')) {
      const previo = vistos.get(nodo.id);
      if (previo !== undefined) errores.push(`id duplicado "${nodo.id}" en ${ruta} y ${previo}`);
      else vistos.set(nodo.id, ruta);
    }
    for (const [k, v] of Object.entries(nodo)) recorrer(v, `${ruta}/${k}`);
  })(curso, '');

  // 2. Referencias a recursos y objetivos existentes; 3. completitud por idioma
  const claveRecurso = new Set(['recursoId', 'recursoAudioId', 'subtitulosId', 'fondoRecursoId', 'imagenId', 'documentoId']);
  (function recorrer(nodo: unknown, ruta: string, padre: unknown): void {
    if (Array.isArray(nodo)) return nodo.forEach((n, i) => recorrer(n, `${ruta}/${i}`, padre));
    if (!esObjeto(nodo)) return;
    const claves = Object.keys(nodo);
    const esTextoI18n =
      claves.length > 0 &&
      claves.every((k) => k === 'es' || k === 'en') &&
      Object.values(nodo).every((v) => typeof v === 'string');
    if (esTextoI18n) {
      if (curso.modoIdioma !== 'unico') {
        for (const idioma of curso.idiomas) if (!nodo[idioma]) errores.push(`texto sin traducción "${idioma}" en ${ruta}`);
      }
      return;
    }
    for (const [k, v] of Object.entries(nodo)) {
      if (claveRecurso.has(k) && typeof v === 'string') {
        if (!idsRecursos.has(v)) errores.push(`recurso inexistente "${v}" en ${ruta}/${k}`);
      }
      if (k === 'subtitulos' && esObjeto(v) && padre === 'video') {
        for (const [idioma, id] of Object.entries(v)) {
          if (!idsRecursos.has(id as string)) errores.push(`subtítulo inexistente "${String(id)}" (${idioma}) en ${ruta}`);
        }
      }
      if ((k === 'objetivoIds' && Array.isArray(v)) || k === 'objetivoId') {
        for (const id of ([] as unknown[]).concat(v)) {
          if (!idsObjetivos.has(id as string)) errores.push(`objetivo inexistente "${String(id)}" en ${ruta}`);
        }
      }
      recorrer(v, `${ruta}/${k}`, nodo.tipo ?? padre);
    }
  })(curso, '', null);

  for (const m of curso.modulos) {
    for (const c of m.capsulas) {
      for (const p of c.pantallas) {
        // 4. Reglas de interacciones
        for (const b of p.bloques as Nodo[]) {
          if (b.tipo !== 'interaccion' || !esObjeto(b.interaccion)) continue;
          const { tipo, datos } = b.interaccion as { tipo: string; datos: Nodo };
          const ruta = `${c.id}/${p.id}/${String(b.id)}`;
          if (tipo === 'INT-02') {
            const grupos = new Set((datos.grupos as Nodo[]).map((g) => g.id));
            for (const e of datos.elementos as Nodo[]) {
              if (!grupos.has(e.grupoCorrecto)) errores.push(`grupo inexistente "${String(e.grupoCorrecto)}" en ${ruta}`);
            }
          }
          if (
            tipo === 'INT-05' &&
            typeof datos.preguntasPorIntento === 'number' &&
            datos.preguntasPorIntento > (datos.preguntas as unknown[]).length
          ) {
            errores.push(`preguntasPorIntento mayor que el banco en ${ruta}`);
          }
          if (tipo === 'INT-08') {
            const nodos = new Set((datos.nodos as Nodo[]).map((n) => n.id));
            if (!nodos.has(datos.inicioId)) errores.push(`inicioId inexistente en ${ruta}`);
            for (const n of datos.nodos as Nodo[]) {
              for (const o of n.opciones as Nodo[]) {
                if (o.siguienteId && !nodos.has(o.siguienteId)) {
                  errores.push(`siguienteId inexistente "${String(o.siguienteId)}" en ${ruta}`);
                }
              }
            }
          }
        }
        // 5. Narración: el bloque de personaje referido debe existir en la pantalla
        const ref = p.narracion?.personajeBloqueId;
        if (ref && !(p.bloques as Nodo[]).some((b) => b.id === ref && b.tipo === 'personaje')) {
          errores.push(`personajeBloqueId "${ref}" no es un personaje de ${p.id}`);
        }
      }
    }
  }

  // 6. HU-0610 · Disparadores: como mucho 10 por pantalla, segundo de 0 a 600 y referencias que existen
  const idsPantallas = curso.modulos.flatMap((m) => m.capsulas.flatMap((c) => c.pantallas.map((p) => p.id)));
  for (const m of curso.modulos) for (const c of m.capsulas) for (const p of c.pantallas) errores.push(...erroresDisparadores(p, idsPantallas));

  // 7. Coherencia de idiomas
  if (curso.modoIdioma === 'unico' && curso.idiomas.length !== 1) errores.push("modoIdioma 'unico' exige exactamente un idioma");
  if (curso.modoIdioma !== 'unico' && curso.idiomas.length < 2) {
    errores.push(`modoIdioma '${curso.modoIdioma}' exige al menos dos idiomas`);
  }
  return errores;
}

/** Avisos para exportar: no impiden guardar. Supone un curso válido. */
export function advertenciasCurso(curso: Curso): string[] {
  const avisos: string[] = [];
  for (const m of curso.modulos) {
    for (const c of m.capsulas) {
      for (const p of c.pantallas) {
        if (p.estado !== 'aprobado') avisos.push(`pantalla ${p.id} en estado "${p.estado}"`);
        for (const [idioma, a] of Object.entries(p.narracion?.porIdioma ?? {})) {
          if (a && a.estado !== 'generado') avisos.push(`narración ${p.id} (${idioma}) ${a.estado}`);
        }
      }
    }
  }
  return avisos;
}

/** Valida un documento de curso y devuelve errores y advertencias. */
export function validarCurso(documento: unknown): ResultadoValidacion {
  const errores = erroresCurso(documento);
  const valido = errores.length === 0;
  return { valido, errores, advertencias: valido ? advertenciasCurso(documento as Curso) : [] };
}

/** Comprobación de tipo: true si el documento es un curso válido. */
export function esCursoValido(documento: unknown): documento is Curso {
  return erroresCurso(documento).length === 0;
}
