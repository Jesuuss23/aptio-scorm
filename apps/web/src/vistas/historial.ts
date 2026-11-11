// HU-0607 · Deshacer y rehacer en el editor (SUP-46). Lógica pura, sin DOM ni red:
// - `fotoDe` toma lo que el editor puede cambiar de una pantalla (título, textos, narración, disposición, ajustes y extras);
// - `conFoto` arma la pantalla como se ve en esa foto, para mostrarla al instante mientras se espera el guardado;
// - `cambioHacia` calcula el cuerpo del PATCH que lleva la pantalla guardada a la foto elegida;
// - la pila guarda hasta 60 fotos para deshacer; un cambio nuevo vacía la de rehacer.
import type { AjusteElemento, ElementoExtra } from '@aptio/player';
import { plantillaPara, type Disposicion } from '@aptio/schema/marca';
import type { PantallaDoc } from '@aptio/schema/revision';

type Texto = { es?: string; en?: string };
type PantallaEditable = PantallaDoc & { plantilla?: string; ajustes?: Record<string, AjusteElemento>; extras?: ElementoExtra[] };

/** Lo que el editor cambia de una pantalla. Es una copia: cambiar la pantalla después no la toca. */
export type Foto = {
  titulo: Texto;
  textos: Record<string, Texto>;
  narracion?: Texto;
  disposicion?: string;
  ajustes: Record<string, AjusteElemento>;
  extras: ElementoExtra[];
};

/** El cuerpo del PATCH de pantalla, sin la versión. */
export type CambioHacia = {
  titulo?: Texto;
  textos?: Record<string, Texto>;
  narracion?: Texto;
  disposicion?: string;
  ajustes?: Record<string, AjusteElemento | null>;
  extras?: ElementoExtra[];
};

const copia = <T>(v: T): T => structuredClone(v);
const igual = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** El primer texto con rol título va con el título de la pantalla (la API lo cambia junto con `titulo`). */
const idTitulo = (p: PantallaDoc) => p.bloques.find((b) => b.tipo === 'texto' && b.rol === 'titulo')?.id;

export function fotoDe(pantalla: PantallaDoc): Foto {
  const p = pantalla as PantallaEditable;
  const textos: Record<string, Texto> = {};
  for (const b of p.bloques) if (b.tipo === 'texto' && b.id !== idTitulo(p)) textos[b.id] = copia(b.contenido ?? {});
  const foto: Foto = { titulo: copia(p.titulo), textos, ajustes: copia(p.ajustes ?? {}), extras: copia(p.extras ?? []) };
  if (p.narracion) foto.narracion = copia(p.narracion.texto);
  if (p.disposicion !== undefined) foto.disposicion = p.disposicion;
  return foto;
}

/** La pantalla como se ve en la foto (para mostrarla antes de que se guarde). No cambia la pantalla que recibe. */
export function conFoto(pantalla: PantallaDoc, foto: Foto): PantallaDoc {
  const p = copia(pantalla) as PantallaEditable;
  const titulo = idTitulo(p);
  p.titulo = copia(foto.titulo);
  for (const b of p.bloques) {
    if (b.id === titulo) b.contenido = copia(foto.titulo);
    else if (foto.textos[b.id]) b.contenido = copia(foto.textos[b.id]!);
  }
  if (p.narracion && foto.narracion) p.narracion = { ...p.narracion, texto: copia(foto.narracion) };
  if (foto.disposicion !== undefined && foto.disposicion !== p.disposicion) {
    p.disposicion = foto.disposicion;
    if (p.plantilla) p.plantilla = plantillaPara(p.plantilla, foto.disposicion as Disposicion);
  }
  if (Object.keys(foto.ajustes).length) p.ajustes = copia(foto.ajustes);
  else delete p.ajustes;
  if (foto.extras.length) p.extras = copia(foto.extras);
  else delete p.extras;
  return p;
}

/**
 * El PATCH que lleva la pantalla guardada a la foto. La API aplica en orden: título y textos, disposición (que borra los
 * ajustes), extras (que borran los ajustes de los extras quitados) y ajustes; por eso:
 * - si cambia la disposición, van todos los ajustes de la foto;
 * - si no, solo los que cambian, con `null` para los que la foto no tiene, salvo los de extras que ya no estarán.
 * Devuelve null si no hay nada que guardar.
 */
export function cambioHacia(guardada: PantallaDoc, objetivo: Foto): CambioHacia | null {
  const antes = fotoDe(guardada);
  const cambio: CambioHacia = {};
  if (!igual(antes.titulo, objetivo.titulo)) cambio.titulo = copia(objetivo.titulo);
  const textos: Record<string, Texto> = {};
  for (const [id, t] of Object.entries(objetivo.textos)) if (id in antes.textos && !igual(antes.textos[id], t)) textos[id] = copia(t);
  if (Object.keys(textos).length) cambio.textos = textos;
  if (objetivo.narracion && antes.narracion && !igual(antes.narracion, objetivo.narracion)) cambio.narracion = copia(objetivo.narracion);
  const otraDisposicion = objetivo.disposicion !== undefined && (antes.disposicion ?? 'idea') !== objetivo.disposicion;
  if (otraDisposicion) cambio.disposicion = objetivo.disposicion!;
  if (!igual(antes.extras, objetivo.extras)) cambio.extras = copia(objetivo.extras);

  const ajustes: Record<string, AjusteElemento | null> = {};
  if (otraDisposicion) {
    Object.assign(ajustes, copia(objetivo.ajustes));
  } else {
    const existen = new Set([...guardada.bloques.map((b) => b.id), ...objetivo.extras.map((e) => e.id)]);
    for (const [id, a] of Object.entries(objetivo.ajustes)) if (!igual(antes.ajustes[id], a)) ajustes[id] = copia(a);
    for (const id of Object.keys(antes.ajustes)) if (!(id in objetivo.ajustes) && existen.has(id)) ajustes[id] = null;
  }
  if (Object.keys(ajustes).length) cambio.ajustes = ajustes;
  return Object.keys(cambio).length ? cambio : null;
}

/** Una foto de una pantalla en la pila. */
export type Entrada = { pantallaId: string; foto: Foto };
export type Historial = { deshacer: Entrada[]; rehacer: Entrada[] };

export const MAX_HISTORIAL = 60;
export const HISTORIAL_VACIO: Historial = { deshacer: [], rehacer: [] };

/** Un cambio nuevo: guarda cómo estaba la pantalla antes (hasta 60) y vacía rehacer. */
export function registrar(h: Historial, antes: Entrada): Historial {
  return { deshacer: [...h.deshacer, antes].slice(-MAX_HISTORIAL), rehacer: [] };
}

/**
 * Deshacer (o rehacer): saca la última foto de una pila y deja en la otra cómo está ahora esa pantalla.
 * `ahora` da la foto actual de una pantalla. Devuelve null si no hay nada que deshacer (o rehacer).
 */
export function mover(h: Historial, hacia: 'deshacer' | 'rehacer', ahora: (pantallaId: string) => Foto): { historial: Historial; entrada: Entrada } | null {
  const desde = hacia === 'deshacer' ? h.deshacer : h.rehacer;
  const entrada = desde.at(-1);
  if (!entrada) return null;
  const vuelta: Entrada = { pantallaId: entrada.pantallaId, foto: ahora(entrada.pantallaId) };
  const resto = desde.slice(0, -1);
  return hacia === 'deshacer'
    ? { historial: { deshacer: resto, rehacer: [...h.rehacer, vuelta].slice(-MAX_HISTORIAL) }, entrada }
    : { historial: { deshacer: [...h.deshacer, vuelta].slice(-MAX_HISTORIAL), rehacer: resto }, entrada };
}
