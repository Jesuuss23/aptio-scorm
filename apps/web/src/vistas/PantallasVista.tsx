// HU-0406 y HU-0407 · Resultado de la etapa 4: las pantallas armadas con la disposición y los colores del kit, y cada
// actividad con lo que trae. CP-043: mientras la
// etapa corre, cada pantalla lista aparece en su lugar y las que faltan se ven como espacios en espera.
import type { PantallasCurso } from '@aptio/schema/generacion';
import { DISPOSITIVOS, NOMBRE_DISPOSICION } from '@aptio/schema/marca';
import { type CSSProperties, useEffect, useState } from 'react';
import { api, ErrorApi } from '../api';
import { contenidoZona } from '../formato';
import './fuentes-kit';
import { Miniatura } from './PantallasModelo';

type Dispositivo = (typeof DISPOSITIVOS)[number];

export function PantallasVista({ generacionId, clave }: { generacionId: string; clave?: string }) {
  const [d, setD] = useState<PantallasCurso | null>(null);
  const [error, setError] = useState('');
  const [dispositivo, setDispositivo] = useState<Dispositivo>('escritorio');

  // `clave` cambia con cada pantalla lista: se vuelve a pedir el avance.
  useEffect(() => {
    api.etapaGeneracion<PantallasCurso>(generacionId, 'PANTALLAS').then(
      (e) => (e.datos ? setD(e.datos) : setError('La etapa todavía no tiene pantallas')),
      (e: unknown) => setError(e instanceof ErrorApi ? e.message : 'No se pudieron cargar las pantallas'),
    );
  }, [generacionId, clave]);

  if (error && !d) return <div className="nota error" role="alert">{error}</div>;
  if (!d) return <p className="sec" role="status">Cargando pantallas…</p>;
  const { paleta, tipografias } = d.kit;
  const estilo = {
    '--k-primario': paleta.primario, '--k-secundario': paleta.secundario, '--k-acento': paleta.acento,
    '--k-fondo': paleta.fondo, '--k-texto': paleta.texto, '--k-titulos': `'${tipografias.titulos}', sans-serif`, '--k-textos': `'${tipografias.textos}', sans-serif`,
  } as CSSProperties;
  const terminado = Boolean(d.curso);
  return (
    <div className="pantallas-vista" style={estilo} role="region" aria-label="Pantallas armadas con el kit">
      <div className="kit-fila">
        <p className="sec num" role="status">{d.pantallas.length} de {d.total} pantallas{terminado ? '' : ' · se agregan a medida que quedan listas'}</p>
        <div className="opciones" role="group" aria-label="Dispositivo">
          {DISPOSITIVOS.map((x) => (
            <button key={x} type="button" className="opcion" aria-pressed={dispositivo === x} onClick={() => setDispositivo(x)}>
              {x === 'celular' ? 'Celular' : 'Escritorio'}
            </button>
          ))}
        </div>
      </div>
      {d.advertencias.map((a) => <p key={a} className="nota aviso">{a}</p>)}
      {terminado ? <p className="nota">Propuesta de la IA con el kit de {d.kit.nombre}. Cada actividad trae sus datos; las imágenes y la voz se agregan en las etapas siguientes.</p> : null}
      <ol className="pantallas-rejilla" aria-label="Pantallas">
        {Array.from({ length: Math.max(d.total, d.pantallas.length) }, (_, i) => {
          const p = d.pantallas.find((x) => x.orden === i + 1);
          const numero = String(i + 1).padStart(2, '0');
          const modelo = p ? d.modelos[p.disposicion] : undefined;
          if (!p || !modelo) {
            return (
              <li key={`espera-${numero}`} className="pantalla-celda" aria-label={`Pantalla ${numero} en espera`}>
                <span className={`pantalla-espera ${dispositivo}`} />
                <span className="sec num">{numero}</span>
              </li>
            );
          }
          return (
            <li key={p.id} className="pantalla-celda" aria-label={`Pantalla ${p.id}: ${p.titulo}`}>
              <Miniatura definicion={modelo} dispositivo={dispositivo} fondo={p.fondo} contenido={(z) => contenidoZona(p, z, d.kit.personaje)} />
              <span className="pantalla-nombre"><span className="num">{numero}</span> {p.titulo}</span>
              <span className="fila-chips">
                <span className="chip">{NOMBRE_DISPOSICION[p.disposicion]}</span>
                {p.actividad?.interaccion?.modo === 'sumativa' ? <span className="chip aviso">Calificada</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
