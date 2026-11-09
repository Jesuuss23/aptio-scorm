import { useEffect, useState } from 'react';

/** Navegación mínima con la History API; suficiente hasta que haya más vistas. */
export function navegar(destino: string) {
  if (destino === window.location.pathname + window.location.search) return;
  window.history.pushState(null, '', destino);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function useRuta() {
  const [ruta, setRuta] = useState(() => ({ camino: window.location.pathname, busqueda: window.location.search }));
  useEffect(() => {
    const cambiar = () => setRuta({ camino: window.location.pathname, busqueda: window.location.search });
    window.addEventListener('popstate', cambiar);
    return () => window.removeEventListener('popstate', cambiar);
  }, []);
  return ruta;
}
