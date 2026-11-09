import { Estructura } from '@aptio/ui';
import { useEffect, useState } from 'react';
import { api, ErrorApi, NOMBRE_ROL, type Usuario } from './api';
import { MENU, NOMBRE_VISTA } from './menu';
import { navegar, useRuta } from './ruta';
import { Ingreso, NuevaClave, Olvido } from './vistas/Acceso';
import { Proyectos } from './vistas/Proyectos';

const PUBLICAS = ['/ingresar', '/olvido', '/clave'];

export function App() {
  const { camino, busqueda } = useRuta();
  // undefined = comprobando la sesión; null = sin sesión.
  const [usuario, setUsuario] = useState<Usuario | null | undefined>(undefined);

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
  const vista = NOMBRE_VISTA[camino] ?? 'Página no encontrada';
  return (
    <Estructura
      menu={MENU}
      rutaActual={camino}
      ruta={['Inicio', vista]}
      usuario={{ nombre: usuario.nombre, rol: NOMBRE_ROL[usuario.rol] }}
      alNavegar={navegar}
      alSalir={salir}
    >
      {camino === '/' ? (
        <Proyectos />
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
