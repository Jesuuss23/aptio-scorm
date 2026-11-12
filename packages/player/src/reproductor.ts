// HU-1101 · Reproductor único: el mismo código dibuja la vista previa del editor y el paquete exportado (decisión 3).
// Se monta en un Shadow DOM propio para que los estilos de la página que lo contiene (el editor o el LMS) no lo cambien.
// HU-1102 · Patrón Clásico: barra con temario y avance, la pantalla y un pie con Anterior, contador y Siguiente. Con
// «actividades obligatorias», Siguiente se deshabilita y dice por qué (RN-11-4, CP-086).
// HU-0702 · Narración con boca sincronizada: «Escuchar narración» reproduce el audio de la pantalla y el personaje mueve
// la boca según sus marcas (CP-072). Con «Siguiente se habilita al terminar la narración», se avanza al terminarla.
// HU-0801 · Subtítulos: con «CC», mientras suena el audio se ve la frase del WebVTT que se está diciendo; en pausa o
// sin audio, el texto completo de la narración. La preferencia se recuerda en el navegador (SUP-37).
// HU-0608 · Línea de tiempo: cada elemento aparece en su `retardoS` y sale en su `finS`; sin tiempo, entra escalonado de
// a 0,3 s (RN-06-9). El reloj de la pantalla es el audio de la narración si está sonando (o ya sonó) y, si no, el tiempo
// desde que se mostró. El editor monta con `sinTiempos` (todo a la vista) y mueve la aguja con `irA`, `reproducir`,
// `pausar` y `verTodo`: en ese segundo se ven solo los elementos activos, con la boca y el subtítulo de ese instante.
// HU-0804 · Bilingüe (RN-08-4, CP-079): si el curso trae español e inglés, la barra suma el botón de idioma. Cambiar de
// idioma vuelve a montar el reproductor en la misma pantalla con lo visto, los resultados y los puntos (como la
// reanudación de la HU-1105); una actividad a medio hacer vuelve a empezar. El foco queda en el botón de idioma.
// HU-1103 · Patrones de navegación (RN-11-1, RN-11-2): el mismo núcleo (reglas de avance, seguimiento, reanudación y
// teclado) con 7 marcos. Clásico; Historias (segmentos arriba, zonas ‹ › a los lados, deslizar y flechas, sin pie);
// Vertical («↑ Volver» y «Continuar ↓»); Mapa de misiones y Menú de temas (se elige una estación o un tema y «← Mapa» o
// «← Temas» vuelve); Ramificado (marco clásico sin temario: las ramas están dentro de cada decisión); Inmersivo (sin
// barras, con marcador y botones flotantes). El personalizado usa su patrón base. Siguiente bloqueado dice por qué.
import { colorLegible } from './contraste.ts';
import { abrirCreditos } from './creditos.ts';
import { animarBoca, bocaEn, mostrarBoca, parpadear } from './boca.ts';
import { h, vaciar } from './dom.ts';
import { ACTIVIDADES, type ContextoActividad } from './interacciones/index.ts';
import { pieResultado } from './interacciones/comun.ts';
import { aplanar, type Motivo, modoDe, motivoBloqueo } from './navegacion.ts';
import { conMapa, entradaEstacion, estaciones, estadoEstacion, type PatronBase, patronDe } from './patrones.ts';
import { dibujarPantalla } from './pantalla.ts';
import { type Cue, cueEn, leerVtt } from './subtitulos.ts';
import { type EstadoSeguimiento, seguimiento } from './seguimiento.ts';
import { ESTILOS } from './estilos.ts';
import { estadoReanudado, type Reanudacion } from './reanudacion.ts';
import { activoEn, duracionDe, tiemposDe, ultimoCambio } from './tiempos.ts';
import { t, textos } from './textos.ts';
import type { AudioNarracion, BloqueInteraccion, Creditos, CursoReproductor, Idioma, KitReproductor, ModoNavegacion, Pantalla, ResultadoActividad, RolColor } from './tipos.ts';

/** Estilo base (el mismo de KIT_INICIAL en @aptio/schema/marca) más blanco y alerta. */
export const PALETA_BASE: Record<RolColor, string> = {
  primario: '#12355B', secundario: '#2E7D6B', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033', blanco: '#FFFFFF', alerta: '#B42318',
};

/** HU-1103 · Distancia mínima (px) para que deslizar en Historias cuente como pasar de pantalla. */
const UMBRAL_DESLIZAR = 50;

/** Lo que se ve por defecto en el patrón Clásico si el curso no dice otra cosa. */
const MOSTRAR_BASE = ['temario', 'progreso', 'contador', 'botones'];

export interface OpcionesReproductor {
  idioma?: Idioma;
  /** HU-0804 · Idiomas que ofrece el botón de idioma; por defecto, los del curso. Con uno solo no hay botón. */
  idiomas?: Idioma[];
  /** HU-0804 · Se avisa después de cambiar de idioma, con el estado ya en el idioma nuevo. */
  alCambiarIdioma?: (idioma: Idioma, estado: EstadoReproductor) => void;
  kit?: KitReproductor;
  /** URL de un recurso del curso (imagen, personaje, video). Sin URL se dibuja un marco con su texto alternativo. */
  urlRecurso?: (id: string) => string | undefined;
  /** El SVG del personaje como texto; por defecto se descarga de `urlRecurso`. */
  cargarSvg?: (id: string) => Promise<string | undefined>;
  /** El WebVTT de una narración como texto (HU-0801); por defecto se descarga de `urlRecurso`. */
  cargarSubtitulos?: (id: string) => Promise<string | undefined>;
  /** HU-1406 · Créditos de IA del paquete: con ellos, la barra muestra «Créditos». */
  creditos?: Creditos;
  /** Modo revisión: se puede ir a cualquier pantalla y se ven los identificadores. */
  revision?: boolean;
  /** Id de la pantalla con la que empieza. */
  inicio?: string;
  /** false: solo la pantalla, sin barra ni botones (la usa la revisión para mostrar una pantalla a la vez). */
  marco?: boolean;
  /** HU-0606 · true en el editor: los botones agregados se eligen y se escriben, pero no navegan. */
  sinAcciones?: boolean;
  /** HU-0608 · true en el editor: se ve todo, sin reloj ni entrada escalonada, hasta que se mueve la aguja. */
  sinTiempos?: boolean;
  alCambiar?: (estado: EstadoReproductor) => void;
  /**
   * HU-1105 · Avance guardado con el que se vuelve al curso (no se usa en modo revisión). Con `preguntar`, antes de
   * mostrar la pantalla aparece «¿Continuar donde lo dejaste?» con Continuar (foco inicial) y Empezar de nuevo.
   */
  reanudar?: Reanudacion & { preguntar?: boolean };
  /** HU-1105 · Lo que eligió el participante (true: Continuar). Se avisa antes de mostrar la pantalla elegida. */
  alReanudar?: (continuar: boolean) => void;
}

export interface EstadoReproductor extends EstadoSeguimiento {
  pantallaId: string;
  indice: number;
  total: number;
  puedeSiguiente: boolean;
  motivo: string | null;
  /** Patrón pedido por el curso y el que se dibuja (HU-1103: el personalizado usa su base). */
  patron: string;
  patronAplicado: PatronBase;
  /** HU-1103 · En Mapa de misiones o Menú de temas, true mientras se ve el mapa (no una pantalla). */
  enMapa: boolean;
  modo: ModoNavegacion;
  /** Actividades hechas, por id de pantalla. */
  resultados: Record<string, ResultadoActividad>;
  /** HU-1202 · Pantallas vistas, en el orden del curso (el paquete las guarda en `suspend_data`). */
  vistas: string[];
}

export interface Reproductor {
  ir(destino: string | number): boolean;
  siguiente(): boolean;
  anterior(): boolean;
  reiniciar(): void;
  estado(): EstadoReproductor;
  /** HU-0608 · Deja la pantalla quieta en el segundo `s`: solo lo activo, con la boca y el subtítulo de ese instante. */
  irA(segundo: number): void;
  /** HU-0608 · Corre la pantalla desde `desde` (con la narración, si tiene) y avisa el segundo en cada cuadro. */
  reproducir(desde: number, alTiempo?: (segundo: number, terminado: boolean) => void): void;
  /** HU-0608 · Detiene la aguja donde está. */
  pausar(): void;
  /** HU-0608 · Vuelve a mostrar todo (■ en el editor). */
  verTodo(): void;
  /** HU-0608 · Duración de la pantalla actual en segundos (RN-06-7). */
  duracion(): number;
  destruir(): void;
}

/**
 * Monta el reproductor. Con español e inglés, el botón de idioma lo vuelve a montar en el otro idioma conservando el
 * avance; el objeto devuelto sigue sirviendo (siempre habla con el reproductor del idioma actual).
 */
export function montar(contenedor: HTMLElement, curso: CursoReproductor, opciones: OpcionesReproductor = {}): Reproductor {
  let r: Reproductor;
  const cambiar = (nuevo: Idioma) => {
    const e = r.estado();
    r.destruir();
    r = montarUno(contenedor, curso, {
      ...opciones, idioma: nuevo, inicio: e.pantallaId,
      reanudar: { pantallaId: e.pantallaId, vistas: e.vistas, resultados: e.resultados },
    }, cambiar);
    contenedor.shadowRoot?.querySelector<HTMLElement>('.ap-idioma')?.focus();
    opciones.alCambiarIdioma?.(nuevo, r.estado());
  };
  r = montarUno(contenedor, curso, opciones, cambiar);
  return {
    ir: (d) => r.ir(d),
    siguiente: () => r.siguiente(),
    anterior: () => r.anterior(),
    reiniciar: () => r.reiniciar(),
    estado: () => r.estado(),
    irA: (s) => r.irA(s),
    reproducir: (desde, alTiempo) => r.reproducir(desde, alTiempo),
    pausar: () => r.pausar(),
    verTodo: () => r.verTodo(),
    duracion: () => r.duracion(),
    destruir: () => r.destruir(),
  };
}

function montarUno(contenedor: HTMLElement, curso: CursoReproductor, opciones: OpcionesReproductor, cambiarIdioma: (idioma: Idioma) => void): Reproductor {
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
  const patron = patronDe(curso.navegacion);
  const esMapa = conMapa(patron) && conMarco;
  const tramos = esMapa ? estaciones(curso, pantallas) : [];
  /** Mapa de misiones o Menú de temas: true mientras se ve el mapa. */
  let enMapa = false;
  const atajos = conMarco && curso.navegacion?.atajosTeclado !== false;
  const mejor = curso.seguimiento.notaReportada !== 'ultima';

  let actual = 0;
  let maxima = 0;
  let vivo = true;
  let temarioAbierto = false;
  /** HU-1105 · true mientras se pregunta si se reanuda: no se puede navegar. */
  let pendiente = false;
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
    if (fijo !== null && cues.length) return cueEn(cues, fijo * 1000)?.texto ?? '';
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
    seguirReloj();
    callar();
    detenerBoca = animarBoca(personaje, { ms: () => audio.currentTime * 1000, sonando: () => !audio.paused && !audio.ended }, () => audioDe(actual)?.bocas);
    refrescar();
    seguirSubtitulos();
  });
  audio.addEventListener('pause', () => {
    callar();
    // Con la aguja quieta (editor), la boca queda en la de ese instante.
    if (fijo !== null && !enReproduccion) quieta(fijo);
    refrescar();
  });
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
    // En el editor la narración suena con ▶ Reproducir de la línea de tiempo.
    barraNarracion.hidden = !url || opciones.sinTiempos === true;
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
    // HU-1401 · Variantes legibles del kit (SUP-63): texto de aciertos y errores a 4,5:1 y foco a 3:1 sobre las superficies claras.
    `--ap-bien-texto:${colorLegible(paleta.secundario, [paleta.blanco, paleta.fondo])}`,
    `--ap-mal-texto:${colorLegible(paleta.alerta, [paleta.blanco, paleta.fondo])}`,
    `--ap-foco:${colorLegible(paleta.acento, [paleta.blanco, paleta.fondo], 3)}`,
    `--ap-f-titulos:${JSON.stringify(opciones.kit?.tipografias?.titulos ?? 'Barlow Condensed')}`,
    `--ap-f-textos:${JSON.stringify(opciones.kit?.tipografias?.textos ?? 'Atkinson Hyperlegible')}`,
  ].join(';');
  const titulo = t(curso.metadatos.titulo, idioma);
  const barraAvance = h('div', { class: 'ap-avance', role: 'progressbar', 'aria-label': tx.progreso, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i'));
  const porcentaje = h('span', { class: 'ap-porcentaje' });
  const botonTemario = h('button', { type: 'button', class: 'ap-boton-barra', 'aria-expanded': 'false', onclick: () => { temarioAbierto = !temarioAbierto; refrescar(); } }, h('span', { 'aria-hidden': 'true' }, '☰ '), tx.temario);
  const botonSubtitulos = h('button', { type: 'button', class: 'ap-boton-barra', 'aria-pressed': 'false', onclick: () => { conSubtitulos = !conSubtitulos; recordarSubtitulos(conSubtitulos); refrescar(); } }, 'CC', h('span', { class: 'ap-oculto' }, ` ${tx.subtitulos}`));
  // HU-1406 · Créditos de IA: solo si el paquete los trae (sin recursos de IA no hay botón).
  const botonCreditos: HTMLButtonElement | null = opciones.creditos && conMarco
    ? h('button', { type: 'button', class: 'ap-boton-barra', 'aria-haspopup': 'dialog', onclick: () => abrirCreditos({ raiz, sombra, creditos: opciones.creditos!, tx, volver: botonCreditos! }) }, tx.creditos)
    : null;
  // HU-0804 · Botón de idioma: muestra el otro idioma y lo dice completo para el lector de pantalla.
  const ofrecidos = opciones.idiomas ?? curso.idiomas;
  const otro: Idioma = idioma === 'es' ? 'en' : 'es';
  const botonIdioma = conMarco && ofrecidos.includes('es') && ofrecidos.includes('en')
    ? h('button', { type: 'button', class: 'ap-boton-barra ap-idioma', 'aria-label': tx.cambiarIdioma, 'data-idioma': idioma, onclick: () => { if (!pendiente) cambiarIdioma(otro); } }, otro.toUpperCase())
    : null;
  const temario = h('nav', { class: 'ap-temario', 'aria-label': tx.temario, hidden: true });
  const escena = h('div', { class: 'ap-escena' });
  const subtitulos = h('p', { class: 'ap-subtitulos', lang: idioma, hidden: true });
  // HU-1103 · Anterior y Siguiente cambian de forma con el patrón; el nombre accesible sigue siendo el mismo.
  const glifo = (x: string) => h('span', { 'aria-hidden': 'true' }, x);
  const oculto = (x: string) => h('span', { class: 'ap-oculto' }, x);
  const [claseAnterior, claseSiguiente, contenidoAnterior, contenidoSiguiente] =
    patron === 'historias' ? ['ap-zona ap-zona-izq', 'ap-zona ap-zona-der', [glifo('‹'), oculto(tx.anterior)], [glifo('›'), oculto(tx.siguiente)]]
    : patron === 'inmersivo' ? ['ap-fab ap-fab-izq', 'ap-fab ap-fab-der', [glifo('◀'), oculto(tx.anterior)], [glifo('▶'), oculto(tx.siguiente)]]
    : patron === 'vertical' ? ['ap-nav', 'ap-nav ap-primario', [glifo('↑ '), tx.volver], [tx.continuar, glifo(' ↓')]]
    : ['ap-nav', 'ap-nav ap-primario', [glifo('◀ '), tx.anterior], [tx.siguiente, glifo(' ▶')]];
  const anterior = h('button', { type: 'button', class: claseAnterior, onclick: () => irA(actual - 1, true) }, ...contenidoAnterior);
  const siguiente = h('button', { type: 'button', class: claseSiguiente, 'aria-describedby': 'ap-motivo', onclick: () => irA(actual + 1, true) }, ...contenidoSiguiente);
  const contador = h('span', { class: 'ap-contador' });
  const motivo = h('span', { class: patron === 'historias' || patron === 'inmersivo' ? 'ap-motivo ap-motivo-flotante' : 'ap-motivo', id: 'ap-motivo', role: 'status' });
  const puntos = mostrar.has('puntos') ? h('span', { class: 'ap-puntos' }) : null;
  // Historias: un segmento por pantalla (las vistas se pintan); el valor accesible es el avance, como la barra.
  const segmentos = h('div', { class: 'ap-segmentos', role: 'progressbar', 'aria-label': tx.progreso, 'aria-valuemin': 0, 'aria-valuemax': 100 }, pantallas.map(() => h('i')));
  const tituloPantalla = h('span', { class: 'ap-titulo-curso' });
  // Mapa de misiones y Menú de temas: «← Mapa» o «← Temas» vuelve a elegir estación.
  const botonMapa = h('button', { type: 'button', class: 'ap-boton-barra ap-volver-mapa', onclick: () => verMapa(true) }, glifo('← '), patron === 'hub' ? tx.temas : tx.mapa);
  const conTemario = mostrar.has('temario') && patron !== 'ramificado' && !esMapa;
  const herramientas = [botonSubtitulos, botonIdioma, botonCreditos];

  const barra = patron === 'inmersivo' ? null
    : patron === 'historias'
      ? h('header', { class: 'ap-barra ap-barra-historias' },
        mostrar.has('progreso') ? segmentos : null,
        h('div', { class: 'ap-barra-fila' }, conTemario ? botonTemario : null, tituloPantalla, puntos, ...herramientas))
      : h('header', { class: 'ap-barra' },
        esMapa ? botonMapa : conTemario ? botonTemario : null,
        h('span', { class: 'ap-titulo-curso' }, titulo),
        mostrar.has('progreso') ? [barraAvance, porcentaje] : h('span', { class: 'ap-espacio' }),
        puntos,
        ...herramientas);
  const flotantes = patron === 'historias' ? [anterior, siguiente, motivo]
    : patron === 'inmersivo' ? [h('div', { class: 'ap-hud' }, conTemario ? botonTemario : null, mostrar.has('progreso') ? porcentaje : null, puntos, ...herramientas), anterior, siguiente, motivo]
    : [];
  const pie = flotantes.length ? null : h('footer', { class: patron === 'vertical' ? 'ap-pie ap-pie-vertical' : 'ap-pie' }, anterior, h('span', { class: 'ap-centro' }, mostrar.has('contador') ? contador : null, motivo), siguiente);
  const cuerpo = h('div', { class: 'ap-cuerpo' }, temario, escena, ...flotantes);
  const raiz = h('div', { class: conMarco ? 'ap-r' : 'ap-r ap-sin-marco', lang: idioma, style: variables, 'data-patron': patron, 'data-modo': modo },
    barra,
    cuerpo,
    barraNarracion,
    audio,
    subtitulos,
    pie);

  if (atajos) {
    raiz.addEventListener('keydown', (e) => {
      const destino = e.target as HTMLElement;
      if (pendiente || enMapa || destino.closest('.ap-actividad, .ap-temario, .ap-reanudar, .ap-creditos') || e.altKey || e.ctrlKey || e.metaKey) return;
      // Vertical también con ↓ y ↑ (sin quitarle al navegador el desplazamiento dentro de la pantalla: solo en los botones).
      const vertical = patron === 'vertical' && destino.closest('.ap-pie');
      if (e.key === 'ArrowRight' || (vertical && e.key === 'ArrowDown')) { e.preventDefault(); irA(actual + 1, true); }
      else if (e.key === 'ArrowLeft' || (vertical && e.key === 'ArrowUp')) { e.preventDefault(); irA(actual - 1, true); }
    });
  }
  // HU-1103 · Historias: deslizar el dedo (o el puntero) a la izquierda avanza y a la derecha vuelve; las zonas ‹ › y las
  // flechas hacen lo mismo. Dentro de una actividad no se desliza, para no pelear con sus controles.
  if (patron === 'historias' && conMarco) {
    let inicio: { x: number; y: number } | null = null;
    cuerpo.addEventListener('pointerdown', (ev) => {
      const e = ev as PointerEvent;
      inicio = (e.target as HTMLElement).closest('.ap-actividad, .ap-temario') ? null : { x: e.clientX, y: e.clientY };
    });
    cuerpo.addEventListener('pointerup', (ev) => {
      const e = ev as PointerEvent;
      if (!inicio || pendiente) return;
      const dx = e.clientX - inicio.x;
      const dy = e.clientY - inicio.y;
      inicio = null;
      if (Math.abs(dx) < UMBRAL_DESLIZAR || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      irA(actual + (dx < 0 ? 1 : -1), true);
    });
    cuerpo.addEventListener('pointercancel', () => { inicio = null; });
  }
  vaciar(sombra, h('style', {}, ESTILOS), raiz);
  const dejarDeParpadear = parpadear(personaje);

  // ---------- Actividades ----------
  const crearActividad = (b: BloqueInteraccion, p: Pantalla): HTMLElement => {
    const anuncio = h('p', { class: 'ap-oculto', 'aria-live': 'polite' });
    const previa = resultados.get(p.id);
    const ctx: ContextoActividad = {
      id: p.id, idioma, tx, modo: b.interaccion.modo,
      intentosMaximos: curso.seguimiento.intentosMaximos ?? null,
      intentosPrevios: previa?.intentos ?? 0,
      urlRecurso,
      anunciar: (texto) => { anuncio.textContent = texto; },
      activo: () => vivo,
      terminar: (r) => {
        const previo = resultados.get(p.id);
        const puntaje = mejor && previo?.puntaje != null && r.puntaje !== null ? Math.max(previo.puntaje, r.puntaje) : r.puntaje;
        resultados.set(p.id, { completada: r.completada || Boolean(previo?.completada), puntaje, intentos: (previo?.intentos ?? 0) + 1 });
        refrescar();
      },
    };
    // HU-1105 · Una sumativa que ya usó todos sus intentos (en esta sesión o en una anterior) muestra su resultado.
    if (ctx.modo === 'sumativa' && ctx.intentosMaximos !== null && (ctx.intentosPrevios ?? 0) >= ctx.intentosMaximos) {
      return h('div', { class: 'ap-juego' }, pieResultado(ctx, previa?.puntaje ?? null, false, () => undefined, false), anuncio);
    }
    const crear = ACTIVIDADES[b.interaccion.tipo];
    return h('div', { class: 'ap-juego' }, crear ? crear(b.interaccion.datos, ctx) : null, anuncio);
  };

  const pantallaDe = (i: number): HTMLElement => {
    const p = pantallas[i]!.pantalla;
    let el = dibujadas.get(p.id);
    if (!el) {
      el = dibujarPantalla(p, { idioma, tx, paleta, urlRecurso, revision, actividad: crearActividad, cargarSvg, alSiguiente: opciones.sinAcciones ? undefined : () => irA(actual + 1, true) });
      if (!opciones.sinTiempos) escalonar(el, p);
      dibujadas.set(p.id, el);
    }
    return el;
  };

  // ---------- Línea de tiempo (HU-0608) ----------
  /** El segundo en que el editor dejó la aguja; null: corre el reloj (o, con `sinTiempos`, se ve todo). */
  let fijo: number | null = null;
  /** true mientras el editor reproduce la pantalla con ▶. */
  let enReproduccion = false;
  let inicioReloj = 0;
  let latido = 0;
  const elementoDe = (id: string) => escena.querySelector<HTMLElement>(`[data-bloque="${CSS.escape(id)}"]`);
  /** RN-06-9 · Lo que no tiene tiempo entra escalonado: el retraso va en la animación, sin mover el resto. */
  function escalonar(el: HTMLElement, p: Pantalla) {
    for (const x of tiemposDe(p)) {
      if (x.definido || !x.inicioS) continue;
      const nodo = el.querySelector<HTMLElement>(`[data-bloque="${CSS.escape(x.id)}"]`);
      if (!nodo) continue;
      if (![...nodo.classList].some((c) => c.startsWith('ap-anim-'))) nodo.classList.add('ap-entra');
      nodo.style.animationDelay = `${x.inicioS}s`;
    }
  }
  /** Muestra lo activo en el segundo `s`: todos los elementos (editor) o solo los que tienen tiempo (el reloj). */
  const aplicarTiempo = (s: number, todos: boolean) => {
    const p = pantallas[actual]?.pantalla;
    if (!p) return;
    for (const x of tiemposDe(p)) if (todos || x.definido) elementoDe(x.id)?.classList.toggle('ap-fuera', !activoEn(x, s));
  };
  /** El segundo de la pantalla: el del audio si está sonando o ya sonó; si no, desde que se mostró. */
  /** El audio manda solo si de verdad suena (o ya sonó): si no carga, el reloj sigue igual. */
  const sonando = () => !audio.paused && !audio.ended && audio.readyState >= 3;
  const relojS = () => (audio.getAttribute('src') && (sonando() || audio.currentTime > 0) ? audio.currentTime : (performance.now() - inicioReloj) / 1000);
  function seguirReloj() {
    // Con ▶ del editor, el que mueve la pantalla es `reproducir`.
    if (enReproduccion) return;
    cancelAnimationFrame(latido);
    const p = pantallas[actual]?.pantalla;
    if (!vivo || opciones.sinTiempos || fijo !== null || !p) return;
    const tiempos = tiemposDe(p);
    if (!tiempos.some((x) => x.definido)) return;
    const hasta = ultimoCambio(tiempos);
    const paso = () => {
      if (!vivo || fijo !== null) return;
      const s = relojS();
      aplicarTiempo(s, false);
      if (s <= hasta || !audio.paused) latido = requestAnimationFrame(paso);
    };
    paso();
  }
  const empezarReloj = () => {
    fijo = null;
    inicioReloj = performance.now();
    seguirReloj();
  };
  /** Editor: la aguja en `s`, con la boca de ese instante si no está sonando. */
  const quieta = (s: number) => {
    fijo = s;
    cancelAnimationFrame(latido);
    aplicarTiempo(s, true);
    const svg = personaje();
    if (svg && audio.paused) mostrarBoca(svg, bocaEn(audioDe(actual)?.bocas ?? [], s * 1000));
    if (conSubtitulos) subtitulos.textContent = textoSubtitulos();
  };
  const reproducir = (desde: number, alTiempo?: (s: number, terminado: boolean) => void) => {
    const p = pantallas[actual]?.pantalla;
    if (!vivo || !p) return;
    cancelAnimationFrame(latido);
    enReproduccion = true;
    const total = duracionDe(p, idioma);
    const conAudio = Boolean(audio.getAttribute('src'));
    const voz = (audioDe(actual)?.duracionMs ?? 0) / 1000;
    const salida = performance.now() - desde * 1000;
    if (conAudio && desde < voz) {
      audio.currentTime = desde;
      void audio.play().catch(() => undefined);
    }
    const paso = () => {
      if (!vivo) return;
      const s = sonando() ? audio.currentTime : (performance.now() - salida) / 1000;
      const terminado = s >= total;
      fijo = Math.min(s, total);
      aplicarTiempo(fijo, true);
      const svg = personaje();
      if (svg && (audio.paused || audio.ended)) mostrarBoca(svg, bocaEn(audioDe(actual)?.bocas ?? [], fijo * 1000));
      if (conSubtitulos) subtitulos.textContent = textoSubtitulos();
      alTiempo?.(fijo, terminado);
      if (!terminado) latido = requestAnimationFrame(paso);
      else {
        enReproduccion = false;
        audio.pause();
      }
    };
    paso();
  };

  // ---------- Estado y refresco ----------
  const estado = (): EstadoReproductor => {
    const m = motivoBloqueo(pantallas, avance(), modo, actual + 1);
    const ultima = actual === pantallas.length - 1;
    return {
      ...seguimiento(pantallas, vistas, resultados, curso.seguimiento),
      pantallaId: pantallas[actual]?.pantalla.id ?? '', indice: actual, total: pantallas.length,
      puedeSiguiente: !ultima && m === null, motivo: ultima ? null : textoMotivo(m),
      patron: curso.navegacion?.patron ?? 'clasico', patronAplicado: patron, enMapa, modo,
      resultados: Object.fromEntries(resultados),
      vistas: pantallas.filter((x) => vistas.has(x.pantalla.id)).map((x) => x.pantalla.id),
    };
  };

  function refrescar() {
    if (!vivo) return;
    const e = estado();
    barraAvance.setAttribute('aria-valuenow', String(e.progreso));
    (barraAvance.firstChild as HTMLElement).style.width = `${e.progreso}%`;
    porcentaje.textContent = `${e.progreso} %`;
    segmentos.setAttribute('aria-valuenow', String(e.progreso));
    pantallas.forEach((x, i) => segmentos.children[i]?.classList.toggle('ap-visto', vistas.has(x.pantalla.id)));
    tituloPantalla.textContent = t(pantallas[actual]?.pantalla.titulo, idioma);
    if (puntos) {
      vaciar(puntos, glifo('★ '), tx.puntos(e.puntos));
    }
    botonMapa.hidden = enMapa;
    if (pie) pie.hidden = enMapa;
    for (const x of flotantes) x.hidden = enMapa && x !== motivo;
    if (enMapa) dibujarMapa();
    contador.textContent = tx.pantalla(actual + 1, pantallas.length);
    motivo.textContent = enMapa ? '' : e.motivo ?? '';
    anterior.disabled = actual === 0;
    siguiente.disabled = !e.puedeSiguiente;
    siguiente.title = e.motivo ?? '';
    const sonando = !audio.paused && !audio.ended;
    botonNarracion.setAttribute('aria-pressed', String(sonando));
    botonNarracion.textContent = sonando ? tx.pausar : tx.escuchar;
    botonSubtitulos.setAttribute('aria-pressed', String(conSubtitulos));
    subtitulos.hidden = !conSubtitulos || enMapa;
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

  /** HU-1103 · Mapa de misiones o Menú de temas: las estaciones con su avance; se entra a las que deja la regla. */
  function dibujarMapa() {
    const a = avance();
    const hub = patron === 'hub';
    const titulo = h('h2', { class: 'ap-mapa-titulo', tabindex: '-1' }, hub ? tx.temasTitulo : tx.mapaTitulo);
    const lista = h('ol', { class: hub ? 'ap-temas' : 'ap-estaciones' }, tramos.map((e, i) => {
      const x = estadoEstacion(e, pantallas, a, modo, vistas);
      const nombre = t(e.titulo, idioma);
      // El nombre accesible sale del texto visible (WCAG 2.5.3) con el número y el estado como texto oculto:
      // «Misión 1: Bloqueo y etiquetado, 0 de 11 pantallas, bloqueada».
      const prefijo = hub ? tx.tema(i + 1, '') : tx.mision(i + 1, '');
      const estado = x.completa ? `, ${tx.hecha}` : x.abierta ? '' : `, ${tx.bloqueada}`;
      return h('li', {}, h('button', {
        type: 'button', class: `ap-estacion${x.completa ? ' ap-completa' : ''}`, disabled: !x.abierta,
        onclick: () => irA(entradaEstacion(e, pantallas, avance(), modo, vistas), true, true),
      }, h('span', { class: 'ap-estacion-num', 'aria-hidden': 'true' }, x.completa ? '✓' : x.abierta ? String(i + 1) : '🔒'),
      h('span', { class: 'ap-estacion-texto' }, h('b', {}, oculto(prefijo), nombre), oculto(', '), h('small', {}, tx.hechasDe(x.hechas, x.total)), estado ? oculto(estado) : null)));
    }));
    vaciar(escena, h('section', { class: 'ap-mapa', 'aria-labelledby': 'ap-mapa-titulo' }, Object.assign(titulo, { id: 'ap-mapa-titulo' }), lista));
  }

  function verMapa(enfocar: boolean) {
    if (!esMapa) return;
    enMapa = true;
    audio.pause();
    callar();
    barraNarracion.hidden = true;
    refrescar();
    if (enfocar) escena.querySelector<HTMLElement>('.ap-mapa-titulo')?.focus();
  }

  function irA(destino: number, enfocar: boolean, desdeMapa = false): boolean {
    if (!vivo || (destino === actual && !(enMapa && desdeMapa)) || motivoBloqueo(pantallas, avance(), modo, destino) !== null) {
      if (destino === actual) refrescar();
      return false;
    }
    enMapa = false;
    actual = destino;
    maxima = Math.max(maxima, destino);
    vistas.add(pantallas[destino]!.pantalla.id);
    vaciar(escena, pantallaDe(destino));
    cargarNarracion();
    empezarReloj();
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
    // HU-1103 · Mapa de misiones y Menú de temas empiezan eligiendo estación (en revisión se va directo a la pantalla);
    // la primera pantalla cuenta como vista solo al entrar a ella.
    enMapa = esMapa && !(revision && inicio > 0);
    if (pantallas[inicio]) {
      if (!enMapa) vistas.add(pantallas[inicio].pantalla.id);
      vaciar(escena, pantallaDe(inicio));
    }
    cargarNarracion();
    empezarReloj();
    if (enMapa) barraNarracion.hidden = true;
    refrescar();
  };
  const indiceDe = (d: string | number) => (typeof d === 'number' ? d : pantallas.findIndex((x) => x.pantalla.id === d));

  // ---------- Reanudación (HU-1105) ----------
  const mostrarActual = () => {
    enMapa = false;
    if (pantallas[actual]) vaciar(escena, pantallaDe(actual));
    cargarNarracion();
    empezarReloj();
    refrescar();
  };
  const restaurar = (r: Reanudacion) => {
    const x = estadoReanudado(pantallas, r);
    actual = x.actual;
    maxima = x.maxima;
    vistas.clear();
    resultados.clear();
    dibujadas.clear();
    escuchadas.clear();
    for (const id of x.vistas) vistas.add(id);
    for (const [id, v] of x.resultados) resultados.set(id, v);
    // Las narraciones de lo ya visto no vuelven a frenar el avance; la de la pantalla actual, sí.
    for (const id of x.vistas) if (id !== pantallas[actual]?.pantalla.id) escuchadas.add(id);
  };
  /** Aviso accesible dentro del Shadow DOM: el resto del curso queda inerte hasta que se elige. */
  const preguntar = () => {
    pendiente = true;
    const fondo = [...raiz.children] as HTMLElement[];
    // `inert` saca el fondo del foco y de los clics; aria-hidden, del árbol de accesibilidad en lectores que no conocen inert.
    for (const el of fondo) { el.inert = true; el.setAttribute('aria-hidden', 'true'); }
    const elegir = (continuar: boolean) => {
      if (!pendiente) return;
      pendiente = false;
      dialogo.remove();
      for (const el of fondo) { el.inert = false; el.removeAttribute('aria-hidden'); }
      opciones.alReanudar?.(continuar);
      if (continuar) mostrarActual();
      else reiniciar(0);
      escena.querySelector<HTMLElement>('.ap-titulo-pantalla')?.focus();
    };
    const continuar = h('button', { type: 'button', class: 'ap-nav ap-primario', onclick: () => elegir(true) }, tx.continuar);
    const empezar = h('button', { type: 'button', class: 'ap-nav', onclick: () => elegir(false) }, tx.empezarDeNuevo);
    const nombre = t(pantallas[actual]?.pantalla.titulo, idioma);
    const dialogo = h('div', {
      class: 'ap-reanudar', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ap-reanudar-titulo', 'aria-describedby': 'ap-reanudar-detalle',
      onkeydown: (ev: Event) => {
        const e = ev as KeyboardEvent;
        if (e.key === 'Escape') { e.preventDefault(); elegir(true); }
        else if (e.key === 'Tab') {
          // El foco no sale del aviso: va y vuelve entre sus dos botones.
          e.preventDefault();
          (sombra.activeElement === continuar ? empezar : continuar).focus();
        }
      },
    }, h('div', { class: 'ap-reanudar-caja' },
      h('h2', { class: 'ap-reanudar-titulo', id: 'ap-reanudar-titulo' }, tx.reanudarPregunta),
      h('p', { id: 'ap-reanudar-detalle' }, tx.pantalla(actual + 1, pantallas.length), nombre ? h('span', { class: 'ap-reanudar-nombre' }, nombre) : null),
      h('div', { class: 'ap-reanudar-botones' }, continuar, empezar)));
    raiz.append(dialogo);
    refrescar();
    continuar.focus();
  };

  // En modo revisión se puede empezar en cualquier pantalla; como participante, desde la primera o donde lo dejó.
  const reanudar = revision ? undefined : opciones.reanudar;
  if (reanudar) {
    restaurar(reanudar);
    if (reanudar.preguntar) preguntar();
    else mostrarActual();
  } else reiniciar(revision && opciones.inicio ? Math.max(0, indiceDe(opciones.inicio)) : 0);

  return {
    ir: (d) => irA(indiceDe(d), false),
    siguiente: () => irA(actual + 1, false),
    anterior: () => irA(actual - 1, false),
    reiniciar: () => reiniciar(0),
    estado,
    irA: (s) => {
      enReproduccion = false;
      audio.pause();
      quieta(Math.max(0, s));
    },
    reproducir,
    pausar: () => {
      enReproduccion = false;
      cancelAnimationFrame(latido);
      audio.pause();
      if (fijo !== null) quieta(fijo);
    },
    verTodo: () => {
      enReproduccion = false;
      cancelAnimationFrame(latido);
      audio.pause();
      fijo = null;
      for (const el of escena.querySelectorAll('.ap-fuera')) el.classList.remove('ap-fuera');
      callar();
      refrescar();
      if (!opciones.sinTiempos) empezarReloj();
    },
    duracion: () => {
      const p = pantallas[actual]?.pantalla;
      return p ? duracionDe(p, idioma) : 0;
    },
    destruir: () => {
      vivo = false;
      cancelAnimationFrame(latido);
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
