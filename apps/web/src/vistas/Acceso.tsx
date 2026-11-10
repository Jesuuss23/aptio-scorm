// Ingreso, recuperación y creación de clave (HU-0104, HU-0109) e ingreso con Google para invitados (HU-0108). Sin barra lateral.
import { Marca } from '@aptio/ui';
import { type FormEvent, type ReactNode, useState } from 'react';
import { api, ErrorApi, type Usuario } from '../api';
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
      const { usuario } = await api.ingresar(email, clave);
      alIngresar(usuario);
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
