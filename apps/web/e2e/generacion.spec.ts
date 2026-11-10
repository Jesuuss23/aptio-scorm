// HU-0401 y HU-0408 · Generar el SCORM desde el proyecto (CP-036, CP-037, CP-045) contra la API simulada, que termina
// una etapa en cada consulta.
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const PROYECTO = '/proyectos/00000000-0000-4000-8000-000000000702';

async function conTema(page: Page) {
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('O escribe solo el tema', { exact: false }).fill('Trabajo seguro en altura');
  await material.getByRole('button', { name: 'Agregar tema' }).click();
  return page.getByRole('region', { name: 'Generación del SCORM' });
}
const etapa = (seccion: ReturnType<Page['getByRole']>, nombre: string) => seccion.getByRole('listitem', { name: nombre });

test('CP-036 · lanza la generación y muestra las 11 etapas avanzando con su costo', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const gen = page.getByRole('region', { name: 'Generación del SCORM' });
  // Sin material no se puede generar.
  await expect(gen.getByRole('button', { name: 'Generar SCORM' })).toBeDisabled();
  await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();

  await expect(gen.getByRole('list', { name: 'Etapas de la generación' }).getByRole('listitem')).toHaveCount(11);
  await expect(page.getByText('Minera Andina · Producción')).toBeVisible();
  await expect(gen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(etapa(gen, 'Storyboard y guion')).toContainText('Lista', { timeout: 15_000 });
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('84 páginas → 14 ideas clave');
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('US$ 0.35');
  await expect(etapa(gen, 'Paquete de prueba')).toContainText('Se habilita en un sprint siguiente');
  await expect(gen.getByText('27 %')).toBeVisible();
  await expect(gen.getByText('US$ 0.90')).toBeVisible();
  await expect(gen.getByRole('button', { name: 'Generar de nuevo' })).toBeVisible();
});

test('CP-037 · si otra persona ya la lanzó, avisa y muestra la que está en curso', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, generacion: 'ajena' });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  await expect(gen.getByRole('status').filter({ hasText: 'Ya hay una generación en curso para este proyecto' })).toBeVisible();
  await expect(gen.getByRole('list', { name: 'Etapas de la generación' }).getByRole('listitem')).toHaveCount(11);
  await expect(gen.getByRole('button', { name: 'Generar SCORM' })).toHaveCount(0);
  await expect(gen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
});

test('CP-045 · cancelar en la etapa 3 conserva las etapas 1 y 2', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, generacion: 'lenta' });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  await expect(etapa(gen, 'Storyboard y guion')).toContainText('Trabajando…', { timeout: 15_000 });
  await gen.getByRole('button', { name: 'Cancelar' }).click();

  await expect(gen.getByText('Generación cancelada. Lo terminado se conserva.')).toBeVisible();
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('Lista');
  await expect(etapa(gen, 'Objetivos y estructura')).toContainText('Lista');
  await expect(etapa(gen, 'Storyboard y guion')).toContainText('Cancelada');
  await expect(gen.getByRole('button', { name: 'Continuar' })).toBeVisible();
});

test('HU-0408 · tras un error, continuar retoma desde esa etapa', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, generacion: 'falla' });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  await expect(etapa(gen, 'Objetivos y estructura')).toContainText('El proveedor de IA no respondió (529)', { timeout: 15_000 });
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('Lista');
  await gen.getByRole('button', { name: 'Continuar' }).click();
  await expect(etapa(gen, 'Storyboard y guion')).toContainText('Lista', { timeout: 15_000 });
  await expect(etapa(gen, 'Objetivos y estructura')).toContainText('3 objetivos con nivel de Bloom');
});

test('el diseñador gráfico ve la generación pero no la lanza', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(PROYECTO);
  const gen = page.getByRole('region', { name: 'Generación del SCORM' });
  await expect(gen.getByText('Agrega el material del cliente', { exact: false })).toBeVisible();
  await expect(gen.getByRole('button')).toHaveCount(0);
});
