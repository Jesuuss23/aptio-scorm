// HU-1304 · Medidor «Costo de IA del mes» de la barra lateral (prototipo): total del mes de Lima frente a la suma de
// los límites de Conexiones IA, en rojo al llegar al tope.
import type { ConexionesIA } from '../api';
import { usd } from '../formato';
import { medidorMes } from './conexiones-ia';

export function MedidorCostoIA({ resumen }: { resumen: ConexionesIA }) {
  const { porcentaje, alTope } = medidorMes(resumen.gastoMesUsd, resumen.limiteTotalUsd);
  return (
    <div className={`medidor-ia${alTope ? ' al-tope' : ''}`} role="group" aria-label="Costo de IA del mes">
      <div className="fila"><span>Costo de IA del mes</span><b className="num">{usd(resumen.gastoMesUsd)}</b></div>
      {porcentaje !== null ? (
        <>
          <span className="pista" aria-hidden="true"><i style={{ width: `${porcentaje}%` }} /></span>
          <small>{alTope ? `Al tope: ${usd(resumen.limiteTotalUsd!)} de límite` : `${porcentaje} % de ${usd(resumen.limiteTotalUsd!)}`}</small>
        </>
      ) : <small>Sin límites de gasto</small>}
    </div>
  );
}
