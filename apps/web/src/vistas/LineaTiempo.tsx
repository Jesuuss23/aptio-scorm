// HU-0608 · Línea de tiempo bajo el lienzo (PNT-21, como Storyline): regla, narración palabra por palabra, subtítulos,
// boca de Ana y una barra por elemento. Arrastrar el cuerpo cambia cuándo aparece; el borde izquierdo, la entrada; el
// derecho, la salida (CP-064, CP-065). La aguja roja marca el segundo: ▶ Reproducir / ❚❚ Pausa (también Espacio),
// ■ vuelve al inicio y muestra todo, y un clic en la regla o en una palabra va a ese momento (CP-066). Con teclado,
// las flechas mueven la barra elegida de a 0,1 s (Mayús: 1 s). En pantallas angostas se ve plegada: aguja y narración.
// PR 2 · «✦ Sincronizar con la voz» muestra la propuesta en la franja morada, con las barras donde quedarían (CP-068);
// «⚠ revisar tiempo» marca el elemento que perdió su palabra al cambiar la narración (CP-067).
import type { MarcaPalabra } from '@aptio/schema/tiempos';
import { palabraEn } from '@aptio/schema/tiempos';
import { type KeyboardEvent, type MouseEvent, type PointerEvent, useEffect, useRef, useState } from 'react';
import { arrastrar, type Borde, type CambioTiempo, formatoS, marcasRegla, pxAS, zoomAjustado, zoomSiguiente } from './linea-tiempo';

export type BarraTiempo = { id: string; nombre: string; inicioS: number; finS: number | null; oculto: boolean; revisar?: boolean; propuesta?: boolean };
type Tramo = { inicioS: number; finS: number };

const UMBRAL_PX = 3;

export function LineaTiempo({
  barras, marcas, subtitulos, boca, vozS, duracion, tiempo, reproduciendo, elegidoId, ocupado,
  alIr, alReproducir, alPausar, alDetener, alCambiar, alElegir, alAlternarOculto, alOcultar,
  sincronizacion, alSincronizar, alAplicarSincronizacion, alDescartarSincronizacion,
}: {
  barras: BarraTiempo[]; marcas: MarcaPalabra[]; subtitulos: (Tramo & { texto: string })[]; boca: (Tramo & { boca: string })[] | null;
  vozS: number; duracion: number; tiempo: number | null; reproduciendo: boolean; elegidoId: string | null; ocupado: boolean;
  alIr: (s: number) => void; alReproducir: () => void; alPausar: () => void; alDetener: () => void;
  alCambiar: (id: string, cambio: CambioTiempo) => void; alElegir: (id: string) => void; alAlternarOculto: (id: string) => void; alOcultar: () => void;
  /** La propuesta de «Sincronizar con la voz» que se está viendo. */
  sincronizacion: { encontrados: number; total: number } | null;
  alSincronizar: () => void; alAplicarSincronizacion: () => void; alDescartarSincronizacion: () => void;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  const [pps, setPps] = useState<number | null>(null);
  const [arrastre, setArrastre] = useState<{ id: string; borde: Borde; x0: number; dPx: number } | null>(null);

  // Sin zoom elegido, la pantalla entera cabe en el ancho que se ve (Ajustar).
  const [anchoVista, setAnchoVista] = useState(800);
  useEffect(() => {
    const el = scroll.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const obs = new ResizeObserver(() => setAnchoVista(el.clientWidth));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const ajustado = zoomAjustado(anchoVista - 180, duracion);
  const ajustar = () => setPps(null);
  const z = pps ?? ajustado;
  const ancho = Math.ceil(duracion * z) + 16;
  const x = (s: number) => `${(s * z).toFixed(1)}px`;
  const largo = (a: number, b: number) => `${Math.max(2, (b - a) * z - 1).toFixed(1)}px`;
  const actual = tiempo === null ? undefined : palabraEn(marcas, tiempo);

  /** Clic en una pista: la aguja va a ese segundo. */
  const irAlClic = (ev: MouseEvent<HTMLDivElement>) => {
    if ((ev.target as HTMLElement).closest('.lt-elemento, .lt-palabra')) return;
    const caja = ev.currentTarget.getBoundingClientRect();
    alIr(Math.max(0, Math.min(duracion, pxAS(ev.clientX - caja.left, z))));
  };

  const presionar = (b: BarraTiempo) => (ev: PointerEvent<HTMLDivElement>) => {
    if (ev.button !== 0 || ocupado) return;
    const borde = ((ev.target as HTMLElement).dataset.borde as Borde | undefined) ?? 'cuerpo';
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
    setArrastre({ id: b.id, borde, x0: ev.clientX, dPx: 0 });
  };
  const moverPuntero = (ev: PointerEvent<HTMLDivElement>) => {
    if (arrastre) setArrastre({ ...arrastre, dPx: ev.clientX - arrastre.x0 });
  };
  const soltar = (b: BarraTiempo) => (ev: PointerEvent<HTMLDivElement>) => {
    const a = arrastre;
    setArrastre(null);
    if (!a || a.id !== b.id) return;
    const dPx = ev.clientX - a.x0;
    if (Math.abs(dPx) <= UMBRAL_PX) return alElegir(b.id);
    alCambiar(b.id, arrastrar(b, a.borde, pxAS(dPx, z), marcas, duracion, ev.altKey));
  };
  const tecla = (b: BarraTiempo) => (ev: KeyboardEvent<HTMLDivElement>) => {
    if (ev.key !== 'ArrowLeft' && ev.key !== 'ArrowRight') return;
    ev.preventDefault();
    if (ocupado) return;
    const paso = (ev.key === 'ArrowLeft' ? -1 : 1) * (ev.shiftKey ? 1 : 0.1);
    alCambiar(b.id, arrastrar(b, 'cuerpo', paso, marcas, duracion, true));
  };
  /** Mientras se arrastra, la barra se ve donde quedaría. */
  const vista = (b: BarraTiempo): { inicioS: number; finS: number | null } => {
    if (!arrastre || arrastre.id !== b.id || Math.abs(arrastre.dPx) <= UMBRAL_PX) return b;
    const c = arrastrar(b, arrastre.borde, pxAS(arrastre.dPx, z), marcas, duracion);
    return { inicioS: 'retardoS' in c ? (c.retardoS ?? b.inicioS) : b.inicioS, finS: 'finS' in c ? (c.finS ?? null) : b.finS };
  };

  return (
    <section className="tarjeta linea-tiempo" aria-label="Línea de tiempo">
      <div className="lt-controles">
        <button type="button" className="boton primario" onClick={reproduciendo ? alPausar : alReproducir}>{reproduciendo ? '❚❚ Pausa' : '▶ Reproducir'}</button>
        <button type="button" className="boton" title="Volver al inicio y ver todo" aria-label="Detener y ver todo" onClick={alDetener}>■</button>
        <span className="num lt-reloj" aria-live="off">{formatoS(tiempo ?? 0)} / {formatoS(duracion)}</span>
        <span className="sec lt-resumen">Voz {formatoS(vozS)} · {barras.length} elementos</span>
        <span className="lt-espacio" />
        <span className="opciones lt-zoom" role="group" aria-label="Zoom">
          <button type="button" className="opcion" aria-label="Alejar" onClick={() => setPps(zoomSiguiente(z, -1))}>−</button>
          <button type="button" className="opcion" title="Ajustar al ancho" onClick={ajustar}>Ajustar</button>
          <button type="button" className="opcion" aria-label="Acercar" onClick={() => setPps(zoomSiguiente(z, 1))}>+</button>
        </span>
        <button type="button" className="boton ia" title="Cada elemento aparece cuando Ana lo nombra" disabled={ocupado || !marcas.length || sincronizacion !== null}
          onClick={alSincronizar}>✦ Sincronizar con la voz</button>
        <button type="button" className="boton" onClick={alOcultar}>Ocultar</button>
      </div>
      {sincronizacion ? (
        <div className="franja-ia lt-franja" role="region" aria-label="Propuesta: sincronizar con la voz">
          <div className="franja-ia-texto">
            <b>✦ Sincronizar con la voz</b>
            <span>
              Cada elemento aparece cuando Ana lo nombra ({sincronizacion.encontrados} de {sincronizacion.total} encontrados en la narración); el título y el personaje
              entran al inicio y el resto conserva su tiempo. Las barras muestran dónde quedarían.
            </span>
          </div>
          <div className="acciones-form">
            <button type="button" className="boton ia" disabled={ocupado} onClick={alAplicarSincronizacion}>Aplicar</button>
            <button type="button" className="boton" disabled={ocupado} onClick={alDescartarSincronizacion}>Descartar</button>
          </div>
        </div>
      ) : null}
      <div ref={scroll} className="lt-scroll">
        <div className="lt-grilla" style={{ ['--lt-ancho' as string]: `${ancho}px` }}>
          <div className="lt-cab lt-regla-cab"><b>Tiempo</b></div>
          <div className="lt-pista lt-regla" data-pista="regla" aria-label="Regla: clic para ir a ese segundo" onClick={irAlClic}>
            {marcasRegla(duracion).map((m) => (
              <i key={m.s} className={m.entero ? 'lt-tick lt-tick-entero' : 'lt-tick'} style={{ left: x(m.s) }}>{m.entero ? <span>{m.s} s</span> : null}</i>
            ))}
          </div>

          <div className="lt-cab"><b>Narración ES</b></div>
          <div className="lt-pista" data-pista="narracion" onClick={irAlClic}>
            {marcas.length ? marcas.map((m) => (
              <button key={m.indice} type="button" className="lt-palabra" aria-current={actual?.indice === m.indice ? 'true' : undefined}
                style={{ left: x(m.inicioS), width: largo(m.inicioS, m.finS) }} title={`${m.texto} · ${formatoS(m.inicioS)}`} onClick={() => alIr(m.inicioS)}>{m.texto}</button>
            )) : <span className="sec lt-vacio">Sin narración con voz</span>}
          </div>

          <div className="lt-cab lt-detalle"><b>Subtítulos</b></div>
          <div className="lt-pista lt-detalle" data-pista="subtitulos" onClick={irAlClic}>
            {subtitulos.map((c) => (
              <span key={c.inicioS} className="lt-sub" aria-current={tiempo !== null && tiempo >= c.inicioS && tiempo < c.finS ? 'true' : undefined}
                style={{ left: x(c.inicioS), width: largo(c.inicioS, c.finS) }} title={c.texto}>{c.texto}</span>
            ))}
          </div>

          {boca ? (
            <>
              <div className="lt-cab lt-detalle"><b>Boca de Ana</b></div>
              <div className="lt-pista lt-detalle" data-pista="boca" onClick={irAlClic}>
                {boca.map((t) => (
                  <span key={t.inicioS} className={`lt-boca lt-boca-${t.boca}`} aria-current={tiempo !== null && tiempo >= t.inicioS && tiempo < t.finS ? 'true' : undefined}
                    style={{ left: x(t.inicioS), width: largo(t.inicioS, t.finS) }}>{(t.finS - t.inicioS) * z >= 10 && t.boca !== 'X' ? t.boca : ''}</span>
                ))}
              </div>
            </>
          ) : null}

          <div className="lt-cab lt-grupo lt-detalle"><span className="sec">Elementos</span></div>
          <div className="lt-pista lt-grupo lt-detalle"><span className="sec lt-vacio">Arrastra una barra para cambiar cuándo aparece; sus bordes, cuándo entra y sale</span></div>
          {barras.map((b) => {
            const v = vista(b);
            const fin = v.finS ?? duracion;
            return [
              <div key={`${b.id}-cab`} className={`lt-cab lt-detalle${b.id === elegidoId ? ' activa' : ''}`}>
                <button type="button" className="lt-ojo" aria-pressed={!b.oculto} disabled={ocupado} aria-label={`${b.oculto ? 'Mostrar' : 'Ocultar'} ${b.nombre}`}
                  onClick={() => alAlternarOculto(b.id)}>{b.oculto ? '◌' : '●'}</button>
                <button type="button" className="lt-nombre" onClick={() => alElegir(b.id)}>{b.nombre}</button>
                {b.revisar ? <span className="lt-revisar" title="La palabra a la que estaba anclado ya no está en la narración: revisa cuándo aparece">⚠ revisar tiempo</span> : null}
              </div>,
              <div key={`${b.id}-pista`} className="lt-pista lt-detalle" onClick={irAlClic}>
                <div className={`lt-elemento${b.id === elegidoId ? ' elegida' : ''}${b.oculto ? ' oculta' : ''}${arrastre?.id === b.id ? ' arrastrando' : ''}${b.revisar ? ' revisar' : ''}${b.propuesta ? ' propuesta' : ''}`}
                  data-elemento={b.id} role="slider" tabIndex={0} aria-label={`${b.nombre}: aparece a los ${formatoS(v.inicioS)}${v.finS === null ? '' : ` y sale a los ${formatoS(v.finS)}`}`}
                  aria-valuemin={0} aria-valuemax={duracion} aria-valuenow={v.inicioS} aria-valuetext={formatoS(v.inicioS)}
                  style={{ left: x(v.inicioS), width: largo(v.inicioS, fin) }}
                  onPointerDown={presionar(b)} onPointerMove={moverPuntero} onPointerUp={soltar(b)} onPointerCancel={() => setArrastre(null)} onKeyDown={tecla(b)}>
                  <i data-borde="inicio" title="Arrastra: cuándo aparece" />
                  <span>{b.nombre}</span>
                  <i data-borde="fin" title="Arrastra: cuándo sale" />
                </div>
              </div>,
            ];
          })}

          {vozS > 0 ? <div className="lt-fin-voz" style={{ left: `calc(var(--lt-cabeza) + ${x(vozS)})` }}><span>Termina la voz → se habilita Siguiente</span></div> : null}
          <div className={`lt-aguja${tiempo === null ? ' quieta' : ''}`} data-segundo={tiempo ?? 0} style={{ left: `calc(var(--lt-cabeza) + ${x(tiempo ?? 0)})` }} />
        </div>
      </div>
      <p className="sec lt-pie">Clic en la regla o en una palabra para ir a ese momento · Espacio para reproducir · Alt al arrastrar suelta el imán</p>
    </section>
  );
}
