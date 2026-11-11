// HU-0606 · Elementos agregados en el editor: posición en %, los mismos ajustes que un bloque, ocultos y botones.
import { describe, expect, it } from 'vitest';
import { accionBoton, estiloAjuste, posicionExtra } from '../src/ajustes.ts';
import { ESTILOS } from '../src/estilos.ts';

describe('extras', () => {
  it('se ubican en % de la pantalla, dentro de sus límites', () => {
    expect(posicionExtra({ x: 40, y: 80, ancho: 14 })).toBe('left:40%;top:80%;width:14%');
    expect(posicionExtra({ x: -5, y: 130, ancho: 0 })).toBe('left:0%;top:100%;width:1%');
  });

  it('un botón o un título se retocan como un texto; la insignia como una imagen', () => {
    expect(estiloAjuste({ tamanoCqw: 3, color: 'primario' }, 'boton').estilo).toBe('font-size:3cqw;color:var(--ap-primario)');
    expect(estiloAjuste({ alineacion: 'centro' }, 'titulo').estilo).toBe('text-align:center');
    expect(estiloAjuste({ escala: 1.5 }, 'insignia').estilo).toBe('scale:1.5');
  });

  it('la forma toma escala y relleno del kit, y se mueve como los demás', () => {
    expect(estiloAjuste({ escala: 2, relleno: 'secundario', desplazamiento: { x: 5, y: 0 } }, 'forma')).toEqual({
      estilo: 'scale:2;background:var(--ap-secundario);--ap-dx:5cqw;--ap-dy:0cqw', clase: 'ap-desp',
    });
    expect(estiloAjuste({ relleno: 'rojo' as never }, 'forma').estilo).toBe('');
  });

  it('oculto saca el elemento de la vista, en un bloque o en un extra', () => {
    expect(estiloAjuste({ oculto: true }, 'texto').clase).toBe('ap-oculto-el');
    expect(estiloAjuste({ oculto: true, animacion: 'zoom' }, 'boton').clase).toBe('ap-oculto-el ap-anim-zoom');
    expect(estiloAjuste({ oculto: false }, 'texto').clase).toBe('');
    expect(ESTILOS).toContain('.ap-oculto-el{display:none!important}');
  });

  it('el botón solo avanza con «Siguiente»; las demás acciones llegan con los disparadores (SUP-45)', () => {
    expect(accionBoton('siguiente')).toBe('siguiente');
    for (const a of ['nada', 'retroalimentacion', 'ventana', 'audio', 'puntos', undefined] as const) expect(accionBoton(a)).toBe('nada');
  });
});
