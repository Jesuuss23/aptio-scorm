// Cliente de la API (docs/api/openapi.yaml). Mismo origen: la cookie httpOnly `sesion` viaja sola.
import type { Paleta } from '@aptio/schema/marca';

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

export interface Cliente {
  id: string;
  nombre: string;
  lmsHabitual: string | null;
  idiomas: ('es' | 'en')[];
  notas: string | null;
  retencionDocumentosDias: number;
  tieneKit: boolean;
  creadoEn: string;
}
export type ClienteEntrada = Partial<Pick<Cliente, 'lmsHabitual' | 'idiomas' | 'notas' | 'retencionDocumentosDias'>> & { nombre: string };

/** LMS conocidos; el cliente puede usar otro (decisión 11: cualquier LMS). */
export const OPCIONES_LMS = ['Moodle 4.5 o superior', 'Blackboard', 'Chamilo', 'Canvas'];

/** Roles que registran y editan clientes (la API lo vuelve a verificar). */
export const EDITAN_CLIENTES: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR'];

/** Roles que editan el kit de marca; el productor solo lo ve y el revisor no entra (docs/14-modulos.md). */
export const EDITAN_KIT: Rol[] = ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'DISENADOR_GRAFICO'];
export const VEN_KIT: Rol[] = [...EDITAN_KIT, 'PRODUCTOR'];

export interface Voz {
  proveedor: 'google' | 'azure' | 'elevenlabs';
  voz: string;
  velocidad?: number;
}
export interface KitEntrada {
  estilo: string;
  paleta: Paleta;
  tipografias: { titulos: string; textos: string };
  logoRecursoId: string | null;
  voces: { es?: Voz; en?: Voz };
  version: number;
}
export interface Kit extends KitEntrada {
  id: string;
  clienteId: string;
  logoUrl?: string;
  personaje: object | null;
  actualizadoEn: string;
  contraste: { textoFondo: number; cumpleAA: boolean };
  advertencias: { codigo: string; mensaje: string; colores: string[]; relacion: number }[];
}
export interface Recurso {
  id: string;
  tipo: string;
  nombre: string;
  mime: string;
  bytes: number;
  url?: string;
}

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

const json = (datos: unknown, method = 'POST'): RequestInit => ({ method, body: JSON.stringify(datos) });

export const api = {
  yo: () => pedir<Usuario>('/yo'),
  ingresar: (email: string, clave: string) => pedir<{ usuario: Usuario; expira: string }>('/auth/ingresar', json({ email, clave })),
  salir: () => pedir<void>('/auth/salir', { method: 'POST' }),
  pedirClave: (email: string) => pedir<void>('/auth/clave/olvido', json({ email })),
  crearClave: (token: string, clave: string) => pedir<void>('/auth/clave/restablecer', json({ token, clave })),
  clientes: (buscar = '') => pedir<Cliente[]>(`/clientes${buscar ? `?buscar=${encodeURIComponent(buscar)}` : ''}`),
  cliente: (id: string) => pedir<Cliente>(`/clientes/${id}`),
  crearCliente: (datos: ClienteEntrada) => pedir<Cliente>('/clientes', json(datos)),
  editarCliente: (id: string, datos: Partial<ClienteEntrada>) => pedir<Cliente>(`/clientes/${id}`, json(datos, 'PATCH')),
  kit: (clienteId: string) => pedir<Kit>(`/clientes/${clienteId}/kit`),
  guardarKit: (clienteId: string, datos: KitEntrada) => pedir<Kit>(`/clientes/${clienteId}/kit`, json(datos, 'PUT')),
  /** Sube un archivo directo al almacenamiento cifrado (HU-1404): pide la URL firmada, envía el PUT y confirma. */
  async subir(archivo: File, destino: { clienteId?: string; proyectoId?: string; origen?: 'SUBIDO' | 'CLIENTE' }): Promise<Recurso> {
    const subida = await pedir<{ subidaId: string; url: string; cabeceras: Record<string, string> }>(
      '/recursos/subidas',
      json({ nombre: archivo.name, mime: archivo.type, bytes: archivo.size, ...destino }),
    );
    let res: Response;
    try {
      res = await fetch(subida.url, { method: 'PUT', headers: subida.cabeceras, body: archivo });
    } catch {
      throw new ErrorApi(0, 'SIN_CONEXION', 'No se pudo subir el archivo. Revisa tu conexión e intenta de nuevo.');
    }
    if (!res.ok) throw new ErrorApi(res.status, 'SUBIDA_FALLIDA', 'El almacenamiento rechazó el archivo');
    return pedir<Recurso>(`/recursos/subidas/${subida.subidaId}/confirmar`, { method: 'POST' });
  },
};
