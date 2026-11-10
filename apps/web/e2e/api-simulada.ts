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

/** Simula la API. `conSesion` decide qué responde GET /yo; `rol` cambia el rol del usuario. */
export async function simularApi(page: Page, { conSesion, rol }: { conSesion: boolean; rol?: string }) {
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
