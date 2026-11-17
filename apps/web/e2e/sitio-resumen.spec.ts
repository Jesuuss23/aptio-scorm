// HU-1607 · Sitio web › Resumen (PNT-24, REQ-080, CP-138): con 10 leads del período, el indicador Leads muestra 10 y el
// origen suma 100 %; el período se cambia con el teclado; gráfico con su tabla, páginas con más conversiones y próximas
// demos. El sitio cuenta la visita (anónima) con `_visita.js`. axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { fechaLima } from '@aptio/schema/agenda';
import { expect, type Page, test } from '@playwright/test';
import type { AsesorSim, CitaSim, TipoSim } from './agenda-simulada';
import { type LeadSim, simularApi, visitasRecibidasSim, type VisitaDiaSim } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000070${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const BLOQUES = PAGINAS.map((p, n) => ({ id: `00000000-0000-4000-9100-00000000070${n}`, paginaId: p.id, tipo: 'hero', orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F }));
const hace = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
const diaHace = (dias: number) => fechaLima(new Date(Date.now() - dias * 86_400_000));

const lead = (n: number, origen: string, paginaEntrada: string, dias: number): LeadSim => ({
  id: `00000000-0000-4000-9800-0000000007${String(n).padStart(2, '0')}`, correo: `lead${n}@empresa.example`, nombre: `Lead ${n}`, empresa: null, mensaje: null, origen, via: origen === 'asistente_ia' ? 'formulario' : origen,
  paginaEntrada, paginaFormulario: null, utmSource: null, utmMedium: null, utmCampaign: null, utmTerm: null, utmContent: null, referente: null, idioma: 'es',
  etapa: 'NUEVO', consentimiento: true, consentimientoEn: F, totalContactos: 1, historialContactos: [], creadoEn: hace(dias), actualizadoEn: F,
});
// CP-138 · 10 leads en los últimos 30 días (4 de ellos en la última semana) y 2 de antes, que no cuentan.
const LEADS = [
  lead(1, 'formulario', '/precios', 1), lead(2, 'formulario', '/precios', 2), lead(3, 'formulario', '/', 3), lead(4, 'popup', '/', 5),
  lead(5, 'popup', '/', 9), lead(6, 'popup', '/precios', 12), lead(7, 'chatbot', '/', 15), lead(8, 'chatbot', '/', 20), lead(9, 'agendador', '/', 25), lead(10, 'asistente_ia', '/', 28),
  lead(11, 'formulario', '/', 40), lead(12, 'popup', '/', 50),
];
const VISITAS: VisitaDiaSim[] = [
  { dia: diaHace(1), ruta: '/', idioma: 'es', visitas: 120, paginasVistas: 300 }, { dia: diaHace(1), ruta: '/precios', idioma: 'es', visitas: 40, paginasVistas: 90 },
  { dia: diaHace(10), ruta: '/', idioma: 'es', visitas: 200, paginasVistas: 500 }, { dia: diaHace(45), ruta: '/', idioma: 'es', visitas: 150, paginasVistas: 400 },
];
const CARLA: AsesorSim = { id: '00000000-0000-4000-9c00-000000000701', nombre: 'Carla Montoya', correo: 'carla@aptioscorm.com', enlaceVideollamada: 'https://meet.google.com/abc-defg-hij', visible: true, ficticio: false };
const DEMO: TipoSim = { id: '00000000-0000-4000-9b00-000000000701', nombreEs: 'Demo del generador', nombreEn: '', minutos: 30, asesorIds: [CARLA.id], visible: true, ficticio: false };
const cita = (n: number, enDias: number, d: Partial<CitaSim> = {}): CitaSim => ({
  id: `00000000-0000-4000-9a00-00000000070${n}`, tipoId: DEMO.id, asesorId: CARLA.id, inicio: hace(-enDias), fin: hace(-enDias - 0.02), nombre: `Visitante ${n}`,
  correo: `v${n}@empresa.pe`, empresa: 'Minera Andina', lms: null, idioma: 'es', estado: 'confirmada', leadId: null, canceladaPor: null, creadoEn: hace(2), ...d,
});
const AGENDA = { tipos: [DEMO], asesores: [CARLA], citas: [cita(1, 2), cita(2, 3, { estado: 'cancelada', nombre: 'Cancelada' }), cita(3, 1, { empresa: null, nombre: 'Rosa Quispe' })] };
const SITIO = { conSesion: true, rol: 'SUPERADMIN', versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES, leadsSitio: LEADS, visitasSitio: VISITAS, agendaSitio: AGENDA };

const indicador = (page: Page, nombre: string) => page.getByLabel('Indicadores del período').locator('div').filter({ has: page.getByText(nombre, { exact: true }) });
const tarjeta = (page: Page, nombre: string) => page.getByRole('region', { name: nombre });
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

test('CP-138 · con 10 leads del período el indicador Leads muestra 10 y el origen suma 100 %', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio');
  await expect(page.getByRole('heading', { level: 1, name: 'Resumen' })).toBeVisible();
  await expect(page.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true');
  await expect(indicador(page, 'Leads').locator('.res-dato')).toHaveText('10');
  await expect(indicador(page, 'Leads')).toContainText('+400 % frente al período anterior (2)');
  await expect(indicador(page, 'Visitas').locator('.res-dato')).toHaveText('360');
  await expect(indicador(page, 'Visitas')).toContainText('+140 % frente al período anterior (150)');
  await expect(indicador(page, 'Demos agendadas').locator('.res-dato')).toHaveText('3');
  await expect(indicador(page, 'Suscripciones nuevas').locator('.res-dato')).toHaveText('—');
  await expect(indicador(page, 'Suscripciones nuevas')).toContainText('Llega con las suscripciones (S13)');

  const origen = tarjeta(page, 'Origen de los leads');
  await expect(origen.locator('.chip')).toHaveText('10');
  const porcentajes = (await origen.locator('li b').allTextContents()).map((t) => Number.parseInt(t, 10));
  expect(porcentajes.reduce((s, n) => s + n, 0)).toBe(100);
  expect(await origen.locator('li > span:first-child').allTextContents()).toEqual(['Formulario', 'Popup', 'Chatbot', 'Agendador', 'Asistente IA']);
  expect(porcentajes).toEqual([30, 30, 20, 10, 10]);

  // Páginas: /precios convierte 3 de 40 (7,5 %) y el inicio 7 de 320.
  const filas = tarjeta(page, 'Páginas con más conversiones').getByRole('row');
  await expect(filas.nth(1)).toHaveText(/\/precios\s*40\s*3\s*7,5 %/);
  await expect(filas.nth(2)).toHaveText(/^\/\s*320\s*7\s*2,2 %/);

  // Próximas demos: solo las confirmadas, la más cercana primero.
  const demos = tarjeta(page, 'Próximas demos').getByRole('listitem');
  await expect(demos).toHaveCount(2);
  await expect(demos.first()).toContainText('Rosa Quispe');
  await expect(demos.nth(1)).toContainText('Minera Andina');
  await expect(tarjeta(page, 'Próximas demos')).not.toContainText('Cancelada');
  // La tarjeta de páginas por estado sigue.
  await expect(page.getByRole('region', { name: 'Páginas', exact: true })).toContainText('2 páginas: 2 publicadas');
});

test('el período se cambia solo con el teclado y el gráfico trae su tabla de datos', async ({ page }) => {
  await simularApi(page, SITIO);
  await page.goto('/sitio');
  await expect(indicador(page, 'Leads').locator('.res-dato')).toHaveText('10');
  await page.getByRole('button', { name: '30 días' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: '7 días' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
  await expect(indicador(page, 'Leads').locator('.res-dato')).toHaveText('4');
  await expect(indicador(page, 'Visitas').locator('.res-dato')).toHaveText('160');
  const grafico = tarjeta(page, 'Visitas y conversiones');
  await expect(grafico.getByRole('img')).toHaveAccessibleDescription(/160 visitas, 4 leads y 3 demos/);
  await grafico.getByText('Ver los datos por día').focus();
  await page.keyboard.press('Enter');
  await expect(grafico.getByRole('table').getByRole('row')).toHaveCount(8);
  await page.getByRole('button', { name: 'Trimestre' }).focus();
  await page.keyboard.press('Space');
  await expect(indicador(page, 'Leads').locator('.res-dato')).toHaveText('12');
  await expect(grafico.getByRole('table').getByRole('row')).toHaveCount(91);
});

test('el sitio cuenta la visita con `_visita.js`: primera página de la sesión y las siguientes', async ({ page }) => {
  await simularApi(page, { ...SITIO, conSesion: false });
  visitasRecibidasSim.length = 0;
  await page.goto('/s/precios?utm_source=linkedin');
  await expect.poll(() => visitasRecibidasSim.length).toBe(1);
  await page.goto('/s/');
  await expect.poll(() => visitasRecibidasSim.length).toBe(2);
  expect(visitasRecibidasSim).toEqual([
    { ruta: '/precios', idioma: 'es', primeraPagina: true, origen: 'linkedin' },
    // El origen de la primera visita sigue en la sesión (lo guarda el script de captación).
    { ruta: '/', idioma: 'es', primeraPagina: false, origen: 'linkedin' },
  ]);
  expect(await page.evaluate(() => document.cookie)).toBe('');
});

for (const ancho of [390, 1280]) {
  test(`el Resumen a ${ancho} px no tiene violaciones de axe`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    await page.goto('/sitio');
    await expect(indicador(page, 'Leads').locator('.res-dato')).toHaveText('10');
    await tarjeta(page, 'Visitas y conversiones').getByText('Ver los datos por día').click();
    await sinViolaciones(page);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
