// HU-0601 · Editor (PNT-21), esqueleto (SUP-40): barra superior, lienzo con el reproductor y tira de pantallas.
// CP-056 · Edición en el lugar: doble clic (o Tab y Enter o F2) en un texto, escribir y Enter guarda; Esc cancela.
// Clic fuera también guarda. Cada texto guardado crea una versión y deja la pantalla en borrador (RN-05-2).
// HU-0602 · Un clic (o Tab y Espacio) elige un elemento: la barra contextual y el panel de Propiedades cambian su tamaño,
// su color del kit, su alineación y su animación (CP-057). Se guardan en `ajustes` de la pantalla (RN-06-1).
// HU-0603 · En modo Libre se arrastra un elemento (desde 4 px) o se mueve con las flechas de a 0,5 %; se guarda su
// `desplazamiento` en % del ancho (CP-058, RN-06-2). El modo no se guarda en el curso (SUP-42).
// HU-0605 · Panel «Diseños»: la misma pantalla en otra composición de contenido; los ajustes se reinician y los extras
// quedan (RN-06-3). «Deshacer» vuelve a la disposición anterior con sus ajustes (SUP-44).
// HU-0606 · Panel izquierdo con pestañas Diseños · Agregar · Capas: un elemento agregado aparece elegido y en modo Libre
// (CP-061); en Capas se elige, se oculta o se muestra cada elemento. Los extras se eliminan (también con Supr); los
// bloques del contenido solo se ocultan (SUP-45). Lo oculto se ve tenue en el editor y no se ve en el curso.
// HU-0607 · Deshacer y rehacer (↶ ↷, Ctrl+Z, Ctrl+Shift+Z o Ctrl+Y): cada cambio guarda antes una foto de la pantalla
// (hasta 60). Deshacer se ve al instante y se guarda 1 s después de la última pulsación, en un solo PATCH (RN-06-5,
// SUP-46); si la foto es de otra pantalla, el editor va a ella. Si otra persona guardó antes (409), se recarga y se
// vacía el historial. Mientras se escribe, Ctrl+Z es el del texto.
// HU-0608 · Línea de tiempo bajo el lienzo: narración palabra por palabra, subtítulos, boca y una barra por elemento que
// se arrastra (CP-064, CP-065); la aguja deja el lienzo en ese segundo, con solo lo activo (CP-066). El lienzo se monta
// con `sinTiempos` (todo a la vista) hasta que se mueve la aguja; ■ vuelve a mostrar todo. Los tiempos van en `ajustes`
// y pasan por el historial como cualquier retoque.
// HU-0608 PR 2 · «✦ Sincronizar con la voz» (SUP-48) calcula la propuesta aquí, sin IA: se ve en la franja morada con
// las barras donde quedarían; Aplicar la guarda en un solo PATCH y Ctrl+Z la deshace (CP-068). Las barras de los
// elementos que perdieron su palabra al cambiar la narración muestran «⚠ revisar tiempo» (CP-067).
import { type AjusteElemento, type CursoReproductor, type Disparador, duracionDe, leerVtt, montar, PALETA_BASE, type Pantalla, type Reproductor, type RolColor, tiemposDe } from '@aptio/player';
import { elementoRevisarTiempo, marcasPalabra, ORIGEN_REVISAR_TIEMPO, sincronizarConVoz, type TiempoSincronizado } from '@aptio/schema/tiempos';
import { type CursoDoc, type PantallaDoc, pantallasDe } from '@aptio/schema/revision';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type Curso, EDITAN_PANTALLAS, ErrorApi, type Kit, type Rol } from '../api';
import { navegar } from '../ruta';
import {
  ajusteCon, cambioDesplazamiento, controlesDe, desplazado, escalaSiguiente, FLECHAS, nombreElemento, PASO_FLECHA, pxAPorcentaje, seRetoca,
  tamanoSiguiente, UMBRAL_ARRASTRE_PX,
} from './ajustes-elemento';
import { type CambioTexto, edicionDe, esEditable } from './edicion-texto';
import { capasDe, extraNuevo, nombreExtra, type PantallaConExtras, sinExtra, TIPOS_EXTRA, type TipoExtra } from './extras';
import { cambioHacia, conFoto, type Foto, fotoDe, type Historial, HISTORIAL_VACIO, mover as moverHistorial, registrar } from './historial';
import { LineaTiempo } from './LineaTiempo';
import { type CambioTiempo, tramosBoca, tramosSubtitulos } from './linea-tiempo';
import { PanelIzquierdo, type PestanaIzquierda } from './panel-izquierdo';
import { PanelDisenos } from './disenos';
import { PanelDisparadores } from './PanelDisparadores';
import { marcasDisparo } from './disparadores-panel';
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
.ap-r .ap-oculto-el { display: revert !important; opacity: 0.35; outline: 2px dashed currentColor; outline-offset: 3px; }
`;

type PantallaConAjustes = PantallaDoc & { ajustes?: Record<string, AjusteElemento> };
type CambioPantalla = CambioTexto | { ajustes: Record<string, AjusteElemento | null> } | { disposicion: string; ajustes?: Record<string, AjusteElemento | null> } | { disparadores: Disparador[] };
/** HU-0607 · Lo que se ve y falta guardar de una pantalla tras deshacer o rehacer. */
type Pendiente = { foto: Foto; motivo: 'deshacer' | 'rehacer' };
/** Espera tras la última pulsación de deshacer o rehacer antes de guardar (RN-06-5). */
const ESPERA_GUARDADO_MS = 1000;

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
  // HU-0607 · Historial de la sesión (SUP-46), lo que falta guardar y el indicador «Guardando… / Guardado».
  const [historial, setHistorial] = useState<Historial>(HISTORIAL_VACIO);
  const [pendientes, setPendientes] = useState<Record<string, Pendiente>>({});
  const [guardado, setGuardado] = useState<'guardando' | 'guardado' | null>(null);
  const historialRef = useRef(historial);
  const pendientesRef = useRef(pendientes);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ponerHistorial = (h: Historial) => {
    historialRef.current = h;
    setHistorial(h);
  };
  const ponerPendientes = (p: Record<string, Pendiente>) => {
    pendientesRef.current = p;
    setPendientes(p);
  };
  const panelDisenos = useRef<HTMLDivElement>(null);
  const [pestana, setPestana] = useState<PestanaIzquierda>('disenos');
  // HU-0608 · La aguja (null: se ve todo), si está corriendo y si la línea de tiempo se ve.
  // Van con el id de la pantalla: otra pantalla empieza con todo a la vista.
  const [aguja, setAguja] = useState<{ pantallaId: string; s: number } | null>(null);
  const [corriendo, setCorriendo] = useState<string | null>(null);
  const [conLinea, setConLinea] = useState(true);
  const agujaRef = useRef<{ pantallaId: string; s: number } | null>(null);
  // HU-0608 PR 2 · La propuesta de «Sincronizar con la voz» (de una pantalla) y los elementos con «Revisar tiempo».
  const [sincro, setSincro] = useState<{ pantallaId: string; tiempos: Record<string, TiempoSincronizado>; encontrados: number; total: number } | null>(null);
  const [revisar, setRevisar] = useState<Set<string>>(new Set());
  const reproductor = useRef<Reproductor | null>(null);
  const lienzo = useRef<HTMLDivElement>(null);
  /** Texto que recupera el foco cuando el lienzo se redibuja tras guardar con Enter (teclado). */
  const reenfocar = useRef<string | null>(null);
  const editan = EDITAN_PANTALLAS.includes(rol);

  /** El último curso leído, para guardar con su versión aunque el estado de React aún no se haya actualizado. */
  const cursoRef = useRef<Curso | null>(null);
  const recargar = useCallback(async () => {
    const c = await api.curso(proyectoId);
    cursoRef.current = c;
    setCurso(c);
    // «Revisar tiempo» (CP-067) se marca en las barras; si no se pueden leer las observaciones, el editor sigue.
    api.observaciones(c.id).then(
      (obs) => setRevisar(new Set(obs.filter((o) => o.origen === ORIGEN_REVISAR_TIEMPO && o.pantallaId).map((o) => `${o.pantallaId}:${elementoRevisarTiempo(o.mensaje) ?? ''}`))),
      () => setRevisar(new Set()),
    );
  }, [proyectoId]);

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

  // Lo que se ve: el curso guardado con las pantallas que esperan guardarse tras deshacer o rehacer.
  const documento = useMemo(() => {
    const doc = curso ? (curso.documento as unknown as CursoDoc) : null;
    if (!doc || !Object.keys(pendientes).length) return doc;
    return {
      ...doc,
      modulos: doc.modulos.map((m) => ({
        ...m, capsulas: m.capsulas.map((c) => ({ ...c, pantallas: c.pantallas.map((p) => (pendientes[p.id] ? conFoto(p, pendientes[p.id]!.foto) : p)) })),
      })),
    } as CursoDoc;
  }, [curso, pendientes]);
  const pantallas = documento ? pantallasDe(documento) : [];
  const actual = pantallas.find((p) => p.id === pantallaId) ?? pantallas[0];

  /** Si otra persona guardó antes (409), se trae la última versión y el historial se vacía: sus fotos ya no valen. */
  const fallo = async (e: unknown, otro: string) => {
    ponerPendientes({});
    setGuardado(null);
    if (e instanceof ErrorApi && e.estado === 409) {
      await recargar().catch(() => undefined);
      ponerHistorial(HISTORIAL_VACIO);
      setError('Otra persona cambió el curso mientras editabas. Se cargó la última versión; vuelve a hacer tu cambio.');
    } else {
      setError(mensajeDe(e, otro));
    }
  };
  /** HU-0607 · Guarda lo deshecho o rehecho: un PATCH por pantalla, de lo guardado a la foto elegida. */
  const guardarPendientes = async () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    const lista = Object.entries(pendientesRef.current);
    if (!lista.length) return true;
    setOcupado(true);
    setGuardado('guardando');
    try {
      for (const [id, { foto, motivo }] of lista) {
        const c = cursoRef.current!;
        const guardada = pantallasDe(c.documento as unknown as CursoDoc).find((p) => p.id === id);
        const cambio = guardada ? cambioHacia(guardada, foto) : null;
        if (!cambio) continue;
        await api.editarPantalla(c.id, id, { version: c.version, ...cambio, motivo });
        await recargar();
      }
      ponerPendientes({});
      setGuardado('guardado');
      return true;
    } catch (e) {
      await fallo(e, 'No se pudo guardar lo deshecho');
      if (!(e instanceof ErrorApi && e.estado === 409)) ponerHistorial(HISTORIAL_VACIO);
      return false;
    } finally {
      setOcupado(false);
    }
  };
  /** Envía un cambio de la pantalla con la versión leída; devuelve si quedó guardado. Antes guarda lo deshecho. */
  const enviar = async (pantalla: PantallaDoc, cambio: CambioPantalla, listo: string) => {
    if (!curso || !(await guardarPendientes())) return false;
    setError('');
    setAviso('');
    setOcupado(true);
    setGuardado('guardando');
    try {
      const estaba = pantalla.estado;
      const antes = fotoDe(pantalla);
      await api.editarPantalla(curso.id, pantalla.id, { version: cursoRef.current!.version, ...cambio });
      await recargar();
      ponerHistorial(registrar(historialRef.current, { pantallaId: pantalla.id, foto: antes }));
      setGuardado('guardado');
      setAviso(estaba === 'aprobado' ? `${listo} La pantalla volvió a borrador: apruébala de nuevo en Revisión.` : listo);
      return true;
    } catch (e) {
      await fallo(e, 'No se pudo guardar el cambio');
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
  /** HU-0606 · Elimina un extra (solo los extras; los bloques del contenido se ocultan). */
  const quitar = (pantalla: PantallaDoc, id: string) => {
    setElegido(null);
    return enviar(pantalla, { extras: sinExtra(pantalla as PantallaConExtras, id) }, 'Elemento eliminado.');
  };
  /** HU-0607 · Deshacer o rehacer: se ve al instante y se guarda 1 s después de la última pulsación. */
  const paso = (hacia: 'deshacer' | 'rehacer') => {
    if (ocupado || escribiendo || !cursoRef.current) return;
    // Con refs y no con lo dibujado: varias pulsaciones seguidas pueden llegar antes de que React vuelva a dibujar.
    const guardadas = pantallasDe(cursoRef.current.documento as unknown as CursoDoc);
    const ahora = (id: string) => pendientesRef.current[id]?.foto ?? fotoDe(guardadas.find((p) => p.id === id)!);
    const destino = historialRef.current[hacia].at(-1);
    const pantalla = destino && guardadas.find((p) => p.id === destino.pantallaId);
    if (!pantalla) return;
    const r = moverHistorial(historialRef.current, hacia, ahora);
    if (!r) return;
    ponerHistorial(r.historial);
    ponerPendientes({ ...pendientesRef.current, [pantalla.id]: { foto: r.entrada.foto, motivo: hacia } });
    setError('');
    setAviso(hacia === 'deshacer' ? 'Se deshizo el último cambio.' : 'Se rehízo el cambio.');
    setGuardado('guardando');
    const sigue = elegido && (pantalla.bloques.some((b) => b.id === elegido.bloqueId) || r.entrada.foto.extras.some((e) => e.id === elegido.bloqueId));
    if (!sigue) setElegido(null);
    if (pantalla.id !== actual?.id) navegar(`/proyectos/${proyectoId}/editor?pantalla=${pantalla.id}`);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => void guardarPendientesRef.current(), ESPERA_GUARDADO_MS);
  };
  const guardarRef = useRef(guardar);
  const moverRef = useRef(mover);
  const quitarRef = useRef(quitar);
  const modoRef = useRef(modo);
  // HU-0608 · La aguja de la línea de tiempo: ir a un segundo, reproducir, pausar y ■ (ver todo).
  const tiempo = aguja && aguja.pantallaId === actual?.id ? aguja.s : null;
  const reproduciendo = corriendo !== null && corriendo === actual?.id;
  const ponerTiempo = (s: number | null) => {
    const a = s === null || !actual ? null : { pantallaId: actual.id, s };
    agujaRef.current = a;
    setAguja(a);
  };
  const irTiempo = (s: number) => {
    setCorriendo(null);
    ponerTiempo(s);
    reproductor.current?.irA(s);
  };
  const pausarTiempo = () => {
    reproductor.current?.pausar();
    setCorriendo(null);
  };
  const detenerTiempo = () => {
    reproductor.current?.verTodo();
    setCorriendo(null);
    ponerTiempo(null);
  };
  const reproducirTiempo = () => {
    const r = reproductor.current;
    if (!r || !actual) return;
    const desde = tiempo !== null && tiempo < r.duracion() - 0.05 ? tiempo : 0;
    setCorriendo(actual.id);
    let ultimo = -1;
    r.reproducir(desde, (s, fin) => {
      agujaRef.current = { pantallaId: actual.id, s };
      // La aguja se redibuja cada 50 ms: React no necesita cada cuadro.
      if (fin || Math.abs(s - ultimo) >= 0.05) {
        ultimo = s;
        setAguja({ pantallaId: actual.id, s });
      }
      if (fin) setCorriendo(null);
    });
  };
  const espacioRef = useRef(() => {});
  const pasoRef = useRef(paso);
  const guardarPendientesRef = useRef(guardarPendientes);
  useEffect(() => {
    guardarRef.current = guardar;
    moverRef.current = mover;
    quitarRef.current = quitar;
    modoRef.current = modo;
    pasoRef.current = paso;
    guardarPendientesRef.current = guardarPendientes;
    espacioRef.current = () => (reproduciendo ? pausarTiempo() : reproducirTiempo());
  });

  // HU-0607 · Atajos: Ctrl+Z deshace; Ctrl+Shift+Z o Ctrl+Y rehacen. En un campo o mientras se escribe, son los del texto.
  // Al salir del editor se guarda lo que esperaba; si se cierra la página antes, el navegador pregunta.
  useEffect(() => {
    const alTecla = (k: KeyboardEvent) => {
      // HU-0608 · Espacio reproduce o pausa la línea de tiempo (en la página o en sus barras, no en un botón o campo).
      if (k.key === ' ' && !k.ctrlKey && !k.metaKey && !k.altKey) {
        const el = k.composedPath()[0];
        if (el === document.body || (el instanceof HTMLElement && el.closest('.linea-tiempo') && !el.closest('button, input, select, textarea'))) {
          k.preventDefault();
          espacioRef.current();
        }
        return;
      }
      if (!(k.ctrlKey || k.metaKey) || k.altKey) return;
      const tecla = k.key.toLowerCase();
      if (tecla !== 'z' && tecla !== 'y') return;
      const el = k.composedPath()[0];
      if (el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))) return;
      k.preventDefault();
      pasoRef.current(tecla === 'y' || k.shiftKey ? 'rehacer' : 'deshacer');
    };
    const alCerrar = (ev: BeforeUnloadEvent) => {
      if (Object.keys(pendientesRef.current).length) ev.preventDefault();
    };
    document.addEventListener('keydown', alTecla);
    window.addEventListener('beforeunload', alCerrar);
    return () => {
      document.removeEventListener('keydown', alTecla);
      window.removeEventListener('beforeunload', alCerrar);
      if (temporizador.current) void guardarPendientesRef.current();
    };
  }, []);

  // Una sola pantalla, como la verá el participante, con sus textos editables.
  useEffect(() => {
    if (!documento || !actual || !lienzo.current) return;
    const r = montar(lienzo.current, documento as unknown as CursoReproductor, {
      kit: kit ? { paleta: kit.paleta, tipografias: kit.tipografias, personaje: kit.personaje?.nombre ?? null } : {},
      revision: true,
      marco: false,
      inicio: actual.id,
      sinAcciones: true,
      sinTiempos: true,
      // HU-0610 · Con ▶ Reproducir, un «ir a otra pantalla» se avisa sin salir del editor.
      alSalto: ({ pantallaId }) => {
        const todas = pantallasDe(documento);
        const i = todas.findIndex((p) => p.id === pantallaId);
        const destino = todas[i];
        setAviso(`◆ Aquí la cápsula iría a la pantalla ${i + 1}${destino ? ` «${destino.titulo.es ?? destino.titulo.en ?? ''}»` : ''}; en el editor no se cambia de pantalla.`);
      },
      urlRecurso: (id) => cursoRef.current?.urlsRecursos?.[id],
      cargarSvg: async (id) => cursoRef.current?.svgPersonajes?.[id],
      cargarSubtitulos: async (id) => cursoRef.current?.subtitulos?.[id],
    });
    reproductor.current = r;
    // Tras guardar, el lienzo nuevo queda en el mismo segundo de la aguja.
    if (agujaRef.current?.pantallaId === actual.id) r.irA(agujaRef.current.s);
    const sombra = lienzo.current.shadowRoot;
    if (!sombra || !editan) return () => r.destruir();
    const estilo = document.createElement('style');
    estilo.textContent = ESTILOS_EDICION;
    sombra.append(estilo);
    for (const el of sombra.querySelectorAll<HTMLElement>('[data-bloque]')) {
      const b = actual.bloques.find((x) => x.id === el.dataset.bloque) ?? (actual as PantallaConExtras).extras?.find((x) => x.id === el.dataset.bloque);
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
      if (r && r === k.target && k.key === 'Delete' && (actual as PantallaConExtras).extras?.some((x) => x.id === r.dataset.bloque)) {
        k.preventDefault();
        void quitarRef.current(actual, r.dataset.bloque!);
        return;
      }
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
      if (reproductor.current === r) reproductor.current = null;
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
  const extras = (actual as PantallaConExtras).extras ?? [];
  // HU-0608 · Pistas de la línea de tiempo, con la voz en español (SUP-47).
  const narracion = (actual as unknown as Pantalla).narracion;
  const vozEs = narracion?.porIdioma?.es;
  const marcas = vozEs?.duracionMs ? marcasPalabra(narracion?.texto.es ?? '', vozEs.duracionMs) : [];
  const vtt = vozEs?.subtitulosId ? curso.subtitulos?.[vozEs.subtitulosId] : undefined;
  const subtitulosLinea = vtt ? tramosSubtitulos(leerVtt(vtt)) : [];
  const conPersonaje = actual.bloques.some((b) => b.tipo === 'personaje') || extras.some((e) => e.tipo === 'personaje');
  const bocaLinea = conPersonaje && vozEs?.bocas?.length ? tramosBoca(vozEs.bocas, vozEs.duracionMs ?? 0) : null;
  const capas = capasDe(actual as PantallaConExtras);
  // HU-0610 · Disparadores de la pantalla y lo que pueden elegir: sus elementos y las otras pantallas.
  const disparadores = (actual as PantallaConExtras & { disparadores?: Disparador[] }).disparadores ?? [];
  const opcionesElemento = capas.map((c) => ({ id: c.id, nombre: c.nombre, oculto: c.oculto }));
  const opcionesPantalla = pantallas.flatMap((p, i) => (p.id === actual.id ? [] : [{ id: p.id, nombre: `${i + 1}. ${p.titulo.es ?? p.titulo.en ?? p.id}` }]));
  const tiempos = new Map(tiemposDe(actual as unknown as Pantalla).map((x) => [x.id, x]));
  const propuesta = sincro?.pantallaId === actual.id ? sincro : null;
  const barras = capas.map((c) => {
    const t = tiempos.get(c.id);
    const nuevo = propuesta?.tiempos[c.id];
    const largoBarra = t?.finS != null ? t.finS - t.inicioS : null;
    // Con la propuesta a la vista, la barra se ve donde quedaría (la salida se corre con la entrada, como al arrastrar).
    const inicioS = nuevo ? nuevo.retardoS : (t?.inicioS ?? 0);
    return {
      id: c.id, nombre: c.nombre, inicioS, finS: nuevo && largoBarra !== null ? Math.round((inicioS + largoBarra) * 100) / 100 : (t?.finS ?? null), oculto: c.oculto,
      revisar: revisar.has(`${actual.id}:${c.id}`), propuesta: Boolean(nuevo),
    };
  });
  const duracion = duracionDe(actual as unknown as Pantalla, 'es');
  const cambiarTiempo = (id: string, c: CambioTiempo) => {
    const previo = (actual as PantallaConAjustes).ajustes?.[id];
    void enviar(actual, { ajustes: { [id]: ajusteCon(previo, c) } }, 'Tiempo guardado.');
  };
  /** CP-068 · Calcula la propuesta (no guarda nada hasta Aplicar). */
  const sincronizar = () => {
    detenerTiempo();
    setSincro({ pantallaId: actual.id, ...sincronizarConVoz({ bloques: actual.bloques as Parameters<typeof sincronizarConVoz>[0]['bloques'], extras: extras as Parameters<typeof sincronizarConVoz>[0]['extras'] }, marcas) });
  };
  /** Aplica la propuesta en un solo cambio: queda en el historial y Ctrl+Z la deshace. */
  const aplicarSincronizacion = async () => {
    if (!propuesta) return;
    const ajustes: Record<string, AjusteElemento | null> = {};
    for (const [id, t] of Object.entries(propuesta.tiempos)) {
      const previo = (actual as PantallaConAjustes).ajustes?.[id];
      const tiempo = tiempos.get(id);
      const largoBarra = tiempo?.finS != null && previo?.finS !== undefined ? tiempo.finS - tiempo.inicioS : null;
      const cambio = { retardoS: t.retardoS, anclaPalabra: t.anclaPalabra, ...(largoBarra !== null ? { finS: Math.round((t.retardoS + largoBarra) * 100) / 100 } : {}) };
      if (previo?.retardoS === cambio.retardoS && previo?.anclaPalabra === cambio.anclaPalabra) continue;
      ajustes[id] = ajusteCon(previo, cambio);
    }
    setSincro(null);
    if (!Object.keys(ajustes).length) {
      setAviso('Los tiempos ya estaban sincronizados con la voz.');
      return;
    }
    await enviar(actual, { ajustes }, 'Tiempos sincronizados con la voz · revisa con ▶ Reproducir.');
  };
  const bloqueElegido = elegidoId ? actual.bloques.find((b) => b.id === elegidoId) : undefined;
  const extraElegido = elegidoId ? extras.find((e) => e.id === elegidoId) : undefined;
  const bloque = bloqueElegido ?? extraElegido;
  const ajuste = bloque ? (actual as PantallaConAjustes).ajustes?.[bloque.id] : undefined;
  const control = bloque ? controlesDe(bloque.tipo) : null;
  const tamano = control?.tamano === 'escala' ? (ajuste?.escala ?? 1) : (ajuste?.tamanoCqw ?? elegido?.tamanoVisto ?? 2);
  const datosElegido = bloque
    ? { nombre: extraElegido ? nombreExtra(extraElegido) : nombreElemento(bloqueElegido!), tipo: bloque.tipo, ajuste, tamano, extra: extraElegido ?? null }
    : null;
  /** El tamaño que se ve de un elemento, en % del ancho, para que A−/A+ partan de ahí (como al elegirlo con un clic). */
  const tamanoVistoDe = (id: string) => {
    const sombra = lienzo.current?.shadowRoot;
    const el = sombra?.querySelector<HTMLElement>(`[data-bloque="${CSS.escape(id)}"]`);
    const ancho = sombra?.querySelector<HTMLElement>('.ap-r')?.clientWidth || 1;
    return el ? Math.round((parseFloat(getComputedStyle(el).fontSize) / ancho) * 1000) / 10 : 2;
  };
  const elegirCapa = (id: string) => setElegido({ pantallaId: actual.id, bloqueId: id, tamanoVisto: tamanoVistoDe(id) });
  /** HU-0606 · Agrega un elemento: aparece elegido y en modo Libre, listo para mover (CP-061). */
  const agregar = async (tipo: TipoExtra) => {
    const personajeId = pantallas.flatMap((p) => p.bloques).find((b) => b.tipo === 'personaje') as { recursoId?: string } | undefined;
    const nuevo = extraNuevo(tipo, actual as PantallaConExtras, personajeId?.recursoId);
    const nombre = TIPOS_EXTRA.find(([t]) => t === tipo)![1];
    reenfocar.current = nuevo.id;
    if (await enviar(actual, { extras: [...extras, nuevo] }, `${nombre} agregado: arrástralo donde quieras.`)) {
      setModo('libre');
      setElegido({ pantallaId: actual.id, bloqueId: nuevo.id, tamanoVisto: 2 });
    }
  };
  const alternarOculto = (id: string) => {
    const previo = (actual as PantallaConAjustes).ajustes?.[id];
    const ocultar = previo?.oculto !== true;
    void enviar(actual, { ajustes: { [id]: ajusteCon(previo, { oculto: ocultar ? true : undefined }) } }, ocultar ? 'Elemento oculto: se puede mostrar desde Capas.' : 'Elemento visible.');
  };
  /** Cambia un dato del extra elegido (la imagen, su texto alternativo o lo que hace el botón). */
  const cambiarExtra = (cambio: Partial<Pick<NonNullable<typeof extraElegido>, 'recursoId' | 'texto' | 'alClic'>>) => {
    if (!extraElegido) return;
    const lista = extras.map((e) => {
      if (e.id !== extraElegido.id) return e;
      const nuevo = { ...e, ...cambio };
      if (!nuevo.recursoId) delete nuevo.recursoId;
      return nuevo;
    });
    void enviar(actual, { extras: lista }, 'Cambio guardado.');
  };
  const imagenes = ((documento?.recursos ?? []) as { id: string; tipo: string; nombre: string }[]).filter((r) => r.tipo === 'imagen');
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
    alOcultar: () => {
      if (bloque) alternarOculto(bloque.id);
    },
    alEliminar: () => {
      if (extraElegido) void quitar(actual, extraElegido.id);
    },
  };
  /** HU-0605 · Aplica otro diseño; se deshace con el historial (HU-0607), que devuelve también sus ajustes. */
  const cambiarDiseno = (disposicion: string) => {
    setElegido(null);
    void enviar(actual, { disposicion }, `Diseño aplicado: ${nombreDiseno(disposicion)}. Ctrl+Z lo deshace.`);
  };
  const guardando = ocupado || guardado === 'guardando';
  const irA = (id: string) => navegar(`/proyectos/${proyectoId}/editor?pantalla=${id}`);
  return (
    <div className="editor">
      <div className="editor-barra">
        {volver}
        <div className="editor-historial" role="group" aria-label="Deshacer y rehacer">
          <button type="button" className="boton" aria-label="Deshacer" title="Deshacer (Ctrl+Z)"
            disabled={!historial.deshacer.length || ocupado || escribiendo} onClick={() => paso('deshacer')}>↶ Deshacer</button>
          <button type="button" className="boton" aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z o Ctrl+Y)"
            disabled={!historial.rehacer.length || ocupado || escribiendo} onClick={() => paso('rehacer')}>↷</button>
        </div>
        <span className="num sec">{String(indice + 1).padStart(2, '0')} / {pantallas.length}</span>
        <h1>{actual.titulo.es ?? actual.titulo.en}</h1>
        <span className="sec editor-guardado" aria-live="polite">{guardando ? 'Guardando…' : guardado === 'guardado' ? '✓ Guardado' : ''}</span>
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
        </div>
      ) : null}
      <div className="editor-cuerpo">
        <div ref={panelDisenos} className="editor-col-disenos" tabIndex={-1}>
          <PanelIzquierdo pestana={pestana} alCambiarPestana={setPestana} capas={capas} elegidoId={elegidoId} ocupado={ocupado}
            alAgregar={(t) => void agregar(t)} alElegirCapa={elegirCapa} alAlternarOculto={alternarOculto}
            disenos={<PanelDisenos documento={documento!} pantalla={actual} kit={kit} ocupado={ocupado} alElegir={cambiarDiseno} />} />
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
          imagenes={imagenes} alCambiarExtra={cambiarExtra}
          avanzado={<PanelDisparadores key={actual.id} pantalla={actual as PantallaConExtras} lista={disparadores} elementos={opcionesElemento} pantallas={opcionesPantalla} editan={editan}
            alGuardar={(lista) => enviar(actual, { disparadores: lista }, lista.length ? 'Disparadores guardados.' : 'Disparadores quitados.')} />}
          tiempo={bloque && tiempos.get(bloque.id) ? {
            inicioS: tiempos.get(bloque.id)!.inicioS, finS: tiempos.get(bloque.id)!.finS, anclaPalabra: ajuste?.anclaPalabra, palabras: marcas,
            alCambiar: (c) => cambiarTiempo(bloque.id, c),
          } : null}
          diseno={nombreDiseno(actual.disposicion)} alCambiarDiseno={() => {
            setPestana('disenos');
            setTimeout(() => {
              panelDisenos.current?.scrollIntoView({ block: 'nearest' });
              panelDisenos.current?.querySelector<HTMLButtonElement>('.editor-diseno:not([disabled])')?.focus();
            }, 0);
          }} />
      </div>
      {conLinea ? (
        <LineaTiempo key={actual.id} barras={barras} disparos={marcasDisparo(disparadores, opcionesElemento, opcionesPantalla)} marcas={marcas} subtitulos={subtitulosLinea} boca={bocaLinea} vozS={(vozEs?.duracionMs ?? 0) / 1000}
          duracion={duracion} tiempo={tiempo} reproduciendo={reproduciendo} elegidoId={elegidoId} ocupado={ocupado}
          alIr={irTiempo} alReproducir={reproducirTiempo} alPausar={pausarTiempo} alDetener={detenerTiempo} alCambiar={cambiarTiempo}
          alElegir={elegirCapa} alAlternarOculto={alternarOculto} alOcultar={() => { detenerTiempo(); setConLinea(false); }}
          sincronizacion={propuesta ? { encontrados: propuesta.encontrados, total: propuesta.total } : null}
          alSincronizar={sincronizar} alAplicarSincronizacion={() => void aplicarSincronizacion()} alDescartarSincronizacion={() => setSincro(null)} />
      ) : (
        <section className="tarjeta linea-tiempo linea-tiempo-plegada" aria-label="Línea de tiempo">
          <b>Línea de tiempo</b>
          <span className="sec">Voz, subtítulos, boca y cuándo aparece cada elemento</span>
          <button type="button" className="boton" onClick={() => setConLinea(true)}>Mostrar</button>
        </section>
      )}
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
