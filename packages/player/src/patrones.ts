// HU-1103 · Patrones de navegación (M11, RN-11-1 a RN-11-3): qué patrón se dibuja y cómo se agrupan las pantallas en las
// estaciones del mapa de misiones y en los temas del menú. Son funciones puras: las reglas de avance (`motivoBloqueo`),
// el seguimiento y la reanudación son las mismas en todos los patrones.
import { type Avance, motivoBloqueo, type PantallaPlana } from './navegacion.ts';
import type { CursoReproductor, ModoNavegacion, Navegacion, TextoI18n } from './tipos.ts';

export const PATRONES_BASE = ['clasico', 'historias', 'vertical', 'mapa', 'hub', 'ramificado', 'inmersivo'] as const;
export type PatronBase = (typeof PATRONES_BASE)[number];
const esBase = (x: unknown): x is PatronBase => typeof x === 'string' && (PATRONES_BASE as readonly string[]).includes(x);

/**
 * El patrón que se dibuja. Sin `navegacion`, Clásico; el personalizado usa su patrón base (RN-11-3; sus opciones de
 * progreso, avance, menú y barra llegan con la HU-1104); un valor desconocido también cae en Clásico.
 */
export function patronDe(nav: Navegacion | undefined): PatronBase {
  if (nav?.patron === 'personalizado') return esBase(nav.patronPersonalizado?.base) ? nav.patronPersonalizado!.base as PatronBase : 'clasico';
  return esBase(nav?.patron) ? nav!.patron as PatronBase : 'clasico';
}

/** Mapa de misiones y menú de temas: se elige una estación (o tema) y se recorre por dentro. */
export const conMapa = (p: PatronBase) => p === 'mapa' || p === 'hub';

/** Una estación del mapa o un tema del menú: pantallas `desde`..`hasta` (índices del recorrido, inclusive). */
export interface Estacion {
  titulo: TextoI18n;
  desde: number;
  hasta: number;
}

/**
 * Las estaciones: una por módulo y, dentro de un módulo, una nueva en cada pantalla de sección (disposición `seccion`),
 * que le da su título. Así LOTO, con un módulo y dos secciones, tiene 3 estaciones como el prototipo.
 */
export function estaciones(curso: CursoReproductor, pantallas: readonly PantallaPlana[]): Estacion[] {
  const lista: Estacion[] = [];
  pantallas.forEach((x, i) => {
    const anterior = pantallas[i - 1];
    const nuevoModulo = !anterior || anterior.moduloId !== x.moduloId;
    if (nuevoModulo || x.pantalla.disposicion === 'seccion') {
      const modulo = curso.modulos.find((m) => m.id === x.moduloId);
      const titulo = x.pantalla.disposicion === 'seccion' ? x.pantalla.titulo : nuevoModulo && i === 0 && curso.modulos.length === 1 ? curso.metadatos.titulo : modulo?.titulo ?? x.pantalla.titulo;
      if (lista.length) lista[lista.length - 1]!.hasta = i - 1;
      lista.push({ titulo, desde: i, hasta: i });
    }
  });
  if (lista.length) lista[lista.length - 1]!.hasta = pantallas.length - 1;
  return lista;
}

export interface EstadoEstacion {
  hechas: number;
  total: number;
  /** Se puede entrar: la regla deja ir a su primera pantalla. */
  abierta: boolean;
  completa: boolean;
}

/** Cuántas pantallas de la estación están hechas (vistas y, si tienen actividad, completas) y si se puede entrar. */
export function estadoEstacion(e: Estacion, pantallas: readonly PantallaPlana[], avance: Avance, modo: ModoNavegacion, vistas: ReadonlySet<string>): EstadoEstacion {
  const mias = pantallas.slice(e.desde, e.hasta + 1);
  const hechas = mias.filter((x) => vistas.has(x.pantalla.id) && (!x.conActividad || avance.resultados.get(x.pantalla.id)?.completada)).length;
  // Entrar a una estación es ir a su primera pantalla; volver a una ya visitada siempre se puede.
  const abierta = e.desde <= avance.maxima || motivoBloqueo(pantallas, avance, modo, e.desde) === null;
  return { hechas, total: mias.length, abierta, completa: hechas === mias.length };
}

/** La pantalla a la que lleva una estación: la primera sin hacer a la que se puede ir, o la primera. */
export function entradaEstacion(e: Estacion, pantallas: readonly PantallaPlana[], avance: Avance, modo: ModoNavegacion, vistas: ReadonlySet<string>): number {
  for (let i = e.desde; i <= e.hasta; i++) {
    const x = pantallas[i]!;
    const hecha = vistas.has(x.pantalla.id) && (!x.conActividad || avance.resultados.get(x.pantalla.id)?.completada);
    if (!hecha) return i <= avance.maxima || motivoBloqueo(pantallas, avance, modo, i) === null ? i : e.desde;
  }
  return e.desde;
}
