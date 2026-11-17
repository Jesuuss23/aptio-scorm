// HU-1705/HU-1706 · Lo que comparten la compra de cápsulas y el cambio de plan: la fecha corta, el mensaje de un error
// de la API y Culqi Checkout (se carga solo al pagar). La tarjeta nunca pasa por Aptio SCORM.
import { ErrorApi } from '../api';

const SCRIPT_CULQI = 'https://checkout.culqi.com/js/v4';

export interface CulqiCheckout {
  publicKey: string;
  settings: (o: Record<string, unknown>) => void;
  open: () => void;
  close?: () => void;
  token?: { id: string };
  error?: { user_message?: string };
}
declare global {
  interface Window { Culqi?: CulqiCheckout; culqi?: () => void }
}

export const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', timeZone: 'America/Lima' });
export const mensajeDe = (e: unknown, otro: string) => (e instanceof ErrorApi ? e.message : otro);

export function cargarCulqi(): Promise<CulqiCheckout | null> {
  if (window.Culqi) return Promise.resolve(window.Culqi);
  return new Promise((resolver) => {
    const s = document.createElement('script');
    s.src = SCRIPT_CULQI;
    s.async = true;
    s.onload = () => resolver(window.Culqi ?? null);
    s.onerror = () => resolver(null);
    document.head.appendChild(s);
  });
}

