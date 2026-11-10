// INT-07 · Deslizar verdadero/falso: deslizar a la derecha = verdadero y a la izquierda = falso, con botones
// equivalentes. Puntaje = % de aciertos.
import { h, vaciar } from '../dom.ts';
import { t } from '../textos.ts';
import type { TextoI18n } from '../tipos.ts';
import { type Actividad, intentos, lista, marca, pieResultado, porcentaje } from './comun.ts';

type Afirmacion = { id: string; texto: TextoI18n; verdadera: boolean; retroalimentacion: TextoI18n };

/** Distancia mínima en píxeles para contar un deslizamiento. */
const UMBRAL = 60;

export const deslizar: Actividad = (datos, ctx) => {
  const afirmaciones = lista<Afirmacion>(datos.afirmaciones);
  const raiz = h('div', { class: 'ap-deslizar' });
  const control = intentos(ctx);

  const empezar = (vuelta: number) => {
    let i = 0;
    let aciertos = 0;
    const mostrar = () => {
      const a = afirmaciones[i]!;
      let respondida = false;
      const retro = h('div', { class: 'ap-retro', 'aria-live': 'polite' });
      const acciones = h('div', { class: 'ap-acciones' });
      const responder = (dice: boolean) => {
        if (respondida) return;
        respondida = true;
        const bien = dice === a.verdadera;
        if (bien) aciertos++;
        tarjeta.classList.add(dice ? 'ap-a-la-derecha' : 'ap-a-la-izquierda');
        botones.forEach((b) => { b.disabled = true; });
        vaciar(retro, marca(bien, ctx.tx), ` ${t(a.retroalimentacion, ctx.idioma)}`);
        const ultima = i === afirmaciones.length - 1;
        vaciar(acciones, h('button', {
          type: 'button', class: 'ap-boton ap-primario',
          onclick: () => {
            if (!ultima) { i++; mostrar(); return; }
            control.sumar();
            const puntaje = porcentaje(aciertos, afirmaciones.length);
            ctx.terminar({ completada: true, puntaje });
            vaciar(raiz, pieResultado(ctx, puntaje, control.quedan(), () => empezar(vuelta + 1)));
          },
        }, ultima ? ctx.tx.verResultado : ctx.tx.continuar));
        acciones.querySelector('button')?.focus();
      };
      const tarjeta = h('div', { class: 'ap-afirmacion' }, h('p', {}, `«${t(a.texto, ctx.idioma)}»`));
      let desde: number | null = null;
      tarjeta.addEventListener('pointerdown', (e) => { desde = e.clientX; });
      tarjeta.addEventListener('pointerup', (e) => {
        if (desde === null) return;
        const dx = e.clientX - desde;
        desde = null;
        if (Math.abs(dx) >= UMBRAL) responder(dx > 0);
      });
      const botones = [
        h('button', { type: 'button', class: 'ap-opcion', 'data-respuesta': 'falso', onclick: () => responder(false) }, h('span', { 'aria-hidden': 'true' }, '← '), ctx.tx.falso),
        h('button', { type: 'button', class: 'ap-opcion', 'data-respuesta': 'verdadero', onclick: () => responder(true) }, ctx.tx.verdadero, h('span', { 'aria-hidden': 'true' }, ' →')),
      ];
      vaciar(raiz,
        h('p', { class: 'ap-marcador' }, ctx.tx.afirmacion(i + 1, afirmaciones.length)),
        tarjeta,
        h('div', { class: 'ap-opciones ap-dos' }, botones),
        retro, acciones);
    };
    mostrar();
  };
  empezar(0);
  return raiz;
};
