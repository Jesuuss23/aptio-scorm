// HU-1303 · Rentabilidad y mediciones contra la API simulada (CP-098, RN-13-1): la calculadora del prototipo recalcula
// en vivo con `@aptio/schema/rentabilidad`, «Usar el real» toma el promedio de IA por SCORM de HU-1302, administración
// guarda los datos y el tipo de cambio pasa a soles el «Costo de IA»; las mediciones se registran y borran, y con
// «Mediciones» el escenario medido usa el promedio de sus proyectos y el otro avisa que usa los supuestos. Diseño
// instruccional ve los datos sin poder guardarlos. axe WCAG 2.2 A/AA sin violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const calc = (page: Page) => page.getByRole('region', { name: /¿Puedes competir/ });
const medic = (page: Page) => page.getByRole('region', { name: 'Mediciones' });
const cifra = (s: Locator, nombre: string | RegExp) => s.locator('.rent-cifras > div').filter({ has: s.page().getByRole('term').filter({ hasText: nombre }) });
const hacia = (s: Locator, nombre: string | RegExp) => cifra(s, nombre).locator('.hacia');
const desde = (s: Locator, nombre: string | RegExp) => cifra(s, nombre).locator('.desde');
const totales = (s: Locator) => s.getByRole('table', { name: 'Horas por SCORM de 30 pantallas' }).locator('tfoot td');

test.describe('rentabilidad y mediciones (HU-1303)', () => {
  test('CP-098 · recálculo en vivo, «Usar el real», guardar, soles en Costo de IA y mediciones', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
    await page.goto('/rentabilidad');
    const c = calc(page);

    // Ejemplo del prototipo.
    await expect(c.getByRole('heading', { name: '¿Puedes competir a S/ 1,500 por SCORM?' })).toBeVisible();
    await expect(desde(c, 'Días por SCORM')).toHaveText('14.3');
    await expect(hacia(c, 'Días por SCORM')).toHaveText('3.4');
    await expect(hacia(c, 'SCORM al mes con tu equipo')).toHaveText('15.5');
    await expect(desde(c, 'Costo por SCORM')).toHaveText('S/ 3,641');
    await expect(hacia(c, 'Costo por SCORM')).toHaveText('S/ 629');
    await expect(desde(c, /^Margen a/)).toHaveText('-143 %');
    await expect(hacia(c, /^Margen a/)).toHaveText('58 %');
    await expect(cifra(c, /^Margen a/)).toContainText('A tu nuevo precio S/ 1,800: 65 %');
    await expect(totales(c)).toHaveText(['150.0', '25.5']);
    await expect(c.getByText(/^Ejemplo con supuestos/)).toBeVisible();
    await expect(c.getByRole('button', { name: 'Guardar' })).toBeDisabled();

    // En vivo: sin boca en Premiere, hoy son 134 h → 134 × 22 + 900 ÷ (396 ÷ 134).
    await c.getByLabel('Boca del personaje, hoy').fill('0');
    await expect(totales(c)).toHaveText(['134.0', '25.5']);
    await expect(desde(c, 'Costo por SCORM')).toHaveText('S/ 3,253');
    await expect(c.getByText('Hay cambios sin guardar')).toBeVisible();

    // El promedio real de IA por SCORM (HU-1302): 25,5 × 22 + 3,60 × 3,75 + 650 ÷ 15,53.
    await expect(c.getByText('Real:')).toContainText('US$ 3.60');
    await c.getByRole('button', { name: 'Usar el real' }).click();
    await expect(c.getByLabel('IA por API por SCORM (US$)')).toHaveValue('3.6');
    await expect(hacia(c, 'Costo por SCORM')).toHaveText('S/ 616');

    // Guardar, y con otro tipo de cambio el Costo de IA pasa a soles con el guardado.
    const costoIA = page.getByRole('region', { name: 'Costo de IA' });
    await expect(costoIA.getByText('≈ S/ 26.81')).toBeVisible();
    await c.getByLabel('Tipo de cambio').fill('4');
    const put = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith('/negocio/parametros'));
    await c.getByRole('button', { name: 'Guardar' }).click();
    const cuerpo = (await put).postDataJSON();
    expect(cuerpo).toMatchObject({ iaPorScormUsd: 3.6, tipoCambio: 4, tarifaHora: 22 });
    expect(cuerpo.etapas[4]).toEqual({ etapa: 'boca', horasHoy: 0, horasGenerador: 0 });
    await expect(c.getByRole('status')).toHaveText('Datos guardados');
    await expect(c.getByText(/^Ejemplo con supuestos/)).toHaveCount(0);
    await expect(c.getByRole('button', { name: 'Guardar' })).toBeDisabled();
    await expect(costoIA.getByText('≈ S/ 28.60')).toBeVisible();
    await expect(costoIA.getByText('≈ S/ 12.00')).toBeVisible();

    // Mediciones: 2 proyectos medidos hoy.
    const m = medic(page);
    await expect(m.getByText('Aún no hay mediciones.')).toBeVisible();
    const registrar = async (proyecto: string, etapa: string, horas: string) => {
      await m.getByLabel('Proyecto').fill(proyecto);
      await m.getByLabel('Etapa').selectOption({ label: etapa });
      await m.getByLabel('Horas').fill(horas);
      await m.getByRole('button', { name: 'Registrar' }).click();
      await expect(m.getByRole('status')).toHaveText(`Medición registrada: ${proyecto}, ${etapa}`);
    };
    await registrar('Bloqueo y etiquetado', 'Lectura del material y guion', '18');
    await registrar('Bloqueo y etiquetado', 'Diseño gráfico e ilustraciones', '60');
    await registrar('Curso de inducción 2025', 'Animación y armado', '40');
    await expect(m.getByRole('table', { name: 'Mediciones registradas' }).locator('tbody tr')).toHaveCount(3);

    // Con «Mediciones», hoy = (18 + 60 + 40) ÷ 2 = 59 h; el generador avisa que usa los supuestos.
    await c.getByRole('button', { name: 'Mediciones' }).click();
    await expect(c.getByRole('button', { name: 'Mediciones' })).toHaveAttribute('aria-pressed', 'true');
    await expect(c.getByRole('status').filter({ hasText: 'aún no tiene' })).toHaveText('«Con el generador» aún no tiene mediciones: usa los supuestos.');
    await expect(c.getByText('Horas medidas: hoy, promedio de 2 proyectos.')).toBeVisible();
    await expect(totales(c)).toHaveText(['59.0', '25.5']);
    // Las horas medidas no se editan; las del generador (supuestos) sí.
    await expect(c.getByLabel('Lectura del material y guion, hoy')).toHaveCount(0);
    await expect(c.getByLabel('Lectura del material y guion, con el generador')).toBeVisible();
    for (const zona of ['.rent', '.mediciones']) {
      expect(await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze().then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`))).toEqual([]);
    }

    // Borrar una medición recalcula al momento: queda 1 proyecto con 18 + 60 = 78 h.
    const borrado = page.waitForRequest((r) => r.method() === 'DELETE' && /\/negocio\/mediciones\/[0-9a-f-]{36}$/.test(r.url()));
    await m.getByRole('button', { name: 'Borrar la medición de Curso de inducción 2025, Animación y armado' }).click();
    await borrado;
    await expect(m.getByRole('status')).toHaveText('Medición borrada: Curso de inducción 2025, Animación y armado');
    await expect(totales(c)).toHaveText(['78.0', '25.5']);
    await expect(c.getByText('Horas medidas: hoy, promedio de 1 proyecto.')).toBeVisible();

    // Volver a «Supuestos» deja las horas guardadas.
    await c.getByRole('button', { name: 'Supuestos' }).click();
    await expect(totales(c)).toHaveText(['134.0', '25.5']);
  });

  test('diseño instruccional ve los datos sin poder guardarlos y registra mediciones', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'DISENADOR_INSTRUCCIONAL', mediciones: [{ proyectoRef: 'Trabajo en altura', escenario: 'generador', etapa: 'lectura-guion', horas: 3 }] });
    let puts = 0;
    page.on('request', (r) => void (r.method() === 'PUT' && r.url().endsWith('/negocio/parametros') && puts++));
    await page.goto('/rentabilidad');
    const c = calc(page);
    await expect(c.getByLabel('Tipo de cambio')).toHaveAttribute('readonly', '');
    await expect(c.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
    await expect(c.getByRole('button', { name: 'Usar el real' })).toHaveCount(0);
    await expect(c.getByText('Solo administración cambia estos datos.')).toBeVisible();
    await expect(c.getByLabel('Boca del personaje, hoy')).toHaveCount(0);

    await c.getByRole('button', { name: 'Mediciones' }).click();
    await expect(c.getByRole('status')).toHaveText('«Hoy» aún no tiene mediciones: usa los supuestos.');
    await expect(totales(c)).toHaveText(['150.0', '3.0']);

    const m = medic(page);
    await m.getByLabel('Proyecto').fill('Trabajo en altura');
    await m.getByLabel('Escenario').selectOption({ label: 'Con el generador' });
    await m.getByLabel('Horas').fill('5');
    await m.getByRole('button', { name: 'Registrar' }).click();
    await expect(m.getByRole('status')).toHaveText('Medición registrada: Trabajo en altura, Lectura del material y guion');
    // Mismo proyecto: 3 + 5 = 8 h.
    await expect(totales(c)).toHaveText(['150.0', '8.0']);
    await m.getByLabel('Horas').fill('-1');
    await m.getByRole('button', { name: 'Registrar' }).click();
    await expect(m.getByRole('alert')).toHaveText('Escribe las horas: un número de 0 o más');
    expect(puts).toBe(0);
  });

  test('sin mediciones, «Mediciones» avisa que usa los supuestos en los dos escenarios', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
    await page.goto('/rentabilidad');
    const c = calc(page);
    await c.getByRole('button', { name: 'Mediciones' }).click();
    await expect(c.getByRole('status')).toHaveText('Aún no hay mediciones registradas: se usan los supuestos en los dos escenarios.');
    await expect(totales(c)).toHaveText(['150.0', '25.5']);
    // Un dato no válido no se envía.
    await c.getByRole('button', { name: 'Supuestos' }).click();
    await c.getByLabel('Personas del equipo').fill('0');
    await c.getByRole('button', { name: 'Guardar' }).click();
    await expect(c.getByRole('alert')).toContainText('Personas del equipo: un número entero desde 1');
  });
});
