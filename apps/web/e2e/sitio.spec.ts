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
