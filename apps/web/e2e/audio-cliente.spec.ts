// HU-0704 · Audio del cliente en Personaje y voz (CP-074, REQ-023, REQ-024, RN-07-4): sin la autorización del cliente
// la grabación no se usa; limpiar el ruido deja escuchar el antes y el después; «Usar con boca automática» deja la
// narración como «Grabación del cliente» y «Lista», y Ana mueve la boca con las marcas de la grabación; «✦ Re-locutar
// con voz IA» pone la transcripción con la voz del kit y «↶ Deshacer» la revierte. axe WCAG 2.2 A/AA sin violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { AUDIO_CLIENTE, BOCAS_GRABACION, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_VOZ = `/proyectos/${PROYECTO}/voz?pantalla=p05`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const tarjeta = (page: Page) => page.getByRole('region', { name: 'Audio del cliente' });
const narracion = (page: Page, id: string) => page.getByRole('list', { name: 'Narraciones en español' }).getByRole('listitem', { name: `Narración ${id}` });

type Cuerpo = { materialId: string; autorizado?: boolean; usarLimpio?: boolean };
function pedidos(page: Page) {
  const lista: { ruta: string; cuerpo: Cuerpo | null }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/(narraciones\/p\d+\/(grabacion|relocutar)|materiales\/[^/]+\/limpiar)$/.test(r.url())) lista.push({ ruta: new URL(r.url()).pathname, cuerpo: r.postDataJSON() });
  });
  return lista;
}

test.describe('audio del cliente (HU-0704)', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, conAudioCliente: true });
  });

  test('CP-074 · la grabación del gerente queda como narración con boca automática, después de autorizarla y elegir la versión limpia', async ({ page }) => {
    const enviados = pedidos(page);
    await page.goto(URL_VOZ);
    await expect(page.getByRole('heading', { name: 'Personaje y voz' })).toBeVisible();
    await expect(tarjeta(page).getByRole('combobox', { name: 'Audio' })).toHaveValue(AUDIO_CLIENTE.materialId);
    await expect(tarjeta(page).getByRole('combobox', { name: 'Audio' }).locator('option:checked')).toHaveText('Grabacion_gerente.wav · 2:14 min');
    await expect(tarjeta(page).getByRole('combobox', { name: 'Pantalla' })).toHaveValue('p05');
    await expect(tarjeta(page).getByText(`«${AUDIO_CLIENTE.texto}»`)).toBeVisible();

    // RN-07-4: sin marcar la autorización, la API no la acepta y se explica.
    await tarjeta(page).getByRole('button', { name: 'Usar con boca automática' }).click();
    await expect(tarjeta(page).getByRole('alert')).toHaveText('Marca «El cliente autorizó usar esta grabación» para usarla en el curso');
    await expect(narracion(page, 'p05').getByText('Grabación del cliente')).toHaveCount(0);

    // REQ-024: limpiar el ruido y escuchar el antes y el después.
    await tarjeta(page).getByRole('button', { name: 'Limpiar ruido' }).click();
    await expect(tarjeta(page).getByRole('status')).toHaveText('Audio limpio listo: escucha el antes y el después y elige cuál usar.');
    const antes = tarjeta(page).getByRole('group', { name: 'Antes y después' }).locator('audio[aria-label="Escuchar el audio original"]');
    const despues = tarjeta(page).getByRole('group', { name: 'Antes y después' }).locator('audio[aria-label="Escuchar el audio limpio"]');
    for (const a of [antes, despues]) {
      await a.evaluate((el: HTMLAudioElement) => el.play());
      await expect.poll(() => a.evaluate((el: HTMLAudioElement) => el.currentTime)).toBeGreaterThan(0.2);
      await a.evaluate((el: HTMLAudioElement) => el.pause());
    }
    await expect(tarjeta(page).getByRole('radio', { name: 'Limpia' })).toBeChecked();
    await expect(tarjeta(page).getByRole('button', { name: 'Limpiar ruido' })).toBeDisabled();

    await tarjeta(page).getByRole('checkbox', { name: 'El cliente autorizó usar esta grabación' }).check();
    await tarjeta(page).getByRole('button', { name: 'Usar con boca automática' }).click();
    await expect(tarjeta(page).getByRole('status')).toHaveText('La narración de p05 ya es la grabación del cliente, con boca automática y subtítulos.');
    expect(enviados.at(-1)).toEqual({ ruta: expect.stringMatching(/narraciones\/p05\/grabacion$/), cuerpo: expect.objectContaining({ materialId: AUDIO_CLIENTE.materialId, autorizado: true, usarLimpio: true }) });
    const item = narracion(page, 'p05');
    await expect(item.getByText('Grabación del cliente')).toBeVisible();
    await expect(item.getByText('Lista', { exact: true })).toBeVisible();
    await expect(item.getByText(/^Autorizada por Diseño instruccional el .+ · versión limpia$/)).toBeVisible();
    await expect(item.getByText(AUDIO_CLIENTE.texto)).toBeVisible();

    // Ana dice la grabación con sus marcas de boca.
    const audio = item.locator('audio');
    await audio.evaluate((el: HTMLAudioElement) => el.play());
    const vistas = await page.evaluate(async () => {
      const el = document.querySelector<HTMLAudioElement>('[aria-label="Narración p05"] audio')!;
      const formas = new Set<string>();
      const fin = performance.now() + 2000;
      while (performance.now() < fin && !el.ended) {
        const b = document.querySelector('.voz-ana svg')?.getAttribute('data-boca');
        if (!el.paused && b) formas.add(b);
        await new Promise((r) => setTimeout(r, 40));
      }
      return [...formas];
    });
    const esperadas = new Set(BOCAS_GRABACION.map(([, b]) => b));
    expect(vistas.filter((b) => esperadas.has(b)).length).toBeGreaterThanOrEqual(4);
    await expect(page.getByRole('figure').getByRole('status')).toHaveText('Narrando p05');

    // Al volver a la vista sigue siendo la grabación, lista (la voz de la IA no la regenera: lo prueban el worker y la API).
    await page.reload();
    await expect(narracion(page, 'p05').getByText('Grabación del cliente')).toBeVisible();
    await expect(narracion(page, 'p05').getByText('Lista', { exact: true })).toBeVisible();
    for (const zona of ['.voz-pagina']) expect(await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze().then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`))).toEqual([]);
  });

  test('«✦ Re-locutar con voz IA» pone la transcripción con la voz del kit y «↶ Deshacer» la revierte', async ({ page }) => {
    const enviados = pedidos(page);
    await page.goto(URL_VOZ);
    await tarjeta(page).getByRole('combobox', { name: 'Pantalla' }).selectOption('p06');
    const textoAntes = (await narracion(page, 'p06').locator('.voz-texto').textContent())!;
    await tarjeta(page).getByRole('button', { name: '✦ Re-locutar con voz IA' }).click();
    await expect(tarjeta(page).getByRole('status')).toHaveText('La transcripción es ahora la narración de p06; se dirá con la voz del kit.');
    expect(enviados.at(-1)!.ruta).toMatch(/narraciones\/p06\/relocutar$/);
    await expect(narracion(page, 'p06').locator('.voz-texto')).toHaveText(AUDIO_CLIENTE.texto);
    await expect(narracion(page, 'p06').getByText('Grabación del cliente')).toHaveCount(0);
    await tarjeta(page).getByRole('button', { name: '↶ Deshacer' }).click();
    await expect(tarjeta(page).getByRole('status')).toHaveText('Se deshizo la re-locución de p06.');
    await expect(narracion(page, 'p06').locator('.voz-texto')).toHaveText(textoAntes);
    await expect(tarjeta(page).getByRole('button', { name: '↶ Deshacer' })).toHaveCount(0);
  });

  test('el revisor del cliente escucha las narraciones pero no ve el audio del cliente', async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, conAudioCliente: true, rol: 'REVISOR_CLIENTE' });
    await page.goto(URL_VOZ);
    await expect(narracion(page, 'p05')).toBeVisible();
    await expect(tarjeta(page)).toHaveCount(0);
  });
});
