// HU-0602 · Barra contextual y panel de Propiedades del elemento elegido en el editor (CP-057): tamaño A−/A+, colores
// del kit (RN-06-4), alineación y animación de entrada. Los dos usan las mismas acciones; el estado vive en EditorVista.
import type { AjusteElemento, RolColor } from '@aptio/player';
import { useState } from 'react';
import { ALINEACIONES, ANIMACIONES, type Animacion, COLORES_KIT, controlesDe, ESCALA, TAMANO } from './ajustes-elemento';

export interface AccionesRetoque {
  alTamano: (paso: 1 | -1) => void;
  alTamanoValor: (valor: number) => void;
  alColor: (rol: RolColor) => void;
  alAlinear: (a: NonNullable<AjusteElemento['alineacion']>) => void;
  alAnimar: (a: Animacion) => void;
  alRestablecer: () => void;
  alVerAnimacion: () => void;
  /** HU-0603 · Quita solo el desplazamiento del modo Libre. */
  alVolverASuLugar: () => void;
}
interface Elegido {
  nombre: string;
  tipo: string;
  ajuste: AjusteElemento | undefined;
  /** Tamaño que se ve ahora: % del ancho de la pantalla (texto) o escala (imagen y personaje). */
  tamano: number;
}

function Colores({ elegido, paleta, ocupado, alColor }: { elegido: Elegido; paleta: Record<RolColor, string>; ocupado: boolean; alColor: (rol: RolColor) => void }) {
  return (
    <div className="editor-colores" role="group" aria-label="Colores del kit">
      {COLORES_KIT.map(([rol, nombre]) => (
        <button key={rol} type="button" className="editor-color" style={{ background: paleta[rol] }} aria-label={nombre} title={nombre}
          aria-pressed={elegido.ajuste?.color === rol} disabled={ocupado} onClick={() => alColor(rol)} />
      ))}
    </div>
  );
}

/** Barra contextual sobre el lienzo (prototipo: editor › ctx). */
export function BarraElemento({ elegido, paleta, ocupado, acciones }: { elegido: Elegido; paleta: Record<RolColor, string>; ocupado: boolean; acciones: AccionesRetoque }) {
  const c = controlesDe(elegido.tipo);
  const animacion = elegido.ajuste?.animacion ?? 'auto';
  const siguiente = ANIMACIONES[(ANIMACIONES.findIndex(([a]) => a === animacion) + 1) % ANIMACIONES.length]![0];
  return (
    <div className="editor-ctx-barra" role="toolbar" aria-label="Opciones del elemento">
      <b className="editor-ctx-nombre">{elegido.nombre}</b>
      <button type="button" className="boton" disabled={ocupado} aria-label="Más pequeño" onClick={() => acciones.alTamano(-1)}>A−</button>
      <button type="button" className="boton" disabled={ocupado} aria-label="Más grande" onClick={() => acciones.alTamano(1)}>A+</button>
      {c.color ? <Colores elegido={elegido} paleta={paleta} ocupado={ocupado} alColor={acciones.alColor} /> : null}
      {c.alineacion ? (
        <div className="opciones" role="group" aria-label="Alineación">
          {ALINEACIONES.map(([a, nombre]) => (
            <button key={a} type="button" className="opcion" aria-pressed={elegido.ajuste?.alineacion === a} disabled={ocupado} onClick={() => acciones.alAlinear(a)}>{nombre}</button>
          ))}
        </div>
      ) : null}
      <button type="button" className="boton" disabled={ocupado} onClick={() => acciones.alAnimar(siguiente)}>
        Animación: {ANIMACIONES.find(([a]) => a === animacion)?.[1]}
      </button>
      {elegido.ajuste ? <button type="button" className="boton" disabled={ocupado} onClick={acciones.alRestablecer}>Restablecer</button> : null}
    </div>
  );
}

/** Panel lateral de Propiedades: los mismos retoques, con un deslizador de tamaño. */
export function PanelPropiedades({ elegido, paleta, ocupado, modo, acciones, diseno, alCambiarDiseno }: {
  elegido: Elegido | null; paleta: Record<RolColor, string>; ocupado: boolean; modo: 'auto' | 'libre'; acciones: AccionesRetoque;
  /** HU-0605 · Nombre del diseño de la pantalla y cómo ir al panel Diseños. */
  diseno: string; alCambiarDiseno: () => void;
}) {
  if (!elegido) {
    return (
      <aside className="tarjeta kit-bloque editor-propiedades" aria-label="Propiedades">
        <h2>Propiedades</h2>
        <div className="campo">
          <span>Diseño</span>
          <div className="fila-aviso">
            <span className="chip">{diseno}</span>
            <button type="button" className="boton" onClick={alCambiarDiseno}>Cambiar</button>
          </div>
        </div>
        <p className="sec">Elige un elemento en el lienzo para cambiarlo: un clic, o Tab hasta él y Espacio.</p>
      </aside>
    );
  }
  const c = controlesDe(elegido.tipo);
  return (
    <aside className="tarjeta kit-bloque editor-propiedades" aria-label="Propiedades">
      <h2>{elegido.nombre}</h2>
      {c.tamano ? <Deslizador key={`${elegido.nombre}-${elegido.tamano}`} tipo={c.tamano} inicial={elegido.tamano} ocupado={ocupado} alCambiar={acciones.alTamanoValor} /> : null}
      {c.color ? (
        <div className="campo">
          <span>Color</span>
          <Colores elegido={elegido} paleta={paleta} ocupado={ocupado} alColor={acciones.alColor} />
        </div>
      ) : null}
      {c.alineacion ? (
        <div className="campo">
          <span>Alineación</span>
          <div className="opciones" role="group" aria-label="Alineación">
            {ALINEACIONES.map(([a, nombre]) => (
              <button key={a} type="button" className="opcion" aria-pressed={elegido.ajuste?.alineacion === a} disabled={ocupado} onClick={() => acciones.alAlinear(a)}>{nombre}</button>
            ))}
          </div>
        </div>
      ) : null}
      {c.animacion ? (
        <div className="campo">
          <span>Animación de entrada</span>
          <div className="opciones" role="group" aria-label="Animación de entrada">
            {ANIMACIONES.map(([a, nombre]) => (
              <button key={a} type="button" className="opcion" aria-pressed={(elegido.ajuste?.animacion ?? 'auto') === a} disabled={ocupado} onClick={() => acciones.alAnimar(a)}>{nombre}</button>
            ))}
          </div>
          <span className="ayuda">«Auto» entra como la disposición; el orden y los tiempos llegan con la línea de tiempo.</span>
        </div>
      ) : null}
      {c.tamano ? (
        <div className="campo">
          <span>Posición</span>
          <span className="num" aria-label="Desplazamiento">
            {formatoPct(elegido.ajuste?.desplazamiento?.x ?? 0)} / {formatoPct(elegido.ajuste?.desplazamiento?.y ?? 0)} % del ancho
          </span>
          <span className="ayuda">{modo === 'libre' ? 'Arrastra en el lienzo o usa las flechas.' : 'Cambia a Libre para mover.'}</span>
          {elegido.ajuste?.desplazamiento ? (
            <button type="button" className="boton" disabled={ocupado} onClick={acciones.alVolverASuLugar}>Volver a su lugar</button>
          ) : null}
        </div>
      ) : null}
      <div className="acciones-form">
        <button type="button" className="boton" onClick={acciones.alVerAnimacion}>▶ Ver animación</button>
        {elegido.ajuste ? <button type="button" className="boton" disabled={ocupado} onClick={acciones.alRestablecer}>Restablecer</button> : null}
      </div>
    </aside>
  );
}

const formatoPct = (v: number) => (Math.round(v * 100) / 100).toLocaleString('es-PE', { maximumFractionDigits: 2 }).replace('.', ',');

/** El deslizador mueve el valor al instante y guarda al soltarlo (o al terminar con las flechas). */
function Deslizador({ tipo, inicial, ocupado, alCambiar }: { tipo: 'texto' | 'escala'; inicial: number; ocupado: boolean; alCambiar: (v: number) => void }) {
  const [valor, setValor] = useState(inicial);
  const r = tipo === 'texto' ? { ...TAMANO, paso: 0.1 } : { ...ESCALA, paso: 0.05 };
  const confirmar = () => {
    if (!ocupado && valor !== inicial) alCambiar(valor);
  };
  return (
    <label className="campo">
      {tipo === 'texto' ? `Tamaño del texto: ${valor.toFixed(1).replace('.', ',')} % del ancho` : `Tamaño: ${Math.round(valor * 100)} %`}
      <input type="range" min={r.min} max={r.max} step={r.paso} value={valor}
        onChange={(e) => setValor(Number(e.target.value))} onPointerUp={confirmar} onKeyUp={confirmar} onBlur={confirmar} />
    </label>
  );
}
