// Ingreso, recuperación y creación de clave (HU-0104, HU-0109), ingreso con Google para invitados (HU-0108) y segundo
// factor del superadmin (HU-1515). Sin barra lateral.
import { Marca } from '@aptio/ui';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { api, type ConfiguracionSegundoFactor, ErrorApi, type Usuario } from '../api';
import { navegar } from '../ruta';

function Marco({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: ReactNode }) {
  return (
    <div className="acceso">
      <main className="tarjeta acceso-tarjeta">
        <div className="acceso-marca">
          <Marca />
        </div>
        <div>
          <h1>{titulo}</h1>
          <p className="sec">{subtitulo}</p>
        </div>
        {children}
      </main>
    </div>
  );
}

function Aviso({ tipo, children }: { tipo: 'error' | 'validado'; children: ReactNode }) {
  return (
    <div className={`nota ${tipo}`} role={tipo === 'error' ? 'alert' : 'status'}>
      {children}
    </div>
  );
}

function enlace(destino: string, texto: string) {
  return (
    <a
      href={destino}
      onClick={(e) => {
        e.preventDefault();
        navegar(destino);
      }}
    >
      {texto}
    </a>
  );
}

/** Motivos con los que la API devuelve a /ingresar tras intentar con Google (CP-008, CP-009). */
const ERRORES_GOOGLE: Record<string, string> = {
  sin_acceso: 'Tu correo no tiene acceso. Pide a un administrador que te invite.',
  correo_no_verificado: 'Google no confirmó tu correo. Verifícalo en tu cuenta de Google e intenta de nuevo.',
  google_cancelado: 'Cancelaste el ingreso con Google.',
  google_no_disponible: 'El ingreso con Google aún no está configurado. Usa tu correo y clave.',
  google_fallo: 'No se pudo completar el ingreso con Google. Intenta de nuevo.',
};

export function Ingreso({ alIngresar }: { alIngresar: (u: Usuario) => void }) {
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState(() => {
    const motivo = new URLSearchParams(window.location.search).get('error');
    return motivo ? (ERRORES_GOOGLE[motivo] ?? ERRORES_GOOGLE.google_fallo!) : '';
  });
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      const r = await api.ingresar(email, clave);
      // HU-1515 · El superadmin sigue con el código de su aplicación autenticadora.
      if ('segundoFactor' in r) navegar('/ingresar/segundo-factor');
      else alIngresar(r.usuario);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo ingresar');
      setEnviando(false);
    }
  }

  return (
    <Marco titulo="Ingresar" subtitulo="Usa el correo con el que te invitaron.">
      <form className="acceso-form" onSubmit={enviar} noValidate>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        <label className="campo">
          Correo
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="campo">
          Clave
          <input type="password" autoComplete="current-password" required value={clave} onChange={(e) => setClave(e.target.value)} />
        </label>
        <button className="boton primario" type="submit" disabled={enviando || !email || !clave}>
          {enviando ? 'Ingresando…' : 'Ingresar'}
        </button>
        <p className="sec">{enlace('/olvido', '¿Olvidaste tu clave?')}</p>
        <p className="acceso-separador sec">o</p>
        <a className="boton" href="/api/v1/auth/google">Ingresar con Google</a>
        <p className="sec">Solo para correos invitados por un administrador.</p>
      </form>
    </Marco>
  );
}

export function Olvido() {
  const [email, setEmail] = useState('');
  const [enviado, setEnviado] = useState(false);
  const [error, setError] = useState('');

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.pedirClave(email);
      setEnviado(true);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo enviar el pedido');
    }
  }

  return (
    <Marco titulo="Cambiar clave" subtitulo="Te enviaremos un enlace que vale 60 minutos y un solo uso.">
      {enviado ? (
        <div className="acceso-form">
          {/* Mismo mensaje exista o no el correo (CP-011). */}
          <Aviso tipo="validado">Si el correo está registrado, recibirás el enlace en unos minutos.</Aviso>
          <p className="sec">{enlace('/ingresar', 'Volver a ingresar')}</p>
        </div>
      ) : (
        <form className="acceso-form" onSubmit={enviar} noValidate>
          {error ? <Aviso tipo="error">{error}</Aviso> : null}
          <label className="campo">
            Correo
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="boton primario" type="submit" disabled={!email}>
            Enviar enlace
          </button>
          <p className="sec">{enlace('/ingresar', 'Volver a ingresar')}</p>
        </form>
      )}
    </Marco>
  );
}

export const CLAVE_MINIMA = 10;

/** Crear la clave desde la invitación o restablecerla desde el enlace del correo. */
export function NuevaClave({ token }: { token: string }) {
  const [clave, setClave] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState('');
  const [listo, setListo] = useState(false);
  const corta = clave.length > 0 && clave.length < CLAVE_MINIMA;
  const distinta = repetida.length > 0 && repetida !== clave;

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    try {
      await api.crearClave(token, clave);
      setListo(true);
    } catch (err) {
      setError(err instanceof ErrorApi ? err.message : 'No se pudo guardar la clave');
    }
  }

  if (!token) {
    return (
      <Marco titulo="Crear clave" subtitulo="Este enlace no es válido.">
        <p className="sec">{enlace('/olvido', 'Pide un enlace nuevo')}</p>
      </Marco>
    );
  }
  return (
    <Marco titulo="Crear clave" subtitulo={`Elige una clave de al menos ${CLAVE_MINIMA} caracteres.`}>
      {listo ? (
        <div className="acceso-form">
          <Aviso tipo="validado">Tu clave quedó guardada. Ya puedes ingresar.</Aviso>
          {enlace('/ingresar', 'Ingresar')}
        </div>
      ) : (
        <form className="acceso-form" onSubmit={enviar} noValidate>
          {error ? (
            <Aviso tipo="error">
              {error} {enlace('/olvido', 'Pedir un enlace nuevo')}
            </Aviso>
          ) : null}
          <label className="campo">
            Clave nueva
            <input type="password" autoComplete="new-password" value={clave} onChange={(e) => setClave(e.target.value)} aria-invalid={corta} aria-describedby="ayuda-clave" />
          </label>
          <span id="ayuda-clave" className={corta ? 'ayuda error' : 'ayuda'}>
            Mínimo {CLAVE_MINIMA} caracteres.
          </span>
          <label className="campo">
            Repite la clave
            <input type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} aria-invalid={distinta} />
          </label>
          {distinta ? <span className="ayuda error">Las claves no coinciden.</span> : null}
          <button className="boton primario" type="submit" disabled={clave.length < CLAVE_MINIMA || clave !== repetida}>
            Guardar clave
          </button>
        </form>
      )}
    </Marco>
  );
}

/** HU-1515 · Agrupa el secreto de 4 en 4 para copiarlo a mano sin errores. */
const agrupar = (secreto: string) => secreto.match(/.{1,4}/g)?.join(' ') ?? secreto;

/** HU-1515 · Segundo factor del superadmin: configurar la aplicación (CP-160) o escribir el código (CP-161). */
export function SegundoFactor({ alIngresar }: { alIngresar: (u: Usuario) => void }) {
  const [estado, setEstado] = useState<'cargando' | 'configurar' | 'verificar' | 'vencido'>('cargando');
  const [config, setConfig] = useState<ConfiguracionSegundoFactor | null>(null);
  const [codigo, setCodigo] = useState('');
  const [conRecuperacion, setConRecuperacion] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [codigos, setCodigos] = useState<string[] | null>(null);
  const [restantes, setRestantes] = useState<number | null>(null);
  const [guardados, setGuardados] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const usuarioListo = useRef<Usuario | null>(null);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let vigente = true;
    api.estadoSegundoFactor().then(
      async (r) => {
        if (!vigente) return;
        if (r.segundoFactor === 'configurar') {
          const c = await api.configurarSegundoFactor();
          if (vigente) setConfig(c);
        }
        if (vigente) setEstado(r.segundoFactor);
      },
      () => vigente && setEstado('vencido'),
    );
    return () => { vigente = false; };
  }, []);

  const continuar = () => {
    if (usuarioListo.current) alIngresar(usuarioListo.current);
    navegar('/');
  };

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setError('');
    setEnviando(true);
    try {
      if (estado === 'configurar') {
        const r = await api.confirmarSegundoFactor(codigo);
        usuarioListo.current = r.usuario;
        setCodigos(r.codigosRecuperacion);
      } else {
        const r = await api.verificarSegundoFactor(conRecuperacion ? { codigoRecuperacion: codigo } : { codigo });
        usuarioListo.current = r.usuario;
        if (r.codigosRestantes !== undefined) setRestantes(r.codigosRestantes);
        else return continuar();
      }
    } catch (err) {
      if (err instanceof ErrorApi && err.codigo === 'DESAFIO_NO_VALIDO') setEstado('vencido');
      setError(err instanceof ErrorApi ? err.message : 'No se pudo verificar el código');
      setCodigo('');
      campo.current?.focus();
    } finally {
      setEnviando(false);
    }
  }

  if (estado === 'cargando') return <p className="sr" role="status">Cargando…</p>;
  if (estado === 'vencido') {
    return (
      <Marco titulo="Verificación en dos pasos" subtitulo="Pasaron más de 5 minutos o la sesión cambió.">
        <div className="acceso-form">
          <Aviso tipo="error">El paso del segundo factor venció. Vuelve a ingresar.</Aviso>
          {enlace('/ingresar', 'Volver a ingresar')}
        </div>
      </Marco>
    );
  }

  if (codigos) {
    const texto = `Códigos de recuperación de Aptio SCORM (cada uno sirve una sola vez)\n\n${codigos.join('\n')}\n`;
    return (
      <Marco titulo="Guarda tus códigos de recuperación" subtitulo="Te sirven para entrar si pierdes el teléfono. Se muestran una sola vez.">
        <div className="acceso-form">
          <Aviso tipo="validado">La verificación en dos pasos quedó activada.</Aviso>
          <ol className="codigos-recuperacion" aria-label="Códigos de recuperación">
            {codigos.map((c) => <li key={c}>{c}</li>)}
          </ol>
          <div className="acciones-form">
            <button
              className="boton"
              type="button"
              onClick={() => navigator.clipboard?.writeText(texto).then(() => setCopiado(true), () => undefined)}
            >
              {copiado ? 'Copiados' : 'Copiar'}
            </button>
            <a className="boton" href={`data:text/plain;charset=utf-8,${encodeURIComponent(texto)}`} download="aptio-codigos-recuperacion.txt">
              Descargar
            </a>
          </div>
          <label className="casilla">
            <input type="checkbox" checked={guardados} onChange={(e) => setGuardados(e.target.checked)} />
            Guardé los códigos en un lugar seguro, fuera de este equipo
          </label>
          <button className="boton primario" type="button" disabled={!guardados} onClick={continuar}>
            Continuar
          </button>
        </div>
      </Marco>
    );
  }

  if (restantes !== null) {
    return (
      <Marco titulo="Ingresaste con un código de recuperación" subtitulo="Ese código ya no vuelve a servir.">
        <div className="acceso-form">
          <Aviso tipo={restantes <= 3 ? 'error' : 'validado'}>
            Te quedan {restantes} {restantes === 1 ? 'código' : 'códigos'} de recuperación.
            {restantes <= 3 ? ' Pide a soporte que restablezca tu segundo factor para generar códigos nuevos.' : ''}
          </Aviso>
          <button className="boton primario" type="button" onClick={continuar}>
            Continuar
          </button>
        </div>
      </Marco>
    );
  }

  const configurando = estado === 'configurar';
  return (
    <Marco
      titulo={configurando ? 'Activa la verificación en dos pasos' : 'Verificación en dos pasos'}
      subtitulo={
        configurando
          ? 'Tu cuenta administra la plataforma: además de la clave, pide un código de tu teléfono.'
          : conRecuperacion
            ? 'Escribe uno de tus códigos de recuperación.'
            : 'Escribe el código de 6 dígitos de tu aplicación autenticadora.'
      }
    >
      <form className="acceso-form" onSubmit={enviar} noValidate>
        {error ? <Aviso tipo="error">{error}</Aviso> : null}
        {configurando && config ? (
          <>
            <p>1. Escanea este código con tu aplicación autenticadora (Google Authenticator, Microsoft Authenticator, 1Password u otra).</p>
            <img className="qr-segundo-factor" src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(config.qrSvg)}`} alt="Código QR para agregar Aptio SCORM a tu aplicación autenticadora" width={192} height={192} />
            <p className="sec">
              ¿No puedes escanearlo? Escribe esta clave en la aplicación: <code className="secreto-totp">{agrupar(config.secreto)}</code>
            </p>
            <p>2. Escribe el código de 6 dígitos que muestra la aplicación.</p>
          </>
        ) : null}
        <label className="campo">
          {conRecuperacion ? 'Código de recuperación' : 'Código de 6 dígitos'}
          {conRecuperacion ? (
            <input ref={campo} key="recuperacion" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          ) : (
            <input ref={campo} key="totp" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={7} required value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          )}
        </label>
        <button className="boton primario" type="submit" disabled={enviando || !codigo.trim()}>
          {enviando ? 'Verificando…' : configurando ? 'Activar' : 'Verificar'}
        </button>
        {configurando ? null : (
          <button
            className="boton"
            type="button"
            onClick={() => {
              setConRecuperacion(!conRecuperacion);
              setCodigo('');
              setError('');
            }}
          >
            {conRecuperacion ? 'Usar el código de la aplicación' : 'No tengo mi teléfono: usar un código de recuperación'}
          </button>
        )}
        <p className="sec">{enlace('/ingresar', 'Volver a ingresar')}</p>
      </form>
    </Marco>
  );
}
