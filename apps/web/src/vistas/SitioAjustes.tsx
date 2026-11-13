// HU-1509 · Configuración › Ajustes del sitio (PNT-38, REQ-073): dominio con su certificado, nombre, logo y favicon,
// analítica, WhatsApp, correo de leads y modo mantenimiento. Cada tarjeta guarda lo suyo y valida con las mismas reglas
// que la API (`@aptio/schema/sitio-ajustes`). Nombre, dominio, marca y WhatsApp llegan al sitio con «Publicar cambios»;
// el mantenimiento y el correo de leads valen al instante (CP-121).
import { AJUSTES_POR_DEFECTO, type AjustesSitio as Reglas, aplicarCambiosAjustes, type CambiosAjustes, LIMITES_AJUSTES } from '@aptio/schema/sitio-ajustes';
import { Cabecera } from '@aptio/ui';
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { type AjustesSitio, api, type ComprobacionDominio, ErrorApi } from '../api';
import { fechaHoraLima } from './sitio-paginas';

type Aviso = { tipo: 'ok' | 'error' | 'aviso'; texto: string } | null;
const mensajeDe = (e: unknown, defecto: string) => (e instanceof ErrorApi ? e.message : defecto);
const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'America/Lima' });
const PUBLICAR = 'Llega al sitio con «Publicar cambios» (Sitio web › Páginas).';

/** Valida en el navegador con las reglas de la API; devuelve los mensajes o null si está bien. */
function revisar(actual: AjustesSitio, cambios: CambiosAjustes): string | null {
  const { actualizadoEn: _a, ...guardado } = actual;
  const r = aplicarCambiosAjustes({ ...AJUSTES_POR_DEFECTO, ...guardado } as Reglas, cambios);
  return r.ok ? null : r.errores.map((e) => e.mensaje).join('. ');
}

export function SitioAjustes() {
  const [ajustes, setAjustes] = useState<AjustesSitio | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.ajustesSitio().then(setAjustes, (e: unknown) => setError(mensajeDe(e, 'No se pudieron cargar los ajustes')));
  }, []);

  return (
    <>
      <Cabecera titulo="Ajustes del sitio" subtitulo="Dominio, marca, analítica, contacto y mantenimiento del sitio comercial." />
      {error ? <div className="nota error" role="alert">{error}</div> : null}
      {!ajustes ? (!error ? <p className="sec" role="status">Cargando…</p> : null) : (
        <div className="columnas ajustes-sitio">
          <TarjetaIdentidad ajustes={ajustes} alGuardar={setAjustes} />
          <TarjetaContacto ajustes={ajustes} alGuardar={setAjustes} />
          <TarjetaAnalitica ajustes={ajustes} alGuardar={setAjustes} />
          <TarjetaMantenimiento ajustes={ajustes} alGuardar={setAjustes} />
        </div>
      )}
    </>
  );
}

type PropsTarjeta = { ajustes: AjustesSitio; alGuardar: (a: AjustesSitio) => void };

/** Tarjeta con su formulario, su botón «Guardar» y su aviso. */
function useGuardar(ajustes: AjustesSitio, alGuardar: (a: AjustesSitio) => void) {
  const [aviso, setAviso] = useState<Aviso>(null);
  const [ocupado, setOcupado] = useState(false);
  async function guardar(cambios: CambiosAjustes, ok: string): Promise<boolean> {
    const problema = revisar(ajustes, cambios);
    if (problema) {
      setAviso({ tipo: 'error', texto: problema });
      return false;
    }
    setOcupado(true);
    try {
      alGuardar(await api.guardarAjustesSitio(cambios));
      setAviso({ tipo: 'ok', texto: ok });
      return true;
    } catch (e) {
      setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudieron guardar los ajustes') });
      return false;
    } finally {
      setOcupado(false);
    }
  }
  return { aviso, setAviso, ocupado, setOcupado, guardar };
}

function Nota({ aviso }: { aviso: Aviso }) {
  return aviso ? <p className={`nota ${aviso.tipo === 'ok' ? 'validado' : aviso.tipo === 'aviso' ? 'aviso' : 'error'}`} role={aviso.tipo === 'error' ? 'alert' : 'status'}>{aviso.texto}</p> : null;
}

function Tarjeta({ id, titulo, chip, children }: { id: string; titulo: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section className="tarjeta" aria-labelledby={id}>
      <div className="tarjeta-cabeza"><h2 id={id}>{titulo}</h2>{chip}</div>
      {children}
    </section>
  );
}

function TarjetaIdentidad({ ajustes, alGuardar }: PropsTarjeta) {
  const [dominio, setDominio] = useState(ajustes.dominio ?? '');
  const [nombre, setNombre] = useState(ajustes.nombre);
  const [comprobacion, setComprobacion] = useState<ComprobacionDominio | null>(null);
  const g = useGuardar(ajustes, alGuardar);
  const cambiado = dominio.trim().toLowerCase() !== (ajustes.dominio ?? '') || nombre.trim() !== ajustes.nombre;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    if (await g.guardar({ dominio, nombre }, `Se guardó. ${PUBLICAR}`)) setComprobacion(null);
  }

  async function comprobar() {
    g.setOcupado(true);
    g.setAviso(null);
    try {
      setComprobacion(await api.comprobarDominioSitio());
    } catch (e) {
      g.setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudo comprobar el dominio') });
    } finally {
      g.setOcupado(false);
    }
  }

  async function subir(tipo: 'logo' | 'favicon', archivo: File | undefined) {
    if (!archivo) return;
    if (archivo.size > LIMITES_AJUSTES.marcaBytes) return g.setAviso({ tipo: 'error', texto: 'El archivo supera los 200 KB' });
    g.setOcupado(true);
    try {
      alGuardar(await api.subirMarcaSitio(tipo, archivo));
      g.setAviso({ tipo: 'ok', texto: `Se subió el ${tipo}. ${PUBLICAR}` });
    } catch (e) {
      g.setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudo subir el archivo') });
    } finally {
      g.setOcupado(false);
    }
  }

  async function quitar(tipo: 'logo' | 'favicon') {
    g.setOcupado(true);
    try {
      alGuardar(await api.quitarMarcaSitio(tipo));
      g.setAviso({ tipo: 'ok', texto: `Se quitó el ${tipo}. ${PUBLICAR}` });
    } catch (e) {
      g.setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudo quitar el archivo') });
    } finally {
      g.setOcupado(false);
    }
  }

  const chip = comprobacion ? (
    <span className={`chip ${comprobacion.ok ? 'validado' : 'error'}`}>{comprobacion.ok ? `SSL activo${comprobacion.venceEn ? ` · vence ${fecha(comprobacion.venceEn)}` : ''}` : 'SSL sin verificar'}</span>
  ) : undefined;
  return (
    <Tarjeta id="ajustes-identidad" titulo="Dominio e identidad" chip={chip}>
      <form className="formulario-ajustes" onSubmit={enviar} aria-label="Dominio e identidad" noValidate>
        <label className="campo" htmlFor="ajuste-dominio">Dominio
          <input id="ajuste-dominio" value={dominio} onChange={(e) => setDominio(e.target.value)} placeholder="aptioscorm.com" spellCheck={false} autoCapitalize="none" inputMode="url" aria-describedby="ajuste-dominio-ayuda" />
        </label>
        <p className="sec" id="ajuste-dominio-ayuda">Sin https:// ni rutas. Se usa en las direcciones que ven los buscadores (canonical y sitemap). El certificado SSL lo emite el servicio que publica el sitio.</p>
        <label className="campo" htmlFor="ajuste-nombre">Nombre del sitio
          <input id="ajuste-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} maxLength={LIMITES_AJUSTES.nombre} />
        </label>
        <div className="acciones-fila ajustes-acciones">
          <button type="submit" className="boton primario" disabled={g.ocupado || !cambiado}>Guardar</button>
          <button type="button" className="boton" disabled={g.ocupado || !ajustes.dominio} onClick={() => void comprobar()}>Comprobar el dominio</button>
        </div>
      </form>
      {comprobacion && !comprobacion.ok ? <p className="nota error" role="alert">{comprobacion.dominio}: {comprobacion.error}</p> : null}
      {comprobacion?.ok ? <p className="nota validado" role="status">{comprobacion.dominio} responde por HTTPS con un certificado válido{comprobacion.emisor ? ` de ${comprobacion.emisor}` : ''}.</p> : null}
      <div className="marca-sitio">
        {(['logo', 'favicon'] as const).map((tipo) => {
          const actual = ajustes[tipo];
          const nombreTipo = tipo === 'logo' ? 'Logo' : 'Favicon';
          return (
            <div key={tipo} className="marca-fila">
              {actual ? <img src={`/s/_marca/${actual.archivo}`} alt={`${nombreTipo} actual`} width={40} height={40} /> : <span className="sec marca-vacia">Sin {tipo}</span>}
              <label className="boton">
                {actual ? `Cambiar ${tipo}` : `Subir ${tipo}`}
                <input className="sr" type="file" accept="image/svg+xml,image/png" disabled={g.ocupado} onChange={(e) => { void subir(tipo, e.target.files?.[0]); e.target.value = ''; }} aria-label={`Archivo del ${tipo}`} />
              </label>
              {actual ? <button type="button" className="boton" disabled={g.ocupado} onClick={() => void quitar(tipo)}>Quitar {tipo}</button> : null}
            </div>
          );
        })}
        <p className="sec">SVG o PNG de hasta 200 KB. Al SVG se le quitan los scripts y los enlaces externos.</p>
      </div>
      <Nota aviso={g.aviso} />
    </Tarjeta>
  );
}

function TarjetaContacto({ ajustes, alGuardar }: PropsTarjeta) {
  const [visible, setVisible] = useState(ajustes.whatsapp.visible);
  const [numero, setNumero] = useState(ajustes.whatsapp.numero ?? '');
  const [mensaje, setMensaje] = useState(ajustes.whatsapp.mensaje ?? '');
  const [correo, setCorreo] = useState(ajustes.correoLeads ?? '');
  const g = useGuardar(ajustes, alGuardar);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    await g.guardar({ whatsapp: { visible, numero, mensaje }, correoLeads: correo }, `Se guardó. El correo de leads vale desde ahora; el botón de WhatsApp ${PUBLICAR.toLowerCase()}`);
  }

  async function probar() {
    g.setOcupado(true);
    try {
      const r = await api.correoPruebaSitio();
      g.setAviso({ tipo: 'ok', texto: `Se envió un correo de prueba a ${r.para}.` });
    } catch (e) {
      g.setAviso({ tipo: 'error', texto: mensajeDe(e, 'No se pudo enviar el correo de prueba') });
    } finally {
      g.setOcupado(false);
    }
  }

  return (
    <Tarjeta id="ajustes-contacto" titulo="Contacto">
      <form className="formulario-ajustes" onSubmit={enviar} aria-label="Contacto" noValidate>
        <div className="fila-interruptor">
          <span id="ajuste-whatsapp-etiqueta">Botón de WhatsApp</span>
          <button type="button" role="switch" className="interruptor" aria-checked={visible} aria-labelledby="ajuste-whatsapp-etiqueta" onClick={() => setVisible((v) => !v)}><span aria-hidden="true" /></button>
          <span className="sec">{visible ? 'Visible' : 'Oculto'}</span>
        </div>
        <label className="campo" htmlFor="ajuste-whatsapp">Número de WhatsApp
          <input id="ajuste-whatsapp" value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="+51 987 654 321" inputMode="tel" autoComplete="off" />
        </label>
        <label className="campo" htmlFor="ajuste-whatsapp-mensaje">Mensaje inicial (opcional)
          <input id="ajuste-whatsapp-mensaje" value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={LIMITES_AJUSTES.mensajeWhatsapp} placeholder="Hola, quiero agendar una demo" />
        </label>
        <label className="campo" htmlFor="ajuste-correo">Correo que recibe los leads
          <input id="ajuste-correo" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} placeholder="ventas@aulaseducativas.com" autoComplete="off" />
        </label>
        <div className="acciones-fila ajustes-acciones">
          <button type="submit" className="boton primario" disabled={g.ocupado}>Guardar</button>
          <button type="button" className="boton" disabled={g.ocupado || !ajustes.correoLeads} onClick={() => void probar()}>Enviar correo de prueba</button>
        </div>
      </form>
      <Nota aviso={g.aviso} />
    </Tarjeta>
  );
}

function TarjetaAnalitica({ ajustes, alGuardar }: PropsTarjeta) {
  const [ga4, setGa4] = useState(ajustes.analitica.ga4 ?? '');
  const [gtm, setGtm] = useState(ajustes.analitica.gtm ?? '');
  const [pixel, setPixel] = useState(ajustes.analitica.metaPixel ?? '');
  const g = useGuardar(ajustes, alGuardar);
  return (
    <Tarjeta id="ajustes-analitica" titulo="Analítica">
      <form className="formulario-ajustes" aria-label="Analítica" noValidate
        onSubmit={(e) => { e.preventDefault(); void g.guardar({ analitica: { ga4, gtm, metaPixel: pixel } }, 'Se guardaron los identificadores.'); }}>
        <label className="campo" htmlFor="ajuste-ga4">Google Analytics 4<input id="ajuste-ga4" value={ga4} onChange={(e) => setGa4(e.target.value)} placeholder="G-AB12CD34EF" spellCheck={false} /></label>
        <label className="campo" htmlFor="ajuste-gtm">Tag Manager<input id="ajuste-gtm" value={gtm} onChange={(e) => setGtm(e.target.value)} placeholder="GTM-AB12CD3" spellCheck={false} /></label>
        <label className="campo" htmlFor="ajuste-pixel">Meta Pixel<input id="ajuste-pixel" value={pixel} onChange={(e) => setPixel(e.target.value)} placeholder="123456789012345" inputMode="numeric" /></label>
        <p className="nota aviso">Se guardan ahora y se activarán en el sitio con el banner de cookies (Ley 29733): las etiquetas solo se cargan después de que el visitante acepte las cookies de analítica.</p>
        <div className="acciones-fila ajustes-acciones"><button type="submit" className="boton primario" disabled={g.ocupado}>Guardar</button></div>
      </form>
      <Nota aviso={g.aviso} />
    </Tarjeta>
  );
}

function TarjetaMantenimiento({ ajustes, alGuardar }: PropsTarjeta) {
  const [mensaje, setMensaje] = useState(ajustes.mantenimiento.mensaje ?? '');
  const [confirmando, setConfirmando] = useState(false);
  const g = useGuardar(ajustes, alGuardar);
  const activo = ajustes.mantenimiento.activo;

  async function cambiar(siguiente: boolean) {
    const ok = await g.guardar({ mantenimiento: { activo: siguiente, mensaje } },
      siguiente ? 'Modo mantenimiento activo: los visitantes ven el aviso «Volvemos pronto». Tú sigues viendo el sitio.' : 'Modo mantenimiento desactivado: el sitio vuelve a verse.');
    if (ok) setConfirmando(false);
  }

  return (
    <Tarjeta id="ajustes-mantenimiento" titulo="Mantenimiento" chip={<span className={`chip ${activo ? 'aviso' : 'validado'}`}>{activo ? 'Sitio en mantenimiento' : 'Sitio en línea'}</span>}>
      <form className="formulario-ajustes" aria-label="Mantenimiento" noValidate
        onSubmit={(e) => { e.preventDefault(); void g.guardar({ mantenimiento: { mensaje } }, 'Se guardó el aviso.'); }}>
        <div className="fila-interruptor">
          <span id="ajuste-mantenimiento-etiqueta">Modo mantenimiento</span>
          <button type="button" role="switch" className="interruptor" aria-checked={activo} aria-labelledby="ajuste-mantenimiento-etiqueta" aria-expanded={!activo ? confirmando : undefined} disabled={g.ocupado}
            onClick={() => (activo ? void cambiar(false) : setConfirmando((c) => !c))}><span aria-hidden="true" /></button>
          <span className="sec">{activo ? `Activo${ajustes.mantenimiento.desde ? ` desde ${fechaHoraLima(ajustes.mantenimiento.desde)}` : ''}` : 'Inactivo'}</span>
        </div>
        {confirmando && !activo ? (
          <div className="nota aviso confirmar-fila" role="group" aria-label="Confirmar el modo mantenimiento">
            <span>¿Activar el modo mantenimiento? Desde ahora todos los visitantes verán el aviso «Volvemos pronto» en cualquier página. Tú seguirás viendo el sitio con tu sesión.</span>
            <button type="button" className="boton primario" disabled={g.ocupado} onClick={() => void cambiar(true)}>Sí, activar</button>
            <button type="button" className="boton" onClick={() => setConfirmando(false)}>Cancelar</button>
          </div>
        ) : null}
        <label className="campo" htmlFor="ajuste-mantenimiento-mensaje">Mensaje para los visitantes (opcional)
          <textarea id="ajuste-mantenimiento-mensaje" rows={2} value={mensaje} onChange={(e) => setMensaje(e.target.value)} maxLength={LIMITES_AJUSTES.mensajeMantenimiento} placeholder="Volvemos hoy a las 3 p. m." />
        </label>
        <p className="sec">Se aplica al instante, sin publicar. Los visitantes reciben el código 503, que los buscadores entienden como una pausa.</p>
        <div className="acciones-fila ajustes-acciones"><button type="submit" className="boton primario" disabled={g.ocupado || mensaje.trim() === (ajustes.mantenimiento.mensaje ?? '')}>Guardar aviso</button></div>
      </form>
      <Nota aviso={g.aviso} />
    </Tarjeta>
  );
}
