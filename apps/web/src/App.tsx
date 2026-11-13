import { Estructura } from '@aptio/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, CREAN_PROYECTOS, ErrorApi, NOMBRE_ROL, type Usuario, VEN_COSTOS } from './api';
import { MENU, resolverVista } from './menu';
import { navegar, useRuta } from './ruta';
import { Ingreso, NuevaClave, Olvido } from './vistas/Acceso';
import { ClienteDetalle } from './vistas/ClienteDetalle';
import { Clientes } from './vistas/Clientes';
import { EditorVista } from './vistas/EditorVista';
import { NuevoScorm } from './vistas/NuevoScorm';
import { ProyectoDetalle } from './vistas/ProyectoDetalle';
import { Proyectos } from './vistas/Proyectos';
import { RevisionVista } from './vistas/RevisionVista';
import { VistaPrevia } from './vistas/VistaPrevia';
import { EntregaVista } from './vistas/EntregaVista';
import { IdiomasVista } from './vistas/IdiomasVista';
import { AlineacionVista } from './vistas/AlineacionVista';
import { NavegacionVista } from './vistas/NavegacionVista';
import { VideoVista } from './vistas/VideoVista';
import { PersonajeVozVista } from './vistas/PersonajeVozVista';
import { Rentabilidad } from './vistas/Rentabilidad';

const PUBLICAS = ['/ingresar', '/olvido', '/clave'];

export function App() {
  const { camino, busqueda } = useRuta();
  // undefined = comprobando la sesión; null = sin sesión.
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);
  // Nombre que la vista de detalle muestra en la ruta (p. ej. el nombre del cliente).
  // Se guarda con su ruta para no mostrar el nombre de otra vista al navegar.
  const [tituloDe, setTituloDe] = useState({ camino: '', texto: '' });
  const alCargar = useCallback((texto: string) => setTituloDe({ camino: window.location.pathname, texto }), []);
  const titulo = tituloDe.camino === camino ? tituloDe.texto : '';

  useEffect(() => {
    api.yo().then(setUsuario, (e: unknown) => {
      if (e instanceof ErrorApi && e.estado !== 401) console.error(e);
      setUsuario(null);
    });
  }, []);

  useEffect(() => {
    if (usuario === null && !PUBLICAS.includes(camino)) navegar('/ingresar');
    if (usuario && camino === '/ingresar') navegar('/');
  }, [usuario, camino]);

  if (camino === '/clave') return <NuevaClave token={new URLSearchParams(busqueda).get('token') ?? ''} />;
  if (camino === '/olvido') return <Olvido />;
  if (usuario === undefined) return <p className="sr" role="status">Cargando…</p>;
  if (usuario === null || camino === '/ingresar') return <Ingreso alIngresar={setUsuario} />;

  const salir = async () => {
    await api.salir().catch(() => undefined);
    setUsuario(null);
  };
  const vista = resolverVista(camino);
  const ruta = !vista
    ? ['Inicio', 'Página no encontrada']
    : vista.id
      ? vista.sub
        ? [vista.grupo, 'Proyectos', titulo || 'Proyecto', vista.nombre]
        : [vista.grupo, vista.activo === '/' ? 'Proyectos' : 'Clientes y kits', titulo || vista.nombre]
      : [vista.grupo, vista.nombre];
  const puedeCrear = CREAN_PROYECTOS.includes(usuario.rol);
  const venCostos = VEN_COSTOS.includes(usuario.rol);
  // Nuevo SCORM y Rentabilidad solo aparecen a quien puede usarlos (RN-01-2: la API también lo valida).
  const menu = MENU.map((g) => ({ ...g, items: g.items.filter((i) => (i.ruta !== '/nuevo' || puedeCrear) && (i.ruta !== '/rentabilidad' || venCostos)) })).filter((g) => g.items.length);
  return (
    <Estructura
      menu={menu}
      rutaActual={vista?.activo ?? camino}
      ruta={ruta}
      usuario={{ nombre: usuario.nombre, rol: NOMBRE_ROL[usuario.rol] }}
      alNavegar={navegar}
      alSalir={salir}
    >
      {vista?.sub === 'vista-previa' ? (
        <VistaPrevia key={vista.id + busqueda} proyectoId={vista.id!} alCargar={alCargar} prueba={new URLSearchParams(busqueda)} />
      ) : vista?.sub === 'entrega' ? (
        <EntregaVista key={vista.id} proyectoId={vista.id!} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.sub === 'idiomas' ? (
        <IdiomasVista key={vista.id} proyectoId={vista.id!} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.sub === 'alineacion' ? (
        <AlineacionVista key={vista.id} proyectoId={vista.id!} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.sub === 'navegacion' ? (
        <NavegacionVista key={vista.id} proyectoId={vista.id!} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.sub === 'video' ? (
        <VideoVista key={vista.id} proyectoId={vista.id!} pantallaId={new URLSearchParams(busqueda).get('pantalla')} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.sub === 'voz' ? (
        <PersonajeVozVista key={vista.id} proyectoId={vista.id!} pantallaId={new URLSearchParams(busqueda).get('pantalla')} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.sub === 'revision' ? (
        <RevisionVista key={vista.id} proyectoId={vista.id!} rol={usuario.rol} alCargar={alCargar} pantallaId={new URLSearchParams(busqueda).get('pantalla')} />
      ) : vista?.sub === 'editor' ? (
        <EditorVista key={vista.id} proyectoId={vista.id!} pantallaId={new URLSearchParams(busqueda).get('pantalla')} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.activo === '/' && vista.id ? (
        <ProyectoDetalle key={vista.id} id={vista.id} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.activo === '/' ? (
        <Proyectos rol={usuario.rol} />
      ) : vista?.activo === '/rentabilidad' && venCostos ? (
        <Rentabilidad rol={usuario.rol} />
      ) : vista?.activo === '/nuevo' && puedeCrear ? (
        <NuevoScorm />
      ) : vista?.id ? (
        <ClienteDetalle key={vista.id} id={vista.id} rol={usuario.rol} alCargar={alCargar} />
      ) : vista?.activo === '/clientes' ? (
        <Clientes rol={usuario.rol} />
      ) : (
        <div className="ap-cabecera">
          <div>
            <h1>Página no encontrada</h1>
            <p>
              <a href="/" onClick={(e) => { e.preventDefault(); navegar('/'); }}>Volver a Proyectos</a>
            </p>
          </div>
        </div>
      )}
    </Estructura>
  );
}
