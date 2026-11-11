// HU-0606 · Panel izquierdo del editor (prototipo: riel Diseños · Agregar · Capas). «Agregar» pone un elemento nuevo en la
// pantalla, elegido y en modo Libre (CP-061); «Capas» elige, oculta o muestra cada elemento.
import type { ReactNode } from 'react';
import { type Capa, TIPOS_EXTRA, type TipoExtra } from './extras';

export type PestanaIzquierda = 'disenos' | 'agregar' | 'capas';
const PESTANAS: [PestanaIzquierda, string][] = [['disenos', 'Diseños'], ['agregar', 'Agregar'], ['capas', 'Capas']];

/** Vista previa de cada tipo en el panel Agregar (solo decorativa). */
const MUESTRA: Record<TipoExtra, ReactNode> = {
  titulo: <b className="muestra-titulo">Título</b>,
  texto: <span className="muestra-texto">Párrafo de texto</span>,
  dato: <span className="muestra-dato">Dato clave</span>,
  boton: <span className="muestra-boton">Continuar</span>,
  imagen: <span className="muestra-imagen" />,
  insignia: <span className="muestra-insignia">★</span>,
  forma: <span className="muestra-forma" />,
  personaje: <span className="muestra-personaje" />,
};

export function PanelIzquierdo({ pestana, alCambiarPestana, disenos, capas, elegidoId, ocupado, alAgregar, alElegirCapa, alAlternarOculto }: {
  pestana: PestanaIzquierda; alCambiarPestana: (p: PestanaIzquierda) => void; disenos: ReactNode;
  capas: Capa[]; elegidoId: string | null; ocupado: boolean;
  alAgregar: (tipo: TipoExtra) => void; alElegirCapa: (id: string) => void; alAlternarOculto: (id: string) => void;
}) {
  return (
    <div className="editor-izquierda">
      <div className="opciones editor-pestanas" role="tablist" aria-label="Panel del editor">
        {PESTANAS.map(([p, nombre]) => (
          <button key={p} type="button" role="tab" id={`pestana-${p}`} className="opcion" aria-selected={pestana === p} aria-controls={`panel-${p}`}
            onClick={() => alCambiarPestana(p)}>{nombre}</button>
        ))}
      </div>
      <div role="tabpanel" id={`panel-${pestana}`} aria-labelledby={`pestana-${pestana}`}>
        {pestana === 'disenos' ? disenos : null}
        {pestana === 'agregar' ? <PanelAgregar ocupado={ocupado} alAgregar={alAgregar} /> : null}
        {pestana === 'capas' ? <PanelCapas capas={capas} elegidoId={elegidoId} ocupado={ocupado} alElegir={alElegirCapa} alAlternarOculto={alAlternarOculto} /> : null}
      </div>
    </div>
  );
}

function PanelAgregar({ ocupado, alAgregar }: { ocupado: boolean; alAgregar: (tipo: TipoExtra) => void }) {
  return (
    <aside className="tarjeta kit-bloque editor-agregar" aria-label="Agregar">
      <h2>Agregar</h2>
      <p className="sec">Clic para agregar a la pantalla. En modo Libre lo mueves donde quieras.</p>
      <ul className="editor-agregar-lista">
        {TIPOS_EXTRA.map(([tipo, nombre]) => (
          <li key={tipo}>
            <button type="button" className="editor-agregar-tipo" disabled={ocupado} onClick={() => alAgregar(tipo)}>
              <span className="editor-agregar-muestra" aria-hidden="true">{MUESTRA[tipo]}</span>
              <span className="editor-agregar-nombre">{nombre}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}

function PanelCapas({ capas, elegidoId, ocupado, alElegir, alAlternarOculto }: {
  capas: Capa[]; elegidoId: string | null; ocupado: boolean; alElegir: (id: string) => void; alAlternarOculto: (id: string) => void;
}) {
  return (
    <aside className="tarjeta kit-bloque editor-capas" aria-label="Capas">
      <h2>Capas</h2>
      <p className="sec">Elige, oculta o muestra cada elemento.</p>
      {capas.length ? (
        <ul className="editor-capas-lista">
          {capas.map((c) => (
            <li key={c.id} className={c.id === elegidoId ? 'activa' : undefined}>
              <button type="button" className="editor-capa" aria-current={c.id === elegidoId} onClick={() => alElegir(c.id)}>
                {c.nombre}{c.extra ? <span className="sec"> · agregado</span> : null}
              </button>
              <button type="button" className="editor-ojo" aria-pressed={!c.oculto} disabled={ocupado}
                aria-label={`${c.oculto ? 'Mostrar' : 'Ocultar'} ${c.nombre}`} title={c.oculto ? 'Oculto · clic para mostrar' : 'Visible · clic para ocultar'}
                onClick={() => alAlternarOculto(c.id)}>{c.oculto ? '◌' : '●'}</button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="sec">Esta pantalla no tiene elementos que se puedan elegir.</p>
      )}
    </aside>
  );
}
