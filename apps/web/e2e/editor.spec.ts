// HU-0601 · Editor (PNT-21): edición en el lugar (CP-056). Doble clic, escribir y Enter guarda; Esc cancela;
// con teclado se entra con Tab y Enter; si otra persona guardó antes, se recarga y se avisa.
// HU-0602 · Barra contextual y propiedades: tamaño, color del kit (CP-057), alineación y animación.
// HU-0603 · Modo Libre: arrastrar y flechas guardan un desplazamiento en % del ancho (CP-058).
// HU-0605 · Diseños: la misma pantalla en otra composición, con el mismo contenido y Deshacer (CP-060).
// HU-0606 · Agregar elementos (CP-061), capas para ocultar y mostrar, y eliminar extras.
import { expect, type Page, test } from '@playwright/test';
import { RETOQUES_P05, simularApi } from './api-simulada';

const PROYECTO = '00000000-0000-4000-8000-000000000701';
const URL_EDITOR = `/proyectos/${PROYECTO}/editor?pantalla=p01`;
const lienzo = (page: Page) => page.getByRole('region', { name: /^Lienzo de la pantalla/ });
const titulo = (page: Page) => lienzo(page).getByRole('heading', { level: 2 });

/** Peticiones de edición que llegan a la API. */
function contarEdiciones(page: Page) {
  const cuerpos: unknown[] = [];
  page.on('request', (r) => {
    if (r.method() === 'PATCH' && /\/cursos\/[^/]+\/pantallas\/p\d+$/.test(r.url())) cuerpos.push(r.postDataJSON());
  });
  return cuerpos;
}

/** Doble clic para escribir; si el lienzo se redibujó justo en ese momento (llegó el kit), se vuelve a intentar. */
async function empezarAEscribir(page: Page, el: ReturnType<Page['locator']>) {
  await expect(async () => {
    await el.dblclick();
    await expect(page.getByText('Escribiendo… Enter para terminar · Esc para cancelar')).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe('con el productor', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR' });
  });

  test('desde Revisión se abre el editor en la misma pantalla y se vuelve', async ({ page }) => {
    await page.goto(`/proyectos/${PROYECTO}/revision`);
    await page.getByRole('button', { name: 'Siguiente', exact: true }).click();
    await page.getByRole('link', { name: '✎ Editar pantalla' }).click();
    await expect(page).toHaveURL(`/proyectos/${PROYECTO}/editor?pantalla=p02`);
    await expect(page.getByRole('region', { name: 'Lienzo de la pantalla p02' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pantallas' }).getByRole('button')).toHaveCount(30);
    await page.getByRole('navigation', { name: 'Pantallas' }).getByRole('button', { name: /Bloqueo y etiquetado/ }).click();
    await expect(page).toHaveURL(URL_EDITOR);
    await page.getByRole('link', { name: '← Revisión' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Revisión' })).toBeVisible();
  });

  test('CP-056 · doble clic en el título, escribir y Enter lo guarda; sigue tras recargar', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
    await titulo(page).dblclick();
    await expect(page.getByText('Escribiendo… Enter para terminar · Esc para cancelar')).toBeVisible();
    await page.keyboard.type('Bloqueo y etiquetado seguro');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Texto guardado.' })).toBeVisible();
    expect(ediciones).toEqual([expect.objectContaining({ titulo: { es: 'Bloqueo y etiquetado seguro' } })]);
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado seguro');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bloqueo y etiquetado seguro');
    await expect(page.locator('.editor-barra .chip')).toHaveText('Borrador');
    await page.reload();
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado seguro');
  });

  test('CP-056 · Esc cancela: el texto vuelve y no se guarda nada', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await empezarAEscribir(page, lienzo(page).getByText('Cápsula de seguridad · 15 min · 3 retos'));
    await page.keyboard.type('Otro texto');
    await page.keyboard.press('Escape');
    await expect(lienzo(page).getByText('Cápsula de seguridad · 15 min · 3 retos')).toBeVisible();
    // Deja de escribir; el texto sigue elegido para retocarlo (HU-0602).
    await expect(page.getByText('Escribiendo… Enter para terminar · Esc para cancelar')).toHaveCount(0);
    await expect(page.getByRole('toolbar', { name: 'Opciones del elemento' })).toContainText('Subtítulo · Cápsula de seguridad');
    expect(ediciones).toEqual([]);
  });

  test('CP-056 · solo con teclado: Tab hasta el texto, Enter, escribir y Enter; clic fuera también guarda', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await titulo(page).waitFor();
    const subtitulo = lienzo(page).getByText('Cápsula de seguridad · 15 min · 3 retos');
    // Tab recorre los textos editables del lienzo.
    for (let i = 0; i < 40 && !(await subtitulo.evaluate((el) => el.matches(':focus'))); i++) await page.keyboard.press('Tab');
    await expect(subtitulo).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Cápsula de seguridad · 12 min');
    await page.keyboard.press('Enter');
    await expect(lienzo(page).getByText('Cápsula de seguridad · 12 min', { exact: true })).toBeVisible();
    expect(ediciones).toEqual([expect.objectContaining({ textos: { 'p01-subtitulo': { es: 'Cápsula de seguridad · 12 min' } } })]);
    // Clic fuera mientras se escribe guarda lo escrito.
    await titulo(page).dblclick();
    await page.keyboard.type('Bloqueo y etiquetado LOTO');
    await page.getByRole('heading', { level: 1 }).click();
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado LOTO');
    expect(ediciones).toHaveLength(2);
  });

  test('un texto vacío no se guarda y vuelve el que tenía', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await empezarAEscribir(page, titulo(page));
    await page.keyboard.press('Delete');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Un texto no puede quedar vacío; se dejó el que tenía.');
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
    expect(ediciones).toEqual([]);
  });

  test('si otra persona guardó antes (409), se recarga el curso y se avisa', async ({ page }) => {
    await page.route('**/api/v1/cursos/*/pantallas/p01', (r) =>
      r.request().method() === 'PATCH'
        ? r.fulfill({ status: 409, json: { codigo: 'VERSION_CAMBIO', mensaje: 'Otra persona guardó cambios en el curso.' } })
        : r.fallback());
    await page.goto(URL_EDITOR);
    await titulo(page).dblclick();
    await page.keyboard.type('Mi cambio');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('alert')).toHaveText('Otra persona cambió el curso mientras editabas. Se cargó la última versión; vuelve a hacer tu cambio.');
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
  });
});

test('el revisor del cliente no ve «Editar pantalla» ni puede escribir en el editor', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' });
  await page.goto(`/proyectos/${PROYECTO}/revision`);
  await expect(page.getByRole('region', { name: 'Pantalla p01' })).toBeVisible();
  await expect(page.getByRole('link', { name: '✎ Editar pantalla' })).toHaveCount(0);
  await page.goto(URL_EDITOR);
  await expect(page.getByText('El editor es del equipo de producción. Puedes ver y comentar las pantallas en Revisión.')).toBeVisible();
  await expect(lienzo(page)).toHaveCount(0);
});

test.describe('HU-0602 · retoques del elemento elegido', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  });
  const barra = (page: Page) => page.getByRole('toolbar', { name: 'Opciones del elemento' });
  const propiedades = (page: Page) => page.getByRole('complementary', { name: 'Propiedades' });
  const estilo = (page: Page, prop: string) => titulo(page).evaluate((el, p) => getComputedStyle(el).getPropertyValue(p), prop);

  test('CP-057 · elijo un texto y el color Acento: cambia, y solo se ofrecen los colores del kit', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await expect(propiedades(page)).toContainText('Elige un elemento en el lienzo para cambiarlo');
    await titulo(page).click();
    await expect(barra(page)).toContainText('Título · Bloqueo y etiquetado');
    const colores = barra(page).getByRole('group', { name: 'Colores del kit' }).getByRole('button');
    await expect(colores).toHaveText(['', '', '', '', '', '']);
    expect(await colores.evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')))).toEqual(['Primario', 'Secundario', 'Acento', 'Texto', 'Blanco', 'Alerta']);
    // Cada muestra tiene el color real del kit; no hay selector de color libre.
    await expect(colores.nth(2)).toHaveCSS('background-color', 'rgb(242, 169, 0)');
    await expect(page.locator('input[type="color"]')).toHaveCount(0);
    await barra(page).getByRole('button', { name: 'Acento' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Cambio guardado.' })).toBeVisible();
    expect(ediciones).toEqual([expect.objectContaining({ ajustes: { 'p01-titulo': { color: 'acento' } } })]);
    await expect(titulo(page)).toHaveCSS('color', 'rgb(242, 169, 0)');
    await expect(barra(page).getByRole('button', { name: 'Acento' })).toHaveAttribute('aria-pressed', 'true');
    // El contenido no cambia y el retoque sigue tras recargar.
    await page.reload();
    await expect(titulo(page)).toHaveText('Bloqueo y etiquetado');
    await expect(titulo(page)).toHaveCSS('color', 'rgb(242, 169, 0)');
  });

  test('A+ agranda el texto, Centro lo centra, la animación se guarda y Restablecer quita el ajuste', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_EDITOR);
    await titulo(page).click();
    const antes = parseFloat(await estilo(page, 'font-size'));
    await barra(page).getByRole('button', { name: 'Más grande' }).click();
    await expect.poll(async () => parseFloat(await estilo(page, 'font-size'))).toBeGreaterThan(antes);
    // RN-06-2: el tamaño se guarda en % del ancho de la pantalla, nunca en píxeles.
    expect((ediciones[0] as { ajustes: Record<string, { tamanoCqw: number }> }).ajustes['p01-titulo']!.tamanoCqw).toBeGreaterThan(0);
    await barra(page).getByRole('group', { name: 'Alineación' }).getByRole('button', { name: 'Centro' }).click();
    await expect.poll(() => estilo(page, 'text-align')).toBe('center');
    await propiedades(page).getByRole('group', { name: 'Animación de entrada' }).getByRole('button', { name: 'Rebotar' }).click();
    await expect(titulo(page)).toHaveClass(/ap-anim-rebotar/);
    expect(ediciones.at(-1)).toEqual(expect.objectContaining({ ajustes: { 'p01-titulo': expect.objectContaining({ alineacion: 'centro', animacion: 'rebotar' }) } }));
    await propiedades(page).getByRole('button', { name: '▶ Ver animación' }).click();
    await expect(titulo(page)).toHaveClass(/ap-anim-rebotar/);
    await barra(page).getByRole('button', { name: 'Restablecer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se restableció el elemento.' })).toBeVisible();
    expect(ediciones.at(-1)).toEqual(expect.objectContaining({ ajustes: { 'p01-titulo': null } }));
    await expect.poll(async () => parseFloat(await estilo(page, 'font-size'))).toBeCloseTo(antes, 0);
    await expect(titulo(page)).not.toHaveClass(/ap-anim-/);
  });

  test('con teclado: Tab hasta el elemento y Espacio lo elige; Esc lo suelta', async ({ page }) => {
    await page.goto(URL_EDITOR);
    await titulo(page).waitFor();
    for (let i = 0; i < 40 && !(await titulo(page).evaluate((el) => el.matches(':focus'))); i++) await page.keyboard.press('Tab');
    await expect(titulo(page)).toBeFocused();
    await page.keyboard.press(' ');
    await expect(barra(page)).toBeVisible();
    await expect(propiedades(page).getByRole('heading', { level: 2 })).toHaveText('Título · Bloqueo y etiquetado');
    await page.keyboard.press('Escape');
    await expect(barra(page)).toHaveCount(0);
  });
});

test.describe('HU-0603 · modo Libre', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  });
  const URL_P05 = `/proyectos/${PROYECTO}/editor?pantalla=p05`;
  const propiedades = (page: Page) => page.getByRole('complementary', { name: 'Propiedades' });
  const imagen = (page: Page) => lienzo(page).locator('[data-bloque="p05-imagen"]');
  const modo = (page: Page, nombre: string) => page.getByRole('group', { name: 'Modo de edición' }).getByRole('button', { name: nombre }).click();
  /** Corrimiento horizontal y vertical del elemento como fracción del ancho del reproductor. */
  const corrimiento = (page: Page) => imagen(page).evaluate((el) => {
    // Mientras el lienzo se vuelve a montar, el elemento viejo ya no está en la sombra.
    const ancho = (el.getRootNode() as ShadowRoot).querySelector?.<HTMLElement>('.ap-r')?.clientWidth ?? Number.NaN;
    const t = getComputedStyle(el).translate;
    const [x = '0px', y = '0px'] = t === 'none' ? [] : t.split(' ');
    return { x: parseFloat(x) / ancho, y: parseFloat(y) / ancho, ancho };
  });
  async function arrastrar(page: Page, dx: number, dy: number) {
    // El lienzo se vuelve a montar cuando llega el kit: se espera a que la red quede quieta y a que la imagen tenga caja.
    await page.waitForLoadState('networkidle');
    await expect.poll(() => imagen(page).boundingBox()).not.toBeNull();
    const caja = (await imagen(page).boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + dx / 2, caja.y + caja.height / 2 + dy / 2, { steps: 4 });
    await page.mouse.move(caja.x + caja.width / 2 + dx, caja.y + caja.height / 2 + dy, { steps: 4 });
    await page.mouse.up();
  }

  test('CP-058 · arrastro la imagen: se guarda un desplazamiento en % del ancho y se ve igual en otra resolución', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(URL_P05);
    await expect(page.getByText('Modo Automático: la disposición acomoda los elementos. Cambia a Libre para moverlos.')).toBeVisible();
    await modo(page, 'Libre');
    const { ancho } = await corrimiento(page);
    await arrastrar(page, 100, 0);
    await expect(page.getByRole('status').filter({ hasText: 'Posición guardada.' })).toBeVisible();
    const guardado = (ediciones[0] as { ajustes: Record<string, { desplazamiento: { x: number; y: number; dispositivo: string } }> }).ajustes['p05-imagen']!.desplazamiento;
    // 100 px sobre el ancho del reproductor, en %, para todos los dispositivos.
    expect(guardado.x).toBeCloseTo((100 / ancho) * 100, 1);
    expect(guardado.y).toBeCloseTo(0, 1);
    expect(guardado.dispositivo).toBe('todos');
    const grande = await corrimiento(page);
    expect(grande.x).toBeCloseTo(guardado.x / 100, 3);
    // En otra resolución (con el panel Diseños al lado) el reproductor es más angosto, pero el corrimiento sigue siendo la misma fracción del ancho.
    await page.setViewportSize({ width: 1180, height: 900 });
    await expect.poll(async () => (await corrimiento(page)).ancho).toBeLessThan(ancho);
    const chico = await corrimiento(page);
    expect(chico.x).toBeCloseTo(grande.x, 3);
    await expect(propiedades(page).getByLabel('Desplazamiento')).toContainText('% del ancho');
  });

  test('con el elemento elegido, las flechas lo mueven de a 0,5 % y se guarda una vez', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    await modo(page, 'Libre');
    await imagen(page).click();
    await imagen(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('status').filter({ hasText: 'Posición guardada.' })).toBeVisible();
    expect(ediciones).toEqual([expect.objectContaining({ ajustes: { 'p05-imagen': { desplazamiento: { x: 1, y: 0.5, dispositivo: 'todos' } } } })]);
    await expect(propiedades(page).getByLabel('Desplazamiento')).toHaveText('1 / 0,5 % del ancho');
    // «Volver a su lugar» quita solo el desplazamiento.
    await propiedades(page).getByRole('button', { name: 'Volver a su lugar' }).click();
    await expect.poll(() => ediciones.length).toBe(2);
    expect(ediciones[1]).toEqual(expect.objectContaining({ ajustes: { 'p05-imagen': null } }));
    await expect.poll(async () => (await corrimiento(page)).x).toBe(0);
  });

  test('en modo Automático arrastrar no mueve nada', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    await arrastrar(page, 120, 40);
    await imagen(page).focus();
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(1200);
    expect(ediciones).toEqual([]);
    expect((await corrimiento(page)).x).toBe(0);
    await imagen(page).click();
    await expect(propiedades(page)).toContainText('Cambia a Libre para mover.');
  });
});

test.describe('HU-0605 · cambiar diseño', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR', retoquesP05: true });
  });
  const disenos = (page: Page) => page.getByRole('complementary', { name: 'Diseños' });
  const pantallaDibujada = (page: Page) => lienzo(page).locator('.ap-pantalla');
  const PARRAFO = 'Es cualquier energía que puede mover, calentar o liberar algo de forma inesperada mientras trabajas en un equipo.';
  /** Corrimiento horizontal de la imagen en % del ancho del reproductor. */
  const corrimientoX = (page: Page) => lienzo(page).locator('[data-bloque="p05-imagen"]').evaluate((el) => {
    const ancho = (el.getRootNode() as ShadowRoot).querySelector?.<HTMLElement>('.ap-r')?.clientWidth ?? Number.NaN;
    const t = getComputedStyle(el).translate;
    return t === 'none' ? 0 : Math.round((parseFloat(t.split(' ')[0]!) / ancho) * 1000) / 10;
  });

  test('CP-060 · «Idea + ilustración» pasa a «Tarjetas con íconos» con el mismo contenido y Deshacer la devuelve', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`/proyectos/${PROYECTO}/editor?pantalla=p05`);
    await expect(disenos(page).locator('.editor-diseno-nombre')).toHaveText(['Idea + ilustración · actual', 'Personaje habla', 'Dato grande', 'Tarjetas con íconos']);
    await expect(disenos(page).getByRole('button', { name: 'Idea + ilustración · actual' })).toHaveAttribute('aria-current', 'true');
    // Cada miniatura es la misma pantalla dibujada por el reproductor en su composición.
    await expect(disenos(page).getByRole('button', { name: 'Tarjetas con íconos' }).locator('.ap-pantalla.ap-d-lista')).toHaveCount(1);
    await expect(disenos(page).getByRole('button', { name: 'Tarjetas con íconos' }).getByText(PARRAFO)).toHaveCount(1);
    await expect(pantallaDibujada(page)).toHaveClass(/ap-d-idea/);
    await expect.poll(() => corrimientoX(page)).toBe(12.5);

    await disenos(page).getByRole('button', { name: 'Tarjetas con íconos' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Diseño aplicado: Tarjetas con íconos.' })).toBeVisible();
    expect(ediciones).toEqual([{ version: expect.any(Number), disposicion: 'lista' }]);
    await expect(pantallaDibujada(page)).toHaveClass(/ap-d-lista/);
    // Se conserva el contenido; los retoques de posición se reinician (RN-06-3).
    await expect(lienzo(page).getByText(PARRAFO)).toBeVisible();
    await expect.poll(() => corrimientoX(page)).toBe(0);
    await expect(disenos(page).getByRole('button', { name: 'Tarjetas con íconos · actual' })).toBeVisible();

    await page.getByRole('status').getByRole('button', { name: 'Deshacer' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Se deshizo el cambio de diseño.' })).toBeVisible();
    expect(ediciones[1]).toEqual({ version: expect.any(Number), disposicion: 'idea', ajustes: RETOQUES_P05.ajustes });
    await expect(pantallaDibujada(page)).toHaveClass(/ap-d-idea/);
    await expect.poll(() => corrimientoX(page)).toBe(12.5);
    await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0);
  });

  test('Propiedades muestra el diseño y «Cambiar» lleva al panel; una actividad no cambia de diseño aquí', async ({ page }) => {
    await page.goto(`/proyectos/${PROYECTO}/editor?pantalla=p05`);
    const propiedades = page.getByRole('complementary', { name: 'Propiedades' });
    await expect(propiedades.getByText('Idea + ilustración')).toBeVisible();
    await propiedades.getByRole('button', { name: 'Cambiar' }).click();
    await expect(disenos(page).getByRole('button', { name: 'Personaje habla' })).toBeFocused();

    await page.goto(`/proyectos/${PROYECTO}/editor?pantalla=p07`);
    await expect(disenos(page)).toContainText('Esta pantalla tiene una actividad o un video: su diseño se cambia en Revisión');
    await expect(disenos(page).getByRole('button')).toHaveCount(0);
  });
});

test.describe('HU-0606 · agregar elementos y capas', () => {
  test.beforeEach(async ({ page }) => {
    await simularApi(page, { conSesion: true, conProyectos: true, rol: 'PRODUCTOR' });
    await page.setViewportSize({ width: 1440, height: 900 });
  });
  const pestana = (page: Page, nombre: string) => page.getByRole('tablist', { name: 'Panel del editor' }).getByRole('tab', { name: nombre }).click();
  const agregar = (page: Page) => page.getByRole('complementary', { name: 'Agregar' });
  const capas = (page: Page) => page.getByRole('complementary', { name: 'Capas' });
  const barra = (page: Page) => page.getByRole('toolbar', { name: 'Opciones del elemento' });
  const URL_P05 = `/proyectos/${PROYECTO}/editor?pantalla=p05`;

  test('CP-061 · elijo «Botón»: aparece en la pantalla, elegido y en modo Libre, y se arrastra', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    await pestana(page, 'Agregar');
    await expect(agregar(page).locator('.editor-agregar-nombre')).toHaveText(['Título', 'Texto', 'Dato clave', 'Botón', 'Imagen del kit', 'Insignia', 'Forma', 'Personaje']);
    await agregar(page).getByRole('button', { name: 'Botón' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Botón agregado: arrástralo donde quieras.' })).toBeVisible();
    expect(ediciones).toEqual([{
      version: expect.any(Number),
      extras: [{ id: 'p05-extra-boton-1', tipo: 'boton', texto: { es: 'Continuar' }, x: 40, y: 80, ancho: 14, alClic: 'siguiente' }],
    }]);
    const boton = lienzo(page).locator('[data-bloque="p05-extra-boton-1"]');
    await expect(boton).toHaveText('Continuar');
    await expect(boton).toHaveAttribute('data-elegido', '');
    await expect(page.getByRole('group', { name: 'Modo de edición' }).getByRole('button', { name: 'Libre' })).toHaveAttribute('aria-pressed', 'true');
    await expect(barra(page)).toContainText('Botón · Continuar');
    await expect(barra(page).getByRole('button', { name: 'Eliminar' })).toBeVisible();

    // Listo para mover: un arrastre guarda su desplazamiento, como el de un bloque (SUP-45).
    await page.waitForLoadState('networkidle');
    const caja = (await boton.boundingBox())!;
    await page.mouse.move(caja.x + caja.width / 2, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.move(caja.x + caja.width / 2 + 40, caja.y + caja.height / 2 - 20, { steps: 4 });
    await page.mouse.move(caja.x + caja.width / 2 + 80, caja.y + caja.height / 2 - 40, { steps: 4 });
    await page.mouse.up();
    await expect(page.getByRole('status').filter({ hasText: 'Posición guardada.' })).toBeVisible();
    const d = (ediciones[1] as { ajustes: Record<string, { desplazamiento: { x: number; y: number } }> }).ajustes['p05-extra-boton-1']!.desplazamiento;
    expect(d.x).toBeGreaterThan(0);
    expect(d.y).toBeLessThan(0);
  });

  test('en Capas el ojo oculta un elemento (se ve tenue en el editor) y lo vuelve a mostrar', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    await pestana(page, 'Capas');
    await expect(capas(page).locator('.editor-capa')).toHaveText([/^Título · ¿Qué es la energía/, /^Texto · Es cualquier energía/, /^Dato clave · Si puede moverse/, 'Imagen']);
    await capas(page).getByRole('button', { name: 'Ocultar Imagen' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Elemento oculto: se puede mostrar desde Capas.' })).toBeVisible();
    expect(ediciones).toEqual([{ version: expect.any(Number), ajustes: { 'p05-imagen': { oculto: true } } }]);
    const imagen = lienzo(page).locator('[data-bloque="p05-imagen"]');
    await expect(imagen).toHaveClass(/ap-oculto-el/);
    await expect(imagen).toBeVisible();
    expect(await imagen.evaluate((el) => getComputedStyle(el).opacity)).toBe('0.35');
    // Un clic en la capa elige el elemento.
    await capas(page).getByRole('button', { name: 'Imagen', exact: true }).click();
    await expect(barra(page)).toContainText('Imagen');
    await expect(barra(page).getByRole('button', { name: 'Eliminar' })).toHaveCount(0);
    await capas(page).getByRole('button', { name: 'Mostrar Imagen' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Elemento visible.' })).toBeVisible();
    expect(ediciones[1]).toEqual({ version: expect.any(Number), ajustes: { 'p05-imagen': null } });
    await expect(imagen).not.toHaveClass(/ap-oculto-el/);
  });

  test('Supr elimina un extra; en un bloque del contenido no hace nada', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(URL_P05);
    await pestana(page, 'Agregar');
    await agregar(page).getByRole('button', { name: 'Título' }).click();
    const titulo = lienzo(page).locator('[data-bloque="p05-extra-titulo-1"]');
    await expect(titulo).toHaveText('Nuevo título');
    await expect(titulo).toBeFocused();
    await page.keyboard.press('Delete');
    await expect(page.getByRole('status').filter({ hasText: 'Elemento eliminado.' })).toBeVisible();
    expect(ediciones[1]).toEqual({ version: expect.any(Number), extras: [] });
    await expect(titulo).toHaveCount(0);
    await lienzo(page).locator('[data-bloque="p05-titulo"]').focus();
    await page.keyboard.press('Delete');
    await page.waitForTimeout(300);
    expect(ediciones).toHaveLength(2);
  });

  test('el texto de un extra se escribe con doble clic, y en la vista previa el botón lleva a la pantalla siguiente', async ({ page }) => {
    const ediciones = contarEdiciones(page);
    await page.goto(`/proyectos/${PROYECTO}/editor?pantalla=p01`);
    await pestana(page, 'Agregar');
    await agregar(page).getByRole('button', { name: 'Botón' }).click();
    const boton = lienzo(page).locator('[data-bloque="p01-extra-boton-1"]');
    await expect(boton).toHaveText('Continuar');
    await boton.dblclick();
    await page.keyboard.type('Empezar');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status').filter({ hasText: 'Texto guardado.' })).toBeVisible();
    expect(ediciones[1]).toEqual({ version: expect.any(Number), extras: [expect.objectContaining({ id: 'p01-extra-boton-1', texto: { es: 'Empezar' } })] });

    await page.goto(`/proyectos/${PROYECTO}/vista-previa`);
    await expect(page.getByLabel('Seguimiento simulado').getByText('1 de 30', { exact: true })).toBeVisible();
    await page.locator('.vista-previa-reproductor').getByRole('button', { name: 'Empezar' }).click();
    await expect(page.getByLabel('Seguimiento simulado').getByText('2 de 30', { exact: true })).toBeVisible();
  });
});

