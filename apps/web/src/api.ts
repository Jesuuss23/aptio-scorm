// Cliente de la API (docs/api/openapi.yaml). Mismo origen: la cookie httpOnly `sesion` viaja sola.
export interface Usuario {
  id: string;
  email: string;
  nombre: string;
  rol: Rol;
  clienteId: string | null;
  activo: boolean;
  metodos: ('clave' | 'google')[];
}
export type Rol = 'SUPERADMIN' | 'ADMINISTRADOR' | 'DISENADOR_INSTRUCCIONAL' | 'DISENADOR_GRAFICO' | 'PRODUCTOR' | 'REVISOR_CLIENTE';

export const NOMBRE_ROL: Record<Rol, string> = {
  SUPERADMIN: 'Superadmin',
  ADMINISTRADOR: 'Administración',
  DISENADOR_INSTRUCCIONAL: 'Diseño instruccional',
  DISENADOR_GRAFICO: 'Diseño gráfico',
  PRODUCTOR: 'Producción',
  REVISOR_CLIENTE: 'Revisión del cliente',
};

/** Error de la API con la forma { codigo, mensaje, detalles }. */
export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  constructor(estado: number, codigo: string, mensaje: string) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${ruta}`, {
      credentials: 'same-origin',
      ...opciones,
      headers: { 'Content-Type': 'application/json', ...opciones.headers },
    });
  } catch {
    throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  }
  if (res.status === 204 || res.status === 202) return undefined as T;
  const cuerpo = (await res.json().catch(() => ({}))) as { codigo?: string; mensaje?: string };
  if (!res.ok) throw new ErrorApi(res.status, cuerpo.codigo ?? 'ERROR', cuerpo.mensaje ?? 'Ocurrió un error inesperado');
  return cuerpo as T;
}

const json = (datos: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(datos) });

export const api = {
  yo: () => pedir<Usuario>('/yo'),
  ingresar: (email: string, clave: string) => pedir<{ usuario: Usuario; expira: string }>('/auth/ingresar', json({ email, clave })),
  salir: () => pedir<void>('/auth/salir', { method: 'POST' }),
  pedirClave: (email: string) => pedir<void>('/auth/clave/olvido', json({ email })),
  crearClave: (token: string, clave: string) => pedir<void>('/auth/clave/restablecer', json({ token, clave })),
};
