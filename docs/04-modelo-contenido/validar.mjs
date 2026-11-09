// Valida un curso contra el esquema v0 y aplica reglas que JSON Schema no puede expresar.
// Uso: node validar.mjs [ruta-del-curso.json]   (por defecto: ejemplo-capsula.json)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const dir = dirname(fileURLToPath(import.meta.url));
const esquema = JSON.parse(readFileSync(join(dir, "esquema-curso-v0.schema.json"), "utf8"));

export function validarCurso(curso) {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validar = ajv.compile(esquema);
  const errores = [];
  if (!validar(curso)) {
    for (const e of validar.errors) errores.push(`esquema ${e.instancePath || "/"}: ${e.message}`);
    return errores; // las reglas siguientes asumen estructura válida
  }

  const idsRecursos = new Set(curso.recursos.map((r) => r.id));
  const idsObjetivos = new Set(curso.objetivos.map((o) => o.id));
  const usados = new Set();
  const vistos = new Map();

  // 1. Identificadores únicos en todo el documento
  (function recorrer(nodo, ruta) {
    if (Array.isArray(nodo)) return nodo.forEach((n, i) => recorrer(n, `${ruta}/${i}`));
    if (nodo && typeof nodo === "object") {
      if (typeof nodo.id === "string" && !ruta.endsWith("/cliente")) {
        if (vistos.has(nodo.id)) errores.push(`id duplicado "${nodo.id}" en ${ruta} y ${vistos.get(nodo.id)}`);
        else vistos.set(nodo.id, ruta);
      }
      for (const [k, v] of Object.entries(nodo)) recorrer(v, `${ruta}/${k}`);
    }
  })(curso, "");

  // 2. Referencias a recursos y objetivos existentes; 3. completitud por idioma
  const claveRecurso = new Set(["recursoId", "recursoAudioId", "subtitulosId", "fondoRecursoId", "imagenId", "documentoId"]);
  (function recorrer(nodo, ruta, padre) {
    if (Array.isArray(nodo)) return nodo.forEach((n, i) => recorrer(n, `${ruta}/${i}`, padre));
    if (!nodo || typeof nodo !== "object") return;
    const esTextoI18n = Object.keys(nodo).length > 0 && Object.keys(nodo).every((k) => k === "es" || k === "en") && Object.values(nodo).every((v) => typeof v === "string");
    if (esTextoI18n) {
      if (curso.modoIdioma !== "unico") {
        for (const idioma of curso.idiomas) if (!nodo[idioma]) errores.push(`texto sin traducción "${idioma}" en ${ruta}`);
      }
      return;
    }
    for (const [k, v] of Object.entries(nodo)) {
      if (claveRecurso.has(k) && typeof v === "string") {
        usados.add(v);
        if (!idsRecursos.has(v)) errores.push(`recurso inexistente "${v}" en ${ruta}/${k}`);
      }
      if (k === "subtitulos" && v && typeof v === "object" && padre === "video") {
        for (const [idioma, id] of Object.entries(v)) {
          usados.add(id);
          if (!idsRecursos.has(id)) errores.push(`subtítulo inexistente "${id}" (${idioma}) en ${ruta}`);
        }
      }
      if ((k === "objetivoIds" && Array.isArray(v)) || k === "objetivoId") {
        for (const id of [].concat(v)) if (!idsObjetivos.has(id)) errores.push(`objetivo inexistente "${id}" en ${ruta}`);
      }
      recorrer(v, `${ruta}/${k}`, nodo.tipo ?? padre);
    }
  })(curso, "", null);

  // 4. Reglas de interacciones
  for (const m of curso.modulos) for (const c of m.capsulas) for (const p of c.pantallas) for (const b of p.bloques) {
    if (b.tipo !== "interaccion") continue;
    const { tipo, datos } = b.interaccion;
    const ruta = `${c.id}/${p.id}/${b.id}`;
    if (tipo === "INT-02") {
      const grupos = new Set(datos.grupos.map((g) => g.id));
      for (const e of datos.elementos) if (!grupos.has(e.grupoCorrecto)) errores.push(`grupo inexistente "${e.grupoCorrecto}" en ${ruta}`);
    }
    if (tipo === "INT-05" && datos.preguntasPorIntento && datos.preguntasPorIntento > datos.preguntas.length) {
      errores.push(`preguntasPorIntento mayor que el banco en ${ruta}`);
    }
    if (tipo === "INT-08") {
      const nodos = new Set(datos.nodos.map((n) => n.id));
      if (!nodos.has(datos.inicioId)) errores.push(`inicioId inexistente en ${ruta}`);
      for (const n of datos.nodos) for (const o of n.opciones) if (o.siguienteId && !nodos.has(o.siguienteId)) errores.push(`siguienteId inexistente "${o.siguienteId}" en ${ruta}`);
    }
  }

  // 5. Narración: el bloque de personaje referido debe existir en la pantalla
  for (const m of curso.modulos) for (const c of m.capsulas) for (const p of c.pantallas) {
    const ref = p.narracion?.personajeBloqueId;
    if (ref && !p.bloques.some((b) => b.id === ref && b.tipo === "personaje")) errores.push(`personajeBloqueId "${ref}" no es un personaje de ${p.id}`);
  }

  // 6. Coherencia de idiomas
  if (curso.modoIdioma === "unico" && curso.idiomas.length !== 1) errores.push("modoIdioma 'unico' exige exactamente un idioma");
  if (curso.modoIdioma !== "unico" && curso.idiomas.length < 2) errores.push(`modoIdioma '${curso.modoIdioma}' exige al menos dos idiomas`);

  return errores;
}

export function advertencias(curso) {
  const avisos = [];
  for (const m of curso.modulos) for (const c of m.capsulas) for (const p of c.pantallas) {
    if (p.estado !== "aprobado") avisos.push(`pantalla ${p.id} en estado "${p.estado}"`);
    for (const [idioma, a] of Object.entries(p.narracion?.porIdioma ?? {})) if (a.estado !== "generado") avisos.push(`narración ${p.id} (${idioma}) ${a.estado}`);
  }
  return avisos;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ruta = process.argv[2] ?? join(dir, "ejemplo-capsula.json");
  const curso = JSON.parse(readFileSync(ruta, "utf8"));
  const errores = validarCurso(curso);
  if (errores.length) {
    console.error(`✗ ${errores.length} error(es):`);
    for (const e of errores) console.error("  - " + e);
    process.exit(1);
  }
  console.log("✓ El curso es válido según el esquema v0 y las reglas adicionales.");
  const avisos = advertencias(curso);
  if (avisos.length) {
    console.log(`Advertencias para exportar (${avisos.length}):`);
    for (const a of avisos) console.log("  - " + a);
  }
}
