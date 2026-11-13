// HU-1510 · Selector «Español / Inglés» de la consola del sitio (Contenido, Menú principal y Pie de página): cada idioma
// tiene sus elementos y su navegación, con el orden aparte. Dos botones con aria-pressed (dedo, ratón y teclado).
export type IdiomaConsola = 'es' | 'en';
const NOMBRES: [IdiomaConsola, string][] = [['es', 'Español'], ['en', 'Inglés']];

export function SelectorIdiomaSitio({ idioma, alCambiar, etiqueta = 'Idioma', ocupado = false }: {
  idioma: IdiomaConsola; alCambiar: (i: IdiomaConsola) => void; etiqueta?: string; ocupado?: boolean;
}) {
  return (
    <div className="opciones selector-idioma-sitio" role="group" aria-label={etiqueta}>
      {NOMBRES.map(([i, nombre]) => (
        <button key={i} type="button" className="opcion" aria-pressed={idioma === i} disabled={ocupado}
          onClick={() => { if (i !== idioma) alCambiar(i); }}>{nombre}</button>
      ))}
    </div>
  );
}
