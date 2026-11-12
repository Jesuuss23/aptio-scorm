import type { GrupoMenu } from '@aptio/ui';

/**
 * Menú de la barra lateral (DESIGN.md). Solo se listan las vistas que ya existen; las demás se
 * agregan con sus historias: Nuevo SCORM, Producción, Revisión, Editor, Entrega, Rentabilidad…
 */
export const MENU: GrupoMenu[] = [
  { nombre: 'Inicio', items: [{ ruta: '/', nombre: 'Proyectos' }, { ruta: '/nuevo', nombre: 'Nuevo SCORM' }] },
  { nombre: 'Empresa', items: [{ ruta: '/clientes', nombre: 'Clientes y kits' }] },
];

/** Vista a partir de la ruta: grupo de la ruta, nombre, ítem activo del menú y parámetro. */
export function resolverVista(camino: string): { grupo: string; nombre: string; activo: string; id?: string; sub?: 'vista-previa' | 'revision' | 'editor' | 'entrega' | 'idiomas' | 'alineacion' } | null {
  if (camino === '/') return { grupo: 'Inicio', nombre: 'Proyectos', activo: '/' };
  if (camino === '/nuevo') return { grupo: 'Inicio', nombre: 'Nuevo SCORM', activo: '/nuevo' };
  const proyecto = camino.match(/^\/proyectos\/([0-9a-f-]{36})$/i);
  if (proyecto) return { grupo: 'Inicio', nombre: 'Proyecto', activo: '/', id: proyecto[1]! };
  const vistaPrevia = camino.match(/^\/proyectos\/([0-9a-f-]{36})\/vista-previa$/i);
  if (vistaPrevia) return { grupo: 'Inicio', nombre: 'Vista previa', activo: '/', id: vistaPrevia[1]!, sub: 'vista-previa' };
  const revision = camino.match(/^\/proyectos\/([0-9a-f-]{36})\/revision$/i);
  if (revision) return { grupo: 'Inicio', nombre: 'Revisión', activo: '/', id: revision[1]!, sub: 'revision' };
  const editor = camino.match(/^\/proyectos\/([0-9a-f-]{36})\/editor$/i);
  if (editor) return { grupo: 'Inicio', nombre: 'Editor', activo: '/', id: editor[1]!, sub: 'editor' };
  const entrega = camino.match(/^\/proyectos\/([0-9a-f-]{36})\/entrega$/i);
  if (entrega) return { grupo: 'Inicio', nombre: 'Entrega', activo: '/', id: entrega[1]!, sub: 'entrega' };
  const idiomas = camino.match(/^\/proyectos\/([0-9a-f-]{36})\/idiomas$/i);
  if (idiomas) return { grupo: 'Inicio', nombre: 'Idiomas', activo: '/', id: idiomas[1]!, sub: 'idiomas' };
  const alineacion = camino.match(/^\/proyectos\/([0-9a-f-]{36})\/alineacion$/i);
  if (alineacion) return { grupo: 'Inicio', nombre: 'Alineación pedagógica', activo: '/', id: alineacion[1]!, sub: 'alineacion' };
  if (camino === '/clientes') return { grupo: 'Empresa', nombre: 'Clientes y kits', activo: '/clientes' };
  const cliente = camino.match(/^\/clientes\/([0-9a-f-]{36})$/i);
  if (cliente) return { grupo: 'Empresa', nombre: 'Cliente', activo: '/clientes', id: cliente[1]! };
  return null;
}
