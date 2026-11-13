// HU-1501 · CP-109: el superadmin de plataforma entra directo a «Sitio web › Resumen» y solo ve ese grupo; el
// administrador de una organización (y el resto de los roles) no ve el grupo ni puede abrir la vista. axe WCAG 2.2 A/AA.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menú principal' });

test('el superadmin entra a Sitio web › Resumen y solo ve ese grupo', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN' });
  const pedido = page.waitForRequest((r) => r.url().endsWith('/api/v1/sitio/paginas'));
  await page.goto('/');
  await expect(page).toHaveURL('/sitio');
  await pedido;
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible();
  await expect(page.getByText('El sitio todavía no tiene páginas.')).toBeVisible();
  await expect(menu(page).getByText('Sitio web')).toBeVisible();
  await expect(menu(page).getByRole('link', { name: 'Resumen' })).toBeVisible();
  // Sin organización: no ve Proyectos, Clientes ni Empresa, y otra ruta lo devuelve al sitio.
  for (const otro of ['Proyectos', 'Clientes y kits', 'Rentabilidad', 'Operación']) await expect(menu(page).getByRole('link', { name: otro })).toHaveCount(0);
  await page.goto('/clientes');
  await expect(page).toHaveURL('/sitio');
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);
});

for (const rol of ['ADMINISTRADOR', 'DISENADOR_INSTRUCCIONAL', 'PRODUCTOR', 'REVISOR_CLIENTE']) {
  test(`CP-109: ${rol} no ve el grupo «Sitio web» ni puede abrirlo`, async ({ page }) => {
    await simularApi(page, { conSesion: true, rol });
    await page.goto('/');
    await expect(menu(page)).toBeVisible();
    await expect(menu(page).getByText('Sitio web')).toHaveCount(0);
    await expect(menu(page).getByRole('link', { name: 'Resumen' })).toHaveCount(0);
    await page.goto('/sitio');
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });
}

// HU-1502 · Sitio web › Páginas (PNT-25): Nueva página, Programar (hora de Lima), Publicar, Pasar a borrador y Borrar
// con confirmación; axe sin violaciones con la lista, la programación y la confirmación abiertas.
test('el superadmin crea, programa, publica, pasa a borrador y borra una página', async ({ page }) => {
  await simularApi(page, {
    conSesion: true, rol: 'SUPERADMIN',
    paginasSitio: [{ id: '00000000-0000-4000-8000-000000000001', ruta: '/', idioma: 'es', titulo: 'Inicio', estado: 'PUBLICADA', publicarEn: null, publicadaEn: '2026-11-10T15:00:00.000Z', creadoEn: '2026-11-10T15:00:00.000Z', actualizadoEn: '2026-11-10T15:00:00.000Z' }],
  });
  await page.goto('/sitio');
  await menu(page).getByRole('link', { name: 'Páginas' }).click();
  await expect(page).toHaveURL('/sitio/paginas');
  await expect(page.getByRole('heading', { level: 1, name: 'Páginas' })).toBeVisible();
  const tabla = page.getByRole('table', { name: 'Páginas del sitio' });
  const fila = (titulo: string) => tabla.getByRole('row').filter({ has: page.getByRole('rowheader', { name: new RegExp(`^${titulo}`) }) });
  await expect(fila('Inicio')).toContainText('Publicada');
  await expect(fila('Inicio')).toContainText('Publicada el');

  // Nueva página: valida la ruta antes de enviarla y la crea como borrador.
  await page.getByRole('button', { name: 'Nueva página' }).click();
  const form = page.getByRole('form', { name: 'Nueva página' });
  await expect(form.getByLabel('Título')).toBeFocused();
  await form.getByLabel('Título').fill('Precios');
  await form.getByLabel('Ruta').fill('/Precios');
  await form.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('alert')).toContainText('solo lleva minúsculas');
  await form.getByLabel('Ruta').fill('/precios');
  await form.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('status')).toHaveText('«Precios» se creó como borrador.');
  await expect(fila('Precios')).toContainText('Borrador');
  expect((await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze()).violations.map((v) => v.id)).toEqual([]);

  // Programar: rechaza una hora pasada en la misma vista y programa una futura en hora de Lima.
  await fila('Precios').getByRole('button', { name: 'Programar Precios' }).click();
  const programar = page.getByRole('form', { name: 'Programar Precios' });
  const campo = programar.getByLabel('Publicar el (hora de Lima)');
  await expect(campo).toBeFocused();
  await campo.fill('2020-01-01T09:00');
  await programar.getByRole('button', { name: 'Programar publicación' }).click();
  await expect(programar.getByRole('alert')).toHaveText('La fecha de publicación tiene que ser futura.');
  expect((await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze()).violations.map((v) => v.id)).toEqual([]);
  const pedido = page.waitForRequest((r) => r.method() === 'PATCH' && r.url().includes('/sitio/paginas/'));
  await campo.fill('2099-01-15T09:00');
  await programar.getByRole('button', { name: 'Programar publicación' }).click();
  expect((await pedido).postDataJSON()).toEqual({ accion: 'programar', publicarEn: '2099-01-15T09:00:00-05:00' });
  await expect(fila('Precios')).toContainText('Programada');
  await expect(fila('Precios')).toContainText(/Se publica el 15 ene\.? 2099,? 9:00.*\(Lima\)/);
  await expect(page.getByRole('status')).toContainText('«Precios» se publicará el');

  // Publicar ahora y volver a borrador.
  await fila('Precios').getByRole('button', { name: 'Publicar Precios' }).click();
  await expect(fila('Precios')).toContainText('Publicada');
  await expect(page.getByRole('status')).toHaveText('«Precios» está publicada en /precios.');
  await expect(fila('Precios').getByRole('button', { name: 'Borrar Precios' })).toHaveCount(0);
  await fila('Precios').getByRole('button', { name: 'Pasar a borrador Precios' }).click();
  await expect(fila('Precios')).toContainText('Borrador');

  // Borrar pide confirmación; Cancelar no borra.
  await fila('Precios').getByRole('button', { name: 'Borrar Precios' }).click();
  const confirmar = page.getByRole('group', { name: 'Confirmar el borrado de Precios' });
  await expect(confirmar).toContainText('¿Borrar «Precios» (/precios)? No se puede deshacer.');
  expect((await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze()).violations.map((v) => v.id)).toEqual([]);
  await confirmar.getByRole('button', { name: 'Cancelar' }).click();
  await expect(fila('Precios')).toHaveCount(1);
  await fila('Precios').getByRole('button', { name: 'Borrar Precios' }).click();
  await page.getByRole('group', { name: 'Confirmar el borrado de Precios' }).getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(page.getByRole('status')).toHaveText('«Precios» se borró.');
  await expect(fila('Precios')).toHaveCount(0);
  await expect(fila('Inicio')).toHaveCount(1);

  // Una ruta repetida la rechaza la API con su mensaje.
  await page.getByRole('button', { name: 'Nueva página' }).click();
  await form.getByLabel('Título').fill('Otro inicio');
  await form.getByRole('button', { name: 'Crear borrador' }).click();
  await expect(page.getByRole('alert')).toHaveText('Ya hay una página en / en español');
});

test('el Resumen cuenta las páginas por estado', async ({ page }) => {
  const p = (id: string, ruta: string, estado: 'BORRADOR' | 'PROGRAMADA' | 'PUBLICADA') => ({ id, ruta, idioma: 'es' as const, titulo: ruta, estado, publicarEn: estado === 'PROGRAMADA' ? '2099-01-01T14:00:00.000Z' : null, publicadaEn: estado === 'PUBLICADA' ? '2026-11-10T15:00:00.000Z' : null, creadoEn: '2026-11-10T15:00:00.000Z', actualizadoEn: '2026-11-10T15:00:00.000Z' });
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', paginasSitio: [p('00000000-0000-4000-8000-000000000001', '/', 'PUBLICADA'), p('00000000-0000-4000-8000-000000000002', '/precios', 'PROGRAMADA'), p('00000000-0000-4000-8000-000000000003', '/demo', 'BORRADOR')] });
  await page.goto('/sitio');
  await expect(page.getByText('3 páginas: 1 publicadas, 1 programadas y 1 en borrador.')).toBeVisible();
  await page.getByRole('link', { name: 'Ir a Páginas' }).click();
  await expect(page).toHaveURL('/sitio/paginas');
});
