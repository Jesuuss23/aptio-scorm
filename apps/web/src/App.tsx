import { Estructura } from '@aptio/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, type ConexionesIA as ResumenConexiones, CREAN_PROYECTOS, ErrorApi, NOMBRE_ROL, type Usuario, VEN_CONEXIONES, VEN_COSTOS, VEN_OPERACION, VEN_SITIO } from './api';
import { GRUPOS_SUPERADMIN, MENU, resolverVista } from './menu';
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
import { ConexionesIA } from './vistas/ConexionesIA';
import { OperacionVista } from './vistas/OperacionVista';
import { MedidorCostoIA } from './vistas/MedidorCostoIA';
import { EditorPaginaSitio } from './vistas/EditorPaginaSitio';
import { SitioAjustes } from './vistas/SitioAjustes';
import { SitioContenido } from './vistas/SitioContenido';
import { SitioPaginas } from './vistas/SitioPaginas';
import { SitioResumen } from './vistas/SitioResumen';

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
  // HU-1304 · Medidor del mes para administración; se vuelve a pedir al cambiar de vista o al guardar una conexión.
  const [conexiones, setConexiones] = useState<ResumenConexiones | null>(null);
  const [vuelta, setVuelta] = useState(0);
  const refrescarMedidor = useCallback(() => setVuelta((n) => n + 1), []);
  const veConexiones = Boolean(usuario && VEN_CONEXIONES.includes(usuario.rol));

  useEffect(() => {
    api.yo().then(setUsuario, (e: unknown) => {
      if (e instanceof ErrorApi && e.estado !== 401) console.error(e);
      setUsuario(null);
    });
  }, []);

  useEffect(() => {
    if (!veConexiones) return;
    let vigente = true;
    api.conexionesIA().then((r) => { if (vigente) setConexiones(r); }, () => undefined);
    return () => { vigente = false; };
  }, [veConexiones, camino, vuelta]);

  useEffect(() => {
    if (usuario === null && !PUBLICAS.includes(camino)) navegar('/ingresar');
    // HU-1501 · El superadmin no tiene organización: su panel es el grupo «Sitio web» (SUP-166).
    const inicio = usuario && VEN_SITIO.includes(usuario.rol) ? '/sitio' : '/';
    if (usuario && camino === '/ingresar') navegar(inicio);
    else if (usuario && inicio === '/sitio' && !camino.startsWith('/sitio')) navegar('/sitio');
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
    : vista.sub === 'editor-pagina'
      ? [vista.grupo, 'Páginas', vista.nombre]
      : vista.id
      ? vista.sub
        ? [vista.grupo, 'Proyectos', titulo || 'Proyecto', vista.nombre]
        : [vista.grupo, vista.activo === '/' ? 'Proyectos' : 'Clientes y kits', titulo || vista.nombre]
      : [vista.grupo, vista.nombre];
  const puedeCrear = CREAN_PROYECTOS.includes(usuario.rol);
  const venCostos = VEN_COSTOS.includes(usuario.rol);
  const veOperacion = VEN_OPERACION.includes(usuario.rol);
  const veSitio = VEN_SITIO.includes(usuario.rol);
  // Nuevo SCORM y Rentabilidad solo aparecen a quien puede usarlos (RN-01-2: la API también lo valida).
  // HU-1501 · El superadmin ve solo «Sitio web»; el resto de los roles nunca lo ve (CP-109).
  const menu = MENU.filter((g) => GRUPOS_SUPERADMIN.includes(g.nombre) === veSitio).map((g) => ({ ...g, items: g.items.filter((i) => (i.ruta !== '/nuevo' || puedeCrear) && (i.ruta !== '/rentabilidad' || venCostos) && (i.ruta !== '/conexiones-ia' || veConexiones) && (i.ruta !== '/operacion' || veOperacion)) })).filter((g) => g.items.length);
  return (
    <Estructura
      menu={menu}
      rutaActual={vista?.activo ?? camino}
      ruta={ruta}
      usuario={{ nombre: usuario.nombre, rol: NOMBRE_ROL[usuario.rol] }}
      alNavegar={navegar}
      alSalir={salir}
      pie={veConexiones && conexiones ? <MedidorCostoIA resumen={conexiones} /> : null}
    >
      {vista?.sub === 'editor-pagina' && veSitio ? (
        <EditorPaginaSitio key={vista.id} paginaId={vista.id!} nueva={new URLSearchParams(busqueda).has('nueva')} />
      ) : vista?.sub === 'vista-previa' ? (
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
      ) : vista?.activo === '/sitio' && veSitio ? (
        <SitioResumen />
      ) : vista?.activo === '/sitio/paginas' && veSitio ? (
        <SitioPaginas />
      ) : vista?.activo === '/sitio/contenido' && veSitio ? (
        <SitioContenido />
      ) : vista?.activo === '/sitio/ajustes' && veSitio ? (
        <SitioAjustes />
      ) : vista?.activo === '/operacion' && veOperacion ? (
        <OperacionVista />
      ) : vista?.activo === '/conexiones-ia' && veConexiones ? (
        <ConexionesIA alCambiar={refrescarMedidor} />
      ) : vista?.activo === '/rentabilidad' && venCostos ? (
        <Rentabilidad rol={usuario.rol} />
      ) : vista?.activo === '/nuevo' && puedeCrear ? (
        <NuevoScorm />
      ) : vista?.activo === '/clientes' && vista.id ? (
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
