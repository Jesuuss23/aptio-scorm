// HU-1204 · Panel del modo diagnóstico, dentro del Shadow DOM del reproductor. Es para el soporte (no para el
// participante): se abre con Ctrl+Alt+Shift+D o con ?diagnostico=1, nunca solo. Diálogo accesible con el foco atrapado,
// Escape o «Cerrar» para salir, la lista de llamadas en vivo y «Copiar informe» (JSON para la ficha del cliente).
import { h, vaciar } from './dom.ts';
import type { InformeDiagnostico, LlamadaLms, PasoBusqueda, RegistroDiagnostico } from './diagnostico.ts';

export interface OpcionesPanel {
  sombra: ShadowRoot;
  registro: RegistroDiagnostico;
  informe: () => InformeDiagnostico;
  /** Copia el texto; por defecto `navigator.clipboard.writeText`. */
  copiar?: (texto: string) => Promise<void>;
}

const NOMBRE_ORIGEN = { propia: 'esta ventana', padre: 'ventana padre', opener: 'ventana que abrió el curso' } as const;
const NOMBRE_RESULTADO = { api: 'API SCORM 1.2 encontrada', 'sin-api': 'sin API', 'otro-origen': 'de otro origen: el navegador no deja revisarla' } as const;

const textoPaso = (p: PasoBusqueda) => `Nivel ${p.nivel} · ${NOMBRE_ORIGEN[p.origen]}: ${NOMBRE_RESULTADO[p.resultado]}`;
const segundos = (ms: number) => `${(ms / 1000).toFixed(1)} s`;

/** Abre el panel; si ya está abierto, solo lo enfoca. Devuelve cómo cerrarlo. */
export function abrirPanelDiagnostico(o: OpcionesPanel): () => void {
  const previo = o.sombra.querySelector<HTMLElement>('.ap-diagnostico');
  if (previo) {
    previo.querySelector<HTMLElement>('button')?.focus();
    return () => previo.remove();
  }
  const raiz = o.sombra.querySelector<HTMLElement>('.ap-r') ?? o.sombra;
  const antes = o.sombra.activeElement as HTMLElement | null;
  const copiar = o.copiar ?? ((texto: string) => navigator.clipboard.writeText(texto));
  const inf = o.informe();

  const estado = h('p', { class: 'ap-diag-estado', role: 'status' });
  const respaldo = h('div');
  const lista = h('tbody');
  const cuenta = h('span');
  const botonCopiar = h('button', { type: 'button', class: 'ap-nav ap-primario', onclick: () => void alCopiar() }, 'Copiar informe');
  const cerrarBoton = h('button', { type: 'button', class: 'ap-nav', onclick: () => cerrar() }, 'Cerrar');

  const fila = (l: LlamadaLms) => h('tr', { class: l.error !== '0' && l.error !== '' ? 'ap-diag-error' : '' },
    h('td', {}, segundos(l.ms)), h('td', {}, l.metodo), h('td', {}, l.elemento ?? ''), h('td', {}, l.valor ?? ''), h('td', {}, l.respuesta), h('td', {}, l.error));
  const pintarLlamadas = () => {
    vaciar(lista, ...o.registro.lista().map(fila));
    cuenta.textContent = `${o.registro.total()} en total; se muestran las últimas ${o.registro.lista().length}`;
  };

  const hallazgo = inf.api.encontrada
    ? `API SCORM 1.2 encontrada en ${NOMBRE_ORIGEN[inf.api.origen!]} (nivel ${inf.api.nivel})${inf.api.conectado ? '; LMSInitialize respondió bien.' : '; LMSInitialize falló.'}`
    : 'No se encontró la API SCORM 1.2. El curso funciona, pero el LMS no recibe avance ni nota.';
  const revisados = inf.busqueda.length;
  const panel = h('div', { class: 'ap-diagnostico', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ap-diag-titulo', onkeydown: (ev: Event) => teclado(ev as KeyboardEvent) },
    h('div', { class: 'ap-diag-caja' },
      h('h2', { id: 'ap-diag-titulo', class: 'ap-diag-titulo' }, 'Modo diagnóstico'),
      h('p', { class: inf.api.encontrada ? 'ap-diag-hallazgo' : 'ap-diag-hallazgo ap-diag-sin-api' }, hallazgo),
      h('h3', {}, 'Búsqueda de la API'),
      h('p', {}, `Se revisaron ${revisados} ${revisados === 1 ? 'ventana' : 'ventanas'}: hasta 8 niveles (0 a 7) por las ventanas padre y luego la ventana que abrió el curso, si existe.`),
      h('ol', { class: 'ap-diag-busqueda' }, inf.busqueda.map((p) => h('li', {}, textoPaso(p)))),
      h('h3', {}, 'Lo que el LMS tenía al entrar'),
      h('dl', { class: 'ap-diag-datos' },
        ...([['Entrada', inf.inicial.entrada], ['Ubicación', inf.inicial.ubicacion], ['Estado', inf.inicial.estado], ['Nota', inf.inicial.nota], ['suspend_data', `${inf.inicial.suspendDataCaracteres} caracteres`]] as const)
          .flatMap(([k, v]) => [h('dt', {}, k), h('dd', {}, v || '—')])),
      h('p', {}, `${inf.navegador} · reproductor ${inf.reproductor} · curso ${inf.curso.titulo} (${inf.curso.pantallas} pantallas, huella ${inf.curso.huella})`),
      h('h3', {}, 'Llamadas al LMS ', cuenta),
      h('div', { class: 'ap-diag-tabla' }, h('table', { 'aria-label': 'Llamadas al LMS' },
        h('thead', {}, h('tr', {}, ['Tiempo', 'Llamada', 'Elemento', 'Valor', 'Respuesta', 'Error'].map((t) => h('th', { scope: 'col' }, t)))), lista)),
      estado,
      respaldo,
      h('div', { class: 'ap-diag-botones' }, botonCopiar, cerrarBoton)));

  async function alCopiar() {
    const texto = JSON.stringify(o.informe(), null, 2);
    try {
      await copiar(texto);
      estado.textContent = 'Informe copiado. Pégalo en la ficha de compatibilidad del cliente.';
      vaciar(respaldo);
    } catch {
      // Sin permiso para el portapapeles (pasa dentro de algunos LMS): se deja el texto seleccionado para Ctrl+C.
      const area = h('textarea', { class: 'ap-diag-respaldo', readonly: true, 'aria-label': 'Informe de diagnóstico' }) as HTMLTextAreaElement;
      area.value = texto;
      vaciar(respaldo, area);
      area.focus();
      area.select();
      estado.textContent = 'No se pudo copiar solo: el informe quedó seleccionado; cópialo con Ctrl+C.';
    }
  }
  function enfocables(): HTMLElement[] {
    return [...panel.querySelectorAll<HTMLElement>('button, textarea')];
  }
  function teclado(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      cerrar();
    } else if (e.key === 'Tab') {
      const todos = enfocables();
      const i = todos.indexOf(o.sombra.activeElement as HTMLElement);
      e.preventDefault();
      todos[(i + (e.shiftKey ? -1 : 1) + todos.length) % todos.length]?.focus();
    }
    e.stopPropagation();
  }
  const dejar = o.registro.escuchar(pintarLlamadas);
  function cerrar() {
    dejar();
    panel.remove();
    antes?.focus();
  }

  pintarLlamadas();
  raiz.append(panel);
  botonCopiar.focus();
  return cerrar;
}
