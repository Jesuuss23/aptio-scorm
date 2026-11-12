// HU-1001 · Alineación pedagógica (PNT-18, CP-083): en LOTO, obj-3 («aplicar») se evalúa solo con preguntas «recordar» y
// la matriz lo avisa; subir el nivel de la pregunta bq-06 desde su chip quita la alerta; el chip abre la pantalla en
// Revisión; Entrega avisa «N objetivos sin alinear» sin bloquear. axe WCAG 2.2 A/AA sin violaciones. Diseño gráfico ve
// la matriz sin selectores. La API se simula con el cálculo real de @aptio/schema/alineacion.
import AxeBuilder from '@axe-core/playwright';
import { aplicarNiveles, type CambioNivel, informeAlineacion } from '@aptio/schema/alineacion';
import type { CursoDoc } from '@aptio/schema/revision';
import { expect, type Page, test } from '@playwright/test';
import { cursoLoto, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const CURSO = '00000000-0000-4000-8000-000000000990';
const URL_ALINEACION = `/proyectos/${PROYECTO}/alineacion`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];

async function simularAlineacion(page: Page) {
  const doc = cursoLoto() as unknown as CursoDoc;
  let version = 1;
  const cambios: Record<string, unknown>[] = [];
  await page.route(`**/api/v1/cursos/${CURSO}/alineacion`, (r) => {
    if (r.request().method() === 'PATCH') {
      const pedido = r.request().postDataJSON() as { version: number; objetivos?: { id: string; nivelBloom: string }[]; elementos?: { pantallaId: string; preguntaId?: string; nivelBloom: string }[] };
      cambios.push(pedido);
      if (pedido.version !== version) return r.fulfill({ status: 409, json: { codigo: 'VERSION_CAMBIO', mensaje: 'Otra persona guardó cambios en el curso. Recarga para ver la última versión.' } });
      aplicarNiveles(doc, [...(pedido.objetivos ?? []).map((o) => ({ objetivoId: o.id, nivelBloom: o.nivelBloom })), ...(pedido.elementos ?? [])] as CambioNivel[]);
      version += 1;
    }
    return r.fulfill({ json: { version, ...informeAlineacion(doc) } });
  });
  return { cambios };
}

const fila = (page: Page, id: string) => page.getByRole('table').locator(`tr[data-objetivo="${id}"]`);

test('CP-083 · obj-3 «aplicar» evaluado solo con «recordar» tiene la alerta; subir el nivel de una pregunta la quita', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  const { cambios } = await simularAlineacion(page);
  await page.goto(`/proyectos/${PROYECTO}`);
  await page.getByRole('link', { name: 'Alineación' }).click();
  await expect(page).toHaveURL(URL_ALINEACION);
  await expect(page.getByRole('heading', { name: 'Alineación pedagógica', level: 1 })).toBeVisible();

  const matriz = page.getByRole('region', { name: 'Matriz de alineación' });
  await expect(page.locator('.alineacion-cifras')).toContainText('Alertas2');
  await expect(fila(page, 'obj-1').getByText('✓ Alineado')).toBeVisible();
  await expect(fila(page, 'obj-3').getByRole('list', { name: 'Alertas de obj-3' })).toHaveText('Se evalúa solo en «recordar», menor que «aplicar»');
  await expect(page.getByRole('combobox', { name: 'Nivel de Bloom de obj-3' })).toHaveValue('aplicar');
  const evalua = fila(page, 'obj-3').getByRole('list', { name: 'Evalúa obj-3' });
  await expect(evalua.getByRole('button')).toHaveText(['28 · recordar', '28 · recordar']);
  await expect(fila(page, 'obj-3').getByRole('list', { name: 'Practica obj-3' }).getByRole('button')).toHaveText(['15 · aplicar', '20 · comprender', '22 · recordar']);
  expect(await auditar(page)).toEqual([]);

  // El chip de bq-06 abre su nivel: «aplicar» quita la alerta y guarda con la versión leída.
  const bq06 = evalua.getByRole('button', { name: /Pantalla 28, pregunta bq-06/ });
  await bq06.click();
  await expect(bq06).toHaveAttribute('aria-expanded', 'true');
  await matriz.getByRole('combobox', { name: 'Nivel de Bloom de pantalla 28, pregunta bq-06' }).selectOption('aplicar');
  await expect(page.getByRole('status').filter({ hasText: 'Nivel de pantalla 28, pregunta bq-06 guardado · 1 alerta' })).toBeVisible();
  expect(cambios).toEqual([{ version: 1, elementos: [{ pantallaId: 'p28', preguntaId: 'bq-06', nivelBloom: 'aplicar' }] }]);
  await expect(fila(page, 'obj-3').getByText('✓ Alineado')).toBeVisible();
  await expect(page.locator('.alineacion-cifras')).toContainText('Alertas1');
  expect(await auditar(page)).toEqual([]);

  // El nivel del objetivo también se cambia en su fila: obj-2 en «recordar» queda alineado.
  await page.getByRole('combobox', { name: 'Nivel de Bloom de obj-2' }).selectOption('recordar');
  await expect(page.getByText('Todos los objetivos se presentan, se practican y se evalúan a su nivel.')).toBeVisible();
  expect(cambios.at(-1)).toEqual({ version: 2, objetivos: [{ id: 'obj-2', nivelBloom: 'recordar' }] });

  // «Abrir en Revisión» lleva a la pantalla del chip.
  await matriz.getByRole('link', { name: 'Abrir en Revisión' }).click();
  await expect(page).toHaveURL(`/proyectos/${PROYECTO}/revision?pantalla=p28`);
  await expect(page.getByRole('complementary', { name: 'Pantallas' }).getByRole('button', { name: /Reto final/ })).toHaveAttribute('aria-current', 'true');
});

test('diseño gráfico ve la matriz sin cambiar niveles; el chip solo muestra el nivel y el enlace', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  const { cambios } = await simularAlineacion(page);
  await page.goto(URL_ALINEACION);
  await expect(fila(page, 'obj-3').getByRole('list', { name: 'Alertas de obj-3' })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveCount(0);
  await fila(page, 'obj-1').getByRole('button', { name: /Pantalla 7/ }).click();
  await expect(page.getByText('Nivel recordar, según su diseño.')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Abrir en Revisión' })).toBeVisible();
  expect(cambios).toEqual([]);
});

test('Entrega avisa los objetivos sin alinear sin bloquear la exportación', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  await page.route(`**/api/v1/cursos/${CURSO}/validar`, (r) => r.fulfill({ json: {
    formato: 'SCORM12', errores: [], advertencias: ['2 objetivos sin alinear: revísalos en Alineación pedagógica.'], pesoEstimadoMb: 14.8, pesoEstimadoBytes: 15_518_924,
    limiteMb: 100, origenLimite: 'referencia', superaLimite: false, alternativas: [], recursosPesados: [], suspendDataCaracteres: 162,
    pantallasTotal: 30, pantallasSinAprobar: 0, recursosFaltantes: [], modoIdioma: 'unico', textosIngles: null, objetivosSinAlinear: 2,
  } }));
  await page.route(`**/api/v1/cursos/${CURSO}/exportaciones`, (r) => r.fulfill({ json: [] }));
  await page.goto(`/proyectos/${PROYECTO}/entrega`);
  const verificacion = page.getByRole('region', { name: 'Verificación automática' });
  await expect(verificacion).toContainText('2 objetivos sin alinear. Puedes exportar igual; revísalos antes de entregar al cliente.');
  await expect(page.getByRole('button', { name: 'Exportar SCORM 1.2' })).toBeEnabled();
  await verificacion.getByRole('link', { name: 'Ir a Alineación' }).click();
  await expect(page).toHaveURL(URL_ALINEACION);
});

/** axe con las reglas WCAG 2.2 A/AA sobre la vista. */
async function auditar(page: Page) {
  const { violations } = await new AxeBuilder({ page }).include('main').withTags(REGLAS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}
