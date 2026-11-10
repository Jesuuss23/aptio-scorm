// HU-1402 · Los textos del cliente son datos no confiables (RN-03-3, regla 6 de CLAUDE.md). Van siempre dentro de
// <material_cliente> y nunca pueden cerrar esa etiqueta ni abrir otra: así no se confunden con las instrucciones.

export interface PaginaMaterial {
  n: number;
  texto: string;
  escaneada?: boolean;
}

/** Frases típicas de inyección: se marcan para que el diseñador las vea; nunca se obedecen. */
const PATRONES_INSTRUCCION = [
  /\bignor[ae]\w*\s+(?:todas?\s+)?(?:las|tus|sus|estas|esas)?\s*(?:instrucciones|reglas|indicaciones)/i,
  /\bolvida\w*\s+(?:todo\s+lo\s+anterior|(?:todas?\s+)?(?:las|tus|sus)?\s*(?:instrucciones|reglas))/i,
  /\bignore\s+(?:all\s+)?(?:previous|prior|your|the)?\s*(?:instructions|rules|prompts?)/i,
  /\b(?:disregard|forget)\s+(?:all\s+)?(?:previous|prior|your)\s+(?:instructions|rules)/i,
  /\b(?:system\s+prompt|prompt\s+del\s+sistema)\b/i,
  /\b(?:act[úu]a|responde)\s+como\s+(?:si\s+fueras|un|una)\b.*\b(?:sin\s+reglas|libre)/i,
  /<\/?\s*(?:material_cliente|system|instrucciones)\b/i,
];

/** true si el texto parece intentar dar órdenes a la IA (CP-102). */
export function pareceInstruccion(texto: string): boolean {
  return PATRONES_INSTRUCCION.some((p) => p.test(texto));
}

/** Neutraliza los signos que podrían abrir o cerrar etiquetas dentro del material. */
export function neutralizar(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Páginas listas para ir dentro de un <material_cliente> de una plantilla: marcadas como [p. N] (las escaneadas con
 * «OCR») y con el texto neutralizado. `rango` es «primera-última».
 */
export function paginasParaPrompt(paginas: PaginaMaterial[]): { rango: string; texto: string } {
  return {
    rango: paginas.length ? `${paginas[0]!.n}-${paginas.at(-1)!.n}` : '0',
    texto: paginas.map((p) => `[p. ${p.n}${p.escaneada ? ' · OCR' : ''}]\n${neutralizar(p.texto)}`).join('\n\n'),
  };
}

/** Texto del cliente que va en un atributo o en una línea del prompt (nombre de archivo, tema): sin etiquetas ni saltos. */
export const textoSeguro = (v: string) => neutralizar(v).replace(/"/g, '&quot;').replace(/[\r\n]+/g, ' ');

/**
 * Bloque <material_cliente> para un prompt: páginas marcadas como [p. N] (las escaneadas con «OCR»)
 * y el texto neutralizado, de modo que nada dentro del documento pueda cerrar el bloque.
 */
export function materialParaPrompt(documento: { nombre: string }, paginas: PaginaMaterial[]): string {
  const { rango, texto } = paginasParaPrompt(paginas);
  return `<material_cliente archivo="${textoSeguro(documento.nombre)}" paginas="${rango}">\n${texto}\n</material_cliente>`;
}
