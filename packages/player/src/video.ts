// HU-0901 · Preguntas en el video (CP-080, RN-09-1): al llegar al tiempo de una pregunta, el video se detiene y la
// pregunta aparece encima. Al acertar sigue solo; al fallar se ve la retroalimentación y se reintenta; una pregunta no
// obligatoria se puede saltar. La pantalla queda completa cuando el video termina y se respondieron las obligatorias.
// La lógica del tiempo son funciones puras (se prueban con un reloj simulado); el mismo código va en la vista previa y
// en el paquete SCORM o HTML.
import { h, vaciar } from './dom.ts';
import { enfocar, marca, textoVisual } from './interacciones/comun.ts';
import { t, type Textos } from './textos.ts';
import type { BloqueVideo, Idioma, MarcadorVideo } from './tipos.ts';

/** Las preguntas del video, en orden de tiempo. */
export const preguntasVideo = (marcadores: readonly MarcadorVideo[] = []): MarcadorVideo[] =>
  marcadores.filter((m) => m.tipo === 'pregunta' && m.pregunta).sort((a, b) => a.tiempoMs - b.tiempoMs);

/**
 * La primera pregunta sin resolver cuyo tiempo se cruzó al reproducir de `desdeS` a `hastaS` (en segundos). `desdeS`
 * negativo cuenta también una pregunta en 0:00. Un salto hacia atrás no cruza nada.
 */
export function preguntaAlcanzada(marcadores: readonly MarcadorVideo[] = [], resueltas: ReadonlySet<string>, desdeS: number, hastaS: number): MarcadorVideo | null {
  if (hastaS <= desdeS) return null;
  return preguntasVideo(marcadores).find((m) => !resueltas.has(m.id) && m.tiempoMs / 1000 > desdeS && m.tiempoMs / 1000 <= hastaS) ?? null;
}

/** El video cuenta como hecho cuando terminó y no queda ninguna pregunta obligatoria sin responder. */
export const videoCompleto = (marcadores: readonly MarcadorVideo[] = [], resueltas: ReadonlySet<string>, terminado: boolean): boolean =>
  terminado && preguntasVideo(marcadores).every((m) => !m.obligatorio || resueltas.has(m.id));

/** Acierta si la opción elegida es la correcta. */
export const aciertaVideo = (m: MarcadorVideo, opcionId: string): boolean => m.pregunta?.opciones.find((o) => o.id === opcionId)?.correcta === true;

/** 45000 → «0:45». */
export const mmss = (ms: number): string => { const s = Math.floor(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

export interface ContextoVideo {
  id: string;
  idioma: Idioma;
  tx: Textos;
  urlRecurso: (id: string) => string | undefined;
  /** El video terminó con las preguntas obligatorias respondidas. */
  terminar: () => void;
}

const ESPERA_ACIERTO_MS = 900;

/** El bloque de video con sus preguntas encima. */
export function videoInteractivo(b: BloqueVideo, ctx: ContextoVideo): HTMLElement {
  const url = ctx.urlRecurso(b.recursoId);
  const figura = h('figure', { class: 'ap-video', 'data-bloque': b.id });
  if (!url) {
    // Sin el archivo no hay nada que mirar: la pantalla no se bloquea por eso.
    vaciar(figura, h('span', { class: 'ap-sin-imagen' }, ctx.tx.videoPendiente));
    queueMicrotask(ctx.terminar);
    return figura;
  }
  const marcadores = b.marcadores ?? [];
  const resueltas = new Set<string>();
  const video = h('video', { src: url, controls: true, preload: 'metadata', playsinline: true });
  const capa = h('div', { class: 'ap-video-capa' });
  vaciar(figura, h('div', { class: 'ap-video-marco' }, video, capa));
  let ultimoS = -1;
  let abierta: MarcadorVideo | null = null;
  let terminado = false;
  let avisado = false;

  const revisar = () => {
    if (!avisado && videoCompleto(marcadores, resueltas, terminado)) { avisado = true; ctx.terminar(); }
  };
  const seguir = () => {
    abierta = null;
    vaciar(capa);
    figura.classList.remove('ap-con-pregunta');
    enfocar(video);
    void video.play()?.catch(() => undefined);
    revisar();
  };

  const abrir = (m: MarcadorVideo) => {
    abierta = m;
    const p = m.pregunta!;
    const idEnunciado = `${ctx.id}-${m.id}-enunciado`;
    const retro = h('p', { class: 'ap-retro', 'aria-live': 'polite' });
    const enunciado = h('h3', { class: 'ap-video-enunciado', id: idEnunciado, tabindex: '-1', 'data-enfocar': '' }, t(p.enunciado, ctx.idioma));
    const botones = p.opciones.map((o) => h('button', {
      type: 'button', class: 'ap-opcion', 'data-opcion': o.id,
      onclick: (ev: Event) => {
        // Un botón ya elegido no hace nada (aria-disabled, no disabled: puede tener el foco, HU-1401).
        const boton = ev.currentTarget as HTMLButtonElement;
        if (boton.getAttribute('aria-disabled') === 'true') return;
        const bien = aciertaVideo(m, o.id);
        if (bien) {
          boton.classList.add('ap-correcta');
          botones.forEach((x) => { x.setAttribute('aria-disabled', 'true'); });
          vaciar(retro, marca(true, ctx.tx), ` ${t(p.retroalimentacion.correcta, ctx.idioma)}`);
          resueltas.add(m.id);
          setTimeout(() => { if (abierta === m) seguir(); }, ESPERA_ACIERTO_MS);
        } else {
          boton.classList.add('ap-incorrecta');
          boton.setAttribute('aria-disabled', 'true');
          vaciar(retro, marca(false, ctx.tx), ` ${t(p.retroalimentacion.incorrecta, ctx.idioma)} ${ctx.tx.intentaDeNuevo}`);
        }
      },
    }, textoVisual(o.contenido, ctx.idioma)));
    const saltar = m.obligatorio ? null : h('button', { type: 'button', class: 'ap-boton', onclick: () => { resueltas.add(m.id); seguir(); } }, ctx.tx.saltar);
    vaciar(capa, h('div', { class: 'ap-video-pregunta', role: 'dialog', 'aria-labelledby': idEnunciado, 'data-marcador': m.id },
      h('p', { class: 'ap-video-tiempo' }, ctx.tx.preguntaEn(mmss(m.tiempoMs))),
      enunciado,
      h('div', { class: 'ap-opciones' }, botones),
      retro,
      saltar ? h('div', { class: 'ap-acciones' }, saltar) : null));
    figura.classList.add('ap-con-pregunta');
    enfocar(enunciado);
  };

  video.addEventListener('timeupdate', () => {
    if (abierta || video.seeking) return;
    const ahora = video.currentTime;
    const m = preguntaAlcanzada(marcadores, resueltas, ultimoS, ahora);
    ultimoS = ahora;
    if (!m) return;
    video.pause();
    video.currentTime = m.tiempoMs / 1000;
    ultimoS = m.tiempoMs / 1000;
    abrir(m);
  });
  // Saltar con la barra no dispara las preguntas que quedan atrás (impedir adelantar llega con la HU-0902).
  video.addEventListener('seeked', () => { if (!abierta) ultimoS = video.currentTime; });
  video.addEventListener('play', () => { if (abierta) video.pause(); });
  video.addEventListener('ended', () => { terminado = true; revisar(); });
  // Si el archivo no carga (falta en el paquete o la red falla), se avisa y la pantalla no se bloquea por eso.
  video.addEventListener('error', () => {
    abierta = null;
    vaciar(capa);
    figura.classList.remove('ap-con-pregunta');
    if (!figura.querySelector('.ap-video-aviso')) figura.append(h('p', { class: 'ap-video-aviso', role: 'status' }, ctx.tx.videoNoCarga));
    if (!avisado) { avisado = true; ctx.terminar(); }
  });
  return figura;
}
