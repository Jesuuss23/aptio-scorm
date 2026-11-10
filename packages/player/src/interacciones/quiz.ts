// INT-05 · Quiz con tiempo, vidas y puntaje: una pregunta a la vez; se pierde una vida por error y al acabarse el tiempo
// cuenta como error. Con `preguntasPorIntento`, cada intento toma esa cantidad del banco. Puntaje = % de aciertos.
import { barajar, h, vaciar } from '../dom.ts';
import { t } from '../textos.ts';
import type { TextoI18n, Visual } from '../tipos.ts';
import { type Actividad, intentos, lista, marca, pieResultado, porcentaje, textoVisual, visual } from './comun.ts';

type Opcion = { id: string; contenido: Visual; correcta: boolean };
type Pregunta = { id: string; enunciado: TextoI18n; seleccionMultiple?: boolean; opciones: Opcion[]; retroalimentacion: { correcta: TextoI18n; incorrecta: TextoI18n } };

/** Acierta solo si eligió exactamente las opciones correctas. */
export const acierta = (p: Pick<Pregunta, 'opciones'>, elegidas: ReadonlySet<string>): boolean =>
  p.opciones.every((o) => o.correcta === elegidas.has(o.id));

export const quiz: Actividad = (datos, ctx) => {
  const banco = lista<Pregunta>(datos.preguntas);
  const porIntento = Math.min(typeof datos.preguntasPorIntento === 'number' ? datos.preguntasPorIntento : banco.length, banco.length);
  const segundos = typeof datos.segundosPorPregunta === 'number' ? datos.segundosPorPregunta : null;
  const vidasIniciales = typeof datos.vidas === 'number' ? datos.vidas : null;
  const raiz = h('div', { class: 'ap-quiz' });
  const control = intentos(ctx);

  const empezar = (vuelta: number) => {
    const preguntas = porIntento < banco.length ? barajar(banco, `${ctx.id}-quiz-${vuelta}`).slice(0, porIntento) : banco;
    let i = 0;
    let aciertos = 0;
    let vidas = vidasIniciales;
    let reloj: ReturnType<typeof setInterval> | null = null;
    const parar = () => { if (reloj) clearInterval(reloj); reloj = null; };

    const fin = () => {
      parar();
      control.sumar();
      const puntaje = porcentaje(aciertos, preguntas.length);
      ctx.terminar({ completada: true, puntaje });
      vaciar(raiz, pieResultado(ctx, puntaje, control.quedan(), () => empezar(vuelta + 1)));
    };

    const mostrar = () => {
      const p = preguntas[i]!;
      const opciones = datos.barajarOpciones === true ? barajar(p.opciones, `${ctx.id}-${p.id}-${vuelta}`) : p.opciones;
      const multiple = p.seleccionMultiple === true;
      const elegidas = new Set<string>();
      let respondida = false;
      const idEnunciado = `${ctx.id}-q-${p.id}`;
      const tiempo = h('span', { class: 'ap-tiempo' });
      const retro = h('div', { class: 'ap-retro', 'aria-live': 'polite' });
      const acciones = h('div', { class: 'ap-acciones' });

      const responder = (porTiempo: boolean) => {
        if (respondida) return;
        respondida = true;
        parar();
        const bien = !porTiempo && acierta(p, elegidas);
        if (bien) aciertos++;
        else if (vidas !== null) vidas--;
        botones.forEach((b, j) => {
          b.disabled = true;
          const o = opciones[j]!;
          if (o.correcta) b.classList.add('ap-correcta');
          else if (elegidas.has(o.id)) b.classList.add('ap-incorrecta');
        });
        vaciar(retro, marca(bien, ctx.tx), porTiempo ? ` ${ctx.tx.sinTiempo}.` : '', ` ${t(bien ? p.retroalimentacion.correcta : p.retroalimentacion.incorrecta, ctx.idioma)}`);
        const ultima = i === preguntas.length - 1 || vidas === 0;
        vaciar(acciones, h('button', { type: 'button', class: 'ap-boton ap-primario', onclick: () => { if (ultima) fin(); else { i++; mostrar(); } } }, ultima ? ctx.tx.verResultado : ctx.tx.siguientePregunta));
        acciones.querySelector('button')?.focus();
      };

      const botones = opciones.map((o) =>
        h('button', {
          type: 'button', class: 'ap-opcion', 'aria-pressed': multiple ? 'false' : null, 'data-opcion': o.id,
          'aria-label': textoVisual(o.contenido, ctx.idioma),
          onclick: (ev: Event) => {
            if (respondida) return;
            if (!multiple) { elegidas.add(o.id); responder(false); return; }
            if (elegidas.has(o.id)) elegidas.delete(o.id); else elegidas.add(o.id);
            (ev.currentTarget as HTMLElement).setAttribute('aria-pressed', String(elegidas.has(o.id)));
            (acciones.querySelector('button') as HTMLButtonElement | null)?.toggleAttribute('disabled', elegidas.size === 0);
          },
        }, visual(o.contenido, ctx)),
      );
      if (multiple) acciones.append(h('button', { type: 'button', class: 'ap-boton ap-primario', disabled: true, onclick: () => responder(false) }, ctx.tx.responder));

      vaciar(raiz,
        h('div', { class: 'ap-quiz-cabeza' },
          h('span', {}, ctx.tx.pregunta(i + 1, preguntas.length)),
          vidas !== null ? h('span', { class: 'ap-vidas', 'aria-label': ctx.tx.vidas(vidas) }, '●'.repeat(vidas) + '○'.repeat(Math.max(0, (vidasIniciales ?? 0) - vidas))) : null,
          segundos !== null ? tiempo : null),
        h('p', { class: 'ap-enunciado', id: idEnunciado }, t(p.enunciado, ctx.idioma)),
        h('div', { class: 'ap-opciones', role: 'group', 'aria-labelledby': idEnunciado }, botones),
        retro, acciones);

      if (segundos !== null) {
        let quedan = segundos;
        tiempo.textContent = ctx.tx.segundos(quedan);
        reloj = setInterval(() => {
          if (!ctx.activo()) { parar(); return; }
          if (!raiz.isConnected) return; // pantalla fuera de vista: el reloj espera
          quedan--;
          tiempo.textContent = ctx.tx.segundos(Math.max(0, quedan));
          if (quedan <= 0) responder(true);
        }, 1000);
      }
    };
    mostrar();
  };
  empezar(0);
  return raiz;
};
