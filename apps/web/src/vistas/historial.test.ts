// HU-0607 · Deshacer y rehacer: la foto de la pantalla, el PATCH que vuelve a ella y la pila de 60 (SUP-46).
import type { PantallaDoc } from '@aptio/schema/revision';
import { describe, expect, it } from 'vitest';
import { cambioHacia, conFoto, fotoDe, HISTORIAL_VACIO, type Historial, MAX_HISTORIAL, mover, registrar } from './historial';

const p01 = (extra: Record<string, unknown> = {}) => ({
  id: 'p01', titulo: { es: 'Bloqueo' }, estado: 'borrador', disposicion: 'idea', plantilla: 'industrial-idea',
  narracion: { texto: { es: 'Hola' } },
  bloques: [
    { id: 'p01-titulo', tipo: 'texto', rol: 'titulo', contenido: { es: 'Bloqueo' } },
    { id: 'p01-sub', tipo: 'texto', rol: 'parrafo', contenido: { es: 'Sub', en: 'Sub EN' } },
    { id: 'p01-img', tipo: 'imagen', recursoId: 'img' },
  ],
  ...extra,
}) as unknown as PantallaDoc;
const boton = { id: 'p01-extra-boton-1', tipo: 'boton' as const, texto: { es: 'Continuar' }, x: 40, y: 80, ancho: 14 };

describe('historial del editor', () => {
  it('la foto es una copia: cambiar la pantalla después no la toca', () => {
    const p = p01({ ajustes: { 'p01-sub': { color: 'acento' } } });
    const f = fotoDe(p);
    expect(f).toEqual({ titulo: { es: 'Bloqueo' }, textos: { 'p01-sub': { es: 'Sub', en: 'Sub EN' } }, narracion: { es: 'Hola' }, disposicion: 'idea', ajustes: { 'p01-sub': { color: 'acento' } }, extras: [] });
    (p as unknown as { ajustes: Record<string, unknown> }).ajustes['p01-sub'] = { color: 'primario' };
    expect(f.ajustes['p01-sub']).toEqual({ color: 'acento' });
  });

  it('una pantalla igual a la foto no tiene nada que guardar', () => {
    const p = p01({ extras: [boton] });
    expect(cambioHacia(p, fotoDe(p))).toBeNull();
  });

  it('vuelve el título, un texto y la narración, con el inglés que tenían', () => {
    const f = fotoDe(p01());
    const ahora = conFoto(p01(), { ...f, titulo: { es: 'Otro' }, textos: { 'p01-sub': { es: 'Nuevo', en: 'Sub EN' } }, narracion: { es: 'Chau' } });
    expect(ahora.bloques[0]!.contenido).toEqual({ es: 'Otro' });
    expect(cambioHacia(ahora, f)).toEqual({ titulo: { es: 'Bloqueo' }, textos: { 'p01-sub': { es: 'Sub', en: 'Sub EN' } }, narracion: { es: 'Hola' } });
  });

  it('los ajustes que la foto no tenía se restablecen con null; los que cambian vuelven', () => {
    const f = fotoDe(p01({ ajustes: { 'p01-sub': { color: 'acento' } } }));
    const ahora = p01({ ajustes: { 'p01-sub': { color: 'primario' }, 'p01-img': { escala: 2 } } });
    expect(cambioHacia(ahora, f)).toEqual({ ajustes: { 'p01-sub': { color: 'acento' }, 'p01-img': null } });
  });

  it('quitar un extra agregado manda la lista sin él y no pide restablecer su ajuste (la API ya lo borra)', () => {
    const f = fotoDe(p01());
    const ahora = p01({ extras: [boton], ajustes: { [boton.id]: { color: 'acento' } } });
    expect(cambioHacia(ahora, f)).toEqual({ extras: [] });
    // Rehacer: vuelve el extra con su ajuste.
    expect(cambioHacia(p01(), fotoDe(ahora))).toEqual({ extras: [boton], ajustes: { [boton.id]: { color: 'acento' } } });
  });

  it('si cambia la disposición van todos los ajustes de la foto (la API los reinicia) y la plantilla se ve al instante', () => {
    const f = fotoDe(p01({ ajustes: { 'p01-sub': { color: 'acento' } } }));
    const ahora = p01({ disposicion: 'dato', plantilla: 'industrial-dato' });
    expect(cambioHacia(ahora, f)).toEqual({ disposicion: 'idea', ajustes: { 'p01-sub': { color: 'acento' } } });
    expect(conFoto(ahora, f)).toMatchObject({ disposicion: 'idea', plantilla: 'industrial-idea', ajustes: { 'p01-sub': { color: 'acento' } } });
    expect(cambioHacia(p01(), fotoDe(ahora))).toEqual({ disposicion: 'dato' });
  });

  it('CP-063 · 20 cambios y 20 deshacer vuelven a la foto inicial; un cambio nuevo vacía rehacer', () => {
    let pantalla = p01();
    let h: Historial = HISTORIAL_VACIO;
    for (let i = 1; i <= 20; i++) {
      h = registrar(h, { pantallaId: 'p01', foto: fotoDe(pantalla) });
      pantalla = conFoto(pantalla, { ...fotoDe(pantalla), titulo: { es: `Título ${i}` } });
    }
    const inicial = fotoDe(p01());
    let vista = fotoDe(pantalla);
    for (let i = 0; i < 20; i++) {
      const r = mover(h, 'deshacer', () => vista)!;
      h = r.historial;
      vista = r.entrada.foto;
    }
    expect(vista).toEqual(inicial);
    expect(mover(h, 'deshacer', () => vista)).toBeNull();
    expect(h.rehacer).toHaveLength(20);
    // Un solo PATCH lleva lo guardado (el título 20) al estado inicial.
    expect(cambioHacia(pantalla, vista)).toEqual({ titulo: { es: 'Bloqueo' } });
    const r = mover(h, 'rehacer', () => vista)!;
    expect(r.entrada.foto.titulo).toEqual({ es: 'Título 1' });
    expect(registrar(r.historial, { pantallaId: 'p01', foto: vista }).rehacer).toEqual([]);
  });

  it('guarda como máximo 60 fotos: se olvidan las más viejas', () => {
    let h: Historial = HISTORIAL_VACIO;
    for (let i = 0; i < MAX_HISTORIAL + 5; i++) h = registrar(h, { pantallaId: `p${i}`, foto: fotoDe(p01()) });
    expect(MAX_HISTORIAL).toBe(60);
    expect(h.deshacer).toHaveLength(60);
    expect(h.deshacer[0]!.pantallaId).toBe('p5');
  });
});
