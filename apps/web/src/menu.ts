import type { GrupoMenu } from '@aptio/ui';

/**
 * Menú de la barra lateral (DESIGN.md). Solo se listan las vistas que ya existen; las demás se
 * agregan con sus historias: Nuevo SCORM, Producción, Revisión, Editor, Entrega, Rentabilidad…
 */
export const MENU: GrupoMenu[] = [
  { nombre: 'Inicio', items: [{ ruta: '/', nombre: 'Proyectos' }] },
  { nombre: 'Empresa', items: [{ ruta: '/clientes', nombre: 'Clientes y kits' }] },
];

/** Vista a partir de la ruta: grupo de la ruta, nombre, ítem activo del menú y parámetro. */
export function resolverVista(camino: string): { grupo: string; nombre: string; activo: string; id?: string } | null {
  if (camino === '/') return { grupo: 'Inicio', nombre: 'Proyectos', activo: '/' };
  if (camino === '/clientes') return { grupo: 'Empresa', nombre: 'Clientes y kits', activo: '/clientes' };
  const cliente = camino.match(/^\/clientes\/([0-9a-f-]{36})$/i);
  if (cliente) return { grupo: 'Empresa', nombre: 'Cliente', activo: '/clientes', id: cliente[1]! };
  return null;
}
