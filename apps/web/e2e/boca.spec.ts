// HU-0702 · Boca sincronizada (CP-072): Ana mueve la boca con las marcas mientras suena la narración, con un desfase
// menor a 100 ms, en la vista previa (reproductor único) y en Producción. «Siguiente» espera a la narración (SUP-32).
import { expect, type Page, test } from '@playwright/test';
import { ANA_SVG, cursoLoto, KIT_MINERA, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_VISTA = `/proyectos/${PROYECTO}/vista-previa`;
const PROYECTO_NUEVO = '/proyectos/00000000-0000-4000-8000-000000000702';

type Marca = [number, string];
type PantallaDoc = { id: string; narracion?: { porIdioma: { es: { recursoAudioId: string; duracionMs: number; bocas: Marca[] } } } };
const FORMAS = ['B', 'D', 'C', 'E', 'A', 'F', 'G', 'H', 'X'];

/** Marcas de 10 s: una forma distinta cada 90 a 200 ms, como una frase hablada. */
const marcasDiez = (): Marca[] => {
  const m: Marca[] = [];
  for (let t = 0, i = 0; t < 10_000; i++) {
    m.push([t, FORMAS[i % FORMAS.length]!]);
    t += 90 + ((i * 37) % 110);
  }
  m.push([10_000, 'X']);
  return m;
};

const bocaEn = (m: Marca[], ms: number) => {
  let r = 'X';
  for (const [t, b] of m) {
    if (t > ms) break;
    r = b;
  }
  return r;
};

/** El curso LOTO con Ana que verá la vista previa; `cambiar` lo ajusta antes de responder. Cada audio es silencio WAV. */
async function conCurso(page: Page, cambiar: (doc: Record<string, unknown>, pantallas: PantallaDoc[]) => void) {
  await page.route(`**/api/v1/proyectos/${PROYECTO}/curso`, async (route) => {
    const documento = cursoLoto();
    const pantallas = (documento.modulos as { capsulas: { pantallas: PantallaDoc[] }[] }[]).flatMap((m) => m.capsulas.flatMap((c) => c.pantallas));
    cambiar(documento, pantallas);
    const urlsRecursos: Record<string, string> = {};
    for (const p of pantallas) {
      const a = p.narracion?.porIdioma.es;
      if (a?.recursoAudioId) urlsRecursos[a.recursoAudioId] = `${new URL(route.request().url()).origin}/s3-simulado/audio-${a.duracionMs}.wav`;
    }
    await route.fulfill({ json: { id: 'c', proyectoId: PROYECTO, versionEsquema: '0.2.0', version: 1, documento, actualizadoEn: '2026-11-10T10:00:00.000Z', urlsRecursos, svgPersonajes: { 'svg-ana': ANA_SVG } } });
  });
}

/** Lee en el mismo instante el tiempo del audio y la boca visible, cada `cada` ms durante `duranteMs`. */
const muestrear = (page: Page, duranteMs: number, cada = 40) => page.evaluate(async ([durante, paso]) => {
  const raiz = [...document.querySelectorAll('*')].map((el) => el.shadowRoot).find((s) => s?.querySelector('.ap-r'))!;
  const audio = raiz.querySelector('audio')!;
  const muestras: [number, string][] = [];
  const fin = performance.now() + durante;
  while (performance.now() < fin && !audio.ended) {
    const svg = raiz.querySelector('.ap-personaje svg:not(.ap-silueta)');
    if (!audio.paused) muestras.push([audio.currentTime * 1000, svg?.getAttribute('data-boca') ?? '']);
    await new Promise((r) => setTimeout(r, paso));
  }
  return muestras;
}, [duranteMs, cada] as const);

test.describe('vista previa', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  });

  test('CP-072 · con una narración de 10 s la boca cambia según las marcas, con desfase menor a 100 ms', async ({ page }) => {
    const marcas = marcasDiez();
    await conCurso(page, (_doc, pantallas) => {
      const p03 = pantallas.find((p) => p.id === 'p03')!.narracion!.porIdioma.es;
      p03.duracionMs = 10_000;
      p03.bocas = marcas;
    });
    await page.goto(URL_VISTA);
    const siguiente = page.getByRole('button', { name: 'Siguiente', exact: true });
    await siguiente.click();
    await siguiente.click();
    // Ana se dibuja en línea con sus capas: en reposo, con una sola boca visible y la pose de la pantalla.
    const ana = page.locator('[data-pantalla="p03"] .ap-personaje svg:not(.ap-silueta)');
    await expect(ana).toHaveAttribute('data-boca', 'X');
    await expect(ana.locator('[id="boca_X"]')).toBeVisible();
    await expect(ana.locator('[id="boca_A"]')).toBeHidden();
    await expect(ana.locator('[id="pose_explicando"]')).toBeVisible();
    await expect(ana.locator('[id="pose_neutral"]')).toBeHidden();
    // El uniforme toma los colores del kit: no queda ningún color marcador.
    const marcado = await ana.evaluate((el) => el.outerHTML);
    expect(marcado).not.toMatch(/#(0000fe|00fe00|fe0000)\b/i);
    expect(marcado.toLowerCase()).toContain((KIT_MINERA.paleta as { primario: string }).primario.toLowerCase());

    await page.getByRole('button', { name: 'Escuchar narración' }).click();
    await expect(page.getByRole('button', { name: 'Pausar narración' })).toHaveAttribute('aria-pressed', 'true');
    const muestras = await muestrear(page, 9_500);
    expect(muestras.length).toBeGreaterThan(100);

    // Desfase: cuánto habría que mover el instante leído para que la boca visible sea la que toca.
    const desfases = muestras.map(([t, b]) => {
      for (let d = 0; d <= 300; d++) if (bocaEn(marcas, t - d) === b || bocaEn(marcas, t + d) === b) return d;
      return Infinity;
    });
    expect(Math.max(...desfases)).toBeLessThan(100);
    // Y de verdad se movió: recorrió casi todas las formas.
    expect(new Set(muestras.map(([, b]) => b)).size).toBeGreaterThanOrEqual(7);

    await page.getByRole('button', { name: 'Pausar narración' }).click();
    await expect(ana).toHaveAttribute('data-boca', 'X');
  });

  test('con «Siguiente se habilita al terminar la narración», se avanza al terminarla', async ({ page }) => {
    await conCurso(page, (doc, pantallas) => {
      (doc.navegacion as Record<string, unknown>).siguienteSeHabilita = 'narracion';
      pantallas.find((p) => p.id === 'p01')!.narracion!.porIdioma.es.duracionMs = 700;
    });
    await page.goto(URL_VISTA);
    const siguiente = page.getByRole('button', { name: 'Siguiente', exact: true });
    await expect(siguiente).toBeDisabled();
    await expect(page.getByText('Escucha la narración para continuar')).toBeVisible();
    await page.getByRole('button', { name: 'Escuchar narración' }).click();
    await expect(siguiente).toBeEnabled({ timeout: 5_000 });
    await expect(page.getByRole('button', { name: 'Escuchar narración' })).toHaveAttribute('aria-pressed', 'false');
  });

  test('sin audio en la pantalla no aparece «Escuchar narración» ni se bloquea el avance', async ({ page }) => {
    await conCurso(page, (doc, pantallas) => {
      (doc.navegacion as Record<string, unknown>).siguienteSeHabilita = 'narracion';
      delete (pantallas[0]!.narracion!.porIdioma.es as Partial<{ recursoAudioId: string }>).recursoAudioId;
    });
    await page.goto(URL_VISTA);
    await expect(page.getByRole('button', { name: 'Siguiente', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Escuchar narración' })).toBeHidden();
  });
});

test('Producción: al escuchar una narración, Ana la dice al lado con la boca en movimiento', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  // El proyecto recién generado recibe el curso LOTO con Ana (sus marcas de boca vienen de la etapa 7).
  await page.route('**/api/v1/proyectos/00000000-0000-4000-8000-000000000702/curso', (route) => route.fulfill({
    json: { id: 'c', proyectoId: 'x', versionEsquema: '0.2.0', version: 1, documento: cursoLoto(), actualizadoEn: '2026-11-10T10:00:00.000Z', urlsRecursos: {}, svgPersonajes: { 'svg-ana': ANA_SVG } },
  }));
  await page.goto(PROYECTO_NUEVO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('O escribe solo el tema', { exact: false }).fill('Bloqueo y etiquetado');
  await material.getByRole('button', { name: 'Agregar tema' }).click();
  const gen = page.getByRole('region', { name: 'Generación del SCORM' });
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  const voz = gen.getByRole('listitem', { name: 'Voz en español' });
  await expect(voz).toContainText('30 narraciones listas ·', { timeout: 40_000 });
  await voz.getByRole('button', { name: 'Escuchar narraciones' }).click();
  const ana = voz.getByRole('img', { name: 'Ana, la narradora' });
  await expect(ana.locator('svg')).toHaveAttribute('data-boca', 'X');
  await expect(voz.getByText('Elige una narración para escucharla con Ana')).toBeVisible();

  await voz.getByLabel('Escuchar la narración de p03').evaluate((a: HTMLAudioElement) => a.play());
  await expect(voz.getByText('Narrando p03')).toBeVisible();
  // Durante la narración la boca pasa por varias formas y al terminar vuelve al reposo.
  const vistas = await ana.locator('svg').evaluate(async (svg) => {
    const formas = new Set<string>();
    for (let i = 0; i < 40; i++) {
      formas.add(svg.getAttribute('data-boca') ?? '');
      await new Promise((r) => setTimeout(r, 50));
    }
    return [...formas];
  });
  expect(vistas.length).toBeGreaterThanOrEqual(4);
  await expect(ana.locator('svg')).toHaveAttribute('data-boca', 'X', { timeout: 10_000 });
});
