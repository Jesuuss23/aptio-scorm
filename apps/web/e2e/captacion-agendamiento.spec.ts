// HU-1605 · Agendamiento de demos (REQ-078, PNT-33, RN-17-5, CP-135, CP-136). En el sitio: la reserva completa con el
// teclado (días con flechas, aria-pressed, confirmación role=status con Google Calendar y .ics), la franja ocupada del
// asesor no aparece, si otro visitante la toma antes el sitio avisa y recarga los horarios (CP-135), y sin JavaScript
// quedan el formulario de contacto y el WhatsApp. En el panel, Captación › Agendamiento: la cita reservada aparece con
// el lead en Demo (CP-136), alta y edición de asesores y tipos, «Ofrecer», orden, días bloqueados, recordatorios, y
// «Cancelar», «Realizada» y «No asistió». axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { AJUSTES_AGENDA_POR_DEFECTO, deLima, fechaLima, franjasLibres } from '@aptio/schema/agenda';
import { type AsesorSim, type CitaSim, reservasSim, type TipoSim } from './agenda-simulada';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000020${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/agendar-demo', 'Agendar demo')];
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000020${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const BLOQUES = [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[1]!.id, 'agendador')];

const CARLA: AsesorSim = { id: '00000000-0000-4000-9c00-000000000001', nombre: 'Carla Montoya', correo: 'carla@aptioscorm.com', enlaceVideollamada: 'https://meet.google.com/abc-defg-hij', visible: true, ficticio: false };
const LUIS: AsesorSim = { id: '00000000-0000-4000-9c00-000000000002', nombre: 'Luis Ríos', correo: 'luis@aptioscorm.com', enlaceVideollamada: 'https://meet.google.com/xyz-abcd-efg', visible: true, ficticio: false };
const DEMO: TipoSim = { id: '00000000-0000-4000-9b00-000000000001', nombreEs: 'Demo del generador', nombreEn: 'Generator demo', minutos: 30, asesorIds: [CARLA.id], visible: true, ficticio: false };
const MIGRACION: TipoSim = { id: '00000000-0000-4000-9b00-000000000002', nombreEs: 'Asesoría de migración', nombreEn: '', minutos: 45, asesorIds: [LUIS.id], visible: false, ficticio: false };
const SITIO = { conSesion: true, rol: 'SUPERADMIN', versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES };

/** Las franjas que el sitio ofrecería ahora mismo a la demo, sin citas. */
const franjas = () => franjasLibres(AJUSTES_AGENDA_POR_DEFECTO, { minutos: DEMO.minutos, asesorIds: DEMO.asesorIds }, [], new Date());
const cita = (n: number, inicio: string, d: Partial<CitaSim> = {}): CitaSim => ({
  id: `00000000-0000-4000-9a00-00000000010${n}`, tipoId: DEMO.id, asesorId: CARLA.id, inicio, fin: new Date(Date.parse(inicio) + 30 * 60_000).toISOString(), nombre: `Visitante ${n}`,
  correo: `visitante${n}@empresa.pe`, empresa: 'Minera Andina', lms: 'Moodle', idioma: 'es', estado: 'confirmada', leadId: null, canceladaPor: null, creadoEn: F, ...d,
});

const sinViolaciones = async (page: Page, incluir = 'main') => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include(incluir).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const agendaLista = (page: Page) => page.waitForResponse((r) => new URL(r.url()).pathname === '/s/_agenda.json');
const dias = (page: Page) => page.locator('.ag-dias');

test('CP-136 · reserva con el teclado: flechas entre días, hora, datos y confirmación con Google Calendar y .ics; la franja ocupada no aparece', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  const [primera] = franjas();
  const ocupada = cita(1, primera!.inicio);
  await simularApi(page, { ...SITIO, agendaSitio: { tipos: [DEMO], asesores: [CARLA], citas: [ocupada] } });
  const lista = agendaLista(page);
  await page.goto('/s/agendar-demo');
  await lista;
  const booker = page.locator('.booker');
  await expect(booker).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByRole('heading', { level: 1, name: 'Agendar demo' })).toBeVisible();

  // El primer día con horarios tiene el foco de la rejilla; el de la franja ocupada ya no ofrece esa hora (CP-135).
  const libres = franjasLibres(AJUSTES_AGENDA_POR_DEFECTO, { minutos: 30, asesorIds: [CARLA.id] }, [{ asesorId: CARLA.id, inicio: new Date(ocupada.inicio), fin: new Date(ocupada.fin) }], new Date());
  const diasLibres = [...new Set(libres.map((f) => f.fecha))];
  const primerDia = dias(page).locator(`button[data-fecha="${diasLibres[0]}"]`);
  await expect(primerDia).toHaveAttribute('tabindex', '0');
  await primerDia.focus();
  if (diasLibres[0] === primera!.fecha) {
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: /^Horarios del/ }).getByRole('button', { name: primera!.hora, exact: true })).toHaveCount(0);
    await primerDia.focus();
  }
  // Flecha derecha: el siguiente día con horarios (salta fines de semana y feriados).
  await page.keyboard.press('ArrowRight');
  const segundo = dias(page).locator(`button[data-fecha="${diasLibres[1]}"]`);
  await expect(segundo).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(primerDia).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(segundo).toHaveAttribute('aria-pressed', 'true');

  const hora = libres.find((f) => f.fecha === diasLibres[1])!;
  const horas = page.getByRole('group', { name: /^Horarios del/ });
  await expect(horas).toHaveAccessibleName(/\(hora de lima\)$/);
  await horas.getByRole('button', { name: hora.hora, exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#ag-nombre')).toBeFocused();
  await page.keyboard.type('Rosa Quispe');
  await page.keyboard.press('Tab');
  await page.keyboard.type('rosa@minera.pe');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Minera Andina');
  await page.locator('#ag-lms').selectOption('Moodle');
  await page.locator('#ag-acepto').focus();
  await page.keyboard.press('Space');
  await sinViolaciones(page, '.booker');
  await page.getByRole('button', { name: /^Confirmar demo del / }).focus();
  await page.keyboard.press('Enter');

  const listo = page.getByRole('status').filter({ hasText: 'Tu demo está agendada' });
  await expect(listo).toBeVisible();
  await expect(listo.getByRole('heading', { name: 'Tu demo está agendada' })).toBeFocused();
  await expect(listo).toContainText('(hora de Lima)');
  await expect(listo.getByRole('link', { name: /Añadir a Google Calendar/ })).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\/calendar\/render\?action=TEMPLATE/);
  await expect(listo.getByRole('link', { name: 'Descargar .ics' })).toHaveAttribute('download', 'demo.ics');
  await expect(listo.getByRole('link', { name: 'Descargar .ics' })).toHaveAttribute('href', /^data:text\/calendar/);
  await expect(listo).toContainText(`Enlace de la videollamada: ${CARLA.enlaceVideollamada}`);
  await expect(listo.getByRole('link', { name: `${CARLA.enlaceVideollamada} (se abre en una pestaña nueva)` })).toHaveAttribute('href', CARLA.enlaceVideollamada);
  await sinViolaciones(page, '.booker');
  expect(reservasSim.at(-1)).toMatchObject({ status: 201, cuerpo: { nombre: 'Rosa Quispe', correo: 'rosa@minera.pe', lms: 'Moodle', consentimiento: true, inicio: hora.inicio } });

  // En el panel: la cita aparece confirmada, y el lead entra con vía Agendador y etapa Demo.
  await page.goto('/captacion/agendamiento');
  const citas = page.getByRole('table', { name: 'Citas' });
  const fila = citas.getByRole('row').filter({ hasText: 'Rosa Quispe' });
  await expect(fila).toContainText('Demo del generador');
  await expect(fila).toContainText('Con Carla Montoya');
  await expect(fila).toContainText(hora.hora);
  await expect(fila).toContainText('Confirmada');
  await page.goto('/captacion/leads');
  const lead = page.getByRole('row').filter({ hasText: 'rosa@minera.pe' });
  await expect(lead).toContainText('Agendador');
  await expect(lead.getByRole('combobox')).toHaveValue('DEMO');
});

test('CP-135 · si otro visitante toma la franja antes, el sitio avisa, recarga los horarios y esa hora ya no está', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simularApi(page, { ...SITIO, agendaSitio: { tipos: [DEMO], asesores: [CARLA] } });
  const lista = agendaLista(page);
  await page.goto('/s/agendar-demo');
  await lista;
  const [f] = franjas();
  await dias(page).locator(`button[data-fecha="${f!.fecha}"]`).click();
  await page.getByRole('group', { name: /^Horarios del/ }).getByRole('button', { name: f!.hora, exact: true }).click();
  await page.locator('#ag-nombre').fill('Rosa Quispe');
  await page.locator('#ag-correo').fill('rosa@minera.pe');
  await page.locator('#ag-acepto').check();
  // Otro visitante reserva la misma franja justo antes.
  const otro = await page.evaluate(async (inicio) => {
    const r = await fetch('/api/v1/publico/citas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tipoId: '00000000-0000-4000-9b00-000000000001', inicio, nombre: 'Otro', correo: 'otro@empresa.pe', consentimiento: true, idioma: 'es' }) });
    return r.status;
  }, f!.inicio);
  expect(otro).toBe(201);
  const recarga = agendaLista(page);
  await page.getByRole('button', { name: /^Confirmar demo del / }).click();
  await recarga;
  const alerta = page.getByRole('alert');
  await expect(alerta).toHaveText('Alguien acaba de tomar ese horario. Te mostramos los horarios actualizados.');
  await expect(alerta).toBeFocused();
  expect(reservasSim.at(-1)?.status).toBe(409);
  const horas = page.getByRole('group', { name: /^Horarios del/ });
  if (await horas.count()) await expect(horas.getByRole('button', { name: f!.hora, exact: true })).toHaveCount(0);
  await sinViolaciones(page, '.booker');
});

test('sin JavaScript el bloque ofrece el formulario de contacto y el WhatsApp, y no hay reserva', async ({ browser }) => {
  const contexto = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  const page = await contexto.newPage();
  await simularApi(page, { ...SITIO, conSesion: false, agendaSitio: { tipos: [DEMO], asesores: [CARLA] }, ajustesSitio: { whatsapp: { visible: true, numero: '+51987654321', mensaje: null } } });
  await page.goto('/s/agendar-demo');
  const bloque = page.locator('#agendar');
  await expect(bloque.locator('noscript > p').first()).toHaveText('Para elegir día y hora necesitas JavaScript. Déjanos tus datos y te proponemos un horario.');
  await expect(bloque.locator('noscript > p').first()).toBeVisible();
  await expect(bloque.getByText('Cargando los horarios disponibles…')).toBeHidden();
  await expect(bloque.getByRole('link', { name: /WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/51987654321/);
  const form = bloque.locator('form[action="/s/_lead"]');
  await expect(form.getByLabel('Correo de trabajo')).toBeVisible();
  await expect(form.locator('input[name="consentimiento"]')).toHaveCount(1);
  await expect(page.locator('.ag-dias')).toHaveCount(0);
  // axe necesita JavaScript: el formulario es el mismo del bloque de contacto, que ya pasa axe (HU-1601).
  await contexto.close();
});

for (const ancho of [390, 1280]) {
  test(`PNT-33 · el panel crea asesores y tipos, los ofrece, ordena, bloquea días y cambia los recordatorios (axe a ${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { ...SITIO, agendaSitio: { tipos: [MIGRACION], asesores: [LUIS] } });
    await page.goto('/captacion/agendamiento');
    await expect(page.getByRole('heading', { level: 1, name: 'Agendamiento' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Ver página de agenda (se abre en una pestaña nueva)' })).toHaveAttribute('href', '/s/agendar-demo');
    await expect(page.getByRole('link', { name: /Ver página de agenda/ })).toHaveAttribute('target', '_blank');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Agendamiento' })).toHaveAttribute('aria-current', 'page');
    const integraciones = page.getByRole('region', { name: 'Integraciones y recordatorios' });
    await expect(integraciones.getByRole('listitem').filter({ hasText: 'Google Calendar' })).toContainText('Próximamente');
    await expect(integraciones.getByRole('listitem').filter({ hasText: 'Outlook' })).toContainText('Próximamente');
    await expect(integraciones).not.toContainText('WhatsApp');
    const horarios = page.getByRole('region', { name: 'Horarios ofrecidos' });
    await expect(horarios.getByRole('table', { name: 'Horarios ofrecidos de lunes a viernes' }).getByRole('row')).toHaveCount(6);
    const anio = fechaLima(new Date()).slice(0, 4);
    await expect(horarios.getByRole('list', { name: `Feriados de Perú ${anio}` })).toContainText('Fiestas Patrias');
    await expect(horarios.getByRole('list', { name: `Feriados de Perú ${anio}` }).getByRole('listitem')).toHaveCount(16);
    await sinViolaciones(page);

    // Asesor nuevo: la validación es la de la API.
    await page.getByRole('button', { name: 'Nuevo asesor' }).click();
    const fa = page.getByRole('form', { name: 'Nuevo asesor' });
    await fa.getByLabel('Nombre').fill('Carla Montoya');
    await fa.getByLabel('Correo').fill('carla@aptioscorm.com');
    await fa.getByLabel('Enlace fijo de videollamada').fill('http://meet.google.com/abc');
    await fa.getByRole('button', { name: 'Guardar asesor' }).click();
    await expect(fa.getByRole('alert')).toContainText('https://');
    await fa.getByLabel('Enlace fijo de videollamada').fill('https://meet.google.com/abc-defg-hij');
    await fa.getByRole('button', { name: 'Guardar asesor' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se agregó a Carla Montoya' })).toBeVisible();
    await expect(page.getByRole('table', { name: 'Asesores' }).getByRole('row')).toHaveCount(3);

    // Tipo nuevo con Carla: nace sin ofrecer.
    await page.getByRole('button', { name: 'Nuevo tipo' }).click();
    const ft = page.getByRole('form', { name: 'Nuevo tipo de reunión' });
    await ft.getByLabel('Nombre (español)').fill('Demo del generador');
    await ft.getByLabel('Nombre (inglés)').fill('Generator demo');
    await ft.getByLabel('Duración (minutos)').fill('30');
    await ft.getByRole('checkbox', { name: 'Carla Montoya' }).check();
    await ft.getByRole('button', { name: 'Guardar tipo' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se creó «Demo del generador», sin ofrecer' })).toBeVisible();
    const ofrecer = page.getByRole('switch', { name: 'Ofrecer Demo del generador' });
    await expect(ofrecer).toHaveAttribute('aria-checked', 'false');
    await ofrecer.click();
    await expect(ofrecer).toHaveAttribute('aria-checked', 'true');
    const tarjeta = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Demo del generador' }) });
    await expect(tarjeta).toContainText('30 minutos');
    await expect(tarjeta).toContainText('Carla Montoya');
    // Subirlo al primer lugar.
    await page.getByRole('button', { name: 'Subir Demo del generador' }).click();
    await expect(page.locator('.agenda-tipo h3').first()).toHaveText('Demo del generador');
    // Editar la duración.
    await page.getByRole('button', { name: 'Editar Demo del generador' }).click();
    await page.getByRole('form', { name: 'Editar Demo del generador' }).getByLabel('Duración (minutos)').fill('45');
    await page.getByRole('button', { name: 'Guardar tipo' }).click();
    await expect(tarjeta).toContainText('45 minutos');

    // Bloquear un día y desbloquearlo.
    const dia = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    await horarios.getByLabel('Día', { exact: true }).fill(dia);
    await horarios.getByRole('button', { name: 'Bloquear día' }).click();
    const bloqueados = horarios.getByRole('list', { name: 'Días bloqueados' });
    await expect(bloqueados.getByRole('listitem')).toHaveCount(1);
    await bloqueados.getByRole('button', { name: /^Desbloquear el / }).click();
    await expect(bloqueados).toHaveCount(0);
    // Horarios: uno mal escrito no se guarda.
    await horarios.getByLabel('Horas de inicio').fill('09:00, 25:00');
    await horarios.getByRole('button', { name: 'Guardar horarios' }).click();
    await expect(horarios.getByRole('alert')).toContainText('09:00, 10:30');
    await horarios.getByLabel('Horas de inicio').fill('09:00, 15:00');
    await horarios.getByRole('button', { name: 'Guardar horarios' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se guardaron los horarios ofrecidos.' })).toBeVisible();
    await expect(horarios.getByRole('table', { name: 'Horarios ofrecidos de lunes a viernes' }).getByRole('row')).toHaveCount(3);

    // Recordatorios por correo.
    const recordatorios = page.getByRole('switch', { name: 'Recordatorios por correo' });
    await expect(recordatorios).toHaveAttribute('aria-checked', 'true');
    await recordatorios.click();
    await expect(recordatorios).toHaveAttribute('aria-checked', 'false');

    // Borrar el tipo sin citas.
    await page.getByRole('button', { name: 'Borrar Asesoría de migración' }).click();
    await page.getByRole('group', { name: 'Confirmar el borrado de Asesoría de migración' }).getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByRole('heading', { name: 'Asesoría de migración' })).toHaveCount(0);
    await sinViolaciones(page);
  });
}

test('PNT-33 · las citas: filtro por estado, «Cancelar» con confirmación, y «Realizada» o «No asistió» solo para las que ya empezaron', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  // «Pasada» empezó hoy en Lima (el filtro por defecto es desde hoy): hace 2 h, o a mitad de camino desde la medianoche
  // de Lima si todavía no pasaron 2 h del día.
  const ahora = Date.now();
  const inicioHoy = deLima(fechaLima(new Date(ahora)), '00:00').getTime();
  const pasada = cita(1, new Date(Math.max(ahora - 2 * 3_600_000, inicioHoy + (ahora - inicioHoy) / 2)).toISOString(), { nombre: 'Ana Pérez' });
  const otraPasada = cita(2, new Date(Date.now() - 26 * 3_600_000).toISOString(), { nombre: 'Jorge Salas' });
  const futura = cita(3, franjas()[0]!.inicio, { nombre: 'Rosa Quispe' });
  const cancelada = cita(4, franjas()[1]!.inicio, { nombre: 'Pedro Ruiz', estado: 'cancelada', canceladaPor: 'visitante' });
  await simularApi(page, { ...SITIO, agendaSitio: { tipos: [DEMO], asesores: [CARLA], citas: [pasada, otraPasada, futura, cancelada] } });
  await page.goto('/captacion/agendamiento');
  const region = page.getByRole('region', { name: /^Citas/ });
  // Por defecto: confirmadas desde hoy.
  await expect(region.getByRole('table', { name: 'Citas' }).getByRole('row')).toHaveCount(3);
  await region.getByLabel('Desde').fill('');
  await region.getByLabel('Estado').selectOption('');
  const tabla = region.getByRole('table', { name: 'Citas' });
  await expect(tabla.getByRole('row')).toHaveCount(5);
  await expect(tabla.getByRole('row').filter({ hasText: 'Pedro Ruiz' })).toContainText('Por el visitante');

  // La futura: solo «Cancelar».
  const filaFutura = tabla.getByRole('row').filter({ hasText: 'Rosa Quispe' });
  await expect(filaFutura.getByRole('button', { name: /como realizada/ })).toHaveCount(0);
  await filaFutura.getByRole('button', { name: 'Cancelar la cita de Rosa Quispe' }).click();
  await filaFutura.getByRole('group', { name: 'Confirmar la cancelación de la cita de Rosa Quispe' }).getByRole('button', { name: 'Sí, cancelar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Se canceló la cita de Rosa Quispe' })).toBeVisible();
  await expect(filaFutura).toContainText('Cancelada');
  await expect(filaFutura).toContainText('Por el equipo');

  // Las pasadas: «Realizada» y «No asistió».
  await tabla.getByRole('button', { name: 'Marcar la cita de Ana Pérez como realizada' }).click();
  await expect(tabla.getByRole('row').filter({ hasText: 'Ana Pérez' })).toContainText('Realizada');
  await tabla.getByRole('button', { name: 'Marcar que Jorge Salas no asistió' }).click();
  await expect(tabla.getByRole('row').filter({ hasText: 'Jorge Salas' })).toContainText('No asistió');
  await sinViolaciones(page);

  await region.getByLabel('Estado').selectOption('realizada');
  await expect(tabla.getByRole('row')).toHaveCount(2);
});

test('PNT-33 · un rol de organización no ve Agendamiento', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
  await page.goto('/');
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Agendamiento' })).toHaveCount(0);
});
