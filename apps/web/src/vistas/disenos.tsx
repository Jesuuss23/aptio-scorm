// HU-0605 · Panel «Diseños» del editor (prototipo: editor › Diseños): la misma pantalla en otras composiciones de
// contenido, dibujadas en miniatura con el mismo reproductor (RN-06-6). Elegir una la aplica; se puede deshacer (SUP-44).
import { montar } from '@aptio/player';
import type { Disposicion } from '@aptio/schema/marca';
import type { CursoDoc } from '@aptio/schema/revision';
import { useEffect, useRef } from 'react';
import type { Kit } from '../api';
import { type ConDisposicion, cursoConDiseno, nombreDiseno, opcionesDiseno } from './disenos-pantalla';

const ESTILO_MINIATURA = '.ap-id{display:none}';

function Miniatura({ documento, pantalla, disposicion, kit }: { documento: CursoDoc; pantalla: ConDisposicion; disposicion: string; kit: Kit | null }) {
  const ref = useRef<HTMLDivElement>(null);
  // Se dibuja de nuevo solo si cambia el curso (una versión nueva), la pantalla o el kit.
  useEffect(() => {
    if (!ref.current) return;
    const r = montar(ref.current, cursoConDiseno(documento, pantalla, disposicion), {
      kit: kit ? { paleta: kit.paleta, tipografias: kit.tipografias, personaje: kit.personaje?.nombre ?? null } : {},
      revision: true,
      marco: false,
    });
    const estilo = document.createElement('style');
    estilo.textContent = ESTILO_MINIATURA;
    ref.current.shadowRoot?.append(estilo);
    return () => r.destruir();
  }, [documento, pantalla, disposicion, kit]);
  return (
    <span className="editor-diseno-mini" aria-hidden="true" inert>
      <span ref={ref} className="editor-diseno-lienzo" />
    </span>
  );
}

export function PanelDisenos({ documento, pantalla, kit, ocupado, alElegir }: {
  documento: CursoDoc; pantalla: ConDisposicion; kit: Kit | null; ocupado: boolean; alElegir: (disposicion: Disposicion) => void;
}) {
  const opciones = opcionesDiseno(pantalla);
  const actual = pantalla.disposicion ?? 'idea';
  return (
    <aside className="tarjeta kit-bloque editor-disenos" aria-label="Diseños">
      <h2>Diseños para esta pantalla</h2>
      {opciones.length ? (
        <>
          <p className="sec">Mismo contenido, otra composición. Se puede deshacer.</p>
          <ul className="editor-disenos-lista">
            {opciones.map((d) => (
              <li key={d}>
                <button type="button" className="editor-diseno" aria-current={d === actual} disabled={ocupado || d === actual}
                  onClick={() => alElegir(d as Disposicion)}>
                  <Miniatura documento={documento} pantalla={pantalla} disposicion={d} kit={kit} />
                  <span className="editor-diseno-nombre">{nombreDiseno(d)}{d === actual ? ' · actual' : ''}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="sec">Esta pantalla tiene una actividad o un video: su diseño se cambia en Revisión con «✦ Convertir en actividad» o «✦ Ver 3 variantes».</p>
      )}
    </aside>
  );
}
