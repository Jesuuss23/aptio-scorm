// HU-1001 · Alineación pedagógica (PNT-18, CP-083): en LOTO, obj-3 («aplicar») se evalúa solo con preguntas «recordar» y
// la matriz lo avisa; subir el nivel de la pregunta bq-06 desde su chip quita la alerta; el chip abre la pantalla en
// Revisión; Entrega avisa «N objetivos sin alinear» sin bloquear. axe WCAG 2.2 A/AA sin violaciones. Diseño gráfico ve
// la matriz sin selectores. La API se simula con el cálculo real de @aptio/schema/alineacion.
// HU-1002 · CP-084: «✦ Proponer correcciones» trae la propuesta de IA-17 (salida grabada de LOTO); aplicarla deja 0
// alertas y «1 pantalla por revisar» lleva a Revisión; una propuesta vencida ofrece «Recalcular propuesta».
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { aplicarCorreccion, aplicarNiveles, type CambioNivel, type CorreccionAlineacion, informeAlineacion } from '@aptio/schema/alineacion';
import type { CursoDoc } from '@aptio/schema/revision';
import { expect, type Page, test } from '@playwright/test';
import { cursoLoto, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const CURSO = '00000000-0000-4000-8000-000000000990';
const URL_ALINEACION = `/proyectos/${PROYECTO}/alineacion`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const CORRECCION = JSON.parse(readFileSync(new URL('../../../packages/ai/casos/loto/salidas/X-IA-17-alineacion.json', import.meta.url), 'utf8')) as CorreccionAlineacion;

type PropuestaSim = { id: string; tipo: string; pantallaId: null; titulo: string; descripcion: string; cambios: unknown[]; correcciones: unknown[]; versionBase: number; estado: string; costoUsd: number; creadoEn: string };

async function simularAlineacion(page: Page, { vencida = false } = {}) {
  let doc = cursoLoto() as unknown as CursoDoc;
  let version = 1;
  const cambios: Record<string, unknown>[] = [];
  const pedidos: unknown[] = [];
  const propuestas: PropuestaSim[] = [];
  const nueva = (n: number, versionBase: number, estado = 'PENDIENTE'): PropuestaSim => ({
    id: `00000000-0000-4000-8000-00000000c0${n}0`, tipo: 'alineacion', pantallaId: null, titulo: 'Corregir 2 alertas de alineación', descripcion: CORRECCION.resumen,
    cambios: CORRECCION.patch, correcciones: CORRECCION.cambios, versionBase, estado, costoUsd: 0, creadoEn: '2026-11-12T18:00:00.000Z',
  });
  if (vencida) propuestas.unshift(nueva(9, 0, 'VENCIDA'));
  // El trabajo de la IA termina a la 2.ª consulta y deja una propuesta nueva con la versión actual.
  const consultas = new Map<string, number>();
  await page.route(`**/api/v1/cursos/${CURSO}/propuestas`, (r) => {
    if (r.request().method() === 'POST') {
      pedidos.push(r.request().postDataJSON());
      const id = `00000000-0000-4000-8000-00000000a0${pedidos.length}0`;
      consultas.set(id, 0);
      return r.fulfill({ status: 202, json: { id, estado: 'EN_COLA', eventos: '/api/v1/eventos' } });
    }
    return r.fulfill({ json: propuestas });
  });
  await page.route('**/api/v1/trabajos/*', (r) => {
    const id = r.request().url().split('/').at(-1)!;
    const n = (consultas.get(id) ?? 0) + 1;
    consultas.set(id, n);
    if (n === 2) propuestas.unshift(nueva(pedidos.length, version));
    return r.fulfill({ json: { id, tarea: 'IA-17', estado: n >= 2 ? 'COMPLETADO' : 'EN_CURSO', progreso: n >= 2 ? 100 : 50 } });
  });
  await page.route('**/api/v1/propuestas/*/*', (r) => {
    const [id, accion] = r.request().url().split('/').slice(-2);
    const p = propuestas.find((x) => x.id === id)!;
    if (accion === 'descartar') {
      p.estado = 'DESCARTADA';
      return r.fulfill({ status: 204 });
    }
    const { documento, afectadas } = aplicarCorreccion(doc, CORRECCION);
    doc = documento;
    version += 1;
    p.estado = 'APLICADA';
    return r.fulfill({ json: { version, regenerando: [], pantallasPorRevisar: afectadas } });
  });
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
  return { cambios, pedidos, propuestas };
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
  await expect(page.getByRole('button', { name: '✦ Proponer correcciones' })).toHaveCount(0);
  expect(cambios).toEqual([]);
});

test('CP-084 · «✦ Proponer correcciones» trae la propuesta; aplicarla deja 0 alertas y la pantalla 28 por revisar', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  const { pedidos, propuestas } = await simularAlineacion(page);
  await page.goto(URL_ALINEACION);
  await expect(page.locator('.alineacion-cifras')).toContainText('Alertas2');
  await page.getByRole('button', { name: '✦ Proponer correcciones' }).click();
  expect(pedidos).toEqual([{ tipo: 'alineacion' }]);
  await expect(page.getByRole('status').filter({ hasText: 'La IA está preparando la propuesta…' })).toBeVisible();

  const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
  await expect(franja.getByText('✦ Corregir 2 alertas de alineación')).toBeVisible();
  await expect(franja).toContainText('Agregar al Reto final (pantalla 28) dos preguntas');
  await expect(franja.getByRole('list', { name: 'Cambios propuestos' }).getByRole('listitem').locator('b')).toHaveText([
    'Pregunta nueva · obj-3 · aplicar · pantalla 28, pregunta bq-09',
    'Pregunta nueva · obj-2 · comprender · pantalla 28, pregunta bq-10',
  ]);
  await expect(page.getByRole('button', { name: '✦ Proponer correcciones' })).toHaveCount(0);
  expect(await auditar(page)).toEqual([]);

  await franja.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Propuesta aplicada · 0 alertas' })).toBeVisible();
  expect(propuestas[0]!.estado).toBe('APLICADA');
  await expect(franja).toHaveCount(0);
  await expect(page.locator('.alineacion-cifras')).toContainText('Alertas0');
  await expect(fila(page, 'obj-3').getByText('✓ Alineado')).toBeVisible();
  await expect(fila(page, 'obj-3').getByRole('list', { name: 'Evalúa obj-3' }).getByRole('button')).toHaveText(['28 · recordar', '28 · recordar', '28 · aplicar']);
  await expect(page.getByText('Todos los objetivos se presentan, se practican y se evalúan a su nivel.')).toBeVisible();
  await expect(page.getByText('La propuesta cambió la pantalla 28 (Reto final).')).toBeVisible();
  expect(await auditar(page)).toEqual([]);

  await page.getByRole('link', { name: '1 pantalla por revisar' }).click();
  await expect(page).toHaveURL(`/proyectos/${PROYECTO}/revision?pantalla=p28`);
  await expect(page.getByRole('complementary', { name: 'Pantallas' }).getByRole('button', { name: /Reto final/ })).toHaveAttribute('aria-current', 'true');
});

test('una propuesta vencida ofrece «Recalcular propuesta»; la nueva se puede descartar', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  const { pedidos, propuestas } = await simularAlineacion(page, { vencida: true });
  await page.goto(URL_ALINEACION);
  const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
  await expect(franja).toContainText('El curso cambió desde que se calculó esta propuesta.');
  await expect(franja.getByRole('button', { name: 'Aplicar' })).toHaveCount(0);
  await franja.getByRole('button', { name: 'Recalcular propuesta' }).click();
  expect(pedidos).toEqual([{ tipo: 'alineacion' }]);
  await expect(franja.getByRole('button', { name: 'Aplicar' })).toBeVisible();
  await franja.getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Propuesta descartada' })).toBeVisible();
  await expect(franja).toHaveCount(0);
  expect(propuestas[0]!.estado).toBe('DESCARTADA');
  await expect(page.getByRole('button', { name: '✦ Proponer correcciones' })).toBeVisible();
  await expect(page.locator('.alineacion-cifras')).toContainText('Alertas2');
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
