// HU-1104 · Patrón de navegación con IA (PNT-17, CP-088, REQ-048). Diseño instruccional describe «tablero de misiones de
// seguridad» y pide «✦ Crear con IA»: la franja «✦ Propuesta de la IA» trae el motivo y la miniatura de la base (Mapa)
// con la marca ✦ y el marcador; al aplicarlo queda la tarjeta «Personalizado» con su nombre y «✦ IA», y la vista previa
// muestra el mapa con el marcador de puntos flotante. «✦ Recomendar» trae Historias con la alternativa Clásico, que se
// prueba sin guardar. PNT-17 con la franja y la vista previa del personalizado pasan axe WCAG 2.2 A/AA.
import { readFileSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { cursoLoto, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const CURSO = '00000000-0000-4000-8000-000000000990';
const URL_NAVEGACION = `/proyectos/${PROYECTO}/navegacion`;
const URL_VISTA = `/proyectos/${PROYECTO}/vista-previa`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
type Salida = { recomendado: { patron: string; motivo: string }; alternativa: { patron: string; motivo: string }; navegacion: Record<string, unknown> };
const leer = (archivo: string) => JSON.parse(readFileSync(new URL(`../../../packages/ai/casos/loto/salidas/${archivo}`, import.meta.url), 'utf8')) as Salida;
const CREADO = leer('X-IA-14-patron-tablero.json');
const RECOMENDADO = leer('04-IA-14-navegacion.json');

/**
 * Navegación, propuestas de tipo `patron`, trabajos (terminan a la 2.ª consulta) y aplicar/descartar, como la API: al
 * aplicar solo cambian `patron` y `patronPersonalizado`, con una versión nueva.
 */
async function simularPatron(page: Page) {
  let nav: Record<string, unknown> = { ...(cursoLoto().navegacion as Record<string, unknown>) };
  let version = 1;
  const pedidos: Record<string, unknown>[] = [];
  const propuestas: Record<string, unknown>[] = [];
  const consultas = new Map<string, number>();
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL', navegacionCurso: () => nav });
  await page.route(`**/api/v1/cursos/${CURSO}/navegacion`, (r) => r.fulfill({ json: { ...nav, version, patronPreferido: null, patronPreferidoDelCliente: false, hayKit: true } }));
  await page.route(`**/api/v1/cursos/${CURSO}/propuestas`, (r) => {
    if (r.request().method() === 'POST') {
      const pedido = r.request().postDataJSON() as Record<string, unknown>;
      pedidos.push(pedido);
      const id = `00000000-0000-4000-8000-00000000b0${pedidos.length}0`;
      consultas.set(id, 0);
      return r.fulfill({ status: 202, json: { id, estado: 'EN_COLA', eventos: '/api/v1/eventos' } });
    }
    return r.fulfill({ json: propuestas });
  });
  await page.route('**/api/v1/trabajos/*', (r) => {
    const id = r.request().url().split('/').at(-1)!;
    const n = (consultas.get(id) ?? 0) + 1;
    consultas.set(id, n);
    if (n === 2) {
      const pedido = pedidos.at(-1)!;
      const crear = pedido.modo === 'crear';
      const s = crear ? CREADO : RECOMENDADO;
      propuestas.unshift({
        id: `00000000-0000-4000-8000-00000000c0${pedidos.length}0`, tipo: 'patron', pantallaId: null,
        titulo: crear ? 'Patrón nuevo: Tablero de misiones de seguridad' : 'Recomendado: Historias', descripcion: s.recomendado.motivo, cambios: [],
        patron: { modo: pedido.modo, navegacion: s.navegacion, recomendado: s.recomendado, alternativa: s.alternativa, descripcion: crear ? pedido.descripcion : null },
        versionBase: version, estado: 'PENDIENTE', costoUsd: 0.02, creadoEn: '2026-11-12T18:00:00.000Z',
      });
    }
    return r.fulfill({ json: { id, tarea: 'IA-14', estado: n >= 2 ? 'COMPLETADO' : 'EN_CURSO', progreso: n >= 2 ? 100 : 50 } });
  });
  await page.route('**/api/v1/propuestas/*/*', (r) => {
    const [id, accion] = r.request().url().split('/').slice(-2);
    const p = propuestas.find((x) => x.id === id)!;
    if (accion === 'descartar') {
      p.estado = 'DESCARTADA';
      return r.fulfill({ status: 204 });
    }
    const propuesto = (p.patron as { navegacion: Record<string, unknown> }).navegacion;
    const { patronPersonalizado: _fuera, ...resto } = nav;
    nav = { ...resto, patron: propuesto.patron, ...(propuesto.patronPersonalizado ? { patronPersonalizado: propuesto.patronPersonalizado } : {}) };
    version += 1;
    p.estado = 'APLICADA';
    return r.fulfill({ json: { version, regenerando: [] } });
  });
  return { pedidos, nav: () => nav };
}

async function auditar(page: Page, zona = 'main') {
  const { violations } = await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}
const tarjeta = (page: Page, nombre: string) => page.getByRole('group', { name: 'Patrón de navegación' }).getByRole('button', { name: new RegExp(`^${nombre}`) });
const franja = (page: Page) => page.getByRole('region', { name: 'Propuesta de la IA' });

test('CP-088 · «tablero de misiones de seguridad» con «✦ Crear con IA»: franja con miniatura, aplicar y la vista previa con el mapa y el marcador flotante', async ({ page }) => {
  const { pedidos, nav } = await simularPatron(page);
  await page.goto(URL_NAVEGACION);
  await expect(tarjeta(page, 'Historias')).toHaveAttribute('aria-pressed', 'true');
  // Sin descripción no se pide nada.
  await page.getByRole('button', { name: '✦ Crear con IA' }).click();
  await expect(page.getByRole('alert')).toHaveText('Describe cómo quieres el patrón para crearlo con IA.');
  expect(pedidos).toEqual([]);

  await page.getByRole('textbox', { name: 'Describe un patrón' }).fill('tablero de misiones de seguridad');
  await page.getByRole('button', { name: '✦ Crear con IA' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'La IA está preparando la propuesta…' })).toBeVisible();
  const f = franja(page);
  await expect(f.getByText('✦ Patrón nuevo: Tablero de misiones de seguridad')).toBeVisible();
  expect(pedidos).toEqual([{ tipo: 'patron', modo: 'crear', descripcion: 'tablero de misiones de seguridad' }]);
  await expect(f.getByText(CREADO.recomendado.motivo)).toBeVisible();
  // La miniatura de la base (Mapa) con la marca ✦ y el marcador; en modo crear no hay bloque de alternativa.
  const miniatura = f.locator('.patron-miniatura');
  await expect(miniatura).toHaveAttribute('data-patron', 'mapa');
  await expect(miniatura).toHaveAttribute('data-marcador', 'true');
  await expect(miniatura.locator('.patron-miniatura-ia')).toHaveText('✦');
  await expect(f.getByRole('link', { name: 'Probar alternativa' })).toHaveCount(0);
  expect(await auditar(page)).toEqual([]);

  await f.getByRole('button', { name: 'Aplicar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Patrón aplicado · versión 2 del curso' })).toBeVisible();
  await expect(franja(page)).toHaveCount(0);
  // Solo cambió el patrón: las reglas y los elementos visibles de LOTO quedan (RN-11-1).
  expect(nav()).toMatchObject({ patron: 'personalizado', modo: 'condiciones', reanudar: 'preguntar', mostrar: ['progreso', 'temario', 'puntos', 'idioma', 'accesibilidad'] });
  const propia = tarjeta(page, 'Tablero de misiones de seguridad');
  await expect(propia).toHaveAttribute('aria-pressed', 'true');
  await expect(propia.getByText('✦ IA')).toBeVisible();
  await expect(propia.getByText('Creado con IA desde tu descripción')).toBeVisible();
  await expect(page.getByRole('heading', { level: 2, name: 'Elegido: Tablero de misiones de seguridad' })).toBeVisible();
  await expect(page.getByRole('radio', { name: /Libre con actividades obligatorias/ })).toBeChecked();

  // La vista previa del personalizado: el mapa con sus 3 estaciones y el marcador de puntos flotante.
  await page.getByRole('link', { name: '▶ Probar este patrón' }).click();
  await expect(page).toHaveURL(`${URL_VISTA}?patron=personalizado&modo=condiciones`);
  await expect(page.getByText('Así se verá en el LMS con el patrón «Tablero de misiones de seguridad» y la regla «actividades obligatorias».')).toBeVisible();
  const r = page.locator('.vista-previa-reproductor');
  await expect(r.locator('[data-patron="mapa"][data-marcador="true"]')).toBeVisible();
  await expect(r.getByRole('heading', { level: 2, name: 'Tu ruta de misiones' })).toBeVisible();
  await expect(r.getByRole('button', { name: /^Misión \d:/ })).toHaveCount(3);
  await expect(r.locator('.ap-hud .ap-puntos')).toBeVisible();
  await r.getByRole('button', { name: /^Misión 1:/ }).click();
  await expect(page.getByLabel('Seguimiento simulado').getByText('1 de 30', { exact: true })).toBeVisible();
  await expect(r.locator('.ap-hud .ap-puntos')).toBeVisible();
  expect(await auditar(page)).toEqual([]);
});

test('«✦ Recomendar» trae Historias con la alternativa Clásico y su motivo; «Probar alternativa» la muestra sin guardar; descartar', async ({ page }) => {
  const { pedidos, nav } = await simularPatron(page);
  await page.goto(URL_NAVEGACION);
  await page.getByRole('button', { name: '✦ Recomendar' }).click();
  const f = franja(page);
  await expect(f.getByText('✦ Recomendado: Historias')).toBeVisible();
  expect(pedidos).toEqual([{ tipo: 'patron', modo: 'recomendar' }]);
  await expect(f.getByText(RECOMENDADO.recomendado.motivo)).toBeVisible();
  await expect(f.locator('.patron-miniatura')).toHaveAttribute('data-patron', 'historias');
  await expect(f.getByText('Alternativa: Clásico')).toBeVisible();
  await expect(f.getByText(RECOMENDADO.alternativa.motivo)).toBeVisible();
  expect(await auditar(page)).toEqual([]);

  await f.getByRole('link', { name: 'Probar alternativa' }).click();
  await expect(page).toHaveURL(`${URL_VISTA}?patron=clasico&modo=condiciones`);
  await expect(page.getByText('Así se verá en el LMS con el patrón «Clásico» y la regla «actividades obligatorias».')).toBeVisible();
  await expect(page.getByText('Probando sin guardar.')).toBeVisible();
  await expect(page.locator('.vista-previa-reproductor').locator('[data-patron="clasico"]')).toBeVisible();

  // De vuelta, la propuesta sigue pendiente; se descarta sin tocar el curso.
  await page.goto(URL_NAVEGACION);
  await franja(page).getByRole('button', { name: 'Descartar' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Propuesta descartada' })).toBeVisible();
  await expect(franja(page)).toHaveCount(0);
  expect(nav().patron).toBe('historias');
});
