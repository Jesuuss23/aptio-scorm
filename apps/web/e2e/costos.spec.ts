// HU-1302 · Empresa › Rentabilidad: sección «Costo de IA» contra la API simulada (CP-097). Total del periodo, promedio
// por SCORM (sobre los exportados o, sin exportaciones, sobre los proyectos con gasto) y SCORM contados; filtros de
// periodo y cliente; tablas por proyecto, por cliente (con lo hecho sin proyecto, como IA-18) y por proveedor y tarea.
// Solo administración y diseño instruccional la ven. axe WCAG 2.2 A/AA sin violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Locator, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';
import { rangoPeriodo } from '../src/vistas/costos-periodo.ts';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const seccion = (page: Page) => page.getByRole('region', { name: 'Costo de IA' });
const filas = (tabla: Locator) => tabla.locator('tbody tr').evaluateAll((trs) => trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent?.trim())));
const cifra = (s: Locator, nombre: string) => s.locator(`xpath=.//dt[normalize-space()="${nombre}"]/following-sibling::dd[1]`);

test.describe('costo de IA (HU-1302)', () => {
  test('CP-097 · total por proyecto, promedio por SCORM y filtros de periodo y cliente', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
    const pedidos: string[] = [];
    page.on('request', (r) => { if (new URL(r.url()).pathname === '/api/v1/costos') pedidos.push(new URL(r.url()).search); });
    await page.goto('/');
    await page.getByRole('link', { name: 'Rentabilidad' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rentabilidad');
    await expect(page.getByRole('navigation', { name: 'Ruta' })).toContainText('Empresa/Rentabilidad');
    const s = seccion(page);

    // Este mes, de entrada: los días de Lima del mes en curso.
    await expect(s.getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true');
    const mes = rangoPeriodo('mes', new Date());
    expect(pedidos[0]).toBe(`?desde=${mes.desde}&hasta=${mes.hasta}`);
    await expect(cifra(s, 'Total del periodo')).toHaveText('US$ 7.15');
    await expect(cifra(s, 'Promedio por SCORM')).toHaveText('US$ 3.00');
    await expect(s.getByText('Sobre los proyectos con paquete exportado')).toBeVisible();
    await expect(cifra(s, 'SCORM contados')).toHaveText('2');
    expect(await filas(s.getByRole('table', { name: 'Por proyecto' }))).toEqual([
      ['Trabajo en altura', 'Minera Andina', '2', 'Exportado', 'US$ 3.60'],
      ['Bloqueo y etiquetado', 'Minera Andina', '2', 'Exportado', 'US$ 2.40'],
      ['Atención al ciudadano', 'Municipalidad de Lima', '1', 'Sin exportar', 'US$ 0.90'],
    ]);
    expect(await filas(s.getByRole('table', { name: 'Por cliente' }))).toEqual([
      ['Minera Andina', 'US$ 6.00', 'US$ 0.00', 'US$ 6.00'],
      ['Municipalidad de Lima', 'US$ 0.90', 'US$ 0.25', 'US$ 1.15'],
    ]);
    expect(await filas(s.getByRole('table', { name: 'Por proveedor y tarea' }))).toEqual([
      ['anthropic', 'Storyboard IA-05', '2', 'US$ 2.30'],
      ['openai-imagen', 'Prompt de imagen IA-11', '1', 'US$ 2.20'],
      ['anthropic', 'Componer pantalla IA-15', '1', 'US$ 1.80'],
      ['google-tts', 'Narración VOZ', '1', 'US$ 0.60'],
      ['anthropic', 'Extracción de kit IA-18', '1', 'US$ 0.25'],
    ]);
    expect(await new AxeBuilder({ page }).include('.costos').withTags(REGLAS).analyze().then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`))).toEqual([]);

    // Mes anterior.
    await s.getByRole('button', { name: 'Mes anterior' }).click();
    await expect(s.getByRole('button', { name: 'Mes anterior' })).toHaveAttribute('aria-pressed', 'true');
    await expect(cifra(s, 'Total del periodo')).toHaveText('US$ 1.20');
    expect(await filas(s.getByRole('table', { name: 'Por proyecto' }))).toEqual([['Bloqueo y etiquetado', 'Minera Andina', '1', 'Exportado', 'US$ 1.20']]);

    // Todo, y un cliente sin paquetes exportados: el promedio usa los proyectos con gasto.
    await s.getByRole('button', { name: 'Todo' }).click();
    await expect(cifra(s, 'Total del periodo')).toHaveText('US$ 8.35');
    await s.getByRole('combobox', { name: 'Cliente' }).selectOption({ label: 'Municipalidad de Lima' });
    await expect(cifra(s, 'Total del periodo')).toHaveText('US$ 1.15');
    await expect(cifra(s, 'Promedio por SCORM')).toHaveText('US$ 0.90');
    await expect(s.getByText('Aún sin paquetes exportados: sobre los proyectos con gasto')).toBeVisible();
    await expect(cifra(s, 'SCORM contados')).toHaveText('1');
    expect(await filas(s.getByRole('table', { name: 'Por cliente' }))).toEqual([['Municipalidad de Lima', 'US$ 0.90', 'US$ 0.25', 'US$ 1.15']]);
    expect(pedidos.at(-1)).toBe('?clienteId=00000000-0000-4000-8000-0000000000c2');

    // El nombre del proyecto lleva a su detalle.
    await expect(s.getByRole('link', { name: 'Atención al ciudadano' })).toHaveAttribute('href', '/proyectos/00000000-0000-4000-8000-000000000704');
  });

  test('sin consumo en el periodo se dice, con las cifras en cero', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'DISENADOR_INSTRUCCIONAL' });
    await page.goto('/rentabilidad');
    const s = seccion(page);
    await s.getByRole('button', { name: 'Mes anterior' }).click();
    await s.getByRole('combobox', { name: 'Cliente' }).selectOption({ label: 'Municipalidad de Lima' });
    await expect(s.getByText('No hay consumo de IA registrado en mes anterior para este cliente.')).toBeVisible();
    await expect(cifra(s, 'Total del periodo')).toHaveText('US$ 0.00');
    await expect(cifra(s, 'Promedio por SCORM')).toHaveText('US$ 0.00');
    await expect(s.getByRole('table')).toHaveCount(0);
  });

  for (const rol of ['DISENADOR_GRAFICO', 'PRODUCTOR']) {
    test(`${rol} no ve Rentabilidad en el menú ni por la dirección`, async ({ page }) => {
      await simularApi(page, { conSesion: true, rol });
      await page.goto('/');
      await expect(page.getByRole('link', { name: 'Clientes y kits' })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Rentabilidad' })).toHaveCount(0);
      await page.goto('/rentabilidad');
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Página no encontrada');
      await expect(seccion(page)).toHaveCount(0);
    });
  }
});
