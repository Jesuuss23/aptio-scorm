// HU-1709 · La pestaña Cupones de Ventas › Facturación (PNT-37, REQ-089, CP-151). Los cupones de campaña y los
// convenios (con dominios de correo) con su beneficio, vigencia, usos y estado; crear, editar y activar u ocultar (ocultar
// no borra: el cupón deja de aceptarse en el pago y conserva sus usos). Solo el superadmin (ADR-011), con auditoría.
import { LIMITES_CUPON, validarCupon } from '@aptio/schema/cupones';
import { useEffect, useRef, useState } from 'react';
import { api, type CuponEntrada, type CuponVenta, ErrorApi, type EstadoCupon } from '../api';

const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const ESTADOS: Record<EstadoCupon, { nombre: string; chip: string }> = {
  ACTIVO: { nombre: 'Activo', chip: 'validado' }, PROGRAMADO: { nombre: 'Programado', chip: '' }, VENCIDO: { nombre: 'Vencido', chip: 'error' }, AGOTADO: { nombre: 'Agotado', chip: 'aviso' }, OCULTO: { nombre: 'Oculto', chip: '' },
};
/** «31 dic. 2026» desde un día AAAA-MM-DD. */
const dia = (d: string) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${d}T12:00:00Z`));
const vigencia = (c: CuponVenta) => (c.vigenciaDesde || c.vigenciaHasta ? `${c.vigenciaDesde ? `Desde ${dia(c.vigenciaDesde)}` : 'Ya'}${c.vigenciaHasta ? ` · vence ${dia(c.vigenciaHasta)}` : ' · sin vencimiento'}` : 'Sin vencimiento');
const lista = (t: string) => t.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

type Aviso = { tipo: 'ok' | 'error'; texto: string } | null;

export function Cupones() {
  const [cupones, setCupones] = useState<CuponVenta[] | null>(null);
  const [error, setError] = useState('');
  const [aviso, setAviso] = useState<Aviso>(null);
  const [editando, setEditando] = useState<CuponVenta | 'nuevo' | null>(null);
  const [ocupado, setOcupado] = useState('');
  const nuevo = useRef<HTMLButtonElement>(null);

  const cargar = () => api.cupones().then((r) => { setCupones(r.cupones); setError(''); }, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los cupones')));
  useEffect(() => { void cargar(); }, []);

  async function alternar(c: CuponVenta) {
    setOcupado(c.id);
    setAviso(null);
    try {
      const h = await api.editarCupon(c.id, { visible: !c.visible });
      setAviso({ tipo: 'ok', texto: h.visible ? `${h.codigo} vuelve a aceptarse en el pago.` : `${h.codigo} quedó oculto: ya no se acepta en el pago y conserva sus ${h.usos} usos.` });
      await cargar();
    } catch (e) {
      setAviso({ tipo: 'error', texto: `No se pudo cambiar ${c.codigo}: ${mensajeDe(e, 'inténtalo de nuevo')}` });
    } finally {
      setOcupado('');
    }
  }

  return (
    <>
      <div className="tarjeta-cabeza">
        <h2>Cupones y convenios</h2>
        <button type="button" className="boton primario" ref={nuevo} onClick={() => { setAviso(null); setEditando('nuevo'); }}>Nuevo cupón</button>
      </div>
      <p className="sec">Un descuento en porcentaje sobre el precio del plan, sin IGV, en el alta y en las renovaciones que indiques. Un convenio solo se acepta con un correo de sus dominios. Ocultar no borra.</p>
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {aviso ? <div className={`nota ${aviso.tipo === 'ok' ? 'validado' : 'error'}`} role={aviso.tipo === 'ok' ? 'status' : 'alert'}>{aviso.texto}</div> : null}
      {editando ? (
        <FormularioCupon key={editando === 'nuevo' ? 'nuevo' : editando.id} inicial={editando === 'nuevo' ? null : editando} alCancelar={() => { setEditando(null); nuevo.current?.focus(); }}
          alGuardar={async (d) => {
            try {
              const h = editando === 'nuevo' ? await api.crearCupon(d) : await api.editarCupon(editando.id, d);
              setEditando(null);
              setAviso({ tipo: 'ok', texto: editando === 'nuevo' ? `Se creó el cupón ${h.codigo}.` : `Se guardó el cupón ${h.codigo}.` });
              await cargar();
              nuevo.current?.focus();
              return [];
            } catch (e) {
              if (e instanceof ErrorApi && e.detalles?.length) return e.detalles.map((x) => String(x.mensaje));
              return [mensajeDe(e, 'No se guardó el cupón')];
            }
          }} />
      ) : null}
      {!cupones ? (!error ? <p className="sec" role="status">Cargando los cupones…</p> : null) : cupones.length === 0 ? <p className="nota">Todavía no hay cupones.</p> : (
        <table className="tabla-popups tabla-comprobantes" aria-label="Cupones">
          <thead><tr><th scope="col">Código</th><th scope="col">Beneficio</th><th scope="col" className="num">Usos</th><th scope="col">Vigencia</th><th scope="col">Estado</th><th scope="col">Acciones</th></tr></thead>
          <tbody>
            {cupones.map((c) => (
              <tr key={c.id}>
                <th scope="row" data-etiqueta="Código"><b className="num">{c.codigo}</b><br /><span className="sec">{c.nombre} · {c.tipo === 'CONVENIO' ? `Convenio: ${c.dominiosCorreo.join(', ')}` : 'Campaña'}</span></th>
                <td data-etiqueta="Beneficio">{c.beneficio}{c.planesPermitidos.length ? <><br /><span className="sec">Planes: {c.planesPermitidos.join(', ')}</span></> : null}</td>
                <td className="num" data-etiqueta="Usos">{c.usos} / {c.limiteUsos ?? '—'}</td>
                <td data-etiqueta="Vigencia">{vigencia(c)}</td>
                <td data-etiqueta="Estado"><span className={`chip ${ESTADOS[c.estado].chip}`}>{ESTADOS[c.estado].nombre}</span></td>
                <td data-etiqueta="Acciones">
                  <div className="popup-acciones">
                    <button type="button" className="boton" onClick={() => { setAviso(null); setEditando(c); }}>Editar<span className="sr"> {c.codigo}</span></button>
                    <button type="button" className="boton" disabled={Boolean(ocupado)} onClick={() => void alternar(c)}>{c.visible ? 'Ocultar' : 'Activar'}<span className="sr"> {c.codigo}</span></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

function FormularioCupon({ inicial, alGuardar, alCancelar }: { inicial: CuponVenta | null; alGuardar: (d: CuponEntrada) => Promise<string[]>; alCancelar: () => void }) {
  const [v, setV] = useState({
    codigo: inicial?.codigo ?? '', nombre: inicial?.nombre ?? '', tipo: inicial?.tipo ?? 'CAMPANA', porcentaje: inicial ? String(inicial.porcentaje) : '',
    ciclosDescuento: inicial?.ciclosDescuento ? String(inicial.ciclosDescuento) : '', vigenciaDesde: inicial?.vigenciaDesde ?? '', vigenciaHasta: inicial?.vigenciaHasta ?? '',
    limiteUsos: inicial?.limiteUsos ? String(inicial.limiteUsos) : '', planes: inicial?.planesPermitidos.join(', ') ?? '', dominios: inicial?.dominiosCorreo.join(', ') ?? '', visible: inicial?.visible ?? true,
  });
  const [errores, setErrores] = useState<string[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const titulo = useRef<HTMLHeadingElement>(null);
  const alerta = useRef<HTMLDivElement>(null);
  useEffect(() => { titulo.current?.focus(); }, []);
  useEffect(() => { if (errores.length) alerta.current?.focus(); }, [errores]);
  const campo = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const numero = (t: string) => (t.trim() === '' ? null : Number(t.trim()));
  const id = `cupon-${inicial?.id ?? 'nuevo'}`;

  function enviar() {
    const d: CuponEntrada = {
      codigo: v.codigo.trim().toUpperCase(), nombre: v.nombre.trim(), tipo: v.tipo as CuponEntrada['tipo'], porcentaje: Number(v.porcentaje.trim() || NaN), ciclosDescuento: numero(v.ciclosDescuento),
      vigenciaDesde: v.vigenciaDesde || null, vigenciaHasta: v.vigenciaHasta || null, limiteUsos: numero(v.limiteUsos), planesPermitidos: lista(v.planes),
      dominiosCorreo: v.tipo === 'CONVENIO' ? lista(v.dominios) : [], visible: v.visible, orden: inicial?.orden ?? 0,
    };
    const r = validarCupon(d);
    if (!r.ok) { setErrores(r.errores.map((x) => x.mensaje)); return; }
    setErrores([]);
    setOcupado(true);
    void alGuardar(r.datos).then((e) => { setErrores(e); setOcupado(false); });
  }

  return (
    <section className="tarjeta corregir-comprobante" aria-labelledby={`${id}-titulo`}>
      <h3 id={`${id}-titulo`} tabIndex={-1} ref={titulo}>{inicial ? `Editar ${inicial.codigo}` : 'Nuevo cupón'}</h3>
      {inicial && inicial.usos > 0 ? <p className="nota aviso">Ya se usó {inicial.usos} {inicial.usos === 1 ? 'vez' : 'veces'}: los cambios rigen para los pagos nuevos; las suscripciones que ya lo usaron conservan su descuento.</p> : null}
      <form noValidate aria-label={inicial ? `Cupón ${inicial.codigo}` : 'Nuevo cupón'} onSubmit={(e) => { e.preventDefault(); enviar(); }}>
        {errores.length ? <div className="nota error" role="alert" tabIndex={-1} ref={alerta}><ul>{errores.map((x) => <li key={x}>{x}</li>)}</ul></div> : null}
        <div className="plan-campos">
          <p className="campo"><label htmlFor={`${id}-codigo`}>Código</label><input id={`${id}-codigo`} type="text" autoComplete="off" maxLength={30} value={v.codigo} onChange={campo('codigo')} aria-describedby={`${id}-codigo-a`} /><span id={`${id}-codigo-a`} className="sec">Letras, números y guiones; se guarda en mayúsculas.</span></p>
          <p className="campo"><label htmlFor={`${id}-nombre`}>Nombre</label><input id={`${id}-nombre`} type="text" maxLength={LIMITES_CUPON.nombre} value={v.nombre} onChange={campo('nombre')} /></p>
          <p className="campo"><label htmlFor={`${id}-tipo`}>Tipo</label><select id={`${id}-tipo`} value={v.tipo} onChange={campo('tipo')}><option value="CAMPANA">Campaña</option><option value="CONVENIO">Convenio</option></select></p>
          <p className="campo"><label htmlFor={`${id}-porcentaje`}>Descuento (%)</label><input id={`${id}-porcentaje`} type="text" inputMode="numeric" maxLength={3} value={v.porcentaje} onChange={campo('porcentaje')} /></p>
          <p className="campo"><label htmlFor={`${id}-ciclos`}>Pagos con descuento</label><input id={`${id}-ciclos`} type="text" inputMode="numeric" maxLength={3} value={v.ciclosDescuento} onChange={campo('ciclosDescuento')} aria-describedby={`${id}-ciclos-a`} /><span id={`${id}-ciclos-a`} className="sec">Contando el alta. Vacío: en cada pago.</span></p>
          <p className="campo"><label htmlFor={`${id}-desde`}>Vigente desde</label><input id={`${id}-desde`} type="date" value={v.vigenciaDesde} onChange={campo('vigenciaDesde')} /></p>
          <p className="campo"><label htmlFor={`${id}-hasta`}>Vence</label><input id={`${id}-hasta`} type="date" value={v.vigenciaHasta} onChange={campo('vigenciaHasta')} aria-describedby={`${id}-hasta-a`} /><span id={`${id}-hasta-a`} className="sec">Vale todo ese día (hora de Lima). Vacío: sin vencimiento.</span></p>
          <p className="campo"><label htmlFor={`${id}-limite`}>Límite de usos</label><input id={`${id}-limite`} type="text" inputMode="numeric" maxLength={6} value={v.limiteUsos} onChange={campo('limiteUsos')} aria-describedby={`${id}-limite-a`} /><span id={`${id}-limite-a`} className="sec">Vacío: sin límite.</span></p>
          <p className="campo"><label htmlFor={`${id}-planes`}>Planes</label><input id={`${id}-planes`} type="text" autoComplete="off" value={v.planes} onChange={campo('planes')} aria-describedby={`${id}-planes-a`} /><span id={`${id}-planes-a`} className="sec">Identificadores separados por comas. Vacío: todos los planes con tarifa.</span></p>
          {v.tipo === 'CONVENIO' ? <p className="campo"><label htmlFor={`${id}-dominios`}>Dominios de correo</label><input id={`${id}-dominios`} type="text" autoComplete="off" value={v.dominios} onChange={campo('dominios')} aria-describedby={`${id}-dominios-a`} /><span id={`${id}-dominios-a`} className="sec">Por ejemplo pucp.edu.pe, separados por comas. Vale también un subdominio.</span></p> : null}
        </div>
        <label className="casilla"><input type="checkbox" checked={v.visible} onChange={(e) => setV({ ...v, visible: e.target.checked })} /> Activo: se acepta en el pago</label>
        <div className="acciones-fila">
          <button type="submit" className="boton primario" disabled={ocupado}>{inicial ? 'Guardar el cupón' : 'Crear el cupón'}</button>
          <button type="button" className="boton" disabled={ocupado} onClick={alCancelar}>Cancelar</button>
        </div>
      </form>
    </section>
  );
}
