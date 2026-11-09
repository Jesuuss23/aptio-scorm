// Revisa que un personaje SVG cumpla la guía (docs/20-guia-diseno.md) antes de cargarlo al kit.
// Uso: node docs/diseno/personaje/validar-personaje.mjs ruta/al/personaje.svg
import { readFileSync, statSync } from "node:fs";
const ruta = process.argv[2] ?? new URL("./plantilla-ana.svg", import.meta.url).pathname;
const svg = readFileSync(ruta, "utf8");
const ids = new Set([...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
const errores = [], avisos = [];
const oblig = ["personaje", "cabeza", "ojos_abiertos", "ojos_cerrados", "pose_neutral", "pose_explicando", ..."ABCDEFX".split("").map((b) => `boca_${b}`)];
const recom = ["boca_G", "boca_H", "pose_celebrando", "pose_advirtiendo", "pose_pensando", "cejas"];
for (const id of oblig) if (!ids.has(id)) errores.push(`falta la capa obligatoria "${id}"`);
for (const id of recom) if (!ids.has(id)) avisos.push(`falta la capa recomendada "${id}"`);
const vb = svg.match(/viewBox="([\d.\s-]+)"/);
if (!vb) errores.push("falta viewBox");
else { const [, , w, h] = vb[1].trim().split(/\s+/).map(Number); if (Math.abs(w / h - 0.75) > 0.02) avisos.push(`proporción ${w}:${h}; se espera 3:4 (por ejemplo 300 × 400)`); }
for (const [patron, msg] of [[/<text[\s>]/, "tiene textos: conviértelos a trazos"], [/<image[\s>]/, "tiene imágenes incrustadas (PNG/JPG): solo vectores"], [/<script[\s>]/, "tiene scripts"], [/<foreignObject/, "tiene foreignObject"], [/<filter[\s>]/, "usa filtros (desenfoque, sombras): afectan el rendimiento en celular"], [/@import|url\(http/, "carga recursos externos"]])
  if (patron.test(svg)) errores.push(msg);
const kb = statSync(ruta).size / 1024;
if (kb > 200) errores.push(`pesa ${kb.toFixed(0)} KB (máximo 200 KB)`); else if (kb > 120) avisos.push(`pesa ${kb.toFixed(0)} KB (ideal menos de 120 KB)`);
const kit = ["#0000FE", "#00FE00", "#FE0000"].filter((c) => svg.toUpperCase().includes(c));
if (!kit.length) avisos.push("no usa los colores marcadores del kit: el personaje no cambiará con la marca del cliente");
const visibles = "ABCDEFGHX".split("").filter((b) => ids.has(`boca_${b}`) && !new RegExp(`id="boca_${b}"[^>]*display="none"`).test(svg));
if (visibles.length !== 1 || visibles[0] !== "X") avisos.push(`al abrir debe verse solo boca_X (se ven: ${visibles.join(", ") || "ninguna"})`);
console.log(`Personaje: ${ruta}\nCapas encontradas: ${ids.size} · ${kb.toFixed(1)} KB · colores del kit: ${kit.join(", ") || "ninguno"}`);
for (const e of errores) console.log("✗ " + e);
for (const a of avisos) console.log("! " + a);
console.log(errores.length ? `No cumple (${errores.length} errores)` : "✓ Cumple la guía");
process.exit(errores.length ? 1 : 0);
