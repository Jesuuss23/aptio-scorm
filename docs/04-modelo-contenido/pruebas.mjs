// Casos negativos: cada modificación del ejemplo debe producir al menos un error.
import { readFileSync } from "node:fs";
import { validarCurso } from "./validar.mjs";

const base = JSON.parse(readFileSync(new URL("./ejemplo-capsula.json", import.meta.url), "utf8"));
const copia = () => structuredClone(base);
const pantalla = (c, id) => c.modulos[0].capsulas[0].pantallas.find((p) => p.id === id);

const casos = [
  ["El ejemplo original es válido", (c) => c, false],
  ["Falta traducción al inglés en un texto", (c) => { delete pantalla(c, "p01-portada").bloques[0].contenido.en; return c; }, true],
  ["Recurso inexistente", (c) => { pantalla(c, "p02-energias").bloques[0].recursoId = "no-existe"; return c; }, true],
  ["Objetivo inexistente", (c) => { pantalla(c, "p03-memoria").objetivoIds = ["obj-9"]; return c; }, true],
  ["Clasificar con grupo inexistente", (c) => { pantalla(c, "p04-clasificar").bloques[0].interaccion.datos.elementos[0].grupoCorrecto = "g-otro"; return c; }, true],
  ["Quiz sin opción correcta", (c) => { pantalla(c, "p06-quiz").bloques[0].interaccion.datos.preguntas[0].opciones.forEach((o) => (o.correcta = false)); return c; }, true],
  ["Memoria con menos de 3 pares", (c) => { pantalla(c, "p03-memoria").bloques[0].interaccion.datos.pares.length = 2; return c; }, true],
  ["Imagen no decorativa sin texto alternativo", (c) => { pantalla(c, "p01-portada").bloques.push({ id: "b-img", tipo: "imagen", recursoId: "img-fondo-planta", decorativa: false }); return c; }, true],
  ["Documento como origen sin página", (c) => { delete pantalla(c, "p02-energias").bloques[1].origen.paginas; return c; }, true],
  ["Narración generada sin bocas", (c) => { delete pantalla(c, "p02-energias").narracion.porIdioma.es.bocas; return c; }, true],
  ["Id duplicado", (c) => { pantalla(c, "p07-cierre").id = "p01-portada"; return c; }, true],
  ["Bilingüe con un solo idioma", (c) => { c.idiomas = ["es"]; return c; }, true],
  ["Pregunta de video sin pregunta", (c) => { delete pantalla(c, "p05-video").bloques[0].marcadores[1].pregunta; return c; }, true],
  ["Tarjetas (INT-04) como sumativa", (c) => { pantalla(c, "p03-memoria").bloques[0].interaccion = { tipo: "INT-04", modo: "sumativa", datos: { tarjetas: [{ id: "t1", frente: { texto: { es: "a", en: "a" } }, reverso: { texto: { es: "b", en: "b" } } }, { id: "t2", frente: { texto: { es: "c", en: "c" } }, reverso: { texto: { es: "d", en: "d" } } }] } }; return c; }, true],
  ["Disposición desconocida (v0.2)", (c) => { pantalla(c, "p02-energias").disposicion = "collage"; return c; }, true],
  ["Ajuste con color fuera del kit (v0.2)", (c) => { pantalla(c, "p02-energias").ajustes.titulo.color = "#FF0000"; return c; }, true],
  ["Elemento agregado sin posición (v0.2)", (c) => { delete pantalla(c, "p02-energias").extras[0].x; return c; }, true]
];

let fallos = 0;
for (const [nombre, mutar, esperaError] of casos) {
  const errores = validarCurso(mutar(copia()));
  const ok = esperaError ? errores.length > 0 : errores.length === 0;
  if (!ok) fallos++;
  console.log(`${ok ? "✓" : "✗"} ${nombre}${ok ? "" : ` → ${JSON.stringify(errores)}`}`);
}
console.log(fallos ? `\n${fallos} caso(s) fallaron` : `\nTodos los casos (${casos.length}) se comportan como se espera`);
process.exit(fallos ? 1 : 0);
