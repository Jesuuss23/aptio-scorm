// HU-0501 y HU-0502 · Revisión (PNT-20): filtro (CP-046), origen (CP-047), aprobar por lote (CP-048) y una aprobada que
// cambia vuelve a borrador (CP-049). HU-0503 · corregir la narración regenera voz, boca y subtítulos (CP-050).
// HU-0504 · propuestas de la IA: aplicar y deshacer (CP-052) y propuesta vencida (CP-053).
// HU-0604 · los retoques del editor sobreviven a la IA (CP-059).
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const CURSO_ID = '00000000-0000-4000-8000-000000000990';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_REVISION = `/proyectos/${PROYECTO}/revision`;

const lista = (page: Page) => page.getByRole('complementary', { name: 'Pantallas' }).getByRole('listitem');
const elegir = (page: Page, titulo: string) => page.getByRole('complementary', { name: 'Pantallas' }).getByRole('button', { name: new RegExp(titulo) }).click();
const cifra = (page: Page, nombre: string) => page.getByLabel('Resumen de la revisión').locator('div').filter({ hasText: nombre }).locator('dd');

test.describe('con el diseñador instruccional', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  });

  test('desde el proyecto se abre la revisión con la pantalla en el centro', async ({ page }) => {
    await page.goto(`/proyectos/${PROYECTO}`);
    await page.getByRole('link', { name: 'Revisión' }).click();
    await expect(page).toHaveURL(URL_REVISION);
    await expect(page.getByRole('heading', { level: 1, name: 'Revisión' })).toBeVisible();
    await expect(lista(page)).toHaveCount(30);
    await expect(cifra(page, 'Aprobadas')).toHaveText('0 / 30');
    await expect(cifra(page, 'Con observaciones')).toHaveText('3');
    // La pantalla se dibuja con el reproductor, sin la barra ni los botones del participante.
    const escenario = page.locator('.revision-reproductor');
    await expect(escenario.getByRole('heading', { level: 2, name: 'Bloqueo y etiquetado' })).toBeVisible();
    await expect(escenario.getByRole('button', { name: 'Siguiente' })).toBeHidden();
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await expect(page.getByRole('region', { name: 'Pantalla p02' })).toBeVisible();
  });

  test('CP-046 · el filtro «Revisar» deja solo las 3 pantallas con observaciones', async ({ page }) => {
    await page.goto(URL_REVISION);
    await page.getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'Revisar (3)' }).click();
    await expect(lista(page)).toHaveCount(3);
    await expect(lista(page).filter({ hasText: '1 obs.' })).toHaveCount(3);
    await page.getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'Actividades' }).click();
    await expect(lista(page)).toHaveCount(9);
  });

  test('CP-047 · una pantalla tomada del manual muestra «Manual p. 12»; una de la IA lo dice', async ({ page }) => {
    await page.goto(URL_REVISION);
    await elegir(page, 'Apagado no es lo mismo que seguro');
    const origen = page.getByRole('region', { name: 'Origen' });
    await expect(origen.getByText('Manual p. 12', { exact: true })).toBeVisible();
    await expect(origen.getByText('tomado del material del cliente')).toBeVisible();
    await elegir(page, 'Al terminar podrás');
    await expect(origen.getByText('Redactado por la IA', { exact: true })).toBeVisible();
  });

  test('CP-048 · «Aprobar todas las que no tienen observaciones» deja 27 aprobadas y 3 pendientes', async ({ page }) => {
    await page.goto(URL_REVISION);
    await page.getByRole('button', { name: 'Aprobar todas las que no tienen observaciones' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se aprobaron 27 pantallas; quedan 3 pendientes por sus observaciones.' })).toBeVisible();
    await expect(cifra(page, 'Aprobadas')).toHaveText('27 / 30');
    await expect(lista(page).filter({ hasText: 'Aprobada' })).toHaveCount(27);
    // RN-05-1: la pantalla con una observación que bloquea no se puede aprobar.
    await page.getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'Revisar (3)' }).click();
    await lista(page).filter({ hasText: /^20/ }).getByRole('button').click();
    await expect(page.getByRole('region', { name: 'Control de calidad' }).getByText('Falta el texto alternativo de la escena')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprobar pantalla' })).toBeDisabled();
    await expect(page.getByText('Resuelve antes la observación que bloquea la entrega.')).toBeVisible();
    // Una con solo un aviso sí.
    await lista(page).filter({ hasText: /^05/ }).getByRole('button').click();
    await page.getByRole('button', { name: 'Aprobar pantalla' }).click();
    await expect(cifra(page, 'Aprobadas')).toHaveText('28 / 30');
    await expect(page.getByRole('button', { name: 'Aprobada', exact: true })).toBeDisabled();
  });

  test('CP-049 · editar el título de una pantalla aprobada la devuelve a borrador', async ({ page }) => {
    await page.goto(URL_REVISION);
    await page.getByRole('button', { name: 'Aprobar todas las que no tienen observaciones' }).click();
    await expect(cifra(page, 'Aprobadas')).toHaveText('27 / 30');
    await elegir(page, 'Apagado no es lo mismo que seguro');
    const textos = page.getByRole('region', { name: 'Textos' });
    await expect(textos.getByText('Está aprobada: al guardar vuelve a borrador.')).toBeVisible();
    await textos.getByLabel('Título en pantalla').fill('Energía peligrosa en planta');
    await textos.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados. La pantalla volvió a borrador: apruébala de nuevo cuando esté lista.')).toBeVisible();
    await expect(cifra(page, 'Aprobadas')).toHaveText('26 / 30');
    const centro = page.getByRole('region', { name: 'Pantalla p04' });
    await expect(centro.getByRole('heading', { level: 2, name: 'Energía peligrosa en planta' }).first()).toBeVisible();
    await expect(centro.getByText('Borrador', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprobar pantalla' })).toBeEnabled();
  });

  test('CP-050 · corregir la narración muestra la voz, la boca y los subtítulos regenerándose hasta quedar listos', async ({ page }) => {
    await page.goto(URL_REVISION);
    await elegir(page, 'Apagado no es lo mismo que seguro');
    const textos = page.getByRole('region', { name: 'Textos' });
    await textos.getByLabel('Narración').fill('Apagar la máquina no la deja segura: bloquea cada fuente de energía.');
    await textos.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByText('Cambios guardados. Se regeneran su voz, su boca y sus subtítulos en español.')).toBeVisible();
    const chips = page.getByRole('region', { name: 'Regeneración' }).getByRole('listitem');
    await expect(chips).toHaveText(['Voz ES: Regenerando…', 'Boca: Regenerando…', 'Subtítulos ES: Regenerando…']);
    await expect(chips.first()).toHaveText('Voz ES: Lista', { timeout: 10_000 });
    await expect(chips).toHaveText(['Voz ES: Lista', 'Boca: Lista', 'Subtítulos ES: Lista'], { timeout: 10_000 });
    await expect(chips.filter({ hasText: 'Lista' })).toHaveClass(Array(3).fill(/validado/));
    // Cambiar solo el título no regenera nada.
    await elegir(page, 'Bloqueo y etiquetado');
    await textos.getByLabel('Título en pantalla').fill('Bloqueo y etiquetado en planta');
    await textos.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(page.getByRole('status').filter({ hasText: /^Cambios guardados\.$/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Regeneración' })).toHaveCount(0);
  });

  test('CP-052 · «Más visual» se aplica, cambia la pantalla y Deshacer la revierte', async ({ page }) => {
    await page.goto(URL_REVISION);
    await elegir(page, '¿Qué es la energía peligrosa?');
    const ia = page.getByRole('region', { name: 'Ajustar con IA' });
    await expect(ia.getByRole('button', { name: '✦ Otra ilustración' })).toBeDisabled();
    await ia.getByRole('button', { name: '✦ Más visual' }).click();
    await expect(ia.getByText('La IA está preparando la propuesta…')).toBeVisible();
    const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
    await expect(franja.getByText('✦ Más visual')).toBeVisible({ timeout: 10_000 });
    await expect(franja.getByText(/Cambia el párrafo por un dato grande/)).toBeVisible();
    const escena = page.locator('.revision-reproductor');
    await expect(escena.getByText('Es cualquier energía que puede mover, calentar o liberar algo de forma inesperada mientras trabajas en un equipo.')).toBeVisible();

    await franja.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Propuesta aplicada: «Más visual». La pantalla volvió a borrador.' })).toBeVisible();
    await expect(franja).toHaveCount(0);
    await expect(escena.getByText('Mueve, calienta o descarga')).toBeVisible();
    await expect(escena.getByText('Es cualquier energía que puede mover, calentar o liberar algo de forma inesperada mientras trabajas en un equipo.')).toHaveCount(0);

    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se deshizo la propuesta.' })).toBeVisible();
    await expect(escena.getByText('Es cualquier energía que puede mover, calentar o liberar algo de forma inesperada mientras trabajas en un equipo.')).toBeVisible();
    await expect(escena.getByText('Mueve, calienta o descarga')).toHaveCount(0);
  });

  test('«Ver 3 variantes» muestra la elegida en la pantalla antes de aplicarla', async ({ page }) => {
    await page.goto(URL_REVISION);
    await elegir(page, '¿Qué es la energía peligrosa?');
    await page.getByRole('region', { name: 'Ajustar con IA' }).getByRole('button', { name: '✦ Ver 3 variantes' }).click();
    const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
    await expect(franja.getByRole('group', { name: 'Variantes' }).getByRole('button')).toHaveText(['Variante 1 · Lista con íconos', 'Variante 2 · Dato grande', 'Variante 3 · Ana lo explica'], { timeout: 10_000 });
    await expect(franja.getByRole('button', { name: 'Aplicar esta variante' })).toBeDisabled();
    await franja.getByRole('button', { name: 'Variante 1 · Lista con íconos' }).click();
    const escena = page.locator('.revision-reproductor');
    await expect(escena.getByText('Calienta:')).toBeVisible();
    await franja.getByRole('button', { name: 'Variante 3 · Ana lo explica' }).click();
    await expect(escena.getByText('Es la que puede moverse, calentarse o descargarse cuando no lo esperas.')).toBeVisible();
    await expect(escena.getByText('Calienta:')).toHaveCount(0);
    await franja.getByRole('button', { name: 'Aplicar esta variante' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Propuesta aplicada: «Ver 3 variantes».' })).toBeVisible();
    await expect(escena.getByText('Es la que puede moverse, calentarse o descargarse cuando no lo esperas.')).toBeVisible();
  });

  test('CP-053 · si la pantalla cambió, la propuesta ofrece «Recalcular propuesta»; descartar la quita', async ({ page }) => {
    await page.goto(URL_REVISION);
    await elegir(page, '¿Qué es la energía peligrosa?');
    await page.getByRole('region', { name: 'Ajustar con IA' }).getByRole('button', { name: '✦ Menos texto' }).click();
    const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
    await expect(franja.getByText('✦ Menos texto')).toBeVisible({ timeout: 10_000 });
    const textos = page.getByRole('region', { name: 'Textos' });
    await textos.getByLabel('Título en pantalla').fill('La energía peligrosa');
    await textos.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(franja.getByText('La pantalla cambió desde que se calculó esta propuesta.')).toBeVisible();
    await expect(franja.getByRole('button', { name: 'Aplicar' })).toHaveCount(0);
    await franja.getByRole('button', { name: 'Recalcular propuesta' }).click();
    await expect(franja.getByRole('button', { name: 'Aplicar' })).toBeVisible({ timeout: 10_000 });
    await expect(franja.getByText(/Acorta el párrafo/)).toBeVisible();
    await franja.getByRole('button', { name: 'Descartar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Propuesta descartada.' })).toBeVisible();
    await expect(franja).toHaveCount(0);
  });

  test('sin cambios no se guarda; sin pantallas se explica qué hacer', async ({ page }) => {
    await page.goto(URL_REVISION);
    await expect(page.getByRole('button', { name: 'Guardar cambios' })).toBeDisabled();
    await page.goto('/proyectos/00000000-0000-4000-8000-000000000702/revision');
    await expect(page.getByText(/Este proyecto aún no tiene pantallas/)).toBeVisible();
  });
});

test('el productor edita pero no aprueba', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR' });
  await page.goto(URL_REVISION);
  await expect(page.getByLabel('Título en pantalla')).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Aprobar pantalla' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Aprobar todas las que no tienen observaciones' })).toHaveCount(0);
});

test('el revisor del cliente solo mira', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' });
  await page.goto(URL_REVISION);
  await expect(page.getByLabel('Título en pantalla')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Guardar cambios' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Ajustar con IA' })).toHaveCount(0);
});

test('HU-0504 · si la IA no puede preparar la propuesta, se explica y no aparece la franja', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', propuestaFalla: true });
  await page.goto(URL_REVISION);
  const ia = page.getByRole('region', { name: 'Ajustar con IA' });
  await ia.getByLabel('Pedido libre').fill('que lo diga con un ejemplo de la planta');
  await ia.getByRole('button', { name: 'Enviar' }).click();
  await expect(page.getByRole('alert')).toHaveText('La IA no pudo preparar la propuesta. Intenta de nuevo o cambia el pedido.', { timeout: 10_000 });
  await expect(page.getByRole('region', { name: 'Propuesta de la IA' })).toHaveCount(0);
});

test('en celular (390 px) la revisión no desborda y usa solo la escala de letra', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL_REVISION);
  await expect(page.getByRole('region', { name: 'Pantalla p01' })).toBeVisible();
  const medida = await page.evaluate(() => {
    const tamanos = new Set<number>();
    for (const el of document.querySelectorAll<HTMLElement>('main *')) {
      const conTexto = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      const r = el.getBoundingClientRect();
      if (conTexto && r.width && r.height) tamanos.add(parseFloat(getComputedStyle(el).fontSize));
    }
    return { scroll: document.documentElement.scrollWidth, ancho: document.documentElement.clientWidth, tamanos: [...tamanos] };
  });
  expect(medida.scroll).toBeLessThanOrEqual(medida.ancho);
  for (const t of medida.tamanos) expect([11, 12, 14, 16, 20, 26]).toContain(t);
});

test('HU-0503 · si la voz falla, los chips quedan en error y se explica qué hacer', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL', cascada: 'falla' });
  await page.goto(URL_REVISION);
  const textos = page.getByRole('region', { name: 'Textos' });
  await textos.getByLabel('Narración').fill('Hola, soy Ana. Hoy aprendes a bloquear y etiquetar.');
  await textos.getByRole('button', { name: 'Guardar cambios' }).click();
  const region = page.getByRole('region', { name: 'Regeneración' });
  await expect(region.getByRole('listitem')).toHaveText(['Voz ES: Error', 'Boca: Error', 'Subtítulos ES: Error'], { timeout: 10_000 });
  await expect(region.getByText(/No se pudo regenerar la voz de esta pantalla/)).toBeVisible();
});

test.describe('HU-0604 · con p05 retocada en el editor', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL', retoquesP05: true });
  });
  const imagen = (page: Page) => page.locator('.revision-reproductor [data-bloque="p05-imagen"]');
  /** Corrimiento horizontal de la imagen como % del ancho del reproductor. */
  const corrimientoX = (page: Page) => imagen(page).evaluate((el) => {
    const ancho = (el.getRootNode() as ShadowRoot).querySelector?.<HTMLElement>('.ap-r')?.clientWidth ?? Number.NaN;
    const t = getComputedStyle(el).translate;
    return t === 'none' ? 0 : Math.round((parseFloat(t.split(' ')[0]!) / ancho) * 1000) / 10;
  });
  /** Lo que hace el editor al soltar un arrastre: guarda el desplazamiento nuevo de la imagen. */
  const moverImagen = (page: Page, x: number) => page.evaluate(async ({ curso, proyecto, x }) => {
    const c = await (await fetch(`/api/v1/proyectos/${proyecto}/curso`)).json() as { version: number };
    const r = await fetch(`/api/v1/cursos/${curso}/pantallas/p05`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: c.version, ajustes: { 'p05-imagen': { desplazamiento: { x, y: -3, dispositivo: 'todos' } } } }),
    });
    return r.status;
  }, { curso: CURSO_ID, proyecto: PROYECTO, x });

  test('CP-059 · «Menos texto» cambia el texto y la imagen sigue movida; moverla no vence la propuesta', async ({ page }) => {
    await page.goto(URL_REVISION);
    await elegir(page, '¿Qué es la energía peligrosa?');
    await expect.poll(() => corrimientoX(page)).toBe(12.5);
    await page.getByRole('region', { name: 'Ajustar con IA' }).getByRole('button', { name: '✦ Menos texto' }).click();
    const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
    await expect(franja.getByRole('button', { name: 'Aplicar' })).toBeVisible({ timeout: 10_000 });
    // Menos texto no cambia la disposición: no hay aviso.
    await expect(franja.getByRole('note')).toHaveCount(0);

    expect(await moverImagen(page, 20)).toBe(200);
    await franja.getByRole('button', { name: 'Aplicar' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Propuesta aplicada: «Menos texto».' })).toBeVisible();
    const escena = page.locator('.revision-reproductor');
    await expect(escena.getByText('Energía que puede mover, calentar o liberar algo sin aviso.')).toBeVisible();
    await expect.poll(() => corrimientoX(page)).toBe(20);

    // Deshacer devuelve el texto y deja la imagen donde está ahora.
    await page.getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se deshizo la propuesta.' })).toBeVisible();
    await expect(escena.getByText('Es cualquier energía que puede mover, calentar o liberar algo de forma inesperada mientras trabajas en un equipo.')).toBeVisible();
    await expect.poll(() => corrimientoX(page)).toBe(20);
  });

  test('una variante con otra disposición avisa que los retoques se reinician', async ({ page }) => {
    await page.goto(URL_REVISION);
    await elegir(page, '¿Qué es la energía peligrosa?');
    await page.getByRole('region', { name: 'Ajustar con IA' }).getByRole('button', { name: '✦ Ver 3 variantes' }).click();
    const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
    await expect(franja.getByRole('button', { name: 'Aplicar esta variante' })).toBeDisabled({ timeout: 10_000 });
    await expect(franja.getByRole('note')).toHaveCount(0);
    await franja.getByRole('button', { name: 'Variante 1 · Lista con íconos' }).click();
    await expect(franja.getByRole('note')).toHaveText(/Esta propuesta cambia el diseño de la pantalla: el tamaño, el color y la posición que retocaste vuelven a como los dibuja el kit\. Los elementos que agregaste se conservan\./);
  });
});

test('HU-0604 · sin retoques, una variante con otra disposición no avisa', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  await page.goto(URL_REVISION);
  await elegir(page, '¿Qué es la energía peligrosa?');
  await page.getByRole('region', { name: 'Ajustar con IA' }).getByRole('button', { name: '✦ Ver 3 variantes' }).click();
  const franja = page.getByRole('region', { name: 'Propuesta de la IA' });
  await franja.getByRole('button', { name: 'Variante 1 · Lista con íconos' }).click({ timeout: 10_000 });
  await expect(franja.getByRole('note')).toHaveCount(0);
});
