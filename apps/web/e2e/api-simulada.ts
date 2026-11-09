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

/** Simula la API de acceso. `conSesion` decide qué responde GET /yo. */
export async function simularApi(page: Page, { conSesion }: { conSesion: boolean }) {
  let sesion = conSesion;
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const ruta = new URL(req.url()).pathname.replace('/api/v1', '');
    const responder = (status: number, body?: unknown) =>
      route.fulfill({ status, contentType: 'application/json', body: body === undefined ? '' : JSON.stringify(body) });

    if (ruta === '/yo') return sesion ? responder(200, USUARIO) : responder(401, { codigo: 'NO_AUTENTICADO', mensaje: 'Inicia sesión' });
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
    return responder(404, { codigo: 'NO_ENCONTRADO', mensaje: 'No encontrado' });
  });
}
