// HU-0610 · Disparadores simples (PNT-21, CP-069, REQ-045). Diseño gráfico oculta el botón «Ver ejemplo» de p05 y, en
// «Avanzado: disparadores», define «a los 3 s → mostrar botón»: se guarda solo, se marca con ◆ en la regla y, en la
// vista previa, el botón aparece a los 3 s. Con ▶ Reproducir se ve en el editor y un «ir a» se avisa sin salir.
// El panel pasa axe WCAG 2.2 A/AA.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_P05 = `/proyectos/${PROYECTO}/editor?pantalla=p05`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const lienzo = (page: Page) => page.getByRole('region', { name: /^Lienzo de la pantalla/ });
const propiedades = (page: Page) => page.getByRole('complementary', { name: 'Propiedades' });
const capas = (page: Page) => page.getByRole('complementary', { name: 'Capas' });
const linea = (page: Page) => page.getByRole('region', { name: 'Línea de tiempo' });
const disparador = (page: Page, n: number) => propiedades(page).getByRole('group', { name: `Disparador ${n}` });

function contarEdiciones(page: Page) {
  const cuerpos: Record<string, unknown>[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/cursos\/[^/]+\/pantallas\/p05$/.test(r.url())) cuerpos.push(r.postDataJSON());
  });
  return cuerpos;
}
async function auditar(page: Page, zona: string) {
  const { violations } = await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

test.beforeEach(async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO', retoquesP05: true });
  await page.setViewportSize({ width: 1440, height: 900 });
});

test('CP-069 · «a los 3 s → mostrar botón»: se guarda solo, se marca en la regla y en la vista previa el botón aparece a los 3 s', async ({ page }) => {
  const ediciones = contarEdiciones(page);
  await page.goto(URL_P05);
  // Dado un botón oculto.
  await page.getByRole('tablist', { name: 'Panel del editor' }).getByRole('tab', { name: 'Capas' }).click();
  await capas(page).getByRole('button', { name: /^Ocultar Botón/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Elemento oculto: se puede mostrar desde Capas.' })).toBeVisible();

  // Cuando defino «a los 3 s → mostrar botón».
  await propiedades(page).getByText('Avanzado: disparadores').click();
  await expect(propiedades(page).getByText('Esta pantalla no tiene disparadores.')).toBeVisible();
  await propiedades(page).getByRole('button', { name: '+ Nuevo disparador' }).click();
  const d1 = disparador(page, 1);
  await expect(d1.getByRole('combobox', { name: 'Cuando' })).toHaveValue('tiempo');
  await expect(d1.getByRole('spinbutton', { name: 'Segundo' })).toHaveValue('3');
  await expect(d1.getByRole('combobox', { name: 'Hacer' })).toHaveValue('mostrar');
  // Propone el elemento oculto.
  await expect(d1.getByRole('combobox', { name: 'Elemento' })).toHaveValue('p05-boton');
  await expect(page.getByRole('status').filter({ hasText: 'Disparadores guardados.' })).toBeVisible();
  expect(ediciones.at(-1)).toEqual({
    version: expect.any(Number),
    disparadores: [{ id: 'p05-disp-1', cuando: { evento: 'tiempo', segundo: 3 }, accion: { tipo: 'mostrar', elementoId: 'p05-boton' } }],
  });
  await expect(linea(page).locator('[data-disparo="p05-disp-1"]')).toHaveAttribute('title', 'A los 3 s → mostrar «Botón · Ver ejemplo»');
  expect(await auditar(page, '.disparadores')).toEqual([]);

  // Un segundo fuera de rango no se guarda y lo dice.
  const guardados = ediciones.length;
  await d1.getByRole('spinbutton', { name: 'Segundo' }).fill('700');
  await expect(d1.getByText('El segundo debe estar entre 0 y 600')).toBeVisible();
  await expect(d1.getByRole('spinbutton', { name: 'Segundo' })).toHaveAttribute('aria-invalid', 'true');
  await expect(propiedades(page).getByText('Corrige el disparador marcado para guardar.')).toBeVisible();
  expect(await auditar(page, '.disparadores')).toEqual([]);
  await d1.getByRole('spinbutton', { name: 'Segundo' }).fill('3');
  await expect(propiedades(page).getByText('Corrige el disparador marcado para guardar.')).toHaveCount(0);
  expect(ediciones.length).toBe(guardados);

  // Entonces en la vista previa el botón aparece a los 3 s.
  await page.goto(`/proyectos/${PROYECTO}/vista-previa`);
  const r = page.locator('.vista-previa-reproductor');
  for (let n = 1; n < 5; n++) await r.getByRole('button', { name: 'Siguiente' }).click();
  await expect(page.getByLabel('Seguimiento simulado').getByText('5 de 30', { exact: true })).toBeVisible();
  const boton = r.locator('[data-bloque="p05-boton"]');
  const desde = Date.now();
  await expect(boton).toBeHidden();
  await expect(boton).toBeVisible({ timeout: 6000 });
  const pasaron = (Date.now() - desde) / 1000;
  expect(pasaron).toBeGreaterThan(2);
  expect(pasaron).toBeLessThan(5);
  await expect(boton).toHaveText('Ver ejemplo');
});

test('con ▶ Reproducir el editor aplica el disparador y avisa del «ir a» sin salir; quitar lo guarda', async ({ page }) => {
  const ediciones = contarEdiciones(page);
  await page.goto(URL_P05);
  await page.getByRole('tablist', { name: 'Panel del editor' }).getByRole('tab', { name: 'Capas' }).click();
  await capas(page).getByRole('button', { name: /^Ocultar Botón/ }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Elemento oculto' })).toBeVisible();
  await propiedades(page).getByText('Avanzado: disparadores').click();
  await propiedades(page).getByRole('button', { name: '+ Nuevo disparador' }).click();
  await disparador(page, 1).getByRole('spinbutton', { name: 'Segundo' }).fill('1');
  await propiedades(page).getByRole('button', { name: '+ Nuevo disparador' }).click();
  const d2 = disparador(page, 2);
  await d2.getByRole('combobox', { name: 'Cuando' }).selectOption('fin-voz');
  await d2.getByRole('combobox', { name: 'Hacer' }).selectOption('ir-a');
  await d2.getByRole('combobox', { name: 'Pantalla' }).selectOption('p08');
  await expect(page.getByRole('status').filter({ hasText: 'Disparadores guardados.' })).toBeVisible();
  await expect.poll(() => (ediciones.at(-1) as { disparadores?: unknown[] }).disparadores).toEqual([
    { id: 'p05-disp-1', cuando: { evento: 'tiempo', segundo: 1 }, accion: { tipo: 'mostrar', elementoId: 'p05-boton' } },
    { id: 'p05-disp-2', cuando: { evento: 'fin-voz' }, accion: { tipo: 'ir-a', pantallaId: 'p08' } },
  ]);
  expect(await auditar(page, '.disparadores')).toEqual([]);

  // En el lienzo quieto el botón oculto se ve tenue; con ▶ aparece y, al terminar la voz, se avisa del salto.
  const boton = lienzo(page).locator('[data-bloque="p05-boton"]');
  await expect(boton).toHaveClass(/ap-oculto-el/);
  await linea(page).getByRole('button', { name: /Reproducir/ }).click();
  await expect(boton).not.toHaveClass(/ap-oculto-el/, { timeout: 4000 });
  await expect(page.getByRole('status').filter({ hasText: /◆ Aquí la cápsula iría a la pantalla 8/ })).toBeVisible({ timeout: 12_000 });
  await expect(lienzo(page)).toHaveAccessibleName('Lienzo de la pantalla p05');

  // Quitar el segundo lo guarda solo.
  await disparador(page, 2).getByRole('button', { name: 'Quitar el disparador 2' }).click();
  await expect(disparador(page, 2)).toHaveCount(0);
  await expect.poll(() => ((ediciones.at(-1) as { disparadores?: unknown[] }).disparadores ?? []).length).toBe(1);
});
