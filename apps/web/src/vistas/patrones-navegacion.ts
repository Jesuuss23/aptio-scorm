// HU-1103 · Catálogo de patrones de navegación para PNT-17 y la vista previa: nombre, descripción, uso y miniatura.
import type { ModoNavegacion, PatronNavegacion } from '../api';

export type PatronBase = Exclude<PatronNavegacion, 'personalizado'>;

export const PATRONES: { id: PatronBase; nombre: string; descripcion: string; uso: string }[] = [
  { id: 'clasico', nombre: 'Clásico', descripcion: 'Barra superior, temario y Anterior / Siguiente', uso: 'Cursos formales, escritorio' },
  { id: 'historias', nombre: 'Historias', descripcion: 'Pantalla completa; se toca a los lados', uso: 'Cápsulas cortas en celular' },
  { id: 'vertical', nombre: 'Desplazamiento vertical', descripcion: 'Una pantalla tras otra con «Continuar ↓»', uso: 'Lectura con actividades' },
  { id: 'mapa', nombre: 'Mapa de misiones', descripcion: 'Módulos como estaciones que se desbloquean', uso: 'Gamificación' },
  { id: 'hub', nombre: 'Menú de temas', descripcion: 'Tarjetas por tema en cualquier orden', uso: 'Consulta y onboarding' },
  { id: 'ramificado', nombre: 'Ramificado', descripcion: 'El camino depende de las decisiones', uso: 'Escenarios y casos' },
  { id: 'inmersivo', nombre: 'Inmersivo / juego', descripcion: 'Sin barras; marcador de puntos flotante', uso: 'Retos y quiz gamificado' },
];

export const NOMBRE_PATRON: Record<PatronNavegacion, string> = {
  clasico: 'Clásico', historias: 'Historias', vertical: 'Desplazamiento vertical', mapa: 'Mapa de misiones',
  hub: 'Menú de temas', ramificado: 'Ramificado', inmersivo: 'Inmersivo', personalizado: 'Personalizado',
};
export const NOMBRE_MODO: Record<ModoNavegacion, string> = { libre: 'libre', condiciones: 'actividades obligatorias', secuencial: 'secuencial' };
export const esPatron = (x: string | null | undefined): x is PatronNavegacion => Boolean(x && x in NOMBRE_PATRON);
export const esModo = (x: string | null | undefined): x is ModoNavegacion => Boolean(x && x in NOMBRE_MODO);

