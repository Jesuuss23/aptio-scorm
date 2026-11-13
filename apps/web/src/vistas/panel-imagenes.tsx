// HU-0609 · Panel «Imágenes» del editor (prototipo: riel «Imágenes»; REQ-046, REQ-017): las piezas de la biblioteca del
// kit, que se ven con los colores de la marca del proyecto; «Subir imagen propia» (PNG, JPEG o WebP hasta 20 MB y SVG
// hasta 2 MB) y la biblioteca del proyecto con las ya subidas. Elegir cualquiera la agrega a la pantalla.
import { marcadoPieza, PIEZAS, type RolColor } from '@aptio/player';
import { NOMBRE_PIEZA } from '@aptio/schema/biblioteca';
import { type CSSProperties, useRef } from 'react';
import type { Recurso } from '../api';
import { ACEPTA_IMAGEN } from './imagenes';

type Pieza = (typeof PIEZAS)[number];

export function PanelImagenes({ paleta, biblioteca, ocupado, subiendo, alPieza, alSubir, alUsar }: {
  paleta: Record<RolColor, string>; biblioteca: Recurso[]; ocupado: boolean; subiendo: boolean;
  alPieza: (p: Pieza) => void; alSubir: (archivo: File) => void; alUsar: (r: Recurso) => void;
}) {
  const entrada = useRef<HTMLInputElement>(null);
  // Las piezas usan las variables del reproductor (--ap-primario…): aquí se definen con la paleta del kit.
  const colores = Object.fromEntries(Object.entries(paleta).map(([rol, color]) => [`--ap-${rol}`, color])) as CSSProperties;
  return (
    <aside className="tarjeta kit-bloque editor-imagenes" aria-label="Imágenes">
      <h2>Imágenes</h2>
      <h3 id="imagenes-kit">Biblioteca del kit</h3>
      <p className="sec">Ilustraciones con los colores de la marca. Clic para agregarlas a la pantalla.</p>
      <ul className="editor-piezas" aria-labelledby="imagenes-kit" style={colores}>
        {PIEZAS.map((p) => (
          <li key={p}>
            <button type="button" className="editor-pieza" disabled={ocupado} aria-label={`Agregar ${NOMBRE_PIEZA[p]}`} title={NOMBRE_PIEZA[p]}
              onClick={() => alPieza(p)}>
              <span aria-hidden="true" dangerouslySetInnerHTML={{ __html: marcadoPieza(p) }} />
            </button>
          </li>
        ))}
      </ul>
      <h3 id="imagenes-proyecto">Imágenes del proyecto</h3>
      <p className="sec">PNG, JPEG o WebP hasta 20 MB y SVG hasta 2 MB. También puedes arrastrar un archivo al lienzo.</p>
      <button type="button" className="boton" disabled={ocupado || subiendo} onClick={() => entrada.current?.click()}>
        {subiendo ? 'Subiendo…' : 'Subir imagen propia'}
      </button>
      <input ref={entrada} type="file" accept={ACEPTA_IMAGEN} className="sr" tabIndex={-1} aria-label="Archivo de imagen"
        onChange={(e) => {
          const archivo = e.target.files?.[0];
          e.target.value = '';
          if (archivo) alSubir(archivo);
        }} />
      {biblioteca.length ? (
        <ul className="editor-biblioteca" aria-labelledby="imagenes-proyecto">
          {biblioteca.map((r) => (
            <li key={r.id}>
              <button type="button" className="editor-pieza" disabled={ocupado} aria-label={`Agregar ${r.nombre}`} title={r.nombre} onClick={() => alUsar(r)}>
                {r.url ? <img src={r.url} alt="" /> : <span className="sec">{r.nombre}</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sec">Aún no hay imágenes subidas en este proyecto.</p>
      )}
    </aside>
  );
}
