import type { MouseEvent, ReactNode } from 'react';
import { Marca } from './Logo.js';

export interface ItemMenu {
  ruta: string;
  nombre: string;
  /** Número del paso en el flujo principal (Nuevo SCORM 1 → … → Entrega 5). */
  paso?: number;
}
export interface GrupoMenu {
  nombre: string;
  items: ItemMenu[];
}
export interface UsuarioVisible {
  nombre: string;
  rol: string;
}

export interface EstructuraProps {
  menu: GrupoMenu[];
  rutaActual: string;
  /** Ruta de la barra superior: cliente / proyecto / vista. El último elemento es la vista. */
  ruta: string[];
  usuario: UsuarioVisible;
  /** Navegación sin recargar; recibe la ruta del enlace. */
  alNavegar?: (ruta: string) => void;
  alSalir?: () => void;
  estado?: ReactNode;
  acciones?: ReactNode;
  children: ReactNode;
}

export const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Barra lateral cobalto de 240 px, barra superior con ruta y contenido a 32 px (HU-0110). */
export function Estructura({ menu, rutaActual, ruta, usuario, alNavegar, alSalir, estado, acciones, children }: EstructuraProps) {
  const navegar = (e: MouseEvent<HTMLAnchorElement>, destino: string) => {
    if (!alNavegar || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    alNavegar(destino);
  };
  const vista = ruta.at(-1) ?? '';
  return (
    <div className="ap-app">
      <nav className="ap-lateral" aria-label="Menú principal">
        <a className="ap-marca" href="/" onClick={(e) => navegar(e, '/')}>
          <Marca subtitulo="Microaprendizaje con IA" />
        </a>
        {menu.map((g) => (
          <div key={g.nombre} role="group" aria-label={g.nombre} style={{ display: 'contents' }}>
            <div className="ap-grupo">{g.nombre}</div>
            {g.items.map((i) => (
              <a
                key={i.ruta}
                className="ap-item"
                href={i.ruta}
                aria-current={i.ruta === rutaActual ? 'page' : undefined}
                onClick={(e) => navegar(e, i.ruta)}
              >
                <span className="ap-paso">{i.paso ?? ''}</span>
                {i.nombre}
              </a>
            ))}
          </div>
        ))}
        <div className="ap-pie">
          <div className="ap-usuario">
            <span className="ap-avatar" aria-hidden="true">{iniciales(usuario.nombre)}</span>
            <div>
              <b>{usuario.nombre}</b>
              <small>{usuario.rol}</small>
            </div>
            {alSalir ? (
              <button type="button" className="ap-salir" onClick={alSalir}>
                Salir
              </button>
            ) : null}
          </div>
        </div>
      </nav>
      <div className="ap-principal">
        <header className="ap-superior">
          <div className="ap-superior-in">
            <nav className="ap-ruta" aria-label="Ruta">
              {ruta.slice(0, -1).map((r, i) => (
                <span key={`${r}-${i}`} style={{ display: 'contents' }}>
                  <span>{r}</span>
                  <span className="ap-sep" aria-hidden="true">/</span>
                </span>
              ))}
              <b aria-current="page">{vista}</b>
            </nav>
            {estado}
            {acciones ? <div className="ap-acciones">{acciones}</div> : null}
          </div>
        </header>
        <main className="ap-contenido" id="contenido">
          {children}
        </main>
      </div>
    </div>
  );
}

/** Cabecera igual en todas las vistas: h1 con el nombre del menú, subtítulo y como máximo una acción. */
export function Cabecera({ titulo, subtitulo, accion }: { titulo: string; subtitulo?: string; accion?: ReactNode }) {
  return (
    <div className="ap-cabecera">
      <div>
        <h1>{titulo}</h1>
        {subtitulo ? <p>{subtitulo}</p> : null}
      </div>
      {accion}
    </div>
  );
}
