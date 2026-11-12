// HU-0802 · Idiomas (PNT-11) desde la web: traducir los pendientes de LOTO con el glosario del cliente y ver el avance y
// los estados; CP-077 (lo Revisado no cambia al traducir), editar el inglés a mano (queda Revisado), «Marcar revisado» y el
// filtro «Por revisar». El revisor del cliente solo ve. La API se simula con los textos reales del caso LOTO.
// HU-0803 · CP-078: la tarjeta de memoria «Cilindros y mangueras» no cabe en inglés: Desborde con «X de Y caracteres»,
// versión corta propuesta, contador en vivo y «Usar versión corta» la deja Revisada.
import { desborda, NOMBRE_ESTADO, textosDe } from '@aptio/schema/traduccion';
import { expect, type Page, test } from '@playwright/test';
import { cursoLoto, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const CURSO = '00000000-0000-4000-8000-000000000990';
const TRABAJO = '00000000-0000-4000-8000-00000000f802';
const TITULO = '/modulos/0/capsulas/0/pantallas/0/titulo';
const SUBTITULO = '/modulos/0/capsulas/0/pantallas/0/bloques/1/contenido';
const TARJETA = '/modulos/0/capsulas/0/pantallas/6/bloques/1/interaccion/datos/pares/2/b/texto';
const GLOSARIO = [
  { termino: 'LOTO', traduccion: null, noTraducir: true },
  { termino: 'energía cero', traduccion: 'zero energy', noTraducir: false },
];

type Fila = { id: string; ruta: string; pantallaId: string | null; es: string; en: string | null; estado: keyof typeof NOMBRE_ESTADO; limite?: number | null; propuesta?: string | null };
/** Como la API: los caracteres del inglés y la propuesta (null si no hay). */
const aJson = (f: Fila) => ({ ...f, limite: f.limite ?? null, caracteres: f.en === null ? null : f.en.trim().length, propuesta: f.propuesta ?? null });

/** Las filas de Traduccion de LOTO y el trabajo IA-10: termina en la segunda consulta y traduce solo lo Pendiente. */
async function simularIdiomas(page: Page, preparar: (filas: Fila[]) => void = () => undefined) {
  const filas: Fila[] = textosDe(cursoLoto()).map((t, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, ...t, estado: 'PENDIENTE' }));
  preparar(filas);
  const cambios: Record<string, unknown>[] = [];
  let traducciones = 0;
  let consultas = 0;
  await page.route('**/api/v1/clientes/*/glosario', (r) => r.fulfill({ json: GLOSARIO }));
  await page.route(`**/api/v1/cursos/${CURSO}/traducciones**`, (r) => {
    if (r.request().method() === 'POST') {
      traducciones++;
      consultas = 0;
      return r.fulfill({ status: 202, json: { id: TRABAJO, estado: 'EN_COLA', eventos: '/api/v1/eventos' } });
    }
    return r.fulfill({ json: filas.map(aJson) });
  });
  // El SSE manda el lote 2 de 5; la consulta del trabajo lo termina.
  await page.route('**/api/v1/eventos', (r) => r.fulfill({
    headers: { 'content-type': 'text/event-stream' },
    body: `event: trabajo\ndata: ${JSON.stringify({ tipo: 'estado', trabajoId: TRABAJO, estado: 'EN_CURSO', progreso: 40, mensaje: 'Lote 2 de 5 traducido' })}\n\n`,
  }));
  await page.route(`**/api/v1/trabajos/${TRABAJO}`, (r) => {
    if (++consultas < 2) return r.fulfill({ json: { id: TRABAJO, estado: 'EN_CURSO', error: null } });
    const pendientes = filas.filter((f) => f.estado === 'PENDIENTE');
    for (const f of pendientes) Object.assign(f, { en: f.ruta === TITULO ? 'Lockout/tagout' : `[EN] ${f.es}`, estado: 'TRADUCIDA_IA' });
    // Como el worker: lo que no cabe queda en Desborde con la versión corta.
    for (const f of pendientes) if (desborda(f.en, f.limite)) Object.assign(f, { estado: 'DESBORDE', propuesta: '[EN] Cilindros y' });
    return r.fulfill({ json: { id: TRABAJO, estado: 'COMPLETADO', error: null } });
  });
  await page.route('**/api/v1/traducciones/*', (r) => {
    const f = filas.find((x) => r.request().url().endsWith(x.id))!;
    const datos = r.request().postDataJSON() as { en?: string; estado?: string };
    cambios.push(datos);
    if (datos.en) f.en = datos.en;
    const largo = datos.estado !== 'REVISADA' && desborda(f.en, f.limite);
    Object.assign(f, { estado: largo ? 'DESBORDE' : 'REVISADA', propuesta: largo ? f.propuesta : null });
    return r.fulfill({ json: aJson(f) });
  });
  return { filas, cambios, traducidas: () => traducciones };
}

const fila = (page: Page, ruta: string) => page.locator(`tr[data-ruta="${ruta}"]`);

test('traducir los pendientes de LOTO: avance por lotes, estados y CP-077 (lo Revisado no cambia)', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { traducidas } = await simularIdiomas(page, (filas) => {
    Object.assign(filas.find((f) => f.ruta === SUBTITULO)!, { en: 'Safety capsule, reviewed by hand', estado: 'REVISADA' });
  });

  // Desde el detalle del proyecto, «Idiomas» lleva a PNT-11.
  await page.goto(`/proyectos/${PROYECTO}`);
  await page.getByRole('link', { name: 'Idiomas' }).click();
  await expect(page).toHaveURL(`/proyectos/${PROYECTO}/idiomas`);
  await expect(page.getByRole('heading', { name: 'Idiomas', level: 1 })).toBeVisible();
  await expect(page.getByText('291 textos · 290 pendientes · 0 traducidos por IA · 0 desbordes · 1 revisados')).toBeVisible();

  // Agrupado por pantalla y con el glosario del cliente al lado.
  await expect(page.locator('tbody[data-pantalla="p01"] th')).toHaveText('Pantalla 01 · Bloqueo y etiquetado');
  await expect(page.locator('tbody[data-pantalla]')).toHaveCount(31);
  const glosario = page.getByRole('complementary', { name: 'Glosario del cliente' });
  await expect(glosario.getByText('LOTO → LOTO (no se traduce)')).toBeVisible();
  await expect(glosario.getByText('energía cero → zero energy')).toBeVisible();
  await expect(fila(page, TITULO).getByText('Pendiente', { exact: true })).toBeVisible();
  // Sin inglés no hay nada que marcar como revisado.
  await expect(fila(page, TITULO).getByRole('button', { name: 'Marcar revisado' })).toHaveCount(0);

  await page.getByRole('button', { name: '✦ Traducir pendientes' }).click();
  const avance = page.getByRole('progressbar', { name: 'Avance de la traducción' });
  await expect(avance).toHaveAttribute('aria-valuenow', '40');
  await expect(page.getByText('Lote 2 de 5 traducido')).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'Traducción terminada' })).toBeVisible({ timeout: 10_000 });
  expect(traducidas()).toBe(1);

  await expect(page.getByText('291 textos · 0 pendientes · 289 traducidos por IA · 1 desbordes · 1 revisados')).toBeVisible();
  await expect(fila(page, TITULO).getByRole('textbox')).toHaveValue('Lockout/tagout');
  await expect(fila(page, TITULO).getByText('Traducido por IA')).toBeVisible();
  // CP-077: el texto revisado conserva su inglés y su estado.
  await expect(fila(page, SUBTITULO).getByRole('textbox')).toHaveValue('Safety capsule, reviewed by hand');
  await expect(fila(page, SUBTITULO).getByText('Revisado', { exact: true })).toBeVisible();
  // Sin pendientes no hay nada que traducir.
  await expect(page.getByRole('button', { name: '✦ Traducir pendientes' })).toBeDisabled();
});

test('editar el inglés lo deja Revisado; «Marcar revisado» confirma el de la IA y «Por revisar» los oculta', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { cambios } = await simularIdiomas(page, (filas) => {
    for (const f of filas) Object.assign(f, { en: `[EN] ${f.es}`, estado: 'TRADUCIDA_IA' });
  });
  await page.goto(`/proyectos/${PROYECTO}/idiomas`);

  const titulo = fila(page, TITULO).getByRole('textbox');
  await titulo.fill('Lockout and tagout');
  await titulo.press('Enter');
  await expect(fila(page, TITULO).getByText('Revisado', { exact: true })).toBeVisible();
  await fila(page, SUBTITULO).getByRole('button', { name: 'Marcar revisado' }).click();
  await expect(fila(page, SUBTITULO).getByText('Revisado', { exact: true })).toBeVisible();
  expect(cambios).toEqual([{ en: 'Lockout and tagout' }, { estado: 'REVISADA' }]);
  await expect(page.getByText('291 textos · 0 pendientes · 289 traducidos por IA · 0 desbordes · 2 revisados')).toBeVisible();

  // Salir de una celda sin cambiar el texto no guarda nada.
  await fila(page, '/modulos/0/capsulas/0/pantallas/0/narracion/texto').getByRole('textbox').focus();
  await page.keyboard.press('Tab');
  expect(cambios).toHaveLength(2);

  await page.getByRole('button', { name: 'Por revisar' }).click();
  await expect(page.getByRole('button', { name: 'Por revisar' })).toHaveAttribute('aria-pressed', 'true');
  await expect(fila(page, TITULO)).toHaveCount(0);
  await expect(fila(page, SUBTITULO)).toHaveCount(0);
  await expect(page.locator('tr[data-estado]')).toHaveCount(289);
  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(page.locator('tr[data-estado]')).toHaveCount(291);
});

test('el revisor del cliente ve el inglés y los estados, pero no traduce ni edita', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' });
  await simularIdiomas(page);
  await page.goto(`/proyectos/${PROYECTO}/idiomas`);
  await expect(page.getByText('291 textos · 291 pendientes')).toBeVisible();
  await expect(page.getByRole('button', { name: '✦ Traducir pendientes' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Marcar revisado' })).toHaveCount(0);
  await expect(fila(page, TITULO).getByRole('textbox')).toHaveAttribute('readonly', '');
});

test('CP-078 · la tarjeta que no cabe en inglés queda en Desborde; el contador avisa y «Usar versión corta» la deja Revisada', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const { cambios } = await simularIdiomas(page, (filas) => {
    for (const f of filas) Object.assign(f, { en: `[EN] ${f.es}`, estado: desborda(`[EN] ${f.es}`, f.limite) ? 'DESBORDE' : 'TRADUCIDA_IA' });
    Object.assign(filas.find((f) => f.ruta === TARJETA)!, { propuesta: '[EN] Cilindros y' });
  });
  await page.goto(`/proyectos/${PROYECTO}/idiomas`);
  await expect(page.getByText('291 textos · 0 pendientes · 290 traducidos por IA · 1 desbordes · 0 revisados')).toBeVisible();

  const tarjeta = fila(page, TARJETA);
  await expect(tarjeta).toHaveAttribute('data-estado', 'DESBORDE');
  await expect(tarjeta.getByText('Desborde', { exact: true })).toBeVisible();
  await expect(tarjeta.getByText('26 de 24 caracteres')).toBeVisible();
  await expect(tarjeta.getByText('26 / 24 · no cabe')).toBeVisible();
  await expect(tarjeta.getByText('[EN] Cilindros y', { exact: true })).toBeVisible();
  // «Por revisar» incluye los desbordes.
  await page.getByRole('button', { name: 'Por revisar' }).click();
  await expect(tarjeta).toBeVisible();

  // El contador cambia en vivo mientras se escribe.
  const celda = tarjeta.getByRole('textbox');
  await celda.fill('Cylinders and pressure hoses');
  await expect(tarjeta.locator('[data-contador]')).toHaveText('28 / 24 · no cabe');
  await celda.fill('Cylinders and hoses');
  await expect(tarjeta.locator('[data-contador]')).toHaveText('19 / 24');
  // Un inglés escrito a mano que tampoco cabe se guarda y sigue en Desborde, con su propuesta.
  await celda.fill('Cylinders, pressure hoses!');
  await celda.press('Enter');
  await expect(tarjeta).toHaveAttribute('data-estado', 'DESBORDE');
  await expect(tarjeta.getByText('26 de 24 caracteres')).toBeVisible();

  await tarjeta.getByRole('button', { name: 'Usar versión corta' }).click();
  await expect(tarjeta).toHaveCount(0);
  await page.getByRole('button', { name: 'Todas' }).click();
  await expect(tarjeta).toHaveAttribute('data-estado', 'REVISADA');
  await expect(tarjeta.getByRole('textbox')).toHaveValue('[EN] Cilindros y');
  await expect(tarjeta.getByText('Revisado', { exact: true })).toBeVisible();
  expect(cambios).toEqual([{ en: 'Cylinders, pressure hoses!' }, { en: '[EN] Cilindros y' }]);
  await expect(page.getByText('291 textos · 0 pendientes · 290 traducidos por IA · 0 desbordes · 1 revisados')).toBeVisible();
});
