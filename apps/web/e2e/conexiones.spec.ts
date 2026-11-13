// HU-1304 · Empresa › Conexiones IA contra la API simulada (PNT-23, CP-099, CP-100): la tabla de las 8 tareas con
// proveedor y modelo (Azure «próximamente», Boca fija), clave Sí/No, costo estimado, gasto del mes y límite editable;
// «Probar» en modo simulado; cambiar el modelo y la voz guarda solo eso. Con el texto al tope, el aviso arriba, el
// medidor de la barra lateral en rojo y la generación detenida con «Continuar» que sigue al subir el límite. Solo
// administración la ve. axe WCAG 2.2 A/AA sin violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const PROYECTO = '/proyectos/00000000-0000-4000-8000-000000000702';
const tabla = (page: Page) => page.getByRole('table', { name: 'Conexiones por tarea' });
const fila = (page: Page, tarea: string) => tabla(page).getByRole('row').filter({ has: page.getByRole('rowheader', { name: tarea }) });
const medidor = (page: Page) => page.getByRole('group', { name: 'Costo de IA del mes' });
/** axe en las zonas de esta historia (el resto de la estructura tiene sus propias pruebas). */
const violaciones = (page: Page, zonas: string[]) => {
  const axe = new AxeBuilder({ page }).withTags(REGLAS);
  for (const z of zonas) axe.include(z);
  return axe.analyze().then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));
};

test.describe('conexiones IA (HU-1304)', () => {
  test('tabla por tarea, probar, cambiar modelo y voz, y axe sin violaciones', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'ADMINISTRADOR' });
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Conexiones IA' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Conexiones IA' })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Modo simulado' })).toBeVisible();
    await expect(tabla(page).locator('tbody tr')).toHaveCount(8);

    // Texto: Claude con su modelo, clave Sí, costo estimado y gasto del mes.
    const texto = fila(page, 'Resumen, estructura y guion');
    await expect(texto.getByLabel('Proveedor para Resumen, estructura y guion')).toHaveValue('anthropic');
    await expect(texto.getByLabel('Modelo para Resumen, estructura y guion')).toHaveValue('claude-opus-5-5');
    await expect(texto.getByText('Sí', { exact: true })).toBeVisible();
    await expect(texto).toContainText('US$ 0.90');
    await expect(texto).toContainText('US$ 40.00');
    // Voz: Azure se ofrece como próximamente; Boca no se elige; Imagen sin clave.
    const voz = fila(page, 'Voz');
    await expect(voz.getByRole('option', { name: 'Azure Speech (próximamente)' })).toBeDisabled();
    await expect(fila(page, 'Boca del personaje').getByRole('combobox')).toHaveCount(0);
    await expect(fila(page, 'Ilustraciones').getByText('No', { exact: true })).toBeVisible();
    await expect(tabla(page).locator('tfoot')).toContainText('US$ 6.40');
    await expect(medidor(page)).toContainText('Sin límites de gasto');

    // Probar en modo simulado.
    await texto.getByRole('button', { name: 'Probar Resumen, estructura y guion' }).click();
    await expect(texto.getByRole('status')).toHaveText(/✓ simulado, OK · \d+ ms/);

    // Cambiar el modelo: el PUT lleva solo lo cambiado y ninguna clave.
    await texto.getByLabel('Modelo para Resumen, estructura y guion').selectOption('claude-sonnet-5-5');
    const put = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith('/conexiones-ia/texto'));
    await texto.getByRole('button', { name: 'Guardar Resumen, estructura y guion' }).click();
    expect((await put).postDataJSON()).toEqual({ modelo: 'claude-sonnet-5-5', limiteGastoMensualUsd: null });
    await expect(texto.getByLabel('Modelo para Resumen, estructura y guion')).toHaveValue('claude-sonnet-5-5');
    await expect(texto.getByRole('button', { name: 'Guardar Resumen, estructura y guion' })).toBeDisabled();

    // ElevenLabs con su voz por idioma y un límite.
    await voz.getByLabel('Proveedor para Voz').selectOption('elevenlabs');
    await voz.getByLabel('Voz en español para Voz').fill('voz-es-123');
    await voz.getByLabel('Límite mensual en US$ para Voz').fill('-1');
    await voz.getByRole('button', { name: 'Guardar Voz' }).click();
    await expect(voz.getByRole('status')).toHaveText(/mayor o igual a 0/);
    await voz.getByLabel('Límite mensual en US$ para Voz').fill('25,50');
    const putVoz = page.waitForRequest((r) => r.method() === 'PUT' && r.url().endsWith('/conexiones-ia/voz'));
    await voz.getByRole('button', { name: 'Guardar Voz' }).click();
    expect((await putVoz).postDataJSON()).toEqual({ proveedor: 'elevenlabs', voces: { es: 'voz-es-123' }, limiteGastoMensualUsd: 25.5 });
    await expect(voz.getByLabel('Proveedor para Voz')).toHaveValue('elevenlabs');
    await expect(voz.getByLabel('Límite mensual en US$ para Voz')).toHaveValue('25.5');
    await expect(tabla(page).locator('tfoot')).toContainText('Suma de límites: US$ 25.50');
    // El medidor del mes compara el total con la suma de los límites (58,20 de 25,50: al tope).
    await expect(medidor(page)).toContainText('US$ 58.20');

    expect(await violaciones(page, ['main', '.medidor-ia'])).toEqual([]);
  });

  test('CP-100 · con el texto al tope: aviso, medidor en rojo y «Continuar» tras subir el límite', async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', generacion: 'limite' });
    await page.goto(PROYECTO);
    const material = page.getByRole('region', { name: 'Material del cliente' });
    await material.getByLabel('O escribe solo el tema', { exact: false }).fill('Trabajo seguro en altura');
    await material.getByRole('button', { name: 'Agregar tema' }).click();
    const gen = page.getByRole('region', { name: 'Generación del SCORM' });
    await gen.getByRole('button', { name: 'Generar SCORM' }).click();
    const aviso = gen.getByRole('alert').filter({ hasText: 'Se alcanzó el límite de gasto de IA del mes' });
    await expect(aviso).toBeVisible({ timeout: 15_000 });
    await expect(gen.getByRole('listitem', { name: 'Objetivos y estructura' })).toContainText('la tarea «Resumen, estructura y guion» llegó a su límite de gasto del mes (USD 40.00 de 40.00)');
    await expect(gen.getByRole('listitem', { name: 'Objetivos y estructura' })).not.toContainText('LIMITE_GASTO');
    await expect(medidor(page)).toHaveClass(/al-tope/);
    await expect(medidor(page)).toContainText('Al tope');
    expect(await violaciones(page, ['.limite-gasto', '.medidor-ia'])).toEqual([]);

    // Continuar sin subir el límite vuelve a detenerse. Se espera la respuesta de «continuar» (la generación pasa a
    // EN_CURSO y el aviso se va) antes de esperar el aviso otra vez: si no, el aviso de antes ya cuenta como visible, se
    // sale a Conexiones IA con la generación en curso y, al volver con el límite subido, ya no hay nada que continuar.
    const continuada = page.waitForResponse((r) => r.request().method() === 'POST' && r.url().endsWith('/continuar'));
    await aviso.getByRole('button', { name: 'Continuar' }).click();
    await continuada;
    await expect(aviso).toHaveCount(0);
    await expect(aviso).toBeVisible({ timeout: 15_000 });
    await expect(gen.getByRole('listitem', { name: 'Objetivos y estructura' })).toContainText('llegó a su límite de gasto del mes');

    // Administración sube el límite en Conexiones IA.
    await page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Conexiones IA' }).click();
    const banner = page.getByRole('alert').filter({ hasText: 'Una tarea llegó a su límite de gasto del mes' });
    await expect(banner).toContainText('Resumen, estructura y guion');
    const texto = fila(page, 'Resumen, estructura y guion');
    await expect(texto.getByText('Al límite')).toBeVisible();
    expect(await violaciones(page, ['main', '.medidor-ia'])).toEqual([]);
    await texto.getByLabel('Límite mensual en US$ para Resumen, estructura y guion').fill('80');
    await texto.getByRole('button', { name: 'Guardar Resumen, estructura y guion' }).click();
    await expect(banner).toHaveCount(0);
    await expect(texto.getByText('Al límite')).toHaveCount(0);
    await expect(medidor(page)).not.toHaveClass(/al-tope/);
    await expect(medidor(page)).toContainText('73 % de US$ 80.00');

    // De vuelta en el proyecto, «Continuar» sigue desde la etapa detenida.
    await page.goto(PROYECTO);
    await gen.getByRole('alert').getByRole('button', { name: 'Continuar' }).click();
    await expect(gen.getByRole('listitem', { name: 'Storyboard y guion' })).toContainText('Lista', { timeout: 15_000 });
    await expect(gen.getByRole('alert').filter({ hasText: 'Se alcanzó el límite' })).toHaveCount(0);
  });

  test('diseño instruccional no ve Conexiones IA ni el medidor', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'DISENADOR_INSTRUCCIONAL' });
    await page.goto('/');
    await expect(page.getByRole('navigation', { name: 'Menú principal' }).getByRole('link', { name: 'Rentabilidad' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Conexiones IA' })).toHaveCount(0);
    await expect(medidor(page)).toHaveCount(0);
    await page.goto('/conexiones-ia');
    await expect(page.getByRole('heading', { name: 'Página no encontrada' })).toBeVisible();
  });
});
