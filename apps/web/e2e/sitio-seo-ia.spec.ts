// HU-1513 · SEO para IA (REQ-072, PNT-30). CP-126: bloquear un rastreador con su interruptor y, al publicar, robots.txt
// lleva su «Disallow: /»; llms.txt con su contador, «Armar con las páginas publicadas» y su entrega en /s/llms.txt solo
// tras publicar; las preguntas objetivo con la marca manual de cada asistente y su fecha. CP-127: «✦ Proponer
// contenido» trae sugerencias pendientes y «Crear borradores» las vuelve página en borrador y pregunta oculta, sin
// publicar nada. axe WCAG 2.2 A/AA en 0 violaciones a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string, extra: object = {}) => ({
  id: `00000000-0000-4000-8000-00000000000${n}`, ruta, idioma: 'es' as 'es' | 'en', titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F, ...extra,
});
const INICIO = pagina(1, '/', 'Inicio', { metaDescripcion: 'Cápsulas SCORM de 3 a 10 minutos con IA.' });
const PRECIOS = pagina(2, '/precios', 'Precios', { metaDescripcion: 'Planes en soles.' });
const INTERNA = pagina(3, '/gracias', 'Gracias', { indexar: false });
const BORRADOR = pagina(4, '/novedades', 'Novedades', { estado: 'BORRADOR', publicadaEn: null });
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-0000000000${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const PREGUNTA = 'mejor herramienta para crear cursos SCORM con IA';
const SITIO = {
  conSesion: true, rol: 'SUPERADMIN', versionSitio: true,
  paginasSitio: [INICIO, PRECIOS, INTERNA, BORRADOR],
  bloquesSitio: [bloque(10, INICIO.id, 'hero'), bloque(20, PRECIOS.id, 'cta'), bloque(30, INTERNA.id, 'cta')],
};
const LLMS = '# Aptio SCORM\n\n> Cápsulas SCORM de 3 a 10 minutos con IA.\n\n## Páginas\n- [Inicio](https://aptioscorm.com/): Cápsulas SCORM de 3 a 10 minutos con IA.\n- [Precios](https://aptioscorm.com/precios): Planes en soles.';

const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const publicar = async (page: Page) => {
  await page.getByRole('button', { name: 'Publicar cambios' }).click();
  await expect(page.getByRole('status').filter({ hasText: /Se publicó la versión \d+/ })).toBeVisible();
};
const pedir = (page: Page, ruta: string) => page.evaluate(async (r) => {
  const res = await fetch(r);
  return { estado: res.status, tipo: res.headers.get('content-type'), texto: await res.text() };
}, ruta);
const estado = (page: Page, texto: string | RegExp) => page.getByRole('status').filter({ hasText: texto });

for (const ancho of [390, 1280]) {
  test(`PNT-30 y CP-126 a ${ancho} px: bloquear GPTBot lo lleva a robots.txt al publicar, llms.txt se arma con las páginas publicadas y las menciones se marcan a mano`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, { ...SITIO, seoIaSitio: { preguntas: [PREGUNTA] } });
    if (ancho < 900) await page.goto('/sitio/seo-ia');
    else {
      await page.goto('/sitio');
      await page.getByRole('link', { name: 'SEO para IA', exact: true }).click();
    }
    await expect(page.getByRole('heading', { level: 1, name: 'SEO para IA' })).toBeVisible();

    // Rastreadores: los 5 del catálogo, permitidos por defecto.
    const rastreadores = page.getByRole('list', { name: 'Rastreadores de IA' });
    await expect(rastreadores.getByRole('switch')).toHaveCount(5);
    for (const nombre of ['GPTBot', 'ClaudeBot', 'Google-Extended', 'PerplexityBot', 'CCBot']) {
      await expect(rastreadores.getByRole('switch', { name: `Permitir ${nombre}` })).toHaveAttribute('aria-checked', 'true');
    }
    const gptbot = rastreadores.getByRole('switch', { name: 'Permitir GPTBot' });
    await gptbot.focus();
    await page.keyboard.press('Space');
    await expect(gptbot).toHaveAttribute('aria-checked', 'false');
    await expect(estado(page, 'GPTBot quedó bloqueado. Llega al sitio con «Publicar cambios».')).toBeVisible();
    await expect(rastreadores.getByRole('listitem').filter({ hasText: 'GPTBot' })).toContainText('Bloqueado');
    await expect(page.getByText('Cambios sin publicar')).toBeVisible();
    // Sin publicar, el sitio sigue igual.
    expect((await pedir(page, '/s/robots.txt')).texto).not.toContain('GPTBot');
    expect((await pedir(page, '/s/llms.txt')).estado).toBe(404);

    // llms.txt: contador, texto plano y el armado sin IA con las páginas publicadas e indexables.
    const llms = page.getByRole('form', { name: 'llms.txt' });
    const contenido = llms.getByLabel('Contenido de llms.txt');
    await expect(llms.locator('#seoia-llms-cuenta')).toHaveText('0 / 20 000');
    await contenido.fill('# Aptio\n<script>alert(1)</script>');
    await llms.getByRole('button', { name: 'Guardar llms.txt' }).click();
    await expect(llms.getByRole('alert')).toHaveText('llms.txt solo admite texto, sin etiquetas HTML');
    await contenido.fill('x'.repeat(20_001));
    await expect(llms.locator('#seoia-llms-cuenta')).toHaveText('20 001 / 20 000 · 1 de más');
    await llms.getByRole('button', { name: 'Guardar llms.txt' }).click();
    await expect(llms.getByRole('alert')).toHaveText('llms.txt admite hasta 20 000 caracteres (tiene 20 001)');
    await llms.getByRole('button', { name: 'Armar con las páginas publicadas' }).click();
    await expect(contenido).toHaveValue(LLMS);
    await expect(llms.getByRole('status')).toHaveText('Se armó con 2 páginas publicadas. Revísalo y pulsa «Guardar llms.txt».');
    await expect(llms.locator('#seoia-llms-cuenta')).toHaveText(`${LLMS.length} / 20 000`);
    await llms.getByRole('button', { name: 'Guardar llms.txt' }).click();
    await expect(estado(page, 'Se guardó llms.txt. Llega al sitio con «Publicar cambios».')).toBeVisible();
    await expect(contenido).toHaveValue(LLMS);

    // Preguntas objetivo: la marca manual por asistente guarda su fecha; alta, repetida y borrado con confirmación.
    const preguntas = page.getByRole('list', { name: 'Preguntas objetivo' });
    const menciones = preguntas.getByRole('group', { name: `¿Mencionan la marca al responder «${PREGUNTA}»?` });
    await expect(menciones.getByRole('combobox')).toHaveCount(4);
    await expect(menciones.getByLabel('ChatGPT')).toHaveValue('sin_revisar');
    await menciones.getByLabel('ChatGPT').selectOption({ label: 'Sí' });
    await expect(estado(page, `ChatGPT quedó en «Sí» para «${PREGUNTA}».`)).toBeVisible();
    await expect(menciones.getByLabel('ChatGPT')).toHaveValue('si');
    await menciones.getByLabel('Gemini').selectOption({ label: 'No' });
    await expect(menciones.getByLabel('Gemini')).toHaveValue('no');
    await expect(menciones.getByText(/^Revisado el /)).toHaveCount(2);
    await expect(menciones.getByLabel('Claude')).toHaveValue('sin_revisar');
    const alta = page.getByRole('form', { name: 'Agregar pregunta objetivo' });
    await alta.getByLabel('Nueva pregunta objetivo').fill('Mejor herramienta para crear cursos SCORM con IA?');
    await alta.getByRole('button', { name: 'Agregar pregunta' }).click();
    await expect(alta.getByRole('alert')).toHaveText('Esa pregunta ya está en la lista');
    await alta.getByLabel('Nueva pregunta objetivo').fill('cómo convertir un PDF en curso SCORM');
    await alta.getByRole('button', { name: 'Agregar pregunta' }).click();
    await expect(estado(page, 'Se agregó la pregunta «cómo convertir un PDF en curso SCORM».')).toBeVisible();
    await expect(preguntas.getByRole('listitem')).toHaveCount(2);
    await sinViolaciones(page);
    await page.getByRole('button', { name: 'Borrar la pregunta «cómo convertir un PDF en curso SCORM»' }).click();
    await page.getByRole('group', { name: 'Confirmar el borrado de «cómo convertir un PDF en curso SCORM»' }).getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(preguntas.getByRole('listitem')).toHaveCount(1);

    // CP-126 · Publicado: robots.txt bloquea a GPTBot (y solo a él) y /llms.txt se sirve como texto plano.
    await publicar(page);
    const robots = await pedir(page, '/s/robots.txt');
    expect(robots.texto).toContain('User-agent: *\nAllow: /\n');
    expect(robots.texto).toContain('User-agent: GPTBot\nDisallow: /\n');
    for (const permitido of ['ClaudeBot', 'Google-Extended', 'PerplexityBot', 'CCBot']) expect(robots.texto).not.toContain(permitido);
    expect(await pedir(page, '/s/llms.txt')).toEqual({ estado: 200, tipo: 'text/plain; charset=utf-8', texto: `${LLMS}\n` });
    // Volver a permitirlo y publicar lo saca de robots.txt.
    await gptbot.click();
    await expect(gptbot).toHaveAttribute('aria-checked', 'true');
    await publicar(page);
    expect((await pedir(page, '/s/robots.txt')).texto).not.toContain('GPTBot');
  });

  test(`CP-127 a ${ancho} px: las sugerencias de la IA llegan pendientes y «Crear borradores» crea una página en borrador y una pregunta oculta, sin publicar nada`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, SITIO);
    await page.goto('/sitio/seo-ia');
    const proponer = page.getByRole('button', { name: '✦ Proponer contenido' });
    // Sin preguntas objetivo no hay nada que revisar.
    await proponer.click();
    await expect(page.getByRole('alert')).toHaveText('Agrega al menos una pregunta objetivo antes de pedir propuestas');
    const alta = page.getByRole('form', { name: 'Agregar pregunta objetivo' });
    await alta.getByLabel('Nueva pregunta objetivo').fill(PREGUNTA);
    await alta.getByRole('button', { name: 'Agregar pregunta' }).click();
    await expect(page.getByRole('list', { name: 'Preguntas objetivo' }).getByRole('listitem')).toHaveCount(1);

    await proponer.click();
    await expect(estado(page, 'Llegaron 3 sugerencias nuevas. Nada se publica: revísalas y crea los borradores.')).toBeVisible();
    const sugerencias = page.getByRole('list', { name: 'Sugerencias de la IA' });
    await expect(sugerencias.getByRole('listitem')).toHaveCount(3);
    const paginaNueva = sugerencias.getByRole('listitem').filter({ hasText: 'SCORM 1.2 vs. cmi5' });
    await expect(paginaNueva).toContainText('Página nueva');
    await expect(paginaNueva).toContainText('/scorm-vs-cmi5');
    await expect(sugerencias.getByRole('listitem').filter({ hasText: '¿Cuánto cuesta producir una cápsula SCORM?' })).toContainText('Pregunta frecuente');
    await expect(page.getByRole('note')).toContainText('Las respuestas no incluyen precios ni cifras');
    await sinViolaciones(page);
    // Pedir otra vez no duplica.
    await proponer.click();
    await expect(estado(page, 'La IA no encontró nada nuevo que proponer')).toBeVisible();
    await expect(sugerencias.getByRole('listitem')).toHaveCount(3);

    await page.getByRole('button', { name: 'Descartar: ¿Se puede convertir un PDF en un curso SCORM?' }).click();
    await expect(estado(page, 'Se descartó la sugerencia «¿Se puede convertir un PDF en un curso SCORM?».')).toBeVisible();
    await expect(sugerencias.getByRole('listitem')).toHaveCount(2);
    await page.getByRole('button', { name: 'Crear borradores' }).click();
    await expect(estado(page, 'Se crearon 2 borradores. Nada se publicó: las páginas quedan en borrador y las preguntas, ocultas.')).toBeVisible();
    await expect(sugerencias).toHaveCount(0);
    await expect(page.getByText('0 pendientes')).toBeVisible();
    // Nada cambió en el sitio: no hay cambios por publicar, la página nueva da 404 y la pregunta quedó oculta.
    await expect(page.getByText('Cambios sin publicar')).toHaveCount(0);
    expect((await pedir(page, '/s/scorm-vs-cmi5')).estado).toBe(404);
    const oculta = await page.evaluate(() => fetch('/api/v1/sitio/elementos?coleccion=preguntas').then((r) => r.json() as Promise<{ visible: boolean; datos: { pregunta: string } }[]>));
    expect(oculta).toMatchObject([{ visible: false, datos: { pregunta: '¿Cuánto cuesta producir una cápsula SCORM?' } }]);
    await expect(page.getByRole('link', { name: 'Ver la pregunta oculta en Contenido' })).toBeVisible();

    // El enlace abre el borrador en su pestaña SEO, con el meta título y la meta descripción propuestos.
    await page.getByRole('link', { name: 'Abrir el borrador «SCORM 1.2 vs. cmi5»' }).click();
    const panel = page.getByRole('tabpanel', { name: 'SEO' });
    await expect(panel.getByLabel('Ruta de la página')).toHaveValue('/scorm-vs-cmi5');
    await expect(panel.getByLabel('Meta título')).toHaveValue('SCORM 1.2 vs. cmi5: cuál elegir para tu LMS');
    await expect(panel.getByLabel('Meta descripción')).toHaveValue(/^Compara SCORM 1\.2 y cmi5 en una tabla/);
    await page.goto('/sitio/paginas');
    await expect(page.getByRole('row').filter({ hasText: '/scorm-vs-cmi5' })).toContainText('Borrador');
  });
}

test('si la IA no logra una propuesta válida, se avisa y no queda ninguna sugerencia', async ({ page }) => {
  await simularApi(page, { ...SITIO, seoIaSitio: { preguntas: [PREGUNTA], iaFalla: true } });
  await page.goto('/sitio/seo-ia');
  await page.getByRole('button', { name: '✦ Proponer contenido' }).click();
  await expect(page.getByRole('alert')).toHaveText('La IA no logró una propuesta válida; vuelve a intentarlo');
  await expect(page.getByText('0 pendientes')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Sugerencias de la IA' })).toHaveCount(0);
});
