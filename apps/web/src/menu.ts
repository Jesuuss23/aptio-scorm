import type { GrupoMenu } from '@aptio/ui';

/**
 * Menú de la barra lateral (DESIGN.md). Solo se listan las vistas que ya existen; las demás se
 * agregan con sus historias: Nuevo SCORM, Producción, Revisión, Editor, Entrega, Clientes y kits…
 */
export const MENU: GrupoMenu[] = [{ nombre: 'Inicio', items: [{ ruta: '/', nombre: 'Proyectos' }] }];

export const NOMBRE_VISTA: Record<string, string> = { '/': 'Proyectos' };
