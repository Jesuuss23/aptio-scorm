// HU-1603 · Popups (REQ-076, PNT-31, RN-17-3, CP-131, CP-132). En el sitio público: el modal de salida se muestra una
// vez y no vuelve antes de 7 días (CP-131), un popup apagado no aparece y al activarlo en el panel se ve sin publicar
// (CP-132), el popup de correo crea el lead con origen «Popup» y no se vuelve a mostrar, el modal atrapa el foco y se
// cierra con Escape, el deslizable y la barra son fijos, y en pantallas táctiles la salida no se dispara. En el panel,
// Captación › Popups: la tabla, «Nuevo popup», editar, ordenar, reiniciar y borrar. axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { CLAVE_POPUPS } from '@aptio/sitio';
import { eventosPopupSim, type PopupSim, simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const DIA = 86_400_000;
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000010${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000010${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const BLOQUES = [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[0]!.id, 'cta'), bloque(2, PAGINAS[1]!.id, 'cta')];

const popup = (n: number, d: Partial<PopupSim>): PopupSim => ({
  id: `00000000-0000-4000-9900-00000000000${n}`, nombre: `Popup ${n}`, tipo: 'modal', idioma: 'es', disparador: 'al_cargar', valorDisparador: null, paginas: ['*'], titulo: `Título ${n}`,
  texto: 'Texto del popup.', boton: 'Enviar', accion: 'pedir_correo', enlaceDestino: null, frecuenciaDias: 7, visible: true, ficticio: false, orden: n, impresiones: 0, conversiones: 0, actualizadoEn: F, ...d,
});
const GUIA = popup(1, { nombre: 'Guía de microaprendizaje', disparador: 'intencion_salida', titulo: 'Llévate la guía de microaprendizaje', texto: '12 páginas con plantillas para pasar de un manual a una cápsula.', boton: 'Enviarme la guía', impresiones: 2140, conversiones: 146 });
const DEMO = popup(2, { nombre: '¿Quieres ver una demo?', tipo: 'deslizable', disparador: 'desplazamiento', valorDisparador: 30, paginas: ['/'], titulo: '¿Quieres verlo con tu material?', texto: 'Agenda 30 minutos.', boton: 'Agendar demo', accion: 'enlace_interno', enlaceDestino: '/agendar-demo', impresiones: 3980, conversiones: 123 });
const WEBINAR = popup(3, { nombre: 'Webinar de diciembre', titulo: 'Webinar: microaprendizaje para seguridad', paginas: ['/'], visible: false });
const SITIO = { conSesion: true, rol: 'SUPERADMIN', versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES };

const sinViolaciones = async (page: Page, soloMain = true) => {
  // El popup entra con una animación de opacidad (0,2 s): a mitad, el texto semitransparente no llega al contraste.
  await page.evaluate(() => Promise.all(document.getAnimations()
    .filter((a) => Number.isFinite(Number(a.effect?.getComputedTiming().endTime)))
    .map((a) => a.finished.catch(() => undefined))));
  const b = new AxeBuilder({ page }).withTags(REGLAS);
  const axe = await (soloMain ? b.include('main') : b).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
/** La intención de salida: el puntero deja la ventana por arriba. */
const salir = (page: Page) => page.evaluate(() => document.documentElement.dispatchEvent(new MouseEvent('mouseout', { bubbles: true, clientY: 0, relatedTarget: null })));
const listo = (page: Page) => page.waitForResponse((r) => new URL(r.url()).pathname === '/s/_popups.json');
const dialogo = (page: Page, nombre: string | RegExp) => page.getByRole('dialog', { name: nombre });

test('CP-131 · el popup de salida se muestra una vez, atrapa el foco, se cierra con Escape y no vuelve antes de 7 días', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, popupsSitio: [GUIA] });
  const lista = listo(page);
  await page.goto('/s/precios');
  await lista;
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('link', { name: 'Saltar al contenido' }).focus();
  await salir(page);
  const guia = dialogo(page, 'Llévate la guía de microaprendizaje');
  await expect(guia).toBeVisible();
  await expect(guia).toHaveAttribute('aria-modal', 'true');
  await expect(guia).toHaveAccessibleDescription('12 páginas con plantillas para pasar de un manual a una cápsula.');
  await expect(guia.getByLabel('Correo de trabajo')).toBeFocused();
  await sinViolaciones(page, false);
  // El foco no sale del diálogo: de «No, gracias» vuelve a «Cerrar», y al revés.
  await guia.getByRole('button', { name: 'No, gracias' }).focus();
  await page.keyboard.press('Tab');
  await expect(guia.getByRole('button', { name: 'Cerrar' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(guia.getByRole('button', { name: 'No, gracias' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeFocused();
  expect(eventosPopupSim).toEqual([{ popupId: GUIA.id, evento: 'impresion' }]);

  // Vuelve al día siguiente (y a otra página): no se muestra.
  await page.evaluate(([k, id, dia]) => localStorage.setItem(k, JSON.stringify({ [id]: { v: Date.now() - 6 * dia } })), [CLAVE_POPUPS, GUIA.id, DIA] as const);
  const otra = listo(page);
  await page.goto('/s/');
  await otra;
  await salir(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // A los 7 días, sí.
  await page.evaluate(([k, id, dia]) => localStorage.setItem(k, JSON.stringify({ [id]: { v: Date.now() - 7 * dia } })), [CLAVE_POPUPS, GUIA.id, DIA] as const);
  const otraVez = listo(page);
  await page.reload();
  await otraVez;
  await salir(page);
  await expect(dialogo(page, 'Llévate la guía de microaprendizaje')).toBeVisible();
});

test('CP-132 · un popup apagado no se muestra; al activarlo en el panel se ve en el sitio sin publicar', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, popupsSitio: [WEBINAR] });
  const lista = listo(page);
  await page.goto('/s/');
  await lista;
  await page.waitForTimeout(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.goto('/captacion/popups');
  await page.getByRole('switch', { name: 'Activar popup Webinar de diciembre' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Webinar' })).toHaveText('«Webinar de diciembre» quedó activo: ya se ve en el sitio.');
  await expect(page.getByRole('switch', { name: 'Activar popup Webinar de diciembre' })).toHaveAttribute('aria-checked', 'true');
  await page.goto('/s/');
  await expect(dialogo(page, 'Webinar: microaprendizaje para seguridad')).toBeVisible();
  // En la página donde no va, no aparece aunque esté activo.
  await page.evaluate((k) => localStorage.removeItem(k), CLAVE_POPUPS);
  const precios = listo(page);
  await page.goto('/s/precios');
  await precios;
  await page.waitForTimeout(200);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

for (const ancho of [390, 1280]) {
  test(`a ${ancho} px el popup de correo crea el lead con origen «Popup» y no se vuelve a mostrar`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    const csp: string[] = [];
    page.on('console', (m) => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text()); });
    await simularApi(page, { ...SITIO, popupsSitio: [popup(4, { nombre: 'Guía', titulo: 'Llévate la guía', paginas: ['/precios'], boton: 'Enviarme la guía' })] });
    await page.goto('/s/precios?utm_source=linkedin&utm_medium=social');
    const guia = dialogo(page, 'Llévate la guía');
    await expect(guia).toBeVisible();
    await sinViolaciones(page, false);
    await guia.getByLabel('Correo de trabajo').fill('mrojas@andina.example');
    await guia.getByRole('button', { name: 'Enviarme la guía' }).click();
    // Sin la casilla de consentimiento el navegador no lo envía.
    await expect(guia.getByRole('status')).toHaveText('');
    await guia.getByLabel(/Acepto el tratamiento de mis datos personales/).check();
    await guia.getByRole('button', { name: 'Enviarme la guía' }).click();
    await expect(guia.getByRole('status')).toHaveText('Listo: te escribiremos a ese correo.');
    await guia.getByRole('button', { name: 'Cerrar' }).click();
    await page.reload();
    await page.waitForTimeout(300);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(csp).toEqual([]);

    await page.goto('/captacion/leads');
    const fila = page.getByRole('table', { name: 'Leads del sitio' }).getByRole('row').filter({ hasText: 'mrojas@andina.example' });
    await expect(fila).toContainText('Popup');
    await expect(fila).toContainText('/precios');
    await expect(fila).toContainText('linkedin / social');
    await page.goto('/captacion/popups');
    const popups = page.getByRole('table', { name: 'Popups del sitio' });
    await expect(popups.getByRole('row').filter({ hasText: 'Guía' })).toContainText('1 conversiones');
  });
}

test('el deslizable y la barra son fijos y no roban el foco; el enlace cuenta el clic; en pantalla táctil la salida no se dispara', async ({ browser }) => {
  const contexto = await browser.newContext({ viewport: { width: 390, height: 700 }, hasTouch: true, isMobile: true });
  const page = await contexto.newPage();
  const BARRA = popup(5, { nombre: 'Barra', tipo: 'barra', titulo: 'Nuevo: versión en inglés en el mismo paquete', texto: '', boton: 'Ver cómo funciona', accion: 'enlace_interno', enlaceDestino: '/precios', paginas: ['/precios'] });
  await simularApi(page, { ...SITIO, popupsSitio: [GUIA, DEMO, BARRA] });
  const lista = listo(page);
  await page.goto('/s/');
  await lista;
  await salir(page);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.mouse.wheel(0, 4000);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const demo = page.getByRole('complementary', { name: '¿Quieres verlo con tu material?' });
  await expect(demo).toBeVisible();
  expect(await demo.evaluate((e) => getComputedStyle(e).position)).toBe('fixed');
  await expect(demo).not.toContainText('Llévate');
  expect(await page.evaluate(() => document.activeElement?.closest('[data-popup]') ?? null)).toBeNull();
  await sinViolaciones(page, false);
  await demo.getByRole('link', { name: 'Agendar demo' }).click();
  await expect.poll(() => eventosPopupSim.map((e) => e.evento)).toEqual(['impresion', 'conversion']);

  await page.goto('/s/precios');
  const barra = page.getByRole('region', { name: 'Nuevo: versión en inglés en el mismo paquete' });
  await expect(barra).toBeVisible();
  expect(await barra.evaluate((e) => getComputedStyle(e).position)).toBe('fixed');
  await barra.getByRole('button', { name: 'Cerrar' }).click();
  await expect(barra).toHaveCount(0);
  await contexto.close();
});

test('«Probar en el sitio» abre el popup con #popup-<id> aunque el visitante ya lo haya visto', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, popupsSitio: [GUIA, WEBINAR] });
  await page.goto('/captacion/popups');
  const fila = page.getByRole('table', { name: 'Popups del sitio' }).getByRole('row').filter({ hasText: 'Guía de microaprendizaje' });
  const probar = fila.getByRole('link', { name: 'Probar en el sitio: Guía de microaprendizaje (se abre en una pestaña nueva)' });
  await expect(probar).toHaveAttribute('href', `/s/#popup-${GUIA.id}`);
  await expect(page.getByRole('table', { name: 'Popups del sitio' }).getByRole('row').filter({ hasText: 'Webinar' }).getByRole('link', { name: /^Probar/ })).toHaveCount(0);
  await page.evaluate(([k, id]) => localStorage.setItem(k, JSON.stringify({ [id]: { v: Date.now() } })), [CLAVE_POPUPS, GUIA.id] as const);
  await page.goto(`/s/#popup-${GUIA.id}`);
  await expect(dialogo(page, 'Llévate la guía de microaprendizaje')).toBeVisible();
});

for (const ancho of [390, 1280]) {
  test(`PNT-31 a ${ancho} px: la tabla, «Nuevo popup», editar, ordenar, reiniciar y borrar`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { conSesion: true, rol: 'SUPERADMIN', popupsSitio: [GUIA, DEMO, WEBINAR] });
    await page.goto('/captacion/popups');
    await expect(page.getByRole('heading', { level: 1, name: 'Popups' })).toBeVisible();
    const tabla = page.getByRole('table', { name: 'Popups del sitio' });
    await expect(tabla.getByRole('columnheader')).toHaveText(['Popup', 'Tipo', 'Disparador', 'Páginas', 'Impresiones', 'Conversión', 'Activo', 'Acciones']);
    const guia = tabla.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^Guía de microaprendizaje/ }) });
    await expect(guia).toContainText('Modal');
    await expect(guia).toContainText('Intención de salida');
    await expect(guia).toContainText('Todo el sitio');
    await expect(guia).toContainText('6.8 %');
    await expect(tabla.getByRole('row').filter({ hasText: '¿Quieres ver una demo?' })).toContainText('Desplazamiento · 30 %');
    await expect(page.getByRole('switch', { name: 'Activar popup Webinar de diciembre' })).toHaveAttribute('aria-checked', 'false');
    await sinViolaciones(page);

    // Nuevo popup: la frecuencia menor que 7 días y la barra con otro disparador no se aceptan.
    await page.getByRole('button', { name: 'Nuevo popup' }).click();
    const form = page.getByRole('form', { name: 'Datos del popup' });
    await expect(form.getByLabel('Nombre interno')).toBeFocused();
    await form.getByLabel('Nombre interno').fill('Cupón de lanzamiento');
    await form.getByLabel('Título').fill('10 % en tu primer SCORM');
    await form.getByLabel('Botón', { exact: true }).fill('Quiero el cupón');
    await form.getByLabel('Frecuencia (días)').fill('3');
    await form.getByLabel('Páginas').fill('/precios\n/blog/*');
    await expect(form.locator('.popup-reglas')).toContainText('Modal en /precios, /blog/* (español) · Tiempo · 15 s · una vez cada 7 días por visitante · nunca en /pago.');
    await form.getByRole('button', { name: 'Guardar popup' }).click();
    await expect(form.getByRole('alert')).toContainText('La frecuencia va de 7 a 365 días (RN-17-3)');
    await form.getByLabel('Frecuencia (días)').fill('14');
    await form.getByLabel('Tipo').selectOption({ label: 'Barra' });
    await expect(form.getByLabel('Disparador')).toHaveValue('al_cargar');
    await expect(form.getByLabel('Disparador').locator('option')).toHaveText(['Al cargar']);
    await form.getByLabel('Al pulsar el botón').selectOption({ label: 'Abrir un enlace del sitio' });
    await form.getByLabel('Enlace del sitio').fill('https://otro.example');
    await form.getByRole('button', { name: 'Guardar popup' }).click();
    await expect(form.getByRole('alert')).toContainText('El enlace es una ruta del sitio que empieza con /');
    await form.getByLabel('Enlace del sitio').fill('/precios#cupon');
    await sinViolaciones(page);
    await form.getByRole('button', { name: 'Guardar popup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cupón' })).toHaveText('Se creó «Cupón de lanzamiento», apagado: actívalo cuando quieras que se vea.');
    const cupon = tabla.getByRole('row').filter({ has: page.getByRole('rowheader', { name: /^Cupón de lanzamiento/ }) });
    await expect(cupon).toContainText('Barra');
    await expect(cupon).toContainText('/precios, /blog/*');
    await expect(cupon).toContainText('Cada 14 días');

    // Editar.
    await page.getByRole('button', { name: 'Editar ¿Quieres ver una demo?' }).click();
    const edicion = page.getByRole('form', { name: 'Datos del popup' });
    await expect(page.getByRole('heading', { level: 2, name: 'Editar · ¿Quieres ver una demo?' })).toBeVisible();
    await edicion.getByLabel('Porcentaje desplazado').fill('60');
    await edicion.getByRole('button', { name: 'Guardar popup' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se guardó' })).toHaveText('Se guardó «¿Quieres ver una demo?».');
    await expect(tabla.getByRole('row').filter({ hasText: '¿Quieres ver una demo?' })).toContainText('Desplazamiento · 60 %');

    // Ordenar, reiniciar y borrar.
    await page.getByRole('button', { name: 'Bajar Guía de microaprendizaje' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'posición' })).toHaveText('«Guía de microaprendizaje» quedó en la posición 2.');
    await expect(tabla.getByRole('rowheader').first()).toContainText('¿Quieres ver una demo?');
    await page.getByRole('button', { name: 'Reiniciar resultados de Guía de microaprendizaje' }).click();
    await expect(guia).toContainText('—');
    await expect(page.getByRole('button', { name: 'Reiniciar resultados de Guía de microaprendizaje' })).toBeDisabled();
    await page.getByRole('button', { name: 'Borrar Webinar de diciembre' }).click();
    await page.getByRole('group', { name: 'Confirmar el borrado de Webinar de diciembre' }).getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se borró' })).toHaveText('Se borró «Webinar de diciembre».');
    await expect(tabla.getByRole('rowheader')).toHaveCount(3);
    await sinViolaciones(page);
  });
}

test('Captación › Popups es solo del superadmin', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
  await page.goto('/captacion/popups');
  await expect(page.getByRole('heading', { level: 1, name: 'Popups' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Popups' })).toHaveCount(0);
});
