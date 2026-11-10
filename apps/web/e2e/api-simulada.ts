import type { Page } from '@playwright/test';

export const USUARIO = {
  id: '00000000-0000-4000-8000-000000000001',
  email: 'instruccional@aulaseducativas.test',
  nombre: 'Diseño instruccional',
  rol: 'DISENADOR_INSTRUCCIONAL',
  clienteId: null,
  activo: true,
  metodos: ['clave'],
};

export const CLIENTE_ID = '00000000-0000-4000-8000-0000000000c1';

const clienteBase = (id: string, nombre: string, extra: object = {}) => ({
  id, nombre, lmsHabitual: null, idiomas: ['es'], notas: null, retencionDocumentosDias: 180, tieneKit: false,
  creadoEn: '2026-11-10T10:00:00.000Z', ...extra,
});

export const KIT_MINERA = {
  id: '00000000-0000-4000-8000-0000000000a1',
  clienteId: CLIENTE_ID,
  estilo: 'Industrial',
  paleta: { primario: '#12355B', secundario: '#2E7D6B', acento: '#F2A900', fondo: '#F5F7FA', texto: '#102033' },
  tipografias: { titulos: 'Barlow Condensed', textos: 'Atkinson Hyperlegible' },
  logoRecursoId: null,
  personaje: null,
  voces: { es: { proveedor: 'google', voz: 'es-US-Neural2-A', velocidad: 1 } },
  version: 3,
  actualizadoEn: '2026-11-10T10:00:00.000Z',
  contraste: { textoFondo: 16.2, cumpleAA: true },
  advertencias: [],
};

export interface OpcionesSimulacion {
  conSesion: boolean;
  rol?: string;
  /** El próximo PUT del kit responde 409, como si otra persona hubiera guardado antes (CP-022). */
  kitEnConflicto?: boolean;
}

/** Simula la API. `conSesion` decide qué responde GET /yo; `rol` cambia el rol del usuario. */
export async function simularApi(page: Page, { conSesion, rol, kitEnConflicto }: OpcionesSimulacion) {
  let conflicto = Boolean(kitEnConflicto);
  const kits = new Map<string, Record<string, unknown>>([[CLIENTE_ID, structuredClone(KIT_MINERA)]]);
  const subidas = new Map<string, { nombre: string; mime: string }>();
  const modelos: Record<string, unknown>[] = [];
  let glosario: { termino: string; traduccion: string | null; noTraducir: boolean }[] = [];
  let pronunciacion: { idioma: string; escrito: string; pronunciado: string }[] = [];
  // El almacenamiento: el PUT firmado de la subida va directo a S3, fuera de la API.
  await page.route('**/s3-simulado/**', (route) => route.fulfill({ status: 200, body: '' }));
  let sesion = conSesion;
  const usuario = { ...USUARIO, ...(rol ? { rol } : {}) };
  const clientes = [
    clienteBase(CLIENTE_ID, 'Minera Andina', { lmsHabitual: 'Moodle 4.5 o superior', idiomas: ['es', 'en'], tieneKit: true }),
    clienteBase('00000000-0000-4000-8000-0000000000c2', 'Municipalidad de Lima'),
  ];
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const ruta = new URL(req.url()).pathname.replace('/api/v1', '');
    const responder = (status: number, body?: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });

    if (ruta === '/yo') return sesion ? responder(200, usuario) : responder(401, { codigo: 'NO_AUTENTICADO', mensaje: 'Inicia sesión' });
    if (ruta === '/auth/ingresar') {
      const { email, clave } = req.postDataJSON() as { email: string; clave: string };
      if (email === USUARIO.email && clave === 'clave-correcta') {
        sesion = true;
        return responder(200, { usuario: USUARIO, expira: new Date(Date.now() + 3_600_000).toISOString() });
      }
      return responder(401, { codigo: 'CREDENCIALES', mensaje: 'Correo o clave incorrectos' });
    }
    if (ruta === '/auth/salir') {
      sesion = false;
      return responder(204);
    }
    if (ruta === '/auth/clave/olvido') return responder(202);
    if (ruta === '/auth/clave/restablecer') {
      const { token } = req.postDataJSON() as { token: string };
      return token === 'vigente'
        ? responder(204)
        : responder(422, { codigo: 'ENLACE_NO_VALIDO', mensaje: 'Enlace no válido o vencido. Pide uno nuevo.' });
    }
    if (ruta === '/clientes' && req.method() === 'GET') {
      const buscar = (new URL(req.url()).searchParams.get('buscar') ?? '').toLowerCase();
      return responder(200, clientes.filter((c) => c.nombre.toLowerCase().includes(buscar)));
    }
    if (ruta === '/clientes' && req.method() === 'POST') {
      const datos = req.postDataJSON() as { nombre: string };
      if (clientes.some((c) => c.nombre.toLowerCase() === datos.nombre.trim().toLowerCase())) {
        return responder(409, { codigo: 'CLIENTE_EXISTE', mensaje: `Ya existe un cliente llamado «${datos.nombre.trim()}»` });
      }
      const nuevo = clienteBase(`00000000-0000-4000-8000-${String(clientes.length + 1).padStart(12, '0')}`, datos.nombre.trim(), datos);
      clientes.push(nuevo);
      return responder(201, nuevo);
    }
    if (ruta === '/recursos/subidas' && req.method() === 'POST') {
      const datos = req.postDataJSON() as { nombre: string; mime: string };
      const subidaId = `00000000-0000-4000-8000-${String(subidas.size + 1).padStart(12, '0')}`;
      subidas.set(subidaId, datos);
      return responder(201, {
        subidaId, url: `${new URL(req.url()).origin}/s3-simulado/${subidaId}`, cabeceras: { 'Content-Type': datos.mime }, expira: new Date(Date.now() + 900_000).toISOString(),
      });
    }
    const confirmar = ruta.match(/^\/recursos\/subidas\/([0-9a-f-]+)\/confirmar$/);
    if (confirmar) {
      const s = subidas.get(confirmar[1]!)!;
      const svg = s.mime === 'image/svg+xml';
      return responder(201, {
        id: confirmar[1], tipo: svg ? 'SVG' : 'IMAGEN', origen: 'SUBIDO', nombre: s.nombre, mime: s.mime, bytes: 100,
        ...(svg ? { eliminadosAlSanear: s.nombre.includes('peligrosa') ? ['script', 'atributos on*'] : [] } : {}),
        url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><rect width="30" height="40" fill="#12355B"/></svg>')}`,
      });
    }
    if (/^\/clientes\/[0-9a-f-]+\/glosario$/.test(ruta)) {
      if (req.method() === 'PUT') {
        const datos = req.postDataJSON() as { termino: string; traduccion?: string | null; noTraducir?: boolean }[];
        const sinTraduccion = datos.find((t) => !t.noTraducir && !t.traduccion?.trim());
        if (sinTraduccion) {
          return responder(422, { codigo: 'TERMINOS_NO_VALIDOS', mensaje: 'Revisa los términos', detalles: [{ error: `«${sinTraduccion.termino}»: indica la traducción o marca «no traducir»` }] });
        }
        glosario = datos.map((t) => ({ termino: t.termino.trim(), traduccion: t.noTraducir ? null : (t.traduccion ?? null), noTraducir: Boolean(t.noTraducir) }));
      }
      return responder(200, glosario);
    }
    if (/^\/clientes\/[0-9a-f-]+\/pronunciacion$/.test(ruta)) {
      if (req.method() === 'PUT') pronunciacion = req.postDataJSON() as typeof pronunciacion;
      return responder(200, pronunciacion);
    }
    if (ruta === '/voz/muestra') {
      const { texto, idioma } = req.postDataJSON() as { texto: string; idioma: string };
      let dicho = texto;
      const aplicados: string[] = [];
      for (const t of pronunciacion.filter((p) => p.idioma === idioma)) {
        const patron = new RegExp(`\\b${t.escrito}\\b`, 'gi');
        if (patron.test(dicho)) aplicados.push(t.escrito);
        dicho = dicho.replace(patron, t.pronunciado);
      }
      return responder(200, {
        audioUrl: 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=', bocas: [], ssml: `<speak>${texto}</speak>`,
        dicho, aplicados, proveedor: 'simulado', voz: 'es-US-Neural2-A', simulada: true,
      });
    }
    const listaModelos = ruta.match(/^\/clientes\/([0-9a-f-]+)\/kit\/pantallas-modelo$/);
    if (listaModelos) {
      if (req.method() === 'GET') return responder(200, modelos);
      const datos = req.postDataJSON() as Record<string, unknown>;
      const nuevo = { id: `00000000-0000-4000-8000-${String(900 + modelos.length).padStart(12, '0')}`, miniaturaRecursoId: null, orden: 0, activa: true, ...datos };
      modelos.push(nuevo);
      return responder(201, nuevo);
    }
    const unModelo = ruta.match(/^\/clientes\/([0-9a-f-]+)\/kit\/pantallas-modelo\/([0-9a-f-]+)$/);
    if (unModelo) {
      const m = modelos.find((x) => x.id === unModelo[2])!;
      if (req.method() === 'DELETE') {
        m.activa = false;
        return responder(204);
      }
      Object.assign(m, req.postDataJSON());
      return responder(200, m);
    }
    const personaje = ruta.match(/^\/clientes\/([0-9a-f-]+)\/kit\/personaje$/);
    if (personaje) {
      const actual = kits.get(personaje[1]!)!;
      const datos = req.postDataJSON() as { recursoId: string; nombre: string; version: number };
      if (subidas.get(datos.recursoId)?.nombre.includes('boceto')) {
        return responder(422, {
          codigo: 'PERSONAJE_INCOMPLETO', mensaje: 'Al personaje le faltan capas obligatorias. Revísalo con docs/diseno/personaje/validar-personaje.mjs',
          detalles: [{ error: 'Falta la capa obligatoria «cabeza»' }],
        });
      }
      actual.version = (actual.version as number) + 1;
      actual.personaje = {
        recursoId: datos.recursoId, nombre: datos.nombre, bocasDisponibles: ['A', 'B', 'C', 'D', 'E', 'F', 'H', 'X'], bocasFaltantes: ['G'],
        reemplazos: { G: 'B' }, poses: ['neutral', 'explicando'], avisos: ['G falta: se usa la B hasta que se agregue'], eliminadosAlSanear: [],
        url: `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 40"><rect width="30" height="40" fill="#12355B"/></svg>')}`,
      };
      return responder(200, actual);
    }
    const kit = ruta.match(/^\/clientes\/([0-9a-f-]+)\/kit$/);
    if (kit) {
      const actual = kits.get(kit[1]!);
      if (req.method() === 'GET') return actual ? responder(200, actual) : responder(404, { codigo: 'SIN_KIT', mensaje: 'El cliente todavía no tiene kit' });
      const datos = req.postDataJSON() as Record<string, unknown> & { version: number; paleta: Record<string, string> };
      if (conflicto || datos.version !== ((actual?.version as number | undefined) ?? 0)) {
        conflicto = false;
        if (actual) actual.version = (actual.version as number) + 1;
        return responder(409, { codigo: 'KIT_DESACTUALIZADO', mensaje: 'Otra persona guardó el kit mientras lo editabas. Recarga para ver sus cambios.' });
      }
      const bajo = datos.paleta.texto === '#9AA0A6' && datos.paleta.fondo === '#FFFFFF';
      const nuevo = {
        ...(actual ?? { id: '00000000-0000-4000-8000-0000000000a2', clienteId: kit[1], personaje: null }),
        ...datos,
        version: datos.version + 1,
        actualizadoEn: new Date().toISOString(),
        contraste: bajo ? { textoFondo: 2.64, cumpleAA: false } : { textoFondo: 16.2, cumpleAA: true },
        advertencias: bajo ? [{ codigo: 'CONTRASTE_BAJO', mensaje: 'El texto sobre el fondo tiene contraste 2,6:1, menor a 4,5:1', colores: ['texto', 'fondo'], relacion: 2.64 }] : [],
      };
      kits.set(kit[1]!, nuevo);
      return responder(200, nuevo);
    }
    const unCliente = ruta.match(/^\/clientes\/([0-9a-f-]+)$/);
    if (unCliente) {
      const c = clientes.find((x) => x.id === unCliente[1]);
      if (!c) return responder(404, { codigo: 'NO_ENCONTRADO', mensaje: 'Cliente no encontrado' });
      if (req.method() === 'PATCH') Object.assign(c, req.postDataJSON());
      return responder(200, c);
    }
    return responder(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No encontrado' });
  });
}
