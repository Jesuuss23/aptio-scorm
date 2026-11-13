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

// HU-1503 · Editor de página (PNT-26): Páginas › Editar, estado vacío, agregar bloques (entran ocultos), mostrar y
// ocultar con el chip «N visibles», reordenar con flechas por teclado, borrar con confirmación y axe sin violaciones.
test('el superadmin edita los bloques de una página: agrega, muestra, reordena con teclado y borra', async ({ page }) => {
  const fecha = '2026-11-10T15:00:00.000Z';
  const pag = (id: string, ruta: string, titulo: string) => ({ id, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: fecha, creadoEn: fecha, actualizadoEn: fecha });
  const INICIO = '00000000-0000-4000-8000-000000000001';
  const PRECIOS = '00000000-0000-4000-8000-000000000002';
  const bloque = (n: number, tipo: string, visible: boolean) => ({ id: `00000000-0000-4000-9100-00000000000${n}`, paginaId: INICIO, tipo, orden: n, visible, ajustes: null, creadoEn: fecha, actualizadoEn: fecha });
  await simularApi(page, {
    conSesion: true, rol: 'SUPERADMIN',
    paginasSitio: [pag(INICIO, '/', 'Inicio'), pag(PRECIOS, '/precios', 'Precios')],
    bloquesSitio: [bloque(0, 'hero', true), bloque(1, 'metricas', true), bloque(2, 'logos', true), bloque(3, 'testimonios', true)],
  });
  await page.goto('/sitio/paginas');
  await page.getByRole('button', { name: 'Editar Precios' }).click();
  await expect(page).toHaveURL(`/sitio/paginas/${PRECIOS}`);
  await expect(page.getByRole('heading', { level: 1, name: 'Editor de página' })).toBeVisible();
  await expect(page.getByText('Esta página aún no tiene bloques. Agrega uno para empezar.')).toBeVisible();
  await expect(page.getByText('0 visibles')).toBeVisible();

  // Agregar: entra al final y oculto (RN-16-2).
  const agregar = page.getByRole('form', { name: 'Agregar bloque' });
  await agregar.getByLabel('Tipo de bloque').selectOption({ label: 'Planes y precios' });
  await agregar.getByRole('button', { name: 'Agregar bloque' }).click();
  await expect(page.getByRole('status').filter({ hasText: '«Planes y precios» se agregó al final, oculto.' })).toBeVisible();
  const interruptor = page.getByRole('switch', { name: 'Mostrar bloque Planes y precios' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Datos: Planes')).toBeVisible();
  await expect(page.getByText('0 visibles')).toBeVisible();
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('1 visibles')).toBeVisible();

  // Selector de página: pasa a Inicio con sus cuatro bloques.
  await page.getByLabel('Página a editar').selectOption({ label: 'Inicio (/)' });
  await expect(page).toHaveURL(`/sitio/paginas/${INICIO}`);
  const lista = page.getByRole('list', { name: 'Bloques de la página' });
  const nombres = () => lista.getByRole('listitem').locator('b').allTextContents();
  await expect.poll(nombres).toEqual(['Portada', 'Cifras', 'Logos de clientes', 'Testimonios']);
  await expect(page.getByText('4 visibles')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Subir Portada' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Bajar Testimonios' })).toBeDisabled();

  // CP-112 · Ocultar Testimonios: sigue en la lista, tachado, y el chip baja.
  await page.getByRole('switch', { name: 'Mostrar bloque Testimonios' }).press('Space');
  await expect(page.getByRole('switch', { name: 'Mostrar bloque Testimonios' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('3 visibles')).toBeVisible();
  await expect(lista.getByRole('listitem').filter({ hasText: 'Testimonios' })).toContainText('Oculto');

  // CP-113 · Logos sobre Cifras con el teclado; el foco sigue al bloque movido.
  const subirLogos = page.getByRole('button', { name: 'Subir Logos de clientes' });
  await subirLogos.focus();
  await page.keyboard.press('Enter');
  await expect.poll(nombres).toEqual(['Portada', 'Logos de clientes', 'Cifras', 'Testimonios']);
  await expect(subirLogos).toBeFocused();
  await expect(page.getByText('«Logos de clientes» quedó en la posición 2 de 4.')).toBeAttached();
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`)).toEqual([]);

  // Borrar con confirmación.
  await page.getByRole('button', { name: 'Borrar Cifras' }).click();
  const confirmar = page.getByRole('group', { name: 'Confirmar el borrado de Cifras' });
  await expect(confirmar).toBeVisible();
  const axeConfirmar = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axeConfirmar.violations.map((v) => v.id)).toEqual([]);
  await confirmar.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect.poll(nombres).toEqual(['Portada', 'Logos de clientes', 'Testimonios']);
  await expect(page.getByText('2 visibles')).toBeVisible();

  // Volver a Páginas.
  await page.getByRole('button', { name: 'Volver a Páginas' }).click();
  await expect(page).toHaveURL('/sitio/paginas');
});

test('el editor de página es solo del superadmin', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
  await page.goto('/sitio/paginas/00000000-0000-4000-8000-000000000001');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

// HU-1504 · Sitio web › Contenido (PNT-27): pestañas por colección, agregar (entra oculto, CP-115), editar y guardar,
// mostrar y ocultar con el chip, reordenar con teclado, borrar con confirmación, texto plano (RN-16-7) y axe en 0.
test('el superadmin administra el contenido del sitio por colección', async ({ page }) => {
  const f = '2026-11-10T15:00:00.000Z';
  const el = (n: number, coleccion: string, visible: boolean, datos: Record<string, string | number>) => ({ id: `00000000-0000-4000-9300-00000000000${n}`, coleccion, orden: n, visible, datos, creadoEn: f, actualizadoEn: f });
  await simularApi(page, {
    conSesion: true, rol: 'SUPERADMIN',
    elementosSitio: [
      el(0, 'testimonios', true, { nombre: 'Mariana Paredes', cargo: 'Jefa de Capacitación', empresa: 'Minera Andina', texto: 'Pasamos de tres semanas a cuatro días.', estrellas: 5 }),
      el(1, 'testimonios', true, { nombre: 'Carlos Alarcón', cargo: 'Coordinador', empresa: 'Banco Altiplano', texto: 'Subió a Moodle sin ajustes.', estrellas: 5 }),
    ],
  });
  await page.goto('/sitio');
  await menu(page).getByRole('link', { name: 'Contenido' }).click();
  await expect(page).toHaveURL('/sitio/contenido');
  await expect(page.getByRole('heading', { level: 1, name: 'Contenido' })).toBeVisible();
  const pestanas = page.getByRole('tablist', { name: 'Colecciones de contenido' });
  await expect(pestanas.getByRole('tab')).toHaveText(['Cifras', 'Testimonios', 'Logos', 'Funcionalidades', 'Pasos', 'LMS', 'Preguntas']);
  await expect(pestanas.getByRole('tab', { name: 'Cifras' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('Aún no hay elementos en Cifras.')).toBeVisible();

  // CP-115 · Una cifra nueva entra oculta; HTML se rechaza antes de enviar.
  await page.getByRole('button', { name: 'Agregar' }).click();
  const nueva = page.getByRole('form', { name: 'Nuevo elemento de Cifras' });
  await expect(nueva.getByLabel('Valor')).toBeFocused();
  await nueva.getByLabel('Valor').fill('4 días');
  await nueva.getByLabel('Etiqueta').fill('<b>para entregar</b>');
  await nueva.getByRole('button', { name: 'Guardar' }).click();
  await expect(nueva.getByRole('alert')).toHaveText('Etiqueta solo admite texto, sin etiquetas HTML');
  await nueva.getByLabel('Etiqueta').fill('para entregar una cápsula');
  await nueva.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: '«4 días» se agregó al final, oculto.' })).toBeVisible();
  const interruptor = page.getByRole('switch', { name: 'Mostrar 4 días' });
  await expect(interruptor).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('0 visibles')).toBeVisible();
  await interruptor.click();
  await expect(interruptor).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('1 visibles')).toBeVisible();

  // Pestañas con el teclado: flecha derecha pasa a Testimonios.
  await pestanas.getByRole('tab', { name: 'Cifras' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(pestanas.getByRole('tab', { name: 'Testimonios' })).toBeFocused();
  await expect(pestanas.getByRole('tab', { name: 'Testimonios' })).toHaveAttribute('aria-selected', 'true');
  const lista = page.getByRole('list', { name: 'Elementos de Testimonios' });
  const nombres = async () => (await lista.getByRole('listitem').getByLabel('Nombre').evaluateAll((ns) => ns.map((n) => (n as HTMLInputElement).value)));
  await expect.poll(nombres).toEqual(['Mariana Paredes', 'Carlos Alarcón']);
  await expect(page.getByText('2 visibles')).toBeVisible();

  // CP-114 · Ocultar un testimonio: sigue en la lista con sus datos.
  await page.getByRole('switch', { name: 'Mostrar Carlos Alarcón' }).press('Space');
  await expect(page.getByRole('switch', { name: 'Mostrar Carlos Alarcón' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('1 visibles')).toBeVisible();
  await expect(page.getByText('quedó oculto en todas las páginas; sus datos se conservan')).toBeAttached();

  // Editar y guardar: Guardar se activa solo con cambios.
  const editar = page.getByRole('form', { name: 'Editar Mariana Paredes' });
  await expect(editar.getByRole('button', { name: 'Guardar' })).toBeDisabled();
  await editar.getByLabel('Cargo').fill('Jefa de SSOMA');
  await editar.getByRole('button', { name: 'Guardar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se guardó «Mariana Paredes».' })).toBeVisible();
  await expect(page.getByRole('form', { name: 'Editar Mariana Paredes' }).getByLabel('Cargo')).toHaveValue('Jefa de SSOMA');

  // Reordenar con el teclado; el foco sigue al elemento.
  const subir = page.getByRole('button', { name: 'Subir Carlos Alarcón' });
  await subir.focus();
  await page.keyboard.press('Enter');
  await expect.poll(nombres).toEqual(['Carlos Alarcón', 'Mariana Paredes']);
  await expect(page.getByRole('button', { name: 'Bajar Carlos Alarcón' })).toBeFocused();
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

  // Borrar con confirmación.
  await page.getByRole('button', { name: 'Borrar Carlos Alarcón' }).click();
  const confirmar = page.getByRole('group', { name: 'Confirmar el borrado de Carlos Alarcón' });
  const axeConfirmar = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axeConfirmar.violations.map((v) => v.id)).toEqual([]);
  await confirmar.getByRole('button', { name: 'Sí, borrar' }).click();
  await expect.poll(nombres).toEqual(['Mariana Paredes']);
});

test('Contenido es solo del superadmin', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
  await page.goto('/sitio/contenido');
  await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
});

// HU-1505 · CP-116: en producción, un testimonio marcado ficticio y visible bloquea publicar; la lista sale con «Ocultar
// todos los ficticios», que los oculta y publica en un clic. CP-117: en pruebas se publica con aviso. axe en 0.
const F = '2026-11-10T15:00:00.000Z';
const PAG_PRECIOS = { id: '00000000-0000-4000-8000-000000000002', ruta: '/precios', idioma: 'es' as const, titulo: 'Precios', estado: 'BORRADOR' as const, publicarEn: null, publicadaEn: null, creadoEn: F, actualizadoEn: F };
const testimonioSim = (n: number, nombre: string) => ({ id: `00000000-0000-4000-9300-00000000000${n}`, coleccion: 'testimonios', orden: n, visible: true, datos: { nombre, cargo: 'Jefa', empresa: 'Minera Andina', texto: 'Muy útil.', estrellas: 5 }, creadoEn: F, actualizadoEn: F });

test('CP-116: en producción los ficticios visibles bloquean publicar y se resuelve con «Ocultar todos los ficticios»', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'produccion', paginasSitio: [PAG_PRECIOS], elementosSitio: [testimonioSim(0, 'Mariana Paredes'), testimonioSim(1, 'Carlos Alarcón')] });
  await page.goto('/sitio/contenido');
  await expect(page.getByText('Datos ficticios visibles:')).toContainText('0');
  await page.getByRole('tab', { name: 'Testimonios' }).click();
  // Marca los dos como ficticios: aparece el distintivo, el contador y el aviso.
  for (const nombre of ['Mariana Paredes', 'Carlos Alarcón']) {
    await page.getByRole('checkbox', { name: `Ficticio: ${nombre}` }).click();
    await expect(page.getByRole('checkbox', { name: `Ficticio: ${nombre}` })).toBeChecked();
  }
  await expect(page.getByRole('listitem').filter({ hasText: 'Ficticio' }).locator('.chip.aviso')).toHaveCount(2);
  await expect(page.getByText('Datos ficticios visibles:')).toContainText('2');
  const region = page.getByRole('region', { name: 'Datos ficticios visibles' });
  await expect(region).toContainText('Hay 2 datos ficticios visibles. En producción no se puede publicar');
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);

  // Publicar en Páginas: 409 con la lista.
  await menu(page).getByRole('link', { name: 'Páginas' }).click();
  await page.getByRole('button', { name: 'Publicar Precios' }).click();
  const alerta = page.getByRole('alert').filter({ hasText: '«Precios» no se publicó.' });
  await expect(alerta).toBeVisible();
  await expect(alerta.getByRole('list', { name: 'Datos ficticios visibles' }).getByRole('listitem')).toHaveText(['Mariana Paredes (Testimonios)', 'Carlos Alarcón (Testimonios)']);
  const tabla = page.getByRole('table', { name: 'Páginas del sitio' });
  await expect(tabla.getByRole('row', { name: /Precios/ })).toContainText('Borrador');
  const axe409 = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe409.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ') + ' ' + n.failureSummary).join(' | ')}`)).toEqual([]);

  // Un clic: los oculta y publica.
  await alerta.getByRole('button', { name: 'Ocultar todos los ficticios' }).click();
  await expect(page.getByRole('status').filter({ hasText: '«Precios» está publicada en /precios.' })).toBeVisible();
  await expect(tabla.getByRole('row', { name: /Precios/ })).toContainText('Publicada');
  await expect(page.getByText('no se publicó')).toHaveCount(0);

  // De vuelta en Contenido: siguen marcados, ahora ocultos, y el contador en 0.
  await menu(page).getByRole('link', { name: 'Contenido' }).click();
  await expect(page.getByText('Datos ficticios visibles:')).toContainText('0');
  await page.getByRole('tab', { name: 'Testimonios' }).click();
  await expect(page.getByRole('switch', { name: 'Mostrar Mariana Paredes' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByRole('checkbox', { name: 'Ficticio: Mariana Paredes' })).toBeChecked();
});

test('CP-117: en pruebas se publica con aviso y Contenido ofrece ocultarlos', async ({ page }) => {
  const ficticio = { ...testimonioSim(0, 'Mariana Paredes'), ficticio: true };
  await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', paginasSitio: [PAG_PRECIOS], elementosSitio: [ficticio, { ...testimonioSim(1, 'Carlos Alarcón'), ficticio: true }] });
  await page.goto('/sitio/paginas');
  await page.getByRole('button', { name: 'Publicar Precios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Aviso: hay 2 datos ficticios visibles; en pruebas se publica igual' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Páginas del sitio' }).getByRole('row', { name: /Precios/ })).toContainText('Publicada');

  await menu(page).getByRole('link', { name: 'Contenido' }).click();
  const region = page.getByRole('region', { name: 'Datos ficticios visibles' });
  await expect(region).toContainText('En pruebas se publica igual, con aviso');
  await region.getByRole('button', { name: 'Ocultar todos los ficticios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se ocultaron 2 datos ficticios.' })).toBeVisible();
  await expect(region).toHaveCount(0);
});

// HU-1506 · CP-118: menú principal y pie de página en «Sitio web › Páginas» (PNT-25). Agregar (nace oculto), editar,
// reordenar con teclado (el foco sigue al enlace), ocultar «Casos» y ver que sale de «En el sitio», columna del pie que
// oculta sus enlaces, ruta insegura rechazada y borrar con confirmación. axe WCAG 2.2 A/AA.
const enlaceSim = (n: number, zona: 'menu' | 'pie', texto: string, ruta: string | null, orden: number, padreId: string | null = null) =>
  ({ id: `00000000-0000-4000-9500-00000000000${n}`, zona, padreId, texto, ruta, orden, visible: true });

test('CP-118: el enlace «Casos» oculto no aparece en el menú del sitio; el pie se administra por columnas', async ({ page }) => {
  const legal = enlaceSim(4, 'pie', 'Legal', null, 0);
  await simularApi(page, {
    conSesion: true, rol: 'SUPERADMIN',
    enlacesSitio: [
      enlaceSim(1, 'menu', 'Producto', '/funcionalidades/personaje', 0), enlaceSim(2, 'menu', 'Precios', '/precios', 1),
      enlaceSim(3, 'menu', 'Blog', 'https://blog.aptioscorm.com', 2),
      legal, enlaceSim(5, 'pie', 'Privacidad', '/privacidad', 0, legal.id), enlaceSim(6, 'pie', 'Términos', '/terminos', 1, legal.id),
    ],
  });
  await page.goto('/sitio/paginas');
  const menuSitio = page.getByRole('region', { name: 'Menú principal' });
  const enSitio = menuSitio.getByLabel('En el sitio: menú principal');
  await expect(enSitio).toHaveText('En el sitio: Producto · Precios · Blog');
  await expect(menuSitio.getByText('Externo')).toHaveCount(1);

  // Agregar «Casos»: una ruta insegura se rechaza; con una ruta interna entra al final y oculto.
  await menuSitio.getByRole('button', { name: 'Agregar enlace al menú' }).click();
  const nuevo = menuSitio.getByRole('form', { name: 'Nuevo enlace del menú' });
  await expect(nuevo.getByLabel('Texto')).toBeFocused();
  await nuevo.getByLabel('Texto').fill('Casos');
  await nuevo.getByLabel('Ruta').fill('javascript:alert(1)');
  await nuevo.getByRole('button', { name: 'Agregar' }).click();
  await expect(nuevo.getByRole('alert')).toHaveText('La ruta empieza con / o con https://');
  await nuevo.getByLabel('Ruta').fill('/#testimonios');
  await nuevo.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByRole('status').filter({ hasText: '«Casos» se agregó al final, oculto.' })).toBeVisible();
  const casos = menuSitio.getByRole('switch', { name: 'Mostrar Casos' });
  await expect(casos).toHaveAttribute('aria-checked', 'false');
  await expect(enSitio).toHaveText('En el sitio: Producto · Precios · Blog');

  // Mostrarlo, subirlo con el teclado (el foco sigue al enlace) y editar su texto.
  await casos.click();
  await expect(casos).toHaveAttribute('aria-checked', 'true');
  await expect(enSitio).toHaveText('En el sitio: Producto · Precios · Blog · Casos');
  await menuSitio.getByRole('button', { name: 'Subir Casos' }).focus();
  await page.keyboard.press('Enter');
  await expect(menuSitio.getByRole('button', { name: 'Subir Casos' })).toBeFocused();
  await expect(enSitio).toHaveText('En el sitio: Producto · Precios · Casos · Blog');
  const editar = menuSitio.getByRole('form', { name: 'Editar Casos' });
  await editar.getByLabel('Texto').fill('Casos de éxito');
  await editar.getByRole('button', { name: 'Guardar' }).click();
  await expect(enSitio).toHaveText('En el sitio: Producto · Precios · Casos de éxito · Blog');
  await menuSitio.getByRole('form', { name: 'Editar Casos de éxito' }).getByLabel('Texto').fill('Casos');
  await menuSitio.getByRole('form', { name: 'Editar Casos de éxito' }).getByRole('button', { name: 'Guardar' }).click();

  // CP-118: «Casos» oculto no aparece en el sitio (cabecera y menú de celular usan la misma lista); no se borra.
  await menuSitio.getByRole('switch', { name: 'Mostrar Casos' }).click();
  await expect(menuSitio.getByRole('switch', { name: 'Mostrar Casos' })).toHaveAttribute('aria-checked', 'false');
  await expect(enSitio).toHaveText('En el sitio: Producto · Precios · Blog');
  await expect(menuSitio.getByRole('form', { name: 'Editar Casos' })).toBeVisible();

  // Pie: ocultar la columna «Legal» oculta sus enlaces; agregar una columna nueva con un enlace.
  const pie = page.getByRole('region', { name: 'Pie de página' });
  const enPie = pie.getByLabel('En el sitio: pie de página');
  await expect(enPie).toHaveText('En el sitio: Legal (Privacidad, Términos)');
  await pie.getByRole('switch', { name: 'Mostrar Términos' }).click();
  await expect(enPie).toHaveText('En el sitio: Legal (Privacidad)');
  await pie.getByRole('switch', { name: 'Mostrar columna Legal' }).click();
  await expect(enPie).toHaveText('En el sitio: el pie no muestra columnas');
  await expect(pie.getByText('La columna está oculta: ninguno de sus enlaces se ve en el sitio.')).toBeVisible();
  await pie.getByRole('button', { name: 'Agregar columna al pie' }).click();
  const columna = pie.getByRole('form', { name: 'Nueva columna del pie' });
  await columna.getByLabel('Título').fill('Empresa');
  await columna.getByRole('button', { name: 'Agregar' }).click();
  await pie.getByRole('button', { name: 'Agregar enlace a la columna Empresa' }).click();
  const hijo = pie.getByRole('form', { name: 'Nuevo enlace de la columna Empresa' });
  await hijo.getByLabel('Texto').fill('Nosotros');
  await hijo.getByLabel('Ruta').fill('/nosotros');
  await hijo.getByRole('button', { name: 'Agregar' }).click();
  await pie.getByRole('switch', { name: 'Mostrar columna Empresa' }).click();
  await pie.getByRole('switch', { name: 'Mostrar Nosotros' }).click();
  await expect(enPie).toHaveText('En el sitio: Empresa (Nosotros)');

  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => v.id)).toEqual([]);

  // Borrar con confirmación: la columna «Legal» se va con sus enlaces.
  await pie.getByRole('button', { name: 'Borrar columna Legal' }).click();
  await pie.getByRole('group', { name: 'Confirmar el borrado de columna Legal' }).getByRole('button', { name: 'Sí, borrar' }).click();
  await expect(page.getByRole('status').filter({ hasText: '«Legal» se borró.' })).toBeVisible();
  await expect(pie.getByRole('switch', { name: 'Mostrar Privacidad' })).toHaveCount(0);
});

// HU-1507 · Vista previa, versiones y restauración (REQ-068, RN-16-5).
const INICIO_ID = '00000000-0000-4000-8000-000000000001';
const PAG_INICIO = { ...PAG_PRECIOS, id: INICIO_ID, ruta: '/', titulo: 'Inicio', estado: 'PUBLICADA' as const, publicadaEn: F };
const bloqueSim = (n: number, tipo: string, visible = true) => ({ id: `00000000-0000-4000-9100-00000000000${n}`, paginaId: INICIO_ID, tipo, orden: n, visible, ajustes: null, creadoEn: F, actualizadoEn: F });
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

test('CP-119: restaurar la versión 1 crea la 4, el sitio vuelve a la 1 y el panel no cambia', async ({ page }) => {
  await simularApi(page, {
    conSesion: true, rol: 'SUPERADMIN', versionSitio: true,
    paginasSitio: [PAG_INICIO], bloquesSitio: [bloqueSim(0, 'hero'), bloqueSim(1, 'testimonios')],
    elementosSitio: [testimonioSim(0, 'Mariana Paredes')], enlacesSitio: [enlaceSim(1, 'menu', 'Producto', '/funcionalidades/personaje', 0)],
  });
  await page.goto('/sitio/paginas');
  const versiones = page.getByRole('region', { name: 'Versiones' });
  const tabla = versiones.getByRole('table', { name: 'Versiones del sitio' });
  await expect(tabla.getByRole('row', { name: /Versión 1/ })).toContainText('En el sitio');
  await expect(page.getByText('Sitio al día')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Publicar cambios' })).toBeDisabled();

  // v2: ocultar el bloque «Testimonios» en el editor y publicar.
  await page.getByRole('button', { name: 'Editar Inicio' }).click();
  await page.getByRole('switch', { name: 'Mostrar bloque Testimonios' }).click();
  await expect(page.getByText('Cambios sin publicar')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó la versión 2: el sitio ya muestra los cambios.' })).toBeVisible();
  await expect(page.getByText('Sitio al día')).toBeVisible();

  // v3: ocultar «Producto» del menú y publicar.
  await page.getByRole('button', { name: 'Volver a Páginas' }).click();
  await page.getByRole('region', { name: 'Menú principal' }).getByRole('switch', { name: 'Mostrar Producto' }).click();
  await expect(page.getByText('Cambios sin publicar')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó la versión 3' })).toBeVisible();
  await expect(tabla.getByRole('row').filter({ hasText: /Versión \d/ })).toHaveCount(3);

  // Restaurar la 1 con confirmación: se crea la 4 y el sitio queda igual a la 1.
  await tabla.getByRole('button', { name: 'Restaurar la versión 1' }).click();
  const confirmar = tabla.getByRole('group', { name: 'Confirmar la restauración de la versión 1' });
  await expect(confirmar).toContainText('se crea la versión 4');
  await sinViolaciones(page);
  await confirmar.getByRole('button', { name: 'Sí, restaurar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'El sitio volvió a la versión 1 y se creó la versión 4. Lo que editas en el panel no cambió.' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Versiones' })).toBeFocused();
  const v4 = tabla.getByRole('row', { name: /Versión 4/ });
  await expect(v4).toContainText('Restauración de la versión 1');
  await expect(v4).toContainText('En el sitio');
  await expect(versiones.getByText('El sitio muestra la versión 4')).toBeVisible();
  await expect(tabla.getByRole('button', { name: 'Restaurar la versión 4' })).toHaveCount(0);
  // El panel conserva lo editado: «Producto» sigue oculto y el chip avisa que difiere del sitio.
  await expect(page.getByRole('region', { name: 'Menú principal' }).getByRole('switch', { name: 'Mostrar Producto' })).toHaveAttribute('aria-checked', 'false');
  await expect(page.getByText('Cambios sin publicar')).toBeVisible();
  await sinViolaciones(page);
});

test('«Publicar cambios» en producción con ficticios: 409 con la lista y se resuelve en un clic', async ({ page }) => {
  await simularApi(page, {
    conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'produccion',
    paginasSitio: [PAG_INICIO], bloquesSitio: [bloqueSim(0, 'testimonios')],
    elementosSitio: [{ ...testimonioSim(0, 'Mariana Paredes'), ficticio: true }, testimonioSim(1, 'Carlos Alarcón')],
  });
  await page.goto('/sitio/paginas');
  await expect(page.getByText('Aún no hay versiones: el sitio no muestra nada.')).toBeVisible();
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  const alerta = page.getByRole('alert').filter({ hasText: 'Los cambios no se publicaron.' });
  await expect(alerta.getByRole('list', { name: 'Datos ficticios' }).getByRole('listitem')).toHaveText(['Mariana Paredes (Testimonios)']);
  await sinViolaciones(page);
  await alerta.getByRole('button', { name: 'Ocultar todos los ficticios' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se publicó la versión 1' })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Versiones del sitio' }).getByRole('row', { name: /Versión 1/ })).toContainText('Publicar cambios');
});

test('la vista previa muestra la página del panel con menú, bloques y pie en Escritorio y Celular', async ({ page }) => {
  const legal = enlaceSim(2, 'pie', 'Legal', null, 0);
  await simularApi(page, {
    conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas',
    paginasSitio: [{ ...PAG_INICIO, estado: 'BORRADOR', publicadaEn: null }],
    bloquesSitio: [bloqueSim(0, 'hero'), bloqueSim(1, 'testimonios'), bloqueSim(2, 'faq', false)],
    elementosSitio: [{ ...testimonioSim(0, 'Mariana Paredes'), ficticio: true }, testimonioSim(1, 'Carlos Alarcón'), { ...testimonioSim(2, 'Oculta'), visible: false }],
    enlacesSitio: [enlaceSim(1, 'menu', 'Producto', '/funcionalidades/personaje', 0), legal, enlaceSim(3, 'pie', 'Privacidad', '/privacidad', 0, legal.id)],
  });
  await page.goto(`/sitio/paginas/${INICIO_ID}`);
  const tarjeta = page.getByRole('region', { name: 'Vista previa', exact: true });
  await expect(tarjeta).toContainText('La página está en borrador: el sitio aún no la muestra.');
  const escritorio = tarjeta.getByRole('button', { name: 'Escritorio (1280 px)' });
  await expect(escritorio).toHaveAttribute('aria-pressed', 'true');
  const marco = page.getByRole('region', { name: 'Vista previa de Inicio en escritorio, 1280 px' });
  await expect(marco.getByRole('list', { name: 'Menú principal' }).getByRole('listitem')).toHaveText(['Producto']);
  await expect(marco.getByRole('list', { name: 'Bloques visibles' }).locator(':scope > li > b')).toHaveText(['Portada', 'Testimonios']);
  await expect(marco.locator('.vp-elementos li')).toHaveText(['Mariana ParedesFicticio', 'Carlos Alarcón']);
  await expect(marco.getByRole('list', { name: 'Pie: Legal' }).getByRole('listitem')).toHaveText(['Privacidad']);
  expect(await marco.locator('.sitio-previa-pagina').evaluate((n) => n.getBoundingClientRect().width)).toBe(1280);
  await sinViolaciones(page);

  await tarjeta.getByRole('button', { name: 'Celular (390 px)' }).click();
  await expect(escritorio).toHaveAttribute('aria-pressed', 'false');
  const celular = page.getByRole('region', { name: 'Vista previa de Inicio en celular, 390 px' });
  expect(await celular.locator('.sitio-previa-pagina').evaluate((n) => n.getBoundingClientRect().width)).toBe(390);
  await sinViolaciones(page);

  // Al mostrar «Preguntas frecuentes» la vista previa se actualiza sin recargar.
  await page.getByRole('switch', { name: 'Mostrar bloque Preguntas frecuentes' }).click();
  await expect(celular.getByRole('list', { name: 'Bloques visibles' }).locator(':scope > li > b')).toHaveText(['Portada', 'Testimonios', 'Preguntas frecuentes']);
});

// HU-1508 · CP-120 · El sitio público pre-renderizado en /s/ (DA-08, REQ-109): HTML sin JavaScript, menú de celular con
// <details>, enlaces externos con rel="noopener" y sin violaciones de axe a 390 y 1280 px. La tarjeta «Versiones» lo abre.
const SITIO_PUBLICO = {
  conSesion: true, rol: 'SUPERADMIN', versionSitio: true, entornoSitio: 'produccion' as const,
  paginasSitio: [PAG_INICIO], bloquesSitio: [bloqueSim(0, 'hero'), bloqueSim(1, 'testimonios'), bloqueSim(2, 'cta')],
  elementosSitio: [testimonioSim(0, 'Mariana Paredes'), { ...testimonioSim(1, 'Persona de ejemplo'), ficticio: true, visible: false }],
  enlacesSitio: [enlaceSim(1, 'menu', 'Producto', '/funcionalidades/personaje', 0), enlaceSim(2, 'menu', 'Blog', 'https://blog.aptioscorm.com', 1)],
};

for (const ancho of [390, 1280]) {
  test(`CP-120: el sitio público en /s/ a ${ancho} px es HTML sin JavaScript, accesible y con su menú`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO_PUBLICO);
    const res = await page.goto('/s/');
    expect(res?.status()).toBe(200);
    expect(res?.headers()['content-security-policy']).toContain("default-src 'none'");
    await expect(page).toHaveTitle('Aptio SCORM · Inicio');
    expect(await page.locator('script:not([type="application/ld+json"])').count()).toBe(0);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByText('Mariana Paredes')).toBeVisible();
    await expect(page.getByText('Persona de ejemplo')).toHaveCount(0);

    await expect(page.locator('a[href="https://blog.aptioscorm.com"]')).toHaveCount(2);
    for (const blog of await page.locator('a[href="https://blog.aptioscorm.com"]').all()) {
      await expect(blog).toHaveAttribute('target', '_blank');
      await expect(blog).toHaveAttribute('rel', 'noopener');
    }
    const escritorio = page.getByRole('navigation', { name: 'Principal', exact: true });
    const menu = page.locator('details.menu-celular');
    if (ancho < 980) {
      await expect(escritorio).toBeHidden();
      await expect(menu).not.toHaveAttribute('open');
      await page.getByText('Menú', { exact: true }).focus();
      await page.keyboard.press('Enter');
      await expect(menu).toHaveAttribute('open', '');
      await expect(page.getByRole('navigation', { name: 'Principal (menú)' }).getByRole('link', { name: 'Producto' })).toBeVisible();
      await expect(page.getByRole('navigation', { name: 'Principal (menú)' }).getByRole('link', { name: 'Blog' })).toBeVisible();
    } else {
      await expect(escritorio.getByRole('link', { name: 'Producto' })).toHaveAttribute('href', '/s/funcionalidades/personaje');
      await expect(menu).toBeHidden();
    }
    const axe = await new AxeBuilder({ page }).withTags(REGLAS).analyze();
    expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
  });
}

test('CP-120: una ruta no publicada da la página 404 en HTML con enlace al inicio', async ({ page }) => {
  await simularApi(page, SITIO_PUBLICO);
  const res = await page.goto('/s/precios');
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  await page.getByRole('link', { name: 'Ir al inicio' }).click();
  await expect(page).toHaveURL(/\/s\/$/);
  await expect(page.getByText('Mariana Paredes')).toBeVisible();
});

test('«Ver el sitio» en «Versiones» abre el sitio público en otra pestaña, con el sitio listo', async ({ page }) => {
  await simularApi(page, SITIO_PUBLICO);
  await page.goto('/sitio/paginas');
  const versiones = page.getByRole('region', { name: 'Versiones' });
  await expect(versiones.getByText('Sitio listo')).toBeVisible();
  const enlace = versiones.getByRole('link', { name: 'Ver el sitio (se abre en una pestaña nueva)' });
  await expect(enlace).toHaveAttribute('href', '/s/');
  await expect(enlace).toHaveAttribute('target', '_blank');
  await expect(enlace).toHaveAttribute('rel', 'noopener');
  // La pestaña nueva no tiene la API simulada hasta que se le instala; luego se recarga.
  const [pestana] = await Promise.all([page.context().waitForEvent('page'), enlace.click()]);
  await expect(pestana).toHaveURL(/\/s\/$/);
  await simularApi(pestana, SITIO_PUBLICO);
  await pestana.reload();
  await expect(pestana.getByText('Mariana Paredes')).toBeVisible();
  await sinViolaciones(page);
});

test('si preparar el sitio falla, «Versiones» lo dice con el motivo', async ({ page }) => {
  await simularApi(page, { ...SITIO_PUBLICO, prerenderSitio: 'error' });
  await page.goto('/sitio/paginas');
  const versiones = page.getByRole('region', { name: 'Versiones' });
  await expect(versiones.getByText('Error al preparar el sitio')).toBeVisible();
  await expect(versiones.getByRole('alert')).toContainText('El sitio público todavía no muestra la versión 1: no se pudo preparar. Motivo: No se pudo subir el sitio al almacenamiento: Access Denied. Se reintenta');
  await sinViolaciones(page);
});

test('mientras se prepara el sitio, «Versiones» lo indica', async ({ page }) => {
  await simularApi(page, { ...SITIO_PUBLICO, prerenderSitio: 'en_curso' });
  await page.goto('/sitio/paginas');
  const versiones = page.getByRole('region', { name: 'Versiones' });
  await expect(versiones.getByText('Preparando el sitio', { exact: true })).toBeVisible();
  await expect(versiones.getByRole('status')).toContainText('el sitio público la mostrará en unos segundos');
});
