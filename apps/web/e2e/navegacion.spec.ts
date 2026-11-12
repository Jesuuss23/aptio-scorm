// HU-1103 · Patrones de navegación (PNT-17, M11, CP-087). Diseño instruccional elige Historias con regla secuencial, la
// marca como preferida del cliente y la prueba: zonas laterales ‹ ›, teclado y botones avanzan; la actividad de p07 y el
// orden no se saltan (RN-11-1, RN-11-4). Clásico, Historias y Mapa se ven bien en escritorio y celular, y PNT-17 y la
// vista previa con cada patrón pasan axe WCAG 2.2 A/AA sin violaciones. Diseño gráfico solo ve la configuración.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { cursoLoto, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const CURSO = '00000000-0000-4000-8000-000000000990';
const URL_NAVEGACION = `/proyectos/${PROYECTO}/navegacion`;
const URL_VISTA = `/proyectos/${PROYECTO}/vista-previa`;
const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const PATRONES = ['clasico', 'historias', 'vertical', 'mapa', 'hub', 'ramificado', 'inmersivo'] as const;

/** GET y PUT de /navegacion sobre la `navegacion` de LOTO, con versión, 409 y el preferido del kit. */
async function simularNavegacion(page: Page) {
  let nav = { ...(cursoLoto().navegacion as Record<string, unknown>) };
  let version = 1;
  let preferido: string | null = null;
  const pedidos: Record<string, unknown>[] = [];
  const respuesta = () => ({ ...nav, version, patronPreferido: preferido, patronPreferidoDelCliente: preferido === nav.patron, hayKit: true });
  await page.route(`**/api/v1/cursos/${CURSO}/navegacion`, (r) => {
    if (r.request().method() === 'PUT') {
      const { version: leida, patronPreferidoDelCliente, ...campos } = r.request().postDataJSON() as Record<string, unknown>;
      pedidos.push({ version: leida, patronPreferidoDelCliente, ...campos });
      if (leida !== version) return r.fulfill({ status: 409, json: { codigo: 'VERSION_CAMBIO', mensaje: 'Otra persona guardó cambios en el curso. Recarga para ver la última versión.' } });
      nav = { ...nav, ...campos };
      version += 1;
      if (patronPreferidoDelCliente) preferido = nav.patron as string;
    }
    return r.fulfill({ json: respuesta() });
  });
  return { pedidos };
}

async function auditar(page: Page, zona = 'main') {
  const { violations } = await new AxeBuilder({ page }).include(zona).withTags(REGLAS).analyze();
  return violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
}

const reproductor = (page: Page) => page.locator('.vista-previa-reproductor');
const enPantalla = (page: Page, n: number) => expect(page.getByLabel('Seguimiento simulado').getByText(`${n} de 30`, { exact: true })).toBeVisible();
const tarjeta = (page: Page, nombre: string) => page.getByRole('group', { name: 'Patrón de navegación' }).getByRole('button', { name: new RegExp(`^${nombre}`) });

test('CP-087 · Historias + Secuencial: se guarda como preferido y en la prueba avanza con zonas, teclado y botones sin saltar la actividad ni el orden', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  const { pedidos } = await simularNavegacion(page);
  await page.goto(`/proyectos/${PROYECTO}`);
  await page.getByRole('link', { name: 'Navegación' }).click();
  await expect(page).toHaveURL(URL_NAVEGACION);
  await expect(page.getByRole('heading', { level: 1, name: 'Navegación' })).toBeVisible();
  // Las 7 tarjetas con su miniatura; LOTO ya pide Historias con actividades obligatorias.
  await expect(page.getByRole('group', { name: 'Patrón de navegación' }).getByRole('button')).toHaveCount(7);
  await expect(page.locator('.patron-tarjeta .patron-miniatura')).toHaveCount(7);
  await expect(tarjeta(page, 'Historias')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('radio', { name: /Libre con actividades obligatorias/ })).toBeChecked();
  await expect(page.getByRole('radio', { name: /Al volver: preguntar/ })).toBeChecked();
  // Glosario, ayuda y accesibilidad llegan después; «✦ Recomendar» y «✦ Crear con IA» van con la HU-1104.
  for (const x of ['Glosario', 'Ayuda', 'Accesibilidad']) await expect(page.getByRole('checkbox', { name: x })).toBeDisabled();
  await expect(page.getByRole('checkbox', { name: 'Temario' })).toBeEnabled();
  await expect(page.getByText('llega después')).toHaveCount(3);
  await expect(page.getByRole('button', { name: /Recomendar|Crear con IA/ })).toHaveCount(0);
  expect(await auditar(page)).toEqual([]);

  // Secuencial y preferido del cliente: se guarda con la versión leída y la tarjeta queda marcada.
  await page.getByRole('radio', { name: /^Secuencial/ }).check();
  await page.getByRole('checkbox', { name: 'Pantalla X de Y' }).check();
  await page.getByRole('checkbox', { name: 'Usar como preferido del cliente' }).check();
  await page.getByRole('button', { name: 'Guardar navegación' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Navegación guardada · versión 2 del curso' })).toBeVisible();
  expect(pedidos).toEqual([{ version: 1, patron: 'historias', modo: 'secuencial', reanudar: 'preguntar', mostrar: ['progreso', 'temario', 'puntos', 'idioma', 'accesibilidad', 'contador'], patronPreferidoDelCliente: true }]);
  await expect(tarjeta(page, 'Historias').getByText('Preferido del cliente')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Guardar navegación' })).toBeDisabled();
  expect(await auditar(page)).toEqual([]);

  // «▶ Probar este patrón» abre la vista previa con Historias y Secuencial.
  await page.getByRole('link', { name: '▶ Probar este patrón' }).click();
  await expect(page).toHaveURL(`${URL_VISTA}?patron=historias&modo=secuencial`);
  await expect(page.getByText('Así se verá en el LMS con el patrón «Historias» y la regla «secuencial».')).toBeVisible();
  const r = reproductor(page);
  await expect(r.locator('.ap-segmentos i')).toHaveCount(30);
  await expect(r.locator('.ap-pie')).toHaveCount(0);
  const siguiente = r.getByRole('button', { name: 'Siguiente' });
  const anterior = r.getByRole('button', { name: 'Anterior' });
  await expect(siguiente).toHaveClass(/ap-zona-der/);
  // Zona derecha, flecha derecha y zona izquierda.
  await siguiente.click();
  await enPantalla(page, 2);
  await r.getByRole('heading', { level: 2 }).press('ArrowRight');
  await enPantalla(page, 3);
  await anterior.click();
  await enPantalla(page, 2);
  await expect(r.locator('.ap-segmentos i.ap-visto')).toHaveCount(3);
  // En orden: desde el temario no se salta más allá de la siguiente de la más lejana.
  await r.getByRole('button', { name: 'Temario' }).click();
  const temario = r.getByRole('navigation', { name: 'Temario' });
  await expect(temario.getByRole('button', { name: /^4\. / })).toBeEnabled();
  await expect(temario.getByRole('button', { name: /^5\. .*bloqueada$/ })).toBeDisabled();
  await temario.getByRole('button', { name: 'Cerrar' }).click();
  for (let n = 3; n <= 7; n++) {
    await siguiente.click();
    await enPantalla(page, n);
  }
  // La actividad de p07 no se salta por ningún camino y se dice por qué (RN-11-4).
  await expect(siguiente).toBeDisabled();
  await expect(siguiente).toHaveAccessibleDescription('Completa la actividad para continuar');
  await expect(r.getByRole('status').filter({ hasText: 'Completa la actividad para continuar' })).toBeVisible();
  await r.getByRole('heading', { level: 2 }).press('ArrowRight');
  await enPantalla(page, 7);
  expect(await auditar(page)).toEqual([]);
  await expect(page.getByText('Probando sin guardar.')).toBeVisible();
});

for (const [dispositivo, ancho] of [['Escritorio', 1024], ['Celular', 360]] as const) {
  test(`Clásico, Historias y Mapa se ven y se recorren en ${dispositivo.toLowerCase()} sin desbordar`, async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true });
    for (const patron of ['clasico', 'historias', 'mapa'] as const) {
      await page.goto(`${URL_VISTA}?patron=${patron}`);
      await page.getByRole('button', { name: dispositivo, exact: true }).click();
      const r = reproductor(page);
      await expect(r.locator(`[data-patron="${patron}"]`)).toBeVisible();
      expect((await r.boundingBox())!.width).toBeLessThanOrEqual(ancho);
      if (patron === 'mapa') {
        // Tres estaciones (una por sección de LOTO); la segunda espera las actividades de la primera.
        await expect(r.getByRole('heading', { level: 2, name: 'Tu ruta de misiones' })).toBeVisible();
        await expect(r.getByRole('button', { name: /^Misión \d:/ })).toHaveCount(3);
        await expect(r.getByRole('button', { name: /^Misión 2:.*bloqueada$/ })).toBeDisabled();
        await r.getByRole('button', { name: /^Misión 1:/ }).click();
        await enPantalla(page, 1);
        await r.getByRole('button', { name: 'Siguiente' }).click();
        await enPantalla(page, 2);
        await r.getByRole('button', { name: 'Mapa', exact: true }).click();
        await expect(r.getByRole('button', { name: /^Misión 1: Bloqueo y etiquetado ?, 2 de 11 pantallas/ })).toBeVisible();
      } else {
        await enPantalla(page, 1);
        await r.getByRole('button', { name: 'Siguiente' }).click();
        await enPantalla(page, 2);
      }
      const sinDesborde = await r.evaluate((el) => {
        const raiz = el.shadowRoot!.querySelector('.ap-r')!;
        return raiz.scrollWidth <= raiz.clientWidth;
      });
      expect(sinDesborde, patron).toBe(true);
    }
  });
}

test('la vista previa con cada uno de los 7 patrones pasa axe WCAG 2.2 A/AA', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const resultados: Record<string, string[]> = {};
  for (const patron of PATRONES) {
    await page.goto(`${URL_VISTA}?patron=${patron}`);
    await expect(reproductor(page).locator(`[data-patron="${patron}"]`)).toBeVisible();
    resultados[patron] = await auditar(page);
  }
  expect(resultados).toEqual(Object.fromEntries(PATRONES.map((p) => [p, []])));
});

test('diseño gráfico ve la navegación sin poder cambiarla', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  await simularNavegacion(page);
  await page.goto(URL_NAVEGACION);
  await expect(page.getByText('Solo lectura: administración y diseño instruccional cambian la navegación.')).toBeVisible();
  await expect(tarjeta(page, 'Mapa de misiones')).toBeDisabled();
  await expect(page.getByRole('radio', { name: /^Secuencial/ })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardar navegación' })).toHaveCount(0);
  // Probar sí se puede.
  await expect(page.getByRole('link', { name: '▶ Probar este patrón' })).toBeVisible();
  expect(await auditar(page)).toEqual([]);
});
