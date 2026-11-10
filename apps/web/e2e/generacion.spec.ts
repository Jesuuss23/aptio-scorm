// HU-0401 y HU-0408 · Generar el SCORM desde el proyecto (CP-036, CP-037, CP-045) contra la API simulada, que termina
// una etapa en cada consulta.
import { expect, type Page, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const PROYECTO = '/proyectos/00000000-0000-4000-8000-000000000702';

async function conTema(page: Page) {
  await page.goto(PROYECTO);
  const material = page.getByRole('region', { name: 'Material del cliente' });
  await material.getByLabel('O escribe solo el tema', { exact: false }).fill('Trabajo seguro en altura');
  await material.getByRole('button', { name: 'Agregar tema' }).click();
  return page.getByRole('region', { name: 'Generación del SCORM' });
}
const etapa = (seccion: ReturnType<Page['getByRole']>, nombre: string) => seccion.getByRole('listitem', { name: nombre });

test('CP-036 · lanza la generación y muestra las 11 etapas avanzando con su costo', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  await page.goto(PROYECTO);
  const gen = page.getByRole('region', { name: 'Generación del SCORM' });
  // Sin material no se puede generar.
  await expect(gen.getByRole('button', { name: 'Generar SCORM' })).toBeDisabled();
  await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();

  await expect(gen.getByRole('list', { name: 'Etapas de la generación' }).getByRole('listitem')).toHaveCount(11);
  await expect(page.getByText('Minera Andina · Producción')).toBeVisible();
  await expect(gen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
  await expect(etapa(gen, 'Pantallas con el kit')).toContainText('Lista', { timeout: 20_000 });
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('30 páginas → 29 ideas clave');
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('US$ 0.35');
  await expect(etapa(gen, 'Voz en español')).toContainText('Lista', { timeout: 20_000 });
  await expect(etapa(gen, 'Boca del personaje')).toContainText('30 narraciones con boca sincronizada · simulada por letras', { timeout: 20_000 });
  await expect(etapa(gen, 'Ilustraciones')).toContainText('Se habilita en un sprint siguiente');
  await expect(etapa(gen, 'Paquete de prueba')).toContainText('Se habilita en un sprint siguiente');
  await expect(gen.getByText('55 %')).toBeVisible();
  await expect(gen.getByText('US$ 1.53')).toBeVisible();
  await expect(gen.getByRole('button', { name: 'Generar de nuevo' })).toBeVisible();
});

test('CP-037 · si otra persona ya la lanzó, avisa y muestra la que está en curso', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, generacion: 'ajena' });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  await expect(gen.getByRole('status').filter({ hasText: 'Ya hay una generación en curso para este proyecto' })).toBeVisible();
  await expect(gen.getByRole('list', { name: 'Etapas de la generación' }).getByRole('listitem')).toHaveCount(11);
  await expect(gen.getByRole('button', { name: 'Generar SCORM' })).toHaveCount(0);
  await expect(gen.getByRole('button', { name: 'Cancelar' })).toBeVisible();
});

test('CP-045 · cancelar en la etapa 3 conserva las etapas 1 y 2', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, generacion: 'lenta' });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  await expect(etapa(gen, 'Storyboard y guion')).toContainText('Trabajando…', { timeout: 15_000 });
  await gen.getByRole('button', { name: 'Cancelar' }).click();

  await expect(gen.getByText('Generación cancelada. Lo terminado se conserva.')).toBeVisible();
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('Lista');
  await expect(etapa(gen, 'Objetivos y estructura')).toContainText('Lista');
  await expect(etapa(gen, 'Storyboard y guion')).toContainText('Cancelada');
  await expect(gen.getByRole('button', { name: 'Continuar' })).toBeVisible();
});

test('HU-0408 · tras un error, continuar retoma desde esa etapa', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, generacion: 'falla' });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  await expect(etapa(gen, 'Objetivos y estructura')).toContainText('El proveedor de IA no respondió (529)', { timeout: 15_000 });
  await expect(etapa(gen, 'Leer y resumir el material')).toContainText('Lista');
  await gen.getByRole('button', { name: 'Continuar' }).click();
  await expect(etapa(gen, 'Storyboard y guion')).toContainText('Lista', { timeout: 15_000 });
  await expect(etapa(gen, 'Objetivos y estructura')).toContainText('3 objetivos con nivel de Bloom · 1 módulo · 30 pantallas · 12 con actividad');
});

test('el diseñador gráfico ve la generación pero no la lanza', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' });
  await page.goto(PROYECTO);
  const gen = page.getByRole('region', { name: 'Generación del SCORM' });
  await expect(gen.getByText('Agrega el material del cliente', { exact: false })).toBeVisible();
  await expect(gen.getByRole('button')).toHaveCount(0);
});

test('CP-038 · el resumen muestra cada idea clave con su página y el acta de temas omitidos', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  const resumen = etapa(gen, 'Leer y resumir el material');
  await resumen.getByRole('button', { name: 'Ver resumen' }).click({ timeout: 15_000 });
  const vista = gen.getByRole('region', { name: 'Resumen del material' });
  const definiciones = vista.getByRole('listitem', { name: 'Definiciones clave' });
  await expect(definiciones.getByText('Se conserva')).toBeVisible();
  const ideas = definiciones.getByRole('list', { name: 'Ideas clave de Definiciones clave' }).getByRole('listitem');
  await expect(ideas).toHaveCount(3);
  await expect(ideas.first()).toContainText('p. 7');
  await expect(vista.getByRole('listitem', { name: 'Referencias' })).toContainText('Se omite');
  const acta = vista.getByRole('region', { name: 'Acta de temas omitidos' });
  await expect(acta.getByRole('heading', { name: 'Acta de temas omitidos · Bloqueo y etiquetado' })).toBeVisible();
  await expect(acta).toContainText('Registros y anexos');
});

test('CP-039 · la estructura muestra 30 pantallas, 12 con actividad, cada una con su objetivo', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  await etapa(gen, 'Objetivos y estructura').getByRole('button', { name: 'Ver estructura' }).click({ timeout: 15_000 });
  const vista = gen.getByRole('region', { name: 'Estructura del curso' });
  const objetivos = vista.getByRole('region', { name: 'Objetivos de aprendizaje' }).getByRole('listitem');
  await expect(objetivos).toHaveCount(3);
  await expect(objetivos.last()).toContainText('Aplicar');
  const pantallas = vista.getByRole('region', { name: 'Pantallas' });
  await expect(pantallas.getByRole('heading')).toContainText('30 en total · 12 con actividad (mínimo 12)');
  await expect(pantallas.getByRole('listitem')).toHaveCount(30);
  const p07 = pantallas.getByRole('listitem', { name: 'Pantalla p07' });
  await expect(p07).toContainText('Actividad');
  await expect(p07).toContainText('INT-01 · Memoria');
  await expect(p07).toContainText('Objetivo 1');
  await expect(p07).toContainText('p. 13');
});

test('CP-040 · el guion muestra texto y narración por pantalla y advierte la que pasa de 30 palabras', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  const fila = etapa(gen, 'Storyboard y guion');
  await expect(fila).toContainText('1 pantalla supera 30 palabras en pantalla', { timeout: 15_000 });
  await fila.getByRole('button', { name: 'Ver guion' }).click();
  const vista = gen.getByRole('region', { name: 'Guion por pantalla' });
  await expect(vista.getByRole('status')).toContainText('1 pantalla supera el límite de palabras');
  await expect(vista.getByRole('listitem')).toHaveCount(30);
  const p05 = vista.getByRole('listitem', { name: 'Pantalla p05' });
  await expect(p05).toContainText('Supera el límite: 34 palabras en pantalla (máximo 30)');
  await expect(p05).toContainText('INT-04 · Tarjetas');
  // p02 tiene justo 30 palabras (los «·» no cuentan): sin advertencia.
  const p02 = vista.getByRole('listitem', { name: 'Pantalla p02' });
  await expect(p02).toContainText('28 / 30 palabras');
  await expect(p02).not.toContainText('Supera el límite');
  await expect(p02).toContainText('Agregado por la IA');
  await expect(vista.getByRole('listitem', { name: 'Pantalla p06' })).toContainText('p. 13 · PETS-SEG-014 Bloqueo y etiquetado.pdf');
  await expect(vista.getByText(/^Supera el límite:/)).toHaveCount(1);
});

test('CP-043 · las pantallas aparecen en Producción mientras la etapa 4 corre; CP-042 · todas con su disposición', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  const fila = etapa(gen, 'Pantallas con el kit');
  // En curso: la rejilla se muestra sola con las listas y el resto en espera.
  await expect(fila).toContainText('de 30 pantallas listas', { timeout: 15_000 });
  const vista = fila.getByRole('region', { name: 'Pantallas armadas con el kit' });
  await expect(vista.getByRole('status')).toContainText(/^(10|20) de 30 pantallas · se agregan a medida que quedan listas/);
  await expect(vista.getByRole('listitem', { name: /en espera$/ }).first()).toBeVisible();
  // p02 quedó lista después de p03: su lugar sigue en espera.
  await expect(vista.getByRole('listitem', { name: 'Pantalla 02 en espera' })).toBeVisible();

  await expect(fila).toContainText('30 pantallas armadas con el kit · 9 actividades con sus datos · curso validado', { timeout: 15_000 });
  await fila.getByRole('button', { name: 'Ver pantallas' }).click();
  const final = fila.getByRole('region', { name: 'Pantallas armadas con el kit' });
  await expect(final.getByRole('status')).toHaveText('30 de 30 pantallas');
  await expect(final.getByRole('listitem', { name: /^Pantalla p\d\d:/ })).toHaveCount(30);
  await expect(final.getByRole('listitem', { name: /en espera$/ })).toHaveCount(0);
  const p06 = final.getByRole('listitem', { name: 'Pantalla p06: Seis tipos de energía' });
  await expect(p06).toContainText('Lista');
  // CP-044: cada actividad muestra lo que trae; el reto final va calificado.
  await expect(final.getByRole('listitem', { name: /^Pantalla p10:/ })).toContainText('Clasificar: 2 grupos · 7 elementos');
  await expect(final.getByRole('listitem', { name: /^Pantalla p28:/ })).toContainText('Calificada');
  await expect(final.getByText('Calificada')).toHaveCount(1);
  await final.getByRole('button', { name: 'Celular' }).click();
  await expect(final.locator('.miniatura.celular')).toHaveCount(30);
});

test('CP-071 · la etapa 6 deja cada narración Lista con su duración, y se puede escuchar', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  const voz = etapa(gen, 'Voz en español');
  // Mientras corre, las narraciones listas aparecen sin esperar al resto.
  await expect(voz.getByText(/^(10|20) de 30 narraciones listas$/).first()).toBeVisible({ timeout: 25_000 });
  await expect(voz).toContainText('30 narraciones listas · 2 min 10 s de audio · voz es-US-Neural2-A', { timeout: 20_000 });
  await expect(etapa(gen, 'Ilustraciones')).toContainText('En espera');

  await voz.getByRole('button', { name: 'Escuchar narraciones' }).click();
  const lista = voz.getByRole('list', { name: 'Narraciones' }).getByRole('listitem');
  await expect(lista).toHaveCount(30);
  await expect(voz.getByText('30 de 30 narraciones listas · 2 min 10 s de audio')).toBeVisible();
  const p01 = voz.getByRole('listitem', { name: 'Narración p01' });
  await expect(p01).toContainText('Hola, te doy la bienvenida a esta cápsula sobre bloqueo y etiquetado.');
  await expect(p01).toContainText('4.5 s');
  await expect(p01.getByText('Lista', { exact: true })).toBeVisible();
  await expect(p01.getByLabel('Escuchar la narración de p01')).toHaveAttribute('src', /s3-simulado\/p01-es\.mp3$/);
  await expect(voz.getByRole('listitem', { name: 'Narración p16' })).toContainText('Pronunciación del diccionario: candado');
  await expect(lista.filter({ hasText: 'Lista' })).toHaveCount(30);
});

test('CP-073 · tras cambiar la pronunciación de «pasos», solo esas 4 quedan «Por regenerar» y el equipo las regenera', async ({ page }) => {
  // SUP-36: «pasos» aparece en la narración de p02, p12, p15 y p27 del caso LOTO.
  await simularApi(page, { conSesion: true, conProyectos: true, porRegenerar: ['p02', 'p12', 'p15', 'p27'] });
  const gen = await conTema(page);
  await gen.getByRole('button', { name: 'Generar SCORM' }).click();
  const voz = etapa(gen, 'Voz en español');
  await expect(etapa(gen, 'Boca del personaje')).toContainText('Lista', { timeout: 45_000 });

  await voz.getByRole('button', { name: 'Escuchar narraciones' }).click();
  const lista = voz.getByRole('list', { name: 'Narraciones' }).getByRole('listitem');
  await expect(lista.filter({ hasText: 'Por regenerar' })).toHaveCount(4);
  for (const id of ['p02', 'p12', 'p15', 'p27']) await expect(voz.getByRole('listitem', { name: `Narración ${id}` }).getByText('Por regenerar')).toBeVisible();
  await expect(lista.filter({ hasText: 'Lista' })).toHaveCount(26);
  const aviso = voz.getByRole('status', { name: 'Narraciones por regenerar' });
  await expect(aviso).toContainText('4 narraciones quedaron «Por regenerar»');

  await aviso.getByRole('button', { name: 'Regenerar las desactualizadas (4)' }).click();
  // Se reabren las etapas 6 y 7 de la misma generación y vuelven a terminar.
  await expect(gen.getByText('Armando tu SCORM…')).toBeVisible();
  await expect(etapa(gen, 'Boca del personaje')).toContainText('Lista', { timeout: 20_000 });
  await voz.getByRole('button', { name: 'Escuchar narraciones' }).click();
  await expect(lista.filter({ hasText: 'Lista' })).toHaveCount(30);
  await expect(voz.getByRole('status', { name: 'Narraciones por regenerar' })).toHaveCount(0);
});
