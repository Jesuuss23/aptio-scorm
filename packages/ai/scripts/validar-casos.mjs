// Compila los esquemas de salida de IA y valida el caso de referencia (fixtures) de cada etapa.
// Uso: node packages/ai/scripts/validar-casos.mjs
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(raiz, "..", "..");
const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
ajv.addSchema(JSON.parse(readFileSync(join(repo, "packages/schema/esquemas/curso-v0.schema.json"), "utf8")));
const esquemas = {};
for (const f of readdirSync(join(raiz, "esquemas")).filter((f) => f.endsWith(".salida.schema.json"))) {
  const s = JSON.parse(readFileSync(join(raiz, "esquemas", f), "utf8"));
  esquemas[f.slice(0, 5)] = ajv.compile(s);
}
console.log(`Esquemas compilados: ${Object.keys(esquemas).length}`);

let fallos = 0, total = 0;
const casos = join(raiz, "casos");
if (existsSync(casos)) for (const caso of readdirSync(casos)) {
  const dir = join(casos, caso, "salidas");
  if (!existsSync(dir)) continue;
  for (const f of readdirSync(dir).filter((f) => f.endsWith(".json")).sort()) {
    const tarea = (f.match(/IA-\d\d/) || [])[0];
    if (!tarea) continue;
    const datos = JSON.parse(readFileSync(join(dir, f), "utf8"));
    const lista = Array.isArray(datos) ? datos : [datos];
    lista.forEach((d, i) => {
      total++;
      if (!esquemas[tarea](d)) { fallos++; console.log(`✗ ${caso}/${f}[${i}]`); for (const e of esquemas[tarea].errors.slice(0, 6)) console.log(`   ${e.instancePath || "/"} ${e.message} ${JSON.stringify(e.params)}`); }
    });
  }
}
console.log(fallos ? `${fallos} de ${total} salidas no validan` : `Todas las salidas validan (${total})`);
process.exit(fallos ? 1 : 0);
