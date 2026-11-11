// HU-0601 · Editor (PNT-21), esqueleto (SUP-40): barra superior, lienzo con el reproductor y tira de pantallas.
// CP-056 · Edición en el lugar: doble clic (o Tab y Enter o F2) en un texto, escribir y Enter guarda; Esc cancela.
// Clic fuera también guarda. Cada texto guardado crea una versión y deja la pantalla en borrador (RN-05-2).
// HU-0602 · Un clic (o Tab y Espacio) elige un elemento: la barra contextual y el panel de Propiedades cambian su tamaño,
// su color del kit, su alineación y su animación (CP-057). Se guardan en `ajustes` de la pantalla (RN-06-1).
// HU-0603 · En modo Libre se arrastra un elemento (desde 4 px) o se mueve con las flechas de a 0,5 %; se guarda su
// `desplazamiento` en % del ancho (CP-058, RN-06-2). El modo no se guarda en el curso (SUP-42).
// HU-0605 · Panel «Diseños»: la misma pantalla en otra composición de contenido; los ajustes se reinician y los extras
// quedan (RN-06-3). «Deshacer» vuelve a la disposición anterior con sus ajustes (SUP-44).
// Agregar y capas, la línea de tiempo y el deshacer general llegan con la HU-0606 a la HU-0608.
import { type AjusteElemento, type CursoReproductor, montar, PALETA_BASE, type RolColor } from '@aptio/player';
import { type CursoDoc, type PantallaDoc, pantallasDe } from '@aptio/schema/revision';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Curso, EDITAN_PANTALLAS, ErrorApi, type Kit, type Rol } from '../api';
import { navegar } from '../ruta';
import {
  ajusteCon, cambioDesplazamiento, controlesDe, desplazado, escalaSiguiente, FLECHAS, nombreElemento, PASO_FLECHA, pxAPorcentaje, seRetoca,
  tamanoSiguiente, UMBRAL_ARRASTRE_PX,
} from './ajustes-elemento';
import { type CambioTexto, edicionDe, esEditable } from './edicion-texto';
import { PanelDisenos } from './disenos';
import { nombreDiseno } from './disenos-pantalla';
import { type AccionesRetoque, BarraElemento, PanelPropiedades } from './propiedades';
import './fuentes-kit';

const NOMBRE_ESTADO: Record<string, string> = { borrador: 'Borrador', 'propuesta-ia': 'Propuesta de la IA', aprobado: 'Aprobada' };
const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);

/** Estilos del lienzo editable: van dentro del reproductor, que dibuja en su propia sombra. */
const ESTILOS_EDICION = `
[data-editable] { cursor: text; border-radius: 4px; outline: 2px dashed transparent; outline-offset: 3px; }
[data-editable]:hover, [data-editable]:focus-visible { outline-color: currentColor; }
[data-editable][contenteditable] { outline: 2px solid currentColor; cursor: auto; }
[data-retocable] { cursor: pointer; outline: 2px dashed transparent; outline-offset: 3px; }
[data-retocable]:hover, [data-retocable]:focus-visible { outline-color: currentColor; }
[data-elegido] { outline: 2px solid var(--color-naranja, #ff6b35) !important; }
.ap-r[data-libre] [data-retocable] { cursor: move; touch-action: none; user-select: none; }
.ap-r[data-libre] [contenteditable] { cursor: auto; user-select: text; }
`;

type PantallaConAjustes = PantallaDoc & { ajustes?: Record<string, AjusteElemento> };
type CambioPantalla = CambioTexto | { ajustes: Record<string, AjusteElemento | null> } | { disposicion: string; ajustes?: Record<string, AjusteElemento | null> };
/** HU-0605 · Lo necesario para deshacer un cambio de diseño: la disposición y los ajustes de antes. */
type DeshacerDiseno = { pantallaId: string; disposicion: string; ajustes?: Record<string, AjusteElemento> };

type Guardar = (pantalla: PantallaDoc, bloqueId: string, escrito: string) => Promise<boolean>;

export function EditorVista({ proyectoId, pantallaId, rol, alCargar }: {
  proyectoId: string; pantallaId: string | null; rol: Rol; alCargar: (nombre: string) => void;
}) {
  const [curso, setCurso] = useState<Curso | null>(null);
  const [kit, setKit] = useState<Kit | null>(null);
  const [sinCurso, setSinCurso] = useState(false);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState('');
  const [escribiendo, setEscribiendo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  // HU-0602 · Elemento elegido (de una pantalla) y el tamaño que se veía al elegirlo; «Ver animación» vuelve a montar.
  const [elegido, setElegido] = useState<{ pantallaId: string; bloqueId: string; tamanoVisto: number } | null>(null);
  const [repeticion, setRepeticion] = useState(0);
  // HU-0603 · Modo de trabajo del editor (SUP-42): en Automático la disposición acomoda; en Libre se mueve.
  const [modo, setModo] = useState<'auto' | 'libre'>('auto');
  const [deshacer, setDeshacer] = useState<DeshacerDiseno | null>(null);
  const panelDisenos = useRef<HTMLDivElement>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  /** Texto que recupera el foco cuando el lienzo se redibuja tras guardar con Enter (teclado). */
  const reenfocar = useRef<string | null>(null);
  const editan = EDITAN_PANTALLAS.includes(rol);

  const recargar = useCallback(async () => setCurso(await api.curso(proyectoId)), [proyectoId]);

  useEffect(() => {
    api.proyecto(proyectoId).then(
      (p) => {
        alCargar(p.nombre);
        api.kit(p.clienteId).then(setKit, () => setKit(null));
        recargar().catch((e: unknown) => {
          if (e instanceof ErrorApi && e.estado === 404) setSinCurso(true);
          else setError(mensajeDe(e, 'No se pudo cargar el curso'));
        });
      },
      (e: unknown) => setError(mensajeDe(e, 'No se pudo cargar el proyecto')),
    );
  }, [proyectoId, alCargar, recargar]);

  const documento = curso ? (curso.documento as unknown as CursoDoc) : null;
  const pantallas = documento ? pantallasDe(documento) : [];
  const actual = pantallas.find((p) => p.id === pantallaId) ?? pantallas[0];

  /** Envía un cambio de la pantalla con la versión leída; devuelve si quedó guardado. */
  const enviar = async (pantalla: PantallaDoc, cambio: CambioPantalla, listo: string) => {
    if (!curso) return false;
    setError('');
    setAviso('');
    setDeshacer(null);
    setOcupado(true);
    try {
      const estaba = pantalla.estado;
      await api.editarPantalla(curso.id, pantalla.id, { version: curso.version, ...cambio });
      await recargar();
      setAviso(estaba === 'aprobado' ? `${listo} La pantalla volvió a borrador: apruébala de nuevo en Revisión.` : listo);
      return true;
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 409) {
        // Otra persona guardó antes: se trae la última versión para no pisarla.
        await recargar().catch(() => undefined);
        setError('Otra persona cambió el curso mientras editabas. Se cargó la última versión; vuelve a hacer tu cambio.');
      } else {
        setError(mensajeDe(e, 'No se pudo guardar el cambio'));
      }
      return false;
    } finally {
      setOcupado(false);
    }
  };
  /** Guarda lo escrito; devuelve si quedó guardado (si no, el lienzo vuelve al texto de antes). */
  const guardar: Guardar = async (pantalla, bloqueId, escrito) => {
    const r = edicionDe(pantalla, bloqueId, escrito);
    if (r.tipo === 'sin-cambios') return false;
    if (r.tipo === 'vacio') {
      setAviso('');
      setError('Un texto no puede quedar vacío; se dejó el que tenía.');
      return false;
    }
    return enviar(pantalla, r.cambio, 'Texto guardado.');
  };
  // El lienzo se monta una vez por versión; lee siempre la última función de guardado.
  /** HU-0603 · Guarda el desplazamiento de un elemento (lo llama el lienzo al soltar o tras las flechas). */
  const mover = (pantalla: PantallaDoc, bloqueId: string, d: { x: number; y: number }) => {
    const previo = (pantalla as PantallaConAjustes).ajustes?.[bloqueId];
    return enviar(pantalla, { ajustes: { [bloqueId]: ajusteCon(previo, cambioDesplazamiento(d)) } }, 'Posición guardada.');
  };
  const guardarRef = useRef(guardar);
  const moverRef = useRef(mover);
  const modoRef = useRef(modo);
  useEffect(() => {
    guardarRef.current = guardar;
    moverRef.current = mover;
    modoRef.current = modo;
  });

  // Una sola pantalla, como la verá el participante, con sus textos editables.
  useEffect(() => {
    if (!documento || !actual || !lienzo.current) return;
    const r = montar(lienzo.current, documento as unknown as CursoReproductor, {
      kit: kit ? { paleta: kit.paleta, tipografias: kit.tipografias, personaje: kit.personaje?.nombre ?? null } : {},
      revision: true,
      marco: false,
      inicio: actual.id,
    });
    const sombra = lienzo.current.shadowRoot;
    if (!sombra || !editan) return () => r.destruir();
    const estilo = document.createElement('style');
    estilo.textContent = ESTILOS_EDICION;
    sombra.append(estilo);
    for (const el of sombra.querySelectorAll<HTMLElement>('[data-bloque]')) {
      const b = actual.bloques.find((x) => x.id === el.dataset.bloque);
      if (!b || !seRetoca(b.tipo)) continue;
      el.dataset.retocable = '';
      el.tabIndex = 0;
      el.title = esEditable(actual, b.id) ? 'Clic para elegir · doble clic para escribir' : 'Clic para elegir';
      if (esEditable(actual, b.id)) el.dataset.editable = '';
      if (reenfocar.current === el.dataset.bloque) el.focus();
    }
    reenfocar.current = null;

    let edicion: { el: HTMLElement; antes: Node[] } | null = null;
    const empezar = (el: HTMLElement) => {
      if (edicion) return;
      edicion = { el, antes: [...el.childNodes].map((n) => n.cloneNode(true)) };
      el.contentEditable = 'plaintext-only';
      el.setAttribute('role', 'textbox');
      el.setAttribute('aria-multiline', 'false');
      el.focus();
      const rango = document.createRange();
      rango.selectNodeContents(el);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(rango);
      setEscribiendo(true);
    };
    const terminar = async (guardarlo: boolean) => {
      const e = edicion;
      if (!e) return;
      edicion = null;
      e.el.removeAttribute('contenteditable');
      e.el.removeAttribute('role');
      e.el.removeAttribute('aria-multiline');
      setEscribiendo(false);
      const escrito = e.el.textContent ?? '';
      const guardado = guardarlo && (await guardarRef.current(actual, e.el.dataset.bloque!, escrito));
      // Si no se guardó, vuelve el texto de antes; si se guardó, la versión nueva redibuja el lienzo.
      if (!guardado) e.el.replaceChildren(...e.antes);
    };

    const editable = (t: EventTarget | null) => (t instanceof HTMLElement ? t.closest<HTMLElement>('[data-editable]') : null);
    const retocable = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLElement>('[data-retocable]') : null);
    /** HU-0602 · Elegir: se mide el tamaño que se ve, en % del ancho de la pantalla, para que A−/A+ partan de ahí. */
    const elegir = (el: HTMLElement | null) => {
      if (!el) return setElegido(null);
      const ancho = sombra.querySelector<HTMLElement>('.ap-r')?.clientWidth || 1;
      const tamanoVisto = Math.round((parseFloat(getComputedStyle(el).fontSize) / ancho) * 1000) / 10;
      setElegido({ pantallaId: actual.id, bloqueId: el.dataset.bloque!, tamanoVisto });
    };
    const alClic = (ev: Event) => {
      if (!edicion) elegir(retocable(ev.target));
    };
    const alDobleClic = (ev: Event) => {
      const el = editable(ev.target);
      if (el) empezar(el);
    };
    const alTecla = (ev: Event) => {
      const k = ev as KeyboardEvent;
      if (edicion) {
        if (k.key === 'Enter' && !k.shiftKey) {
          k.preventDefault();
          const el = edicion.el;
          reenfocar.current = el.dataset.bloque!;
          void terminar(true).then(() => {
            if (el.isConnected) el.focus();
          });
        } else if (k.key === 'Escape') {
          k.preventDefault();
          k.stopPropagation();
          const el = edicion.el;
          void terminar(false).then(() => el.focus());
        }
        return;
      }
      const el = editable(k.target);
      if (el && el === k.target && (k.key === 'Enter' || k.key === 'F2')) {
        k.preventDefault();
        empezar(el);
        return;
      }
      const r = retocable(k.target);
      if (r && r === k.target && alFlecha(k, r)) return;
      if (r && r === k.target && k.key === ' ') {
        k.preventDefault();
        elegir(r);
      } else if (k.key === 'Escape') {
        elegir(null);
      }
    };
    const alSalir = (ev: Event) => {
      if (edicion && ev.target === edicion.el) void terminar(true);
    };

    // HU-0603 · Arrastre en modo Libre: se ve en vivo con `translate` y se guarda al soltar, en % del ancho.
    const anchoLienzo = () => sombra.querySelector<HTMLElement>('.ap-r')?.clientWidth ?? 0;
    const desplazamientoDe = (id: string) => (actual as PantallaConAjustes).ajustes?.[id]?.desplazamiento;
    const verEn = (el: HTMLElement, d: { x: number; y: number }) => {
      el.style.translate = `${d.x}cqw ${d.y}cqw`;
    };
    let arrastre: { el: HTMLElement; id: string; sx: number; sy: number; movido: boolean; d: { x: number; y: number } } | null = null;
    const alPresionar = (ev: Event) => {
      const p = ev as PointerEvent;
      const el = retocable(p.target);
      if (!el || edicion || modoRef.current !== 'libre' || p.button !== 0) return;
      arrastre = { el, id: el.dataset.bloque!, sx: p.clientX, sy: p.clientY, movido: false, d: desplazado(desplazamientoDe(el.dataset.bloque!), 0, 0) };
      el.setPointerCapture?.(p.pointerId);
    };
    const alMover = (ev: Event) => {
      const p = ev as PointerEvent;
      if (!arrastre) return;
      const dxPx = p.clientX - arrastre.sx;
      const dyPx = p.clientY - arrastre.sy;
      if (!arrastre.movido && Math.hypot(dxPx, dyPx) <= UMBRAL_ARRASTRE_PX) return;
      arrastre.movido = true;
      p.preventDefault();
      const ancho = anchoLienzo();
      const base = desplazamientoDe(arrastre.id);
      arrastre.d = desplazado(base, pxAPorcentaje(dxPx, ancho), pxAPorcentaje(dyPx, ancho));
      verEn(arrastre.el, arrastre.d);
    };
    const alSoltar = () => {
      const a = arrastre;
      arrastre = null;
      if (!a?.movido) return;
      // El clic que sigue al arrastre solo elige el elemento.
      reenfocar.current = a.id;
      void moverRef.current(actual, a.id, a.d);
    };
    // Flechas: se mueve al instante y se guarda una sola vez, 1 s después de la última.
    let flechas: { id: string; d: { x: number; y: number }; t: ReturnType<typeof setTimeout> } | null = null;
    const alFlecha = (k: KeyboardEvent, el: HTMLElement) => {
      const dir = FLECHAS[k.key];
      if (!dir || modoRef.current !== 'libre') return false;
      k.preventDefault();
      const id = el.dataset.bloque!;
      const desde = flechas?.id === id ? flechas.d : desplazado(desplazamientoDe(id), 0, 0);
      if (flechas) clearTimeout(flechas.t);
      const d = desplazado(desde, dir[0] * PASO_FLECHA, dir[1] * PASO_FLECHA);
      verEn(el, d);
      flechas = {
        id, d, t: setTimeout(() => {
          flechas = null;
          reenfocar.current = id;
          void moverRef.current(actual, id, d);
        }, 1000),
      };
      return true;
    };
    sombra.addEventListener('click', alClic);
    sombra.addEventListener('dblclick', alDobleClic);
    sombra.addEventListener('keydown', alTecla);
    sombra.addEventListener('focusout', alSalir);
    sombra.addEventListener('pointerdown', alPresionar);
    sombra.addEventListener('pointermove', alMover);
    sombra.addEventListener('pointerup', alSoltar);
    sombra.addEventListener('pointercancel', alSoltar);
    return () => {
      sombra.removeEventListener('pointerdown', alPresionar);
      sombra.removeEventListener('pointermove', alMover);
      sombra.removeEventListener('pointerup', alSoltar);
      sombra.removeEventListener('pointercancel', alSoltar);
      if (flechas) clearTimeout(flechas.t);
      sombra.removeEventListener('click', alClic);
      sombra.removeEventListener('dblclick', alDobleClic);
      sombra.removeEventListener('keydown', alTecla);
      sombra.removeEventListener('focusout', alSalir);
      edicion = null;
      r.destruir();
    };
    // Se vuelve a montar con cada versión del curso (documento nuevo), al cambiar de pantalla o de kit y con «Ver animación».
  }, [documento, actual, kit, editan, repeticion]);

  // El elemento elegido se marca en el lienzo (después de montarlo).
  const elegidoId = elegido && elegido.pantallaId === actual?.id ? elegido.bloqueId : null;
  useEffect(() => {
    const sombra = lienzo.current?.shadowRoot;
    if (!sombra) return;
    for (const el of sombra.querySelectorAll<HTMLElement>('[data-retocable]')) el.toggleAttribute('data-elegido', el.dataset.bloque === elegidoId);
    sombra.querySelector('.ap-r')?.toggleAttribute('data-libre', modo === 'libre');
  }, [elegidoId, documento, actual, kit, repeticion, modo]);

  const aRevision = `/proyectos/${proyectoId}/revision`;
  const volver = (
    <a className="boton" href={aRevision} onClick={(e) => { e.preventDefault(); navegar(aRevision); }}>← Revisión</a>
  );
  if (error && !curso) return <div className="nota error" role="alert">{error}</div>;
  if (sinCurso) {
    return (
      <div className="editor">
        <div className="editor-barra">{volver}<h1>Editor</h1></div>
        <p className="nota">Este proyecto aún no tiene pantallas. Genera el SCORM y vuelve cuando la etapa «Pantallas animadas con tu marca» termine.</p>
      </div>
    );
  }
  if (!editan) {
    return (
      <div className="editor">
        <div className="editor-barra">{volver}<h1>Editor</h1></div>
        <p className="nota">El editor es del equipo de producción. Puedes ver y comentar las pantallas en Revisión.</p>
      </div>
    );
  }
  if (!curso || !actual) return <p className="sec" role="status">Cargando el editor…</p>;

  const indice = pantallas.indexOf(actual);
  const paleta: Record<RolColor, string> = { ...PALETA_BASE, ...kit?.paleta };
  const bloque = elegidoId ? actual.bloques.find((b) => b.id === elegidoId) : undefined;
  const ajuste = bloque ? (actual as PantallaConAjustes).ajustes?.[bloque.id] : undefined;
  const control = bloque ? controlesDe(bloque.tipo) : null;
  const tamano = control?.tamano === 'escala' ? (ajuste?.escala ?? 1) : (ajuste?.tamanoCqw ?? elegido?.tamanoVisto ?? 2);
  const datosElegido = bloque ? { nombre: nombreElemento(bloque), tipo: bloque.tipo, ajuste, tamano } : null;
  const retocar = (cambio: Partial<Record<keyof AjusteElemento, unknown>>) => {
    if (!bloque) return;
    void enviar(actual, { ajustes: { [bloque.id]: ajusteCon(ajuste, cambio) } }, 'Cambio guardado.');
  };
  const acciones: AccionesRetoque = {
    alTamano: (paso) => retocar(control?.tamano === 'escala' ? { escala: escalaSiguiente(ajuste?.escala, paso) } : { tamanoCqw: tamanoSiguiente(tamano, paso) }),
    alTamanoValor: (v) => retocar(control?.tamano === 'escala' ? { escala: v } : { tamanoCqw: v }),
    alColor: (rol) => retocar({ color: rol }),
    alAlinear: (a) => retocar({ alineacion: a }),
    alAnimar: (a) => retocar({ animacion: a }),
    alRestablecer: () => {
      if (bloque) void enviar(actual, { ajustes: { [bloque.id]: null } }, 'Se restableció el elemento.');
    },
    alVerAnimacion: () => setRepeticion((n) => n + 1),
    alVolverASuLugar: () => {
      if (bloque) void mover(actual, bloque.id, { x: 0, y: 0 });
    },
  };
  /** HU-0605 · Aplica otro diseño y deja a mano cómo deshacerlo. */
  const cambiarDiseno = async (disposicion: string) => {
    const antes: DeshacerDiseno = { pantallaId: actual.id, disposicion: actual.disposicion ?? 'idea', ajustes: (actual as PantallaConAjustes).ajustes };
    setElegido(null);
    if (await enviar(actual, { disposicion }, `Diseño aplicado: ${nombreDiseno(disposicion)}.`)) setDeshacer(antes);
  };
  const deshacerDiseno = () => {
    const d = deshacer;
    const pantalla = d && pantallas.find((p) => p.id === d.pantallaId);
    if (!d || !pantalla) return;
    void enviar(pantalla, { disposicion: d.disposicion, ...(d.ajustes ? { ajustes: d.ajustes } : {}) }, 'Se deshizo el cambio de diseño.');
  };
  const irA = (id: string) => navegar(`/proyectos/${proyectoId}/editor?pantalla=${id}`);
  return (
    <div className="editor">
      <div className="editor-barra">
        {volver}
        <span className="num sec">{String(indice + 1).padStart(2, '0')} / {pantallas.length}</span>
        <h1>{actual.titulo.es ?? actual.titulo.en}</h1>
        <span className={`chip ${actual.estado === 'aprobado' ? 'validado' : actual.estado === 'propuesta-ia' ? 'ia' : ''}`}>{NOMBRE_ESTADO[actual.estado] ?? actual.estado}</span>
        <div className="opciones" role="group" aria-label="Modo de edición">
          <button type="button" className="opcion" aria-pressed={modo === 'auto'} title="La disposición acomoda los elementos" onClick={() => setModo('auto')}>Automático</button>
          <button type="button" className="opcion" aria-pressed={modo === 'libre'} title="Arrastra los elementos donde quieras" onClick={() => setModo('libre')}>Libre</button>
        </div>
      </div>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? (
        <div className="nota fila-aviso" role="status">
          <span>{aviso}</span>
          {deshacer && deshacer.pantallaId === actual.id ? <button type="button" className="boton" disabled={ocupado} onClick={deshacerDiseno}>Deshacer</button> : null}
        </div>
      ) : null}
      <div className="editor-cuerpo">
        <div ref={panelDisenos} className="editor-col-disenos" tabIndex={-1}>
          <PanelDisenos documento={documento!} pantalla={actual} kit={kit} ocupado={ocupado} alElegir={(d) => void cambiarDiseno(d)} />
        </div>
        <section className="editor-lienzo" aria-label={`Lienzo de la pantalla ${actual.id}`}>
          {datosElegido && !escribiendo ? (
            <BarraElemento elegido={datosElegido} paleta={paleta} ocupado={ocupado} acciones={acciones} />
          ) : (
            <p className="editor-ctx" aria-live="polite">
              {escribiendo ? 'Escribiendo… Enter para terminar · Esc para cancelar' : ocupado ? 'Guardando…' : 'Clic en un elemento para cambiarlo; doble clic en un texto para escribir (o Tab hasta él y Espacio o Enter).'}
            </p>
          )}
          <div className="revision-escenario">
            <div ref={lienzo} className="revision-reproductor" />
          </div>
          <p className="editor-ayuda">
            {modo === 'libre' ? 'Modo Libre: arrastra un elemento para moverlo, o elígelo y usa las flechas (0,5 % por pulsación).' : 'Modo Automático: la disposición acomoda los elementos. Cambia a Libre para moverlos.'}
          </p>
        </section>
        <PanelPropiedades elegido={datosElegido} paleta={paleta} ocupado={ocupado} modo={modo} acciones={acciones}
          diseno={nombreDiseno(actual.disposicion)} alCambiarDiseno={() => {
            panelDisenos.current?.scrollIntoView({ block: 'nearest' });
            panelDisenos.current?.querySelector<HTMLButtonElement>('.editor-diseno:not([disabled])')?.focus();
          }} />
      </div>
      <nav className="editor-tira" aria-label="Pantallas">
        <ol>
          {pantallas.map((p, i) => (
            <li key={p.id}>
              <button type="button" className="editor-miniatura" aria-current={p.id === actual.id} disabled={ocupado} onClick={() => irA(p.id)}>
                <span className="num">{String(i + 1).padStart(2, '0')}</span>
                <span>{p.titulo.es ?? p.titulo.en}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </div>
  );
}
