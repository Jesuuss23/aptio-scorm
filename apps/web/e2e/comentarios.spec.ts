// HU-0506 · Comentarios del revisor del cliente (REQ-058, CP-055): el revisor recorre la Revisión en solo lectura (sin
// editor, sin «Aprobar» ni «✦ Revisar con IA») y comenta una pantalla; el equipo la encuentra por el contador y el
// filtro «Con comentarios» y la resuelve. Comentar no cambia el estado de aprobación. axe WCAG 2.2 A/AA sin violaciones.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { type ComentarioSim, simularApi } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const URL_REVISION = '/proyectos/00000000-0000-4000-8000-000000000701/revision';
const pantallas = (page: Page) => page.getByRole('complementary', { name: 'Pantallas' });
const panel = (page: Page) => page.getByRole('region', { name: 'Comentarios' });
const cifra = (page: Page, nombre: string) => page.getByLabel('Resumen de la revisión').locator('div').filter({ hasText: nombre }).locator('dd');
/** axe en las zonas de esta historia (el reproductor y la barra lateral tienen sus propias pruebas). */
const violaciones = (page: Page) =>
  new AxeBuilder({ page }).withTags(REGLAS).include('.comentarios').include('.revision-lista').include('.revision-cifras').include('main .nota').analyze()
    .then((r) => r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`));

test('CP-055 · el revisor comenta en solo lectura y el equipo lo encuentra y lo resuelve', async ({ browser }) => {
  const comentarios: ComentarioSim[] = [];

  // El revisor del cliente: ve pantallas, origen y observaciones, pero no edita, no aprueba ni pide a la IA.
  const ctxCliente = await browser.newContext();
  const cliente = await ctxCliente.newPage();
  await simularApi(cliente, { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE', comentarios });
  await cliente.goto(URL_REVISION);
  await expect(cliente.getByRole('heading', { level: 1, name: 'Revisión' })).toBeVisible();
  await expect(cliente.getByRole('note').filter({ hasText: 'Modo solo lectura' })).toBeVisible();
  await expect(cliente.getByRole('link', { name: '✎ Editar pantalla' })).toHaveCount(0);
  await expect(cliente.getByRole('button', { name: /^Aprobar/ })).toHaveCount(0);
  await expect(cliente.getByRole('button', { name: '✦ Revisar con IA' })).toHaveCount(0);
  await expect(cliente.getByRole('region', { name: 'Origen' })).toBeVisible();
  await expect(cifra(cliente, 'Aprobadas')).toHaveText('0 / 30');
  await expect(panel(cliente)).toContainText('Aún no hay comentarios en esta pantalla.');

  // Validación: vacío y más de 1000 caracteres.
  const campo = panel(cliente).getByLabel('Comentar esta pantalla');
  await panel(cliente).getByRole('button', { name: 'Comentar' }).click();
  await expect(panel(cliente).getByRole('alert')).toHaveText('Escribe el comentario');
  await campo.fill('x'.repeat(1001));
  await expect(panel(cliente)).toContainText('1001 / 1000 caracteres');
  await panel(cliente).getByRole('button', { name: 'Comentar' }).click();
  await expect(panel(cliente).getByRole('alert')).toHaveText('El comentario admite hasta 1000 caracteres');
  expect(comentarios).toHaveLength(0);

  await campo.fill('El logo del cliente debe ir en la esquina superior derecha.');
  await panel(cliente).getByRole('button', { name: 'Comentar' }).click();
  await expect(panel(cliente).getByRole('status')).toHaveText('Comentario publicado.');
  const delCliente = panel(cliente).getByRole('list', { name: 'Comentarios de la pantalla' }).getByRole('listitem');
  await expect(delCliente).toHaveCount(1);
  await expect(delCliente).toContainText('Cliente');
  await expect(delCliente).toContainText('Abierto');
  await expect(delCliente.getByRole('button')).toHaveCount(0);
  await expect(campo).toHaveValue('');
  await expect(cifra(cliente, 'Comentarios abiertos')).toHaveText('1');
  // Comentar no cambia el estado de aprobación.
  await expect(cifra(cliente, 'Aprobadas')).toHaveText('0 / 30');
  expect(await violaciones(cliente)).toEqual([]);
  await ctxCliente.close();

  // El equipo: el contador en la miniatura y el filtro «Con comentarios».
  const ctxEquipo = await browser.newContext();
  const equipo = await ctxEquipo.newPage();
  await simularApi(equipo, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL', comentarios });
  await equipo.goto(URL_REVISION);
  await expect(cifra(equipo, 'Comentarios abiertos')).toHaveText('1');
  await expect(pantallas(equipo).getByRole('button', { name: /1 comentario abierto/ })).toHaveCount(1);
  await pantallas(equipo).getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'Con comentarios (1)' }).click();
  await expect(pantallas(equipo).getByRole('listitem')).toHaveCount(1);
  await pantallas(equipo).getByRole('button', { name: /1 comentario abierto/ }).click();
  const item = panel(equipo).getByRole('listitem');
  await expect(item).toContainText('El logo del cliente debe ir en la esquina superior derecha.');
  await expect(item).toContainText('Cliente');

  await item.getByRole('button', { name: `Resolver el comentario de ${comentarios[0]!.autor.nombre}` }).click();
  await expect(panel(equipo).getByRole('status')).toHaveText('Comentario resuelto.');
  await expect(item).toContainText('Resuelto');
  await expect(item).toContainText('Resuelto por Diseño instruccional');
  await expect(cifra(equipo, 'Comentarios abiertos')).toHaveText('0');
  await expect(pantallas(equipo).getByRole('group', { name: 'Filtro' }).getByRole('button', { name: 'Con comentarios (0)' })).toBeVisible();
  await expect(cifra(equipo, 'Aprobadas')).toHaveText('0 / 30');
  expect(await violaciones(equipo)).toEqual([]);

  // Reabrir lo deja otra vez abierto.
  await item.getByRole('button', { name: /^Reabrir el comentario/ }).click();
  await expect(panel(equipo).getByRole('status')).toHaveText('Comentario reabierto.');
  await expect(cifra(equipo, 'Comentarios abiertos')).toHaveText('1');
  expect(comentarios[0]).toMatchObject({ resuelto: false, resueltoPor: null });
  await ctxEquipo.close();
});
