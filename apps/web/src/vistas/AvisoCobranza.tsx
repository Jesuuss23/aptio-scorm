// HU-1708 · El aviso global de cobranza (PNT-36, REQ-088, RN-18-8). Con el pago de la renovación pendiente, un aviso en
// todas las vistas con la fecha en que la cuenta quedaría en solo lectura; suspendida, el aviso de solo lectura (no se
// genera ni se edita; lo exportado se puede descargar). «Cómo regularizar» explica qué hacer: el administrador paga en
// Plan y suscripción; los demás roles se lo piden. La API valida igual (403 SUSCRIPCION_SUSPENDIDA).
import { monto2 } from '@aptio/schema/suscripciones';
import { useId, useState } from 'react';
import type { Cobranza } from '../api';
import { navegar } from '../ruta';

const fechaLarga = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Lima' });

export function AvisoCobranza({ cobranza }: { cobranza: Cobranza | null }) {
  const id = useId();
  const [abierto, setAbierto] = useState(false);
  if (!cobranza || cobranza.estado === 'AL_DIA') return null;
  const suspendida = cobranza.estado === 'SUSPENDIDA';
  const total = cobranza.total !== null && cobranza.moneda ? monto2(cobranza.total, cobranza.moneda) : null;
  return (
    <section className={`nota ${suspendida ? 'error' : 'aviso'} aviso-cobranza`} aria-labelledby={`${id}-titulo`}>
      <p><b id={`${id}-titulo`}>{suspendida ? 'Cuenta en solo lectura' : 'Falta el pago de la renovación'}</b></p>
      <p>
        {suspendida
          ? `No recibimos el pago de la renovación${total ? ` (${total})` : ''}. Puedes ver los proyectos y descargar lo exportado, pero no generar ni editar hasta regularizar.`
          : `El período terminó${cobranza.finPeriodo ? ` el ${fechaLarga(cobranza.finPeriodo)}` : ''} y falta pagar la renovación${total ? ` (${total})` : ''}.${cobranza.suspensionEn ? ` Si no se paga antes del ${fechaLarga(cobranza.suspensionEn)}, la cuenta queda en solo lectura.` : ''}`}
      </p>
      <div className="acciones-form">
        <button type="button" className="boton" aria-expanded={abierto} aria-controls={`${id}-como`} onClick={() => setAbierto((x) => !x)}>Cómo regularizar</button>
        {cobranza.puedePagar ? (
          <a className="boton primario" href={cobranza.regularizar} onClick={(e) => { e.preventDefault(); navegar(cobranza.regularizar); }}>Pagar ahora</a>
        ) : null}
      </div>
      <div id={`${id}-como`} hidden={!abierto}>
        {cobranza.puedePagar ? (
          <p>Entra a Plan y suscripción y usa «Pagar ahora» con tu tarjeta. Al confirmarse el pago, la cuenta vuelve a la normalidad al instante{suspendida ? ' y el período nuevo empieza ese día' : ''}.</p>
        ) : (
          <p>Pide al administrador de tu organización que pague la renovación en Plan y suscripción. Al confirmarse el pago, la cuenta vuelve a la normalidad al instante.</p>
        )}
      </div>
    </section>
  );
}
