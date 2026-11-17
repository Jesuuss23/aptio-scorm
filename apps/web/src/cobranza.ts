// HU-1708 · El estado de cobranza compartido por las vistas: el contexto con la solo lectura y el evento para volver a
// pedirlo tras pagar.
import { createContext, useContext } from 'react';
import type { Cobranza } from './api';

/** Avisa a la vista global que vuelva a pedir el estado de cobranza (por ejemplo, tras pagar). */
export const EVENTO_COBRANZA = 'aptio:cobranza';
export const avisarCobranza = () => window.dispatchEvent(new Event(EVENTO_COBRANZA));

export const CobranzaContexto = createContext<Cobranza | null>(null);
/** La cuenta está suspendida: las vistas deshabilitan generar y editar. */
export const useSoloLectura = () => useContext(CobranzaContexto)?.estado === 'SUSPENDIDA';
