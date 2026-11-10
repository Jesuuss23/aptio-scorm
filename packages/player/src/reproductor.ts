// HU-1101 · Reproductor único: el mismo código dibuja la vista previa del editor y el paquete exportado (decisión 3).
// Se monta en un Shadow DOM propio para que los estilos de la página que lo contiene (el editor o el LMS) no lo cambien.
// HU-1102 · Patrón Clásico: barra con temario y avance, la pantalla y un pie con Anterior, contador y Siguiente. Con
// «actividades obligatorias», Siguiente se deshabilita y dice por qué (RN-11-4, CP-086).
// HU-0702 · Narración con boca sincronizada: «Escuchar narración» reproduce el audio de la pantalla y el personaje mueve
// la boca según sus marcas (CP-072). Con «Siguiente se habilita al terminar la narración», se avanza al terminarla.
// HU-0801 · Subtítulos: con «CC», mientras suena el audio se ve la frase del WebVTT que se está diciendo; en pausa o
// sin audio, el texto completo de la narración. La preferencia se recuerda en el navegador (SUP-37).
import { animarBoca, mostrarBoca, parpadear } from './boca.ts';
import { h, vaciar } from './dom.ts';
import { ACTIVIDADES, type ContextoActividad } from './interacciones/index.ts';
import { aplanar, type Motivo, modoDe, motivoBloqueo } from './navegacion.ts';
import { dibujarPantalla } from './pantalla.ts';
import { type Cue, cueEn, leerVtt } from './subtitulos.ts';
import { type EstadoSeguimiento, seguimiento } from './seguimiento.ts';
import { ESTILOS } from './estilos.ts';
import { t, textos } from './textos.ts';
import type { AudioNarracion, BloqueInteraccion, CursoReproductor, Idioma, KitReproductor, ModoNavegacion, Pantalla, ResultadoActividad, RolColor } from './tipos.ts';

/** Estilo base (el mismo de KIT_INICIAL en @aptio/schema/marca) más blanco y alerta. */
export const PALETA_BASE: Record<RolColor, string> = {
  primario: '#12355B', secundario: '#2E7D6B', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033', blanco: '#FFFFFF', alerta: '#B42318',
};

/** Lo que se ve por defecto en el patrón Clásico si el curso no dice otra cosa. */
const MOSTRAR_BASE = ['temario', 'progreso', 'contador', 'botones'];

export interface OpcionesReproductor {
  idioma?: Idioma;
  kit?: KitReproductor;
  /** URL de un recurso del curso (imagen, personaje, video). Sin URL se dibuja un marco con su texto alternativo. */
  urlRecurso?: (id: string) => string | undefined;
  /** El SVG del personaje como texto; por defecto se descarga de `urlRecurso`. */
  cargarSvg?: (id: string) => Promise<string | undefined>;
  /** El WebVTT de una narración como texto (HU-0801); por defecto se descarga de `urlRecurso`. */
  cargarSubtitulos?: (id: string) => Promise<string | undefined>;
  /** Modo revisión: se puede ir a cualquier pantalla y se ven los identificadores. */
  revision?: boolean;
  /** Id de la pantalla con la que empieza. */
  inicio?: string;
  /** false: solo la pantalla, sin barra ni botones (la usa la revisión para mostrar una pantalla a la vez). */
  marco?: boolean;
  alCambiar?: (estado: EstadoReproductor) => void;
}

export interface EstadoReproductor extends EstadoSeguimiento {
  pantallaId: string;
  indice: number;
  total: number;
  puedeSiguiente: boolean;
  motivo: string | null;
  /** Patrón pedido por el curso y el que se está usando (por ahora siempre clásico). */
  patron: string;
  patronAplicado: 'clasico';
  modo: ModoNavegacion;
  /** Actividades hechas, por id de pantalla. */
  resultados: Record<string, ResultadoActividad>;
}

export interface Reproductor {
  ir(destino: string | number): boolean;
  siguiente(): boolean;
  anterior(): boolean;
  reiniciar(): void;
  estado(): EstadoReproductor;
  destruir(): void;
}

export function montar(contenedor: HTMLElement, curso: CursoReproductor, opciones: OpcionesReproductor = {}): Reproductor {
  const sombra = contenedor.shadowRoot ?? contenedor.attachShadow({ mode: 'open' });
  const idioma: Idioma = opciones.idioma ?? curso.idiomas[0] ?? 'es';
  const tx = textos(idioma);
  const revision = opciones.revision === true;
  const paleta = { ...PALETA_BASE, ...opciones.kit?.paleta };
  const urlRecurso = opciones.urlRecurso ?? (() => undefined);
  const pantallas = aplanar(curso);
  const modo: ModoNavegacion = revision ? 'libre' : modoDe(curso);
  const mostrar = new Set(curso.navegacion?.mostrar?.length ? [...curso.navegacion.mostrar, 'botones'] : MOSTRAR_BASE);
  const conMarco = opciones.marco !== false;
  const atajos = conMarco && curso.navegacion?.atajosTeclado !== false;
  const mejor = curso.seguimiento.notaReportada !== 'ultima';

  let actual = 0;
  let maxima = 0;
  let vivo = true;
  let temarioAbierto = false;
  let conSubtitulos = preferenciaSubtitulos();
  const vistas = new Set<string>();
  const resultados = new Map<string, ResultadoActividad>();
  const dibujadas = new Map<string, HTMLElement>();
  /** Pantallas cuya narración se escuchó hasta el final. */
  const escuchadas = new Set<string>();

  // ---------- Narración y personaje (HU-0702) ----------
  const svgs = new Map<string, Promise<string | undefined>>();
  const cargarSvg = opciones.cargarSvg ?? ((id: string) => {
    if (!svgs.has(id)) {
      const url = urlRecurso(id);
      svgs.set(id, url ? fetch(url).then((r) => (r.ok ? r.text() : undefined), () => undefined) : Promise.resolve(undefined));
    }
    return svgs.get(id)!;
  });
  // ---------- Subtítulos (HU-0801) ----------
  const vtts = new Map<string, Promise<Cue[]>>();
  const cargarVtt = (id: string) => {
    if (!vtts.has(id)) {
      const texto = opciones.cargarSubtitulos
        ? opciones.cargarSubtitulos(id)
        : (() => { const url = urlRecurso(id); return url ? fetch(url).then((r) => (r.ok ? r.text() : undefined), () => undefined) : Promise.resolve(undefined); })();
      vtts.set(id, texto.then((x) => (x ? leerVtt(x) : []), () => []));
    }
    return vtts.get(id)!;
  };
  let cues: Cue[] = [];
  let siguiendo = 0;
  /** Lo que dice «CC»: la frase del momento mientras suena; si no, el texto completo de la narración. */
  const textoSubtitulos = () => {
    const p = pantallas[actual]?.pantalla;
    if (!p?.narracion) return '';
    if (!audio.paused && !audio.ended && cues.length) return cueEn(cues, audio.currentTime * 1000)?.texto ?? '';
    return t(p.narracion.texto, idioma);
  };
  const seguirSubtitulos = () => {
    cancelAnimationFrame(siguiendo);
    const paso = () => {
      if (!vivo) return;
      if (conSubtitulos) {
        const x = textoSubtitulos();
        if (subtitulos.textContent !== x) subtitulos.textContent = x;
      }
      if (!audio.paused && !audio.ended) siguiendo = requestAnimationFrame(paso);
    };
    paso();
  };
  const audioDe = (i: number): AudioNarracion | undefined => pantallas[i]?.pantalla.narracion?.porIdioma?.[idioma];
  const urlAudio = (i: number) => {
    const id = audioDe(i)?.recursoAudioId;
    return id ? urlRecurso(id) : undefined;
  };
  const pideNarracion = !revision && curso.navegacion?.siguienteSeHabilita === 'narracion';
  const audio = h('audio', { preload: 'auto' }) as HTMLAudioElement;
  const personaje = () => escena.querySelector('.ap-personaje svg:not(.ap-silueta)');
  const botonNarracion = h('button', { type: 'button', class: 'ap-boton', 'aria-pressed': 'false', onclick: () => (audio.paused ? void audio.play().catch(() => undefined) : audio.pause()) }, tx.escuchar);
  const barraNarracion = h('div', { class: 'ap-narracion', hidden: true }, botonNarracion);
  let detenerBoca: (() => void) | null = null;
  const callar = () => {
    detenerBoca?.();
    detenerBoca = null;
    const svg = personaje();
    if (svg) mostrarBoca(svg, 'X');
  };
  audio.addEventListener('play', () => {
    callar();
    detenerBoca = animarBoca(personaje, { ms: () => audio.currentTime * 1000, sonando: () => !audio.paused && !audio.ended }, () => audioDe(actual)?.bocas);
    refrescar();
    seguirSubtitulos();
  });
  audio.addEventListener('pause', () => { callar(); refrescar(); });
  audio.addEventListener('ended', () => {
    const p = pantallas[actual]?.pantalla;
    if (p) escuchadas.add(p.id);
    callar();
    refrescar();
  });
  const cargarNarracion = () => {
    callar();
    audio.pause();
    const url = urlAudio(actual);
    if (url) {
      if (audio.getAttribute('src') !== url) audio.src = url;
      audio.currentTime = 0;
    } else audio.removeAttribute('src');
    barraNarracion.hidden = !url;
    cues = [];
    const vttId = audioDe(actual)?.subtitulosId;
    const indice = actual;
    if (vttId) void cargarVtt(vttId).then((c) => { if (indice === actual) cues = c; });
  };

  const avance = () => {
    const p = pantallas[actual]?.pantalla;
    return { actual, maxima, resultados, narracionPendiente: pideNarracion && Boolean(p && urlAudio(actual)) && !escuchadas.has(p!.id) };
  };
  const textoMotivo = (m: Motivo | null) => (m === 'actividad' ? tx.motivoActividad : m === 'orden' ? tx.motivoOrden : m === 'narracion' ? tx.motivoNarracion : null);

  // ---------- Estructura del patrón Clásico ----------
  const variables = [
    ...Object.entries(paleta).map(([rol, color]) => `--ap-${rol}:${color}`),
    `--ap-f-titulos:${JSON.stringify(opciones.kit?.tipografias?.titulos ?? 'Barlow Condensed')}`,
    `--ap-f-textos:${JSON.stringify(opciones.kit?.tipografias?.textos ?? 'Atkinson Hyperlegible')}`,
  ].join(';');
  const titulo = t(curso.metadatos.titulo, idioma);
  const barraAvance = h('div', { class: 'ap-avance', role: 'progressbar', 'aria-label': tx.progreso, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i'));
  const porcentaje = h('span', { class: 'ap-porcentaje' });
  const botonTemario = h('button', { type: 'button', class: 'ap-boton-barra', 'aria-expanded': 'false', onclick: () => { temarioAbierto = !temarioAbierto; refrescar(); } }, h('span', { 'aria-hidden': 'true' }, '☰ '), tx.temario);
  const botonSubtitulos = h('button', { type: 'button', class: 'ap-boton-barra', 'aria-pressed': 'false', onclick: () => { conSubtitulos = !conSubtitulos; recordarSubtitulos(conSubtitulos); refrescar(); } }, 'CC', h('span', { class: 'ap-oculto' }, ` ${tx.subtitulos}`));
  const temario = h('nav', { class: 'ap-temario', 'aria-label': tx.temario, hidden: true });
  const escena = h('div', { class: 'ap-escena' });
  const subtitulos = h('p', { class: 'ap-subtitulos', hidden: true });
  const anterior = h('button', { type: 'button', class: 'ap-nav', onclick: () => irA(actual - 1, true) }, h('span', { 'aria-hidden': 'true' }, '◀ '), tx.anterior);
  const siguiente = h('button', { type: 'button', class: 'ap-nav ap-primario', 'aria-describedby': 'ap-motivo', onclick: () => irA(actual + 1, true) }, tx.siguiente, h('span', { 'aria-hidden': 'true' }, ' ▶'));
  const contador = h('span', { class: 'ap-contador' });
  const motivo = h('span', { class: 'ap-motivo', id: 'ap-motivo', role: 'status' });

  const raiz = h('div', { class: conMarco ? 'ap-r' : 'ap-r ap-sin-marco', lang: idioma, style: variables, 'data-patron': 'clasico', 'data-modo': modo },
    h('header', { class: 'ap-barra' },
      mostrar.has('temario') ? botonTemario : null,
      h('span', { class: 'ap-titulo-curso' }, titulo),
      mostrar.has('progreso') ? [barraAvance, porcentaje] : h('span', { class: 'ap-espacio' }),
      botonSubtitulos),
    h('div', { class: 'ap-cuerpo' }, temario, escena),
    barraNarracion,
    audio,
    subtitulos,
    h('footer', { class: 'ap-pie' }, anterior, h('span', { class: 'ap-centro' }, mostrar.has('contador') ? contador : null, motivo), siguiente));

  if (atajos) {
    raiz.addEventListener('keydown', (e) => {
      const destino = e.target as HTMLElement;
      if (destino.closest('.ap-actividad, .ap-temario') || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'ArrowRight') irA(actual + 1, true);
      else if (e.key === 'ArrowLeft') irA(actual - 1, true);
    });
  }
  vaciar(sombra, h('style', {}, ESTILOS), raiz);
  const dejarDeParpadear = parpadear(personaje);

  // ---------- Actividades ----------
  const crearActividad = (b: BloqueInteraccion, p: Pantalla): HTMLElement => {
    const anuncio = h('p', { class: 'ap-oculto', 'aria-live': 'polite' });
    const ctx: ContextoActividad = {
      id: p.id, idioma, tx, modo: b.interaccion.modo,
      intentosMaximos: curso.seguimiento.intentosMaximos ?? null,
      urlRecurso,
      anunciar: (texto) => { anuncio.textContent = texto; },
      activo: () => vivo,
      terminar: (r) => {
        const previo = resultados.get(p.id);
        const puntaje = mejor && previo?.puntaje != null && r.puntaje !== null ? Math.max(previo.puntaje, r.puntaje) : r.puntaje;
        resultados.set(p.id, { completada: r.completada || Boolean(previo?.completada), puntaje });
        refrescar();
      },
    };
    const crear = ACTIVIDADES[b.interaccion.tipo];
    return h('div', { class: 'ap-juego' }, crear ? crear(b.interaccion.datos, ctx) : null, anuncio);
  };

  const pantallaDe = (i: number): HTMLElement => {
    const p = pantallas[i]!.pantalla;
    let el = dibujadas.get(p.id);
    if (!el) {
      el = dibujarPantalla(p, { idioma, tx, paleta, urlRecurso, revision, actividad: crearActividad, cargarSvg });
      dibujadas.set(p.id, el);
    }
    return el;
  };

  // ---------- Estado y refresco ----------
  const estado = (): EstadoReproductor => {
    const m = motivoBloqueo(pantallas, avance(), modo, actual + 1);
    const ultima = actual === pantallas.length - 1;
    return {
      ...seguimiento(pantallas, vistas, resultados, curso.seguimiento),
      pantallaId: pantallas[actual]?.pantalla.id ?? '', indice: actual, total: pantallas.length,
      puedeSiguiente: !ultima && m === null, motivo: ultima ? null : textoMotivo(m),
      patron: curso.navegacion?.patron ?? 'clasico', patronAplicado: 'clasico', modo,
      resultados: Object.fromEntries(resultados),
    };
  };

  function refrescar() {
    if (!vivo) return;
    const e = estado();
    barraAvance.setAttribute('aria-valuenow', String(e.progreso));
    (barraAvance.firstChild as HTMLElement).style.width = `${e.progreso}%`;
    porcentaje.textContent = `${e.progreso} %`;
    contador.textContent = tx.pantalla(actual + 1, pantallas.length);
    motivo.textContent = e.motivo ?? '';
    anterior.disabled = actual === 0;
    siguiente.disabled = !e.puedeSiguiente;
    siguiente.title = e.motivo ?? '';
    const sonando = !audio.paused && !audio.ended;
    botonNarracion.setAttribute('aria-pressed', String(sonando));
    botonNarracion.textContent = sonando ? tx.pausar : tx.escuchar;
    botonSubtitulos.setAttribute('aria-pressed', String(conSubtitulos));
    subtitulos.hidden = !conSubtitulos;
    subtitulos.textContent = textoSubtitulos();
    botonTemario.setAttribute('aria-expanded', String(temarioAbierto));
    temario.hidden = !temarioAbierto;
    if (temarioAbierto) dibujarTemario();
    opciones.alCambiar?.(e);
  }

  function dibujarTemario() {
    const grupos = curso.modulos.map((m) => h('div', { class: 'ap-modulo' },
      h('p', { class: 'ap-modulo-titulo' }, t(m.titulo, idioma)),
      h('ol', {}, pantallas.filter((x) => x.moduloId === m.id).map((x) => {
        const bloqueo = motivoBloqueo(pantallas, avance(), modo, x.indice);
        const hecha = vistas.has(x.pantalla.id) && (!x.conActividad || resultados.get(x.pantalla.id)?.completada);
        const nombre = t(x.pantalla.titulo, idioma);
        return h('li', {}, h('button', {
          type: 'button', class: x.indice === actual ? 'ap-entrada ap-actual' : 'ap-entrada', disabled: bloqueo !== null,
          'aria-current': x.indice === actual ? 'step' : null,
          'aria-label': `${x.indice + 1}. ${nombre}${hecha ? `, ${tx.hecha}` : bloqueo ? `, ${tx.bloqueada}` : ''}`,
          onclick: () => { temarioAbierto = false; irA(x.indice, true); },
        }, h('span', { class: 'ap-estado', 'aria-hidden': 'true' }, hecha ? '✓' : bloqueo ? '🔒' : String(x.indice + 1).padStart(2, '0')), nombre));
      }))));
    vaciar(temario, h('div', { class: 'ap-temario-cabeza' }, h('b', {}, tx.temario), h('button', { type: 'button', class: 'ap-boton', onclick: () => { temarioAbierto = false; refrescar(); botonTemario.focus(); } }, tx.cerrar)), ...grupos);
  }

  function irA(destino: number, enfocar: boolean): boolean {
    if (!vivo || destino === actual || motivoBloqueo(pantallas, avance(), modo, destino) !== null) {
      if (destino === actual) refrescar();
      return false;
    }
    actual = destino;
    maxima = Math.max(maxima, destino);
    vistas.add(pantallas[destino]!.pantalla.id);
    vaciar(escena, pantallaDe(destino));
    cargarNarracion();
    refrescar();
    if (enfocar) escena.querySelector<HTMLElement>('.ap-titulo-pantalla')?.focus();
    return true;
  }

  const reiniciar = (inicio = 0) => {
    actual = inicio;
    maxima = inicio;
    vistas.clear();
    resultados.clear();
    dibujadas.clear();
    escuchadas.clear();
    temarioAbierto = false;
    if (pantallas[inicio]) {
      vistas.add(pantallas[inicio].pantalla.id);
      vaciar(escena, pantallaDe(inicio));
    }
    cargarNarracion();
    refrescar();
  };
  const indiceDe = (d: string | number) => (typeof d === 'number' ? d : pantallas.findIndex((x) => x.pantalla.id === d));

  // En modo revisión se puede empezar en cualquier pantalla; como participante, siempre desde la primera.
  reiniciar(revision && opciones.inicio ? Math.max(0, indiceDe(opciones.inicio)) : 0);

  return {
    ir: (d) => irA(indiceDe(d), false),
    siguiente: () => irA(actual + 1, false),
    anterior: () => irA(actual - 1, false),
    reiniciar: () => reiniciar(0),
    estado,
    destruir: () => {
      vivo = false;
      cancelAnimationFrame(siguiendo);
      callar();
      audio.pause();
      dejarDeParpadear();
      sombra.replaceChildren();
    },
  };
}

// HU-0801 · La preferencia de subtítulos vive en el navegador del participante. Dentro de un LMS el almacenamiento puede
// estar bloqueado: entonces empieza sin subtítulos y no se recuerda.
const CLAVE_SUBTITULOS = 'aptio-subtitulos';
function preferenciaSubtitulos(): boolean {
  try {
    return globalThis.localStorage?.getItem(CLAVE_SUBTITULOS) === '1';
  } catch {
    return false;
  }
}
function recordarSubtitulos(si: boolean) {
  try {
    globalThis.localStorage?.setItem(CLAVE_SUBTITULOS, si ? '1' : '0');
  } catch {
    // Sin almacenamiento, la preferencia dura lo que dure la página.
  }
}
