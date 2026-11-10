// HU-0301 a HU-0303 · Proyectos y Nuevo SCORM en la web (CP-029 a CP-032) contra la API simulada.
import { expect, test } from '@playwright/test';
import { CLIENTE_ID, simularApi } from './api-simulada';

test('CP-029 · filtrar por un cliente muestra solo sus proyectos', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto('/');
  const lista = page.getByRole('list', { name: 'Proyectos' });
  await expect(lista.getByRole('listitem')).toHaveCount(5);
  await page.getByLabel('Cliente').selectOption({ label: 'Minera Andina' });
  await expect(lista.getByRole('listitem')).toHaveCount(3);
  await expect(lista.getByText('Municipalidad de Lima', { exact: false })).toHaveCount(0);
  const tarjeta = lista.getByRole('link', { name: 'Bloqueo y etiquetado' });
  await expect(tarjeta.getByText('12 de 30 pantallas aprobadas', { exact: false })).toBeVisible();
  await expect(tarjeta.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  await page.getByLabel('Buscar').fill('altura');
  await expect(lista.getByRole('listitem')).toHaveCount(1);
});

test('sin proyectos: estado vacío con Nuevo SCORM', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Aún no hay proyectos' })).toBeVisible();
  await page.locator('main').getByRole('link', { name: 'Nuevo SCORM' }).last().click();
  await expect(page).toHaveURL(/\/nuevo$/);
});

test('CP-030 y CP-031 · solo cliente y nombre; el proyecto se crea y, sin LMS, el perfil propuesto es Genérico', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto('/nuevo');
  const crear = page.getByRole('button', { name: 'Crear proyecto' });
  await expect(crear).toBeDisabled();
  await page.getByRole('region', { name: 'Cliente y nombre' }).getByRole('combobox').selectOption(CLIENTE_ID);
  await expect(page.getByRole('checkbox', { name: 'Inglés' })).toBeChecked();
  await page.getByLabel('Nombre del SCORM').fill('Bloqueo y etiquetado');
  await crear.click();
  await expect(page).toHaveURL(/\/proyectos\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Bloqueo y etiquetado' })).toBeVisible();
  await expect(page.getByRole('status', { name: 'Perfil de entrega' })).toHaveText('Entrega · perfil propuesto: Genérico');
  await expect(page.getByRole('region', { name: 'Generación del SCORM' }).getByRole('button', { name: 'Generar SCORM' })).toBeVisible();

  // Los datos técnicos se completan después.
  await page.getByLabel('LMS destino').selectOption('Canvas');
  await expect(page.getByRole('status', { name: 'Perfil de entrega' })).toHaveText('Entrega · perfil propuesto: Canvas');
  await page.getByRole('button', { name: 'Guardar datos técnicos' }).click();
  await expect(page.getByText('Datos técnicos guardados')).toBeVisible();
});

test('CP-032 · 48 h, 50 % en SCORM y 30 pantallas por SCORM → ≈ 1.200 pantallas y 40 SCORM', async ({ page }) => {
  await simularApi(page, { conSesion: true });
  await page.goto('/nuevo');
  await page.getByText('Datos técnicos y estimación (opcional)').click();
  const estimacion = page.getByRole('status', { name: 'Estimación' });
  await expect(estimacion).toContainText('Escribe las horas');
  await page.getByLabel('Horas de capacitación que pide el cliente').fill('48');
  await page.getByLabel('% del tiempo en SCORM').fill('50');
  await page.getByLabel('Pantallas por SCORM').fill('30');
  await expect(estimacion).toHaveText('≈ 1.200 pantallas y 40 SCORM');
  await page.getByLabel('SCORM por mes del equipo').fill('8');
  await expect(estimacion).toContainText('≈ 5 meses con el equipo');
  // Los supuestos son editables.
  await page.getByLabel('Minutos por pantalla').fill('1.5');
  await expect(estimacion).toContainText('≈ 960 pantallas y 32 SCORM');
});

test('quien no crea proyectos no ve Nuevo SCORM', async ({ page }) => {
  await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO', conProyectos: true });
  await page.goto('/');
  await expect(page.getByRole('link', { name: 'Nuevo SCORM' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Bloqueo y etiquetado' }).click();
  await expect(page.getByRole('button', { name: 'Guardar datos técnicos' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Archivar' })).toHaveCount(0);
});
