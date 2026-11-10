import { Estructura } from '@aptio/ui';
import { useCallback, useEffect, useState } from 'react';
import { api, ErrorApi, NOMBRE_ROL, type Usuario } from './api';
import { MENU, resolverVista } from './menu';
import { navegar, useRuta } from './ruta';
import { Ingreso, NuevaClave, Olvido } from './vistas/Acceso';
import { ClienteDetalle } from './vistas/ClienteDetalle';
import { Clientes } from './vistas/Clientes';
import { Proyectos } from './vistas/Proyectos';

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
      ? [vista.grupo, 'Clientes y kits', titulo || vista.nombre]
      : [vista.grupo, vista.nombre];
  return (
    <Estructura
      menu={MENU}
      rutaActual={vista?.activo ?? camino}
      ruta={ruta}
      usuario={{ nombre: usuario.nombre, rol: NOMBRE_ROL[usuario.rol] }}
      alNavegar={navegar}
      alSalir={salir}
    >
      {vista?.activo === '/' ? (
        <Proyectos />
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
