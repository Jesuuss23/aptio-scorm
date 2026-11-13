// HU-0206 · Kit propuesto desde un curso anterior o un manual de marca (CP-028, IA-18 v2) contra la API simulada:
// «✦ Extraer de un curso anterior» sube el ZIP como material del cliente y muestra el avance; la propuesta trae paleta,
// tipografías libres con el aviso de la tipografía de marca, estilo, evidencias y confianza. «Aplicar» llena el formulario
// sin guardar (la vista previa y las pantallas modelo cambian al instante, CP-020) y se guarda con «Guardar kit».
// «Descartar» la quita. axe WCAG 2.2 A/AA sin violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { CLIENTE_ID, PROPUESTA_KIT, simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const rgb = (hex: string) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(', ')})`;
const ZIP = { name: 'curso-anterior.zip', mimeType: 'application/x-zip-compressed', buffer: Buffer.from('PK\x03\x04 curso anterior') };
const panel = (page: Page) => page.getByRole('region', { name: 'Propuesta del kit' });

async function extraer(page: Page, archivo = ZIP) {
  const enviados: { ruta: string; cuerpo: Record<string, unknown> }[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && /\/(recursos\/subidas|clientes\/[^/]+\/kit\/extraer)$/.test(r.url())) enviados.push({ ruta: new URL(r.url()).pathname, cuerpo: r.postDataJSON() });
  });
  await panel(page).getByLabel('Curso anterior (ZIP) o manual de marca (PDF)').setInputFiles(archivo);
  return enviados;
}

test.describe('kit desde un curso anterior (HU-0206)', () => {
  test('CP-028 · extraer del ZIP, ver la propuesta, aplicarla en vivo y guardar el kit', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'DISENADOR_GRAFICO' });
    await page.goto(`/clientes/${CLIENTE_ID}`);
    const kit = page.getByRole('region', { name: 'Kit de marca' });
    await expect(kit.getByText('Versión 3')).toBeVisible();
    await expect(panel(page).getByText('✦ Extraer de un curso anterior')).toBeVisible();

    const enviados = await extraer(page);
    await expect(panel(page).getByRole('status')).toHaveText('Leyendo colores y tipografías de curso-anterior.zip…');
    // Se sube como material del cliente (sin proyecto), con el tipo real aunque el navegador diga otro.
    expect(enviados[0]).toEqual({ ruta: '/api/v1/recursos/subidas', cuerpo: expect.objectContaining({ nombre: 'curso-anterior.zip', mime: 'application/zip', clienteId: CLIENTE_ID, origen: 'CLIENTE' }) });
    expect(enviados[0]!.cuerpo.proyectoId).toBeUndefined();

    const p = panel(page);
    await expect(p.getByText('Propuesta desde curso-anterior.zip')).toBeVisible();
    expect(enviados[1]!.ruta).toBe(`/api/v1/clientes/${CLIENTE_ID}/kit/extraer`);
    await expect(p.getByText('80 %')).toBeVisible();
    const colores = p.getByRole('list', { name: 'Paleta propuesta' });
    for (const hex of Object.values(PROPUESTA_KIT.paleta)) await expect(colores.getByText(hex)).toBeVisible();
    await expect(p.getByText('La marca usa Archivo en títulos; se propone Montserrat (libre)')).toBeVisible();
    await expect(p.getByText('Industrial', { exact: true })).toBeVisible();
    await p.getByText('Evidencias').click();
    await expect(p.getByText(PROPUESTA_KIT.evidencias[0]!)).toBeVisible();
    await expect(p.getByText(/^Colores encontrados: #0F2A44 ×5/)).toBeVisible();
    for (const zona of ['.kit-propuesta']) expect(await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze().then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`))).toEqual([]);

    // Aplicar llena el formulario sin guardar: la vista previa y las pantallas modelo cambian al instante (CP-020).
    let guardados = 0;
    page.on('request', (r) => void (r.method() === 'PUT' && /\/kit$/.test(r.url()) && guardados++));
    const portada = page.locator('[data-pantalla="portada"]');
    await expect(portada).toHaveCSS('background-color', rgb('#12355B'));
    await p.getByRole('button', { name: 'Aplicar' }).click();
    await expect(p.getByRole('status')).toHaveText('Propuesta aplicada al formulario: revísala y guarda el kit para conservarla.');
    await expect(portada).toHaveCSS('background-color', rgb(PROPUESTA_KIT.paleta.primario));
    await expect(portada.locator('.kp-titulo')).toHaveCSS('font-family', /Montserrat/);
    await expect(kit.getByLabel('Color primario')).toHaveValue(PROPUESTA_KIT.paleta.primario.toLowerCase());
    await expect(kit.getByLabel('Títulos')).toHaveValue('Montserrat');
    await expect(kit.getByLabel('Textos')).toHaveValue('Source Sans 3');
    await expect(kit.getByRole('button', { name: 'Industrial' })).toHaveAttribute('aria-pressed', 'true');
    const modelos = page.getByRole('region', { name: 'Pantallas modelo del kit' });
    await expect.poll(() => modelos.evaluate((el) => getComputedStyle(el).getPropertyValue('--k-primario').trim().toUpperCase())).toBe(PROPUESTA_KIT.paleta.primario);
    expect(guardados).toBe(0);
    await expect(kit.getByText('Versión 3')).toBeVisible();

    // Se guarda con el botón de siempre (bloqueo de versión incluido).
    const guardado = page.waitForRequest((r) => r.method() === 'PUT' && /\/kit$/.test(r.url()));
    await kit.getByRole('button', { name: 'Guardar kit' }).click();
    expect((await guardado).postDataJSON()).toMatchObject({ version: 3, estilo: 'Industrial', paleta: PROPUESTA_KIT.paleta, tipografias: { titulos: 'Montserrat', textos: 'Source Sans 3' } });
    await expect(kit.getByText('Versión 4')).toBeVisible();
    await expect(kit.getByText('Kit guardado', { exact: true })).toBeVisible();
  });

  test('Descartar quita la propuesta y el kit no cambia', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'DISENADOR_INSTRUCCIONAL' });
    await page.goto(`/clientes/${CLIENTE_ID}`);
    await extraer(page);
    const p = panel(page);
    await expect(p.getByText('Propuesta desde curso-anterior.zip')).toBeVisible();
    const borrado = page.waitForRequest((r) => r.method() === 'DELETE' && r.url().endsWith(`/clientes/${CLIENTE_ID}/kit/propuesta`));
    await p.getByRole('button', { name: 'Descartar' }).click();
    await borrado;
    await expect(p.getByRole('list', { name: 'Paleta propuesta' })).toHaveCount(0);
    await expect(page.locator('[data-pantalla="portada"]')).toHaveCSS('background-color', rgb('#12355B'));
    await page.reload();
    await expect(page.getByRole('region', { name: 'Kit de marca' }).getByText('Versión 3')).toBeVisible();
    await expect(panel(page).getByText('Propuesta desde')).toHaveCount(0);
  });

  test('un material sin colores o de otro tipo se explica', async ({ page }) => {
    await simularApi(page, { conSesion: true });
    await page.goto(`/clientes/${CLIENTE_ID}`);
    await extraer(page, { ...ZIP, name: 'sin-colores.zip' });
    await expect(panel(page).getByRole('alert')).toHaveText(/^No se pudo proponer el kit desde sin-colores\.zip: No se encontraron colores en los estilos del curso/);
    await panel(page).getByLabel('Curso anterior (ZIP) o manual de marca (PDF)').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from('png') });
    await expect(panel(page).getByRole('alert').first()).toHaveText('Sube el ZIP de un curso anterior o el manual de marca en PDF');
  });

  test('el productor ve el kit pero no puede extraer una propuesta', async ({ page }) => {
    await simularApi(page, { conSesion: true, rol: 'PRODUCTOR' });
    await page.goto(`/clientes/${CLIENTE_ID}`);
    await expect(page.getByRole('region', { name: 'Kit de marca' }).getByText('Versión 3')).toBeVisible();
    await expect(panel(page)).toHaveCount(0);
  });
});
