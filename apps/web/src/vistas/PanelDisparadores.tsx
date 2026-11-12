// HU-0610 · «Avanzado: disparadores» en las propiedades de la pantalla (CP-069): cada fila elige «Cuando» (termina la voz
// o a los N s), «Hacer» (mostrar, ocultar o ir a otra pantalla) y el elemento o la pantalla. Se guarda solo, 1 s después
// del último cambio (RN-06-5), cuando todas las filas pasan las reglas de la API.
import type { Disparador } from '@aptio/player';
import { useEffect, useRef, useState } from 'react';
import { conAccion, conEvento, erroresPorFila, MAX_DISPAROS, NOMBRE_CUANDO, NOMBRE_HACER, nuevoDisparador, type Opcion, SEGUNDO_MAXIMO } from './disparadores-panel';

export function PanelDisparadores({ pantalla, lista, elementos, pantallas, editan, alGuardar }: {
  pantalla: { id: string; bloques: { id: string }[]; extras?: { id: string }[] };
  lista: Disparador[];
  elementos: (Opcion & { oculto?: boolean })[];
  pantallas: Opcion[];
  editan: boolean;
  alGuardar: (lista: Disparador[]) => Promise<boolean>;
}) {
  const guardada = JSON.stringify(lista);
  const [borrador, setBorrador] = useState<Disparador[]>(lista);
  const [base, setBase] = useState(guardada);
  // Si lo guardado cambió por fuera (deshacer, otra pantalla), el borrador lo sigue.
  if (base !== guardada) {
    setBase(guardada);
    setBorrador(lista);
  }
  const errores = erroresPorFila(pantalla, borrador, pantallas.map((p) => p.id).concat(pantalla.id));
  const pendiente = JSON.stringify(borrador) !== guardada;
  const valido = errores.size === 0;
  const alGuardarRef = useRef(alGuardar);
  useEffect(() => {
    alGuardarRef.current = alGuardar;
  });
  useEffect(() => {
    if (!pendiente || !valido) return;
    const t = setTimeout(() => void alGuardarRef.current(borrador), 1000);
    return () => clearTimeout(t);
  }, [borrador, pendiente, valido]);

  const cambiar = (i: number, d: Disparador) => setBorrador((l) => l.map((x, j) => (j === i ? d : x)));
  const quitar = (i: number) => setBorrador((l) => l.filter((_, j) => j !== i));
  const agregar = () => setBorrador((l) => [...l, nuevoDisparador(pantalla.id, l, elementos)]);

  return (
    <details className="disparadores" open={lista.length > 0 || undefined}>
      <summary>Avanzado: disparadores</summary>
      <p className="sec">Sin código: cuando termina la voz o llega un segundo, mostrar u ocultar un elemento o ir a otra pantalla. Se ven con ▶ Reproducir en la línea de tiempo y en la vista previa.</p>
      {borrador.length ? (
        <ol className="disparadores-lista">
          {borrador.map((d, i) => {
            const n = i + 1;
            const error = errores.get(i);
            const idError = `disparador-error-${d.id}`;
            return (
              <li key={d.id}>
                <fieldset className="disparador" disabled={!editan} aria-describedby={error ? idError : undefined}>
                  <legend>Disparador {n}</legend>
                  <label>
                    <span>Cuando</span>
                    <select value={d.cuando.evento} onChange={(e) => cambiar(i, conEvento(d, e.target.value as Disparador['cuando']['evento']))}>
                      {(['fin-voz', 'tiempo'] as const).map((x) => <option key={x} value={x}>{NOMBRE_CUANDO[x]}</option>)}
                    </select>
                  </label>
                  {d.cuando.evento === 'tiempo' ? (
                    <label>
                      <span>Segundo</span>
                      <input
                        type="number" min={0} max={SEGUNDO_MAXIMO} step={0.1} inputMode="decimal"
                        value={Number.isFinite(d.cuando.segundo) ? d.cuando.segundo : ''}
                        aria-invalid={error?.includes('segundo') || undefined}
                        onChange={(e) => cambiar(i, { ...d, cuando: { evento: 'tiempo', segundo: e.target.value === '' ? Number.NaN : Number(e.target.value) } })}
                      />
                    </label>
                  ) : null}
                  <label>
                    <span>Hacer</span>
                    <select value={d.accion.tipo} onChange={(e) => cambiar(i, conAccion(d, e.target.value as Disparador['accion']['tipo'], elementos, pantallas))}>
                      {(['mostrar', 'ocultar', 'ir-a'] as const).map((x) => <option key={x} value={x}>{NOMBRE_HACER[x]}</option>)}
                    </select>
                  </label>
                  {d.accion.tipo === 'ir-a' ? (
                    <label>
                      <span>Pantalla</span>
                      <select value={d.accion.pantallaId ?? ''} onChange={(e) => cambiar(i, { ...d, accion: { tipo: 'ir-a', pantallaId: e.target.value } })}>
                        {pantallas.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label>
                      <span>Elemento</span>
                      <select value={d.accion.elementoId ?? ''} onChange={(e) => cambiar(i, { ...d, accion: { tipo: d.accion.tipo, elementoId: e.target.value } })}>
                        {elementos.map((x) => <option key={x.id} value={x.id}>{x.nombre}{x.oculto ? ' (oculto)' : ''}</option>)}
                      </select>
                    </label>
                  )}
                  <button type="button" className="boton" onClick={() => quitar(i)}>Quitar<span className="sr"> el disparador {n}</span></button>
                  {error ? <p id={idError} className="nota error">{error}</p> : null}
                </fieldset>
              </li>
            );
          })}
        </ol>
      ) : <p className="sec">Esta pantalla no tiene disparadores.</p>}
      {editan ? (
        <button type="button" className="boton" disabled={borrador.length >= MAX_DISPAROS} onClick={agregar}>+ Nuevo disparador</button>
      ) : null}
      <p className="sec" role="status">{pendiente ? (valido ? 'Guardando en un momento…' : 'Corrige el disparador marcado para guardar.') : borrador.length >= MAX_DISPAROS ? `Máximo ${MAX_DISPAROS} por pantalla.` : ''}</p>
    </details>
  );
}
