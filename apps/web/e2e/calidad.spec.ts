// HU-0505 · Control de calidad en Revisión (CP-054): la imagen sin texto alternativo de p20 es una observación de
// accesibilidad que bloquea la aprobación; «✦ Revisar con IA» muestra el avance por lotes y suma las observaciones de la
// IA (las de LOTO, 10-IA-12-calidad.json) con su categoría, su sugerencia y el chip «IA»; «Descartar» quita una de la IA
// y el filtro «Revisar» lo refleja; «Del curso» muestra el contraste del kit. axe WCAG 2.2 A/AA sin violaciones.
// La API se simula: el trabajo IA-12 termina a la 2.ª consulta.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const CURSO = '00000000-0000-4000-8000-000000000990';
const TRABAJO = '00000000-0000-4000-8000-00000000f505';
const URL_REVISION = `/proyectos/${PROYECTO}/revision`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

type Obs = { id: string; pantallaId: string | null; tipo: string; severidad: string; categoria: string | null; mensaje: string; sugerencia: string | null; ruta: string | null; origen: string; resuelta: boolean; creadoEn: string };
const obs = (n: number, o: Partial<Obs> & Pick<Obs, 'pantallaId' | 'tipo' | 'severidad' | 'categoria' | 'mensaje' | 'origen'>): Obs => ({
  id: `00000000-0000-4000-8000-${String(5050 + n).padStart(12, '0')}`, sugerencia: null, ruta: null, resuelta: false, creadoEn: '2026-11-12T10:00:00.000Z', ...o,
});
/** Las de reglas: CP-054 en p20 y el contraste del kit (del curso). */
const REGLAS_LOTO = [
  obs(1, { pantallaId: 'p20', tipo: 'ACCESIBILIDAD', severidad: 'bloquea-entrega', categoria: 'accesibilidad', mensaje: 'La imagen p20-foto no tiene texto alternativo.', origen: 'regla' }),
  obs(2, { pantallaId: null, tipo: 'ACCESIBILIDAD', severidad: 'aviso', categoria: 'accesibilidad', origen: 'regla',
    mensaje: 'Kit de marca: el primario sobre el fondo tiene contraste 3,9:1, menor a 4,5:1 (WCAG AA pide 4,5:1). El reproductor oscurece el texto, pero revisa la paleta.' }),
];
/** Las de IA-12 sobre LOTO (gravedad alta y media → aviso, baja → info). */
const IA_LOTO = [
  obs(11, { pantallaId: 'p04', tipo: 'ACCESIBILIDAD', severidad: 'info', categoria: 'accesibilidad', origen: 'ia', mensaje: 'El símbolo «≠» puede leerse mal con lector de pantalla.', sugerencia: 'Texto alternativo: «Apagado no es igual a energía cero».' }),
  obs(12, { pantallaId: 'p09', tipo: 'CALIDAD', severidad: 'info', categoria: 'exactitud', origen: 'ia', mensaje: 'El ejemplo de la faja es contenido creado por la IA, no está en el manual.', sugerencia: 'Confirmar con el cliente o marcarlo como caso ilustrativo.' }),
  obs(13, { pantallaId: 'p18', tipo: 'MATERIAL_FALTANTE', severidad: 'aviso', categoria: 'faltante', origen: 'ia', mensaje: 'Falta el video del cliente; la pantalla usa un marcador de lugar.', sugerencia: 'Pedir el video al cliente o cambiar la pantalla por «Ordenar pasos» con ilustraciones.' }),
  obs(14, { pantallaId: 'p20', tipo: 'CALIDAD', severidad: 'aviso', categoria: 'exactitud', origen: 'ia', mensaje: 'La ilustración es genérica; los puntos de aislamiento reales de la faja 3 están en el Anexo B (p. 30).', sugerencia: 'Pedir al cliente una foto o el diagrama del Anexo B.' }),
];

async function simularCalidad(page: Page) {
  const lista: Obs[] = REGLAS_LOTO.map((o) => ({ ...o }));
  const pedidos: string[] = [];
  const descartadas: string[] = [];
  let consultas = 0;
  await page.route(`**/api/v1/cursos/${CURSO}/observaciones**`, (r) => r.fulfill({ json: lista.filter((o) => !o.resuelta) }));
  await page.route(`**/api/v1/cursos/${CURSO}/control-calidad`, (r) => {
    pedidos.push(r.request().method());
    consultas = 0;
    return r.fulfill({ status: 202, json: { id: TRABAJO, estado: 'EN_COLA', eventos: '/api/v1/eventos' } });
  });
  // El SSE manda el lote 1 de 3; la segunda consulta del trabajo lo termina y aparecen las de la IA.
  await page.route('**/api/v1/eventos', (r) => r.fulfill({
    headers: { 'content-type': 'text/event-stream' },
    body: `event: trabajo\ndata: ${JSON.stringify({ tipo: 'estado', trabajoId: TRABAJO, estado: 'EN_CURSO', progreso: 33, mensaje: 'Lote 1 de 3 revisado' })}\n\n`,
  }));
  await page.route(`**/api/v1/trabajos/${TRABAJO}`, (r) => {
    if (++consultas < 2) return r.fulfill({ json: { id: TRABAJO, estado: 'EN_CURSO', error: null } });
    if (!lista.some((o) => o.origen === 'ia')) lista.push(...IA_LOTO.map((o) => ({ ...o })));
    return r.fulfill({ json: { id: TRABAJO, estado: 'COMPLETADO', error: null } });
  });
  await page.route('**/api/v1/observaciones/*', (r) => {
    const o = lista.find((x) => r.request().url().endsWith(x.id))!;
    if (o.origen !== 'ia') return r.fulfill({ status: 422, json: { codigo: 'OBSERVACION_DE_REGLA', mensaje: 'Esta observación sale de las reglas' } });
    descartadas.push(o.id);
    o.resuelta = (r.request().postDataJSON() as { resuelta: boolean }).resuelta;
    return r.fulfill({ json: o });
  });
  return { pedidos, descartadas };
}

const elegir = (page: Page, titulo: string) => page.getByRole('complementary', { name: 'Pantallas' }).getByRole('button', { name: new RegExp(titulo) }).click();
const tarjeta = (page: Page) => page.getByRole('region', { name: 'Control de calidad' });
const filtro = (page: Page) => page.getByRole('group', { name: 'Filtro' });

test('CP-054 · la imagen sin alternativo bloquea; «Revisar con IA» suma las de la IA, se descarta una y el filtro lo refleja', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  const { pedidos, descartadas } = await simularCalidad(page);
  await page.goto(URL_REVISION);
  await expect(filtro(page).getByRole('button', { name: 'Revisar (1)' })).toBeVisible();

  // CP-054: en p20, la observación de accesibilidad de las reglas bloquea la aprobación y no se descarta.
  await elegir(page, 'Encuentra los puntos de aislamiento');
  const deLaPantalla = tarjeta(page).getByRole('list', { name: 'Observaciones de la pantalla' });
  const cp054 = deLaPantalla.getByRole('listitem').filter({ hasText: 'La imagen p20-foto no tiene texto alternativo.' });
  await expect(cp054.getByText('Bloquea la entrega')).toBeVisible();
  await expect(cp054.getByText('Accesibilidad', { exact: true })).toBeVisible();
  await expect(cp054.getByRole('button', { name: /Descartar/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aprobar pantalla' })).toBeDisabled();
  // Del curso: el contraste del kit.
  await expect(tarjeta(page).getByRole('heading', { name: 'Del curso', level: 3 })).toBeVisible();
  await expect(tarjeta(page).getByRole('list', { name: 'Observaciones del curso' })).toContainText('Kit de marca: el primario sobre el fondo tiene contraste 3,9:1');

  // «✦ Revisar con IA»: avance por lotes y, al terminar, las de la IA en su pantalla.
  await tarjeta(page).getByRole('button', { name: '✦ Revisar con IA' }).click();
  expect(pedidos).toEqual(['POST']);
  await expect(tarjeta(page).getByRole('progressbar', { name: 'Avance de la revisión de calidad' })).toHaveAttribute('aria-valuenow', '33');
  await expect(tarjeta(page).getByText('Lote 1 de 3 revisado')).toBeVisible();
  await expect(tarjeta(page).getByRole('button', { name: 'Revisando…' })).toBeDisabled();
  await expect(tarjeta(page).getByRole('status').filter({ hasText: 'Revisión terminada' })).toBeVisible({ timeout: 10_000 });
  const deIA = deLaPantalla.getByRole('listitem').filter({ hasText: 'La ilustración es genérica' });
  await expect(deIA.getByText('IA', { exact: true })).toBeVisible();
  await expect(deIA.getByText('Exactitud', { exact: true })).toBeVisible();
  await expect(deIA.getByText('Sugerencia: Pedir al cliente una foto o el diagrama del Anexo B.')).toBeVisible();
  await expect(filtro(page).getByRole('button', { name: 'Revisar (4)' })).toBeVisible();
  expect(await auditar(page)).toEqual([]);

  // Descartar la de p09 (información): desaparece y el filtro «Revisar» baja a 3.
  await elegir(page, 'Un ejemplo de planta');
  await tarjeta(page).getByRole('button', { name: 'Descartar: El ejemplo de la faja es contenido creado por la IA, no está en el manual.' }).click();
  await expect(tarjeta(page).getByText('Sin observaciones abiertas.')).toBeVisible();
  expect(descartadas).toEqual([IA_LOTO[1]!.id]);
  await filtro(page).getByRole('button', { name: 'Revisar (3)' }).click();
  await expect(page.getByRole('complementary', { name: 'Pantallas' }).getByRole('listitem')).toHaveCount(3);
});

test('el revisor del cliente ve las observaciones, pero no pide la revisión ni descarta', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' });
  await simularCalidad(page);
  await page.goto(URL_REVISION);
  await elegir(page, 'Encuentra los puntos de aislamiento');
  await expect(tarjeta(page).getByText('La imagen p20-foto no tiene texto alternativo.')).toBeVisible();
  await expect(tarjeta(page).getByRole('button', { name: /Revisar con IA/ })).toHaveCount(0);
  await expect(tarjeta(page).getByRole('button', { name: /Descartar/ })).toHaveCount(0);
});

/** axe con las reglas WCAG 2.2 A/AA sobre la tarjeta de control de calidad. */
async function auditar(page: Page) {
  const { violations } = await new AxeBuilder({ page }).include('.control-calidad').withTags(REGLAS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}
