// HU-0504 · Propuestas de la IA en Revisión (RN-05-3, RN-05-4): la tarjeta «Ajustar con IA» y la franja con la
// propuesta para aplicar o descartar. El estado vive en RevisionVista, que también dibuja la variante elegida.
import { cambiaDisposicion } from '@aptio/schema/propuesta';
import { useState } from 'react';
import type { Propuesta } from '../api';

export type TipoPedido = Propuesta['tipo'];
const BOTONES: [TipoPedido, string][] = [['mas-visual', 'Más visual'], ['menos-texto', 'Menos texto'], ['actividad', 'Convertir en actividad'], ['variantes', 'Ver 3 variantes']];

/** Los pedidos a la IA sobre la pantalla actual. «Otra ilustración» llega con las ilustraciones (S9). */
export function AjustarConIA({ ocupado, calculando, alPedir }: { ocupado: boolean; calculando: boolean; alPedir: (tipo: TipoPedido, texto?: string) => void }) {
  const [texto, setTexto] = useState('');
  const bloqueado = ocupado || calculando;
  return (
    <section className="tarjeta kit-bloque" aria-label="Ajustar con IA">
      <h2>Ajustar con IA</h2>
      <div className="fila-chips">
        {BOTONES.map(([tipo, nombre]) => (
          <button key={tipo} type="button" className="boton ia" disabled={bloqueado} onClick={() => alPedir(tipo)}>✦ {nombre}</button>
        ))}
        <button type="button" className="boton ia" disabled aria-describedby="ia-ilustracion">✦ Otra ilustración</button>
      </div>
      <span id="ia-ilustracion" className="ayuda">Otra ilustración llega con las ilustraciones.</span>
      <label className="campo">
        Pedido libre
        <textarea rows={2} value={texto} maxLength={500} placeholder="Ej.: que lo diga con un ejemplo de la planta" onChange={(e) => setTexto(e.target.value)} />
      </label>
      <div className="acciones-form">
        <button type="button" className="boton ia" disabled={bloqueado || !texto.trim()} onClick={() => alPedir('libre', texto.trim())}>Enviar</button>
        {calculando ? <span className="ayuda" role="status">La IA está preparando la propuesta…</span> : null}
      </div>
    </section>
  );
}

/** Franja de la propuesta (prototipo: Revisión). Con variantes, se elige una para verla antes de aplicarla. */
export function FranjaPropuesta({ propuesta, vencida, variante, ocupado, conAjustes, alVerVariante, alAplicar, alDescartar, alRecalcular }: {
  propuesta: Propuesta; vencida: boolean; variante: number | null; ocupado: boolean;
  /** HU-0604 · La pantalla tiene retoques de tamaño, color o posición (ajustes). */
  conAjustes: boolean;
  alVerVariante: (i: number | null) => void; alAplicar: () => void; alDescartar: () => void; alRecalcular: () => void;
}) {
  const variantes = propuesta.vistaPrevia ?? [];
  // RN-06-3: si la propuesta cambia la disposición, los ajustes vuelven a como los dibuja el kit; los extras quedan.
  const patch = variantes.length ? (variante === null ? null : variantes[variante]?.patch) : propuesta.cambios;
  const reinicia = !vencida && conAjustes && patch ? cambiaDisposicion(patch) : false;
  return (
    <div className="franja-ia" role="region" aria-label="Propuesta de la IA">
      <div className="franja-ia-texto">
        <b>✦ {propuesta.titulo}</b>
        <span>{vencida ? 'La pantalla cambió desde que se calculó esta propuesta.' : propuesta.descripcion}</span>
      </div>
      {!vencida && variantes.length ? (
        <div className="opciones" role="group" aria-label="Variantes">
          {variantes.map((v, i) => (
            <button key={v.nombre} type="button" className="opcion" aria-pressed={variante === i} onClick={() => alVerVariante(variante === i ? null : i)}>
              Variante {i + 1} · {v.nombre}
            </button>
          ))}
        </div>
      ) : null}
      <div className="acciones-form">
        {vencida ? (
          <button type="button" className="boton ia" disabled={ocupado} onClick={alRecalcular}>Recalcular propuesta</button>
        ) : (
          <button type="button" className="boton ia" disabled={ocupado || (variantes.length > 0 && variante === null)} onClick={alAplicar}>
            {variantes.length ? 'Aplicar esta variante' : 'Aplicar'}
          </button>
        )}
        <button type="button" className="boton" disabled={ocupado} onClick={alDescartar}>Descartar</button>
        {!vencida && variantes.length && variante === null ? <span className="ayuda">Elige una variante para verla en la pantalla.</span> : null}
      </div>
      {reinicia ? (
        <p className="aviso-retoques" role="note">
          Esta propuesta cambia el diseño de la pantalla: el tamaño, el color y la posición que retocaste vuelven a como los dibuja el kit. Los elementos que agregaste se conservan.
        </p>
      ) : null}
    </div>
  );
}
