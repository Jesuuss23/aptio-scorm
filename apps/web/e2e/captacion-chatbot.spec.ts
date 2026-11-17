// HU-1604 · Chatbot del sitio (REQ-077, PNT-32, RN-17-4, CP-133, CP-134). En el sitio: el botón flotante abre un diálogo
// accesible (foco atrapado, Escape devuelve el foco, todo con el teclado) que responde citando la fuente; una pregunta
// sin respuesta da «no lo sé» con «Agendar demo» y «Hablar con una persona» (CP-133); la demo se agenda desde el chat y
// aparece en Captación › Agendamiento (CP-134); el traspaso ofrece WhatsApp en horario y el correo fuera de horario; la
// conversación sigue al recargar (sessionStorage) y el chat no aparece en el pago ni oculto. En el panel, Captación ›
// Chatbot: identidad, respuestas rápidas con su orden, fuentes y conversaciones. axe WCAG 2.2 A/AA a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { type AsesorSim, reservasSim, type TipoSim } from './agenda-simulada';
import { simularApi } from './api-simulada';
import { chatsSim, type ChatbotSitioSim, type RapidaSim } from './chatbot-simulado';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000030${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/pago', 'Pago')];
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000030${n}`, paginaId, tipo, orden: n, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const BLOQUES = [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[0]!.id, 'faq'), bloque(2, PAGINAS[1]!.id, 'hero')];
const ELEMENTOS = [{
  id: '00000000-0000-4000-9200-000000000301', coleccion: 'preguntas', idioma: 'es' as const, orden: 0, visible: true,
  datos: { pregunta: '¿Funciona con Moodle?', respuesta: 'Sí: el paquete SCORM 1.2 sube a Moodle 4.5 o superior como cualquier otro.' }, creadoEn: F, actualizadoEn: F,
}];
const rapida = (n: number, textoEs: string, accion: RapidaSim['accion'], d: Partial<RapidaSim> = {}): RapidaSim => ({ id: `00000000-0000-4000-9e00-00000000000${n}`, textoEs, textoEn: '', accion, visible: true, orden: n, ficticio: false, ...d });
const RAPIDAS = [rapida(1, '¿Funciona con Moodle?', 'consulta_ia'), rapida(2, 'Agendar demo', 'agendar_demo'), rapida(3, 'Hablar con una persona', 'hablar_persona')];
const SIEMPRE = { diasAtencion: [1, 2, 3, 4, 5, 6, 7], horarioInicio: '00:00', horarioFin: '23:59' };
const NUNCA = { diasAtencion: [] as number[] };
const CHAT: ChatbotSitioSim = { ajustes: { visible: true, nombre: 'Ana', saludoEs: 'Hola, soy Ana. ¿Quieres ver cómo convertir un manual en una cápsula SCORM?', ...SIEMPRE }, rapidas: RAPIDAS };
const CARLA: AsesorSim = { id: '00000000-0000-4000-9c00-000000000301', nombre: 'Carla Montoya', correo: 'carla@aptioscorm.com', enlaceVideollamada: 'https://meet.google.com/abc-defg-hij', visible: true, ficticio: false };
const DEMO: TipoSim = { id: '00000000-0000-4000-9b00-000000000301', nombreEs: 'Demo del generador', nombreEn: 'Generator demo', minutos: 30, asesorIds: [CARLA.id], visible: true, ficticio: false };
const SITIO = { conSesion: true, rol: 'SUPERADMIN', versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES, elementosSitio: ELEMENTOS, ajustesSitio: { whatsapp: { visible: true, numero: '+51987654321', mensaje: null } } };

const sinViolaciones = async (page: Page, incluir = 'main') => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include(incluir).analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};
const abrirSitio = async (page: Page, ruta = '/s/') => {
  const listo = page.waitForResponse((r) => new URL(r.url()).pathname === '/s/_chatbot.json');
  await page.goto(ruta);
  await listo;
};
const boton = (page: Page) => page.getByRole('button', { name: 'Abrir el chat con Ana' });
const dialogo = (page: Page) => page.getByRole('dialog', { name: 'Ana' });
const log = (page: Page) => dialogo(page).getByRole('log', { name: 'Conversación' });

test('responde citando la fuente, sigue al recargar (sessionStorage) y se maneja con el teclado (Escape y Tab)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, chatbotSitio: CHAT });
  await abrirSitio(page);
  await expect(boton(page)).toHaveAttribute('aria-expanded', 'false');
  await boton(page).focus();
  await page.keyboard.press('Enter');
  await expect(dialogo(page)).toBeVisible();
  await expect(dialogo(page)).toHaveAttribute('aria-modal', 'true');
  await expect(boton(page)).toHaveAttribute('aria-expanded', 'true');
  const entrada = dialogo(page).getByRole('textbox', { name: 'Escribe tu pregunta' });
  await expect(entrada).toBeFocused();
  await expect(log(page)).toHaveAttribute('aria-live', 'polite');
  await expect(log(page)).toContainText('Hola, soy Ana. ¿Quieres ver cómo convertir un manual en una cápsula SCORM?');

  await page.keyboard.type('¿Sirve en Moodle?');
  await page.keyboard.press('Enter');
  const respuesta = log(page).locator('.ch-bot').last();
  await expect(respuesta).toContainText('Sí: el paquete SCORM 1.2 sube a Moodle 4.5 o superior como cualquier otro.');
  await expect(respuesta.getByRole('link', { name: '¿Funciona con Moodle?' })).toHaveAttribute('href', '/s/');
  expect(chatsSim.at(-1)).toMatchObject({ ia: true, cuerpo: { mensaje: '¿Sirve en Moodle?', idioma: 'es' } });
  // Al escribir, las respuestas rápidas se van.
  await expect(dialogo(page).getByRole('group', { name: 'Respuestas rápidas' })).toHaveCount(0);

  // El foco no sale del diálogo con Tab y Escape lo cierra devolviendo el foco al botón.
  for (let i = 0; i < 8; i++) await page.keyboard.press('Tab');
  expect(await page.evaluate(() => Boolean(document.activeElement?.closest('.ch-caja')))).toBe(true);
  await page.keyboard.press('Escape');
  await expect(dialogo(page)).toHaveCount(0);
  await expect(boton(page)).toBeFocused();

  // La conversación sigue en la misma pestaña al recargar (sessionStorage, sin cookies).
  const id = await page.evaluate(() => JSON.parse(sessionStorage.getItem('aptio.chat') ?? '{}').id as string);
  expect(id).toMatch(/^[0-9a-f-]{36}$/);
  expect(await page.context().cookies()).toEqual([]);
  await abrirSitio(page);
  await boton(page).click();
  await expect(log(page)).toContainText('¿Sirve en Moodle?');
  await expect(log(page)).toContainText('Sí: el paquete SCORM 1.2 sube a Moodle 4.5');
  await page.keyboard.type('¿Y en Canvas?');
  await page.keyboard.press('Enter');
  await expect(log(page).locator('.ch-bot')).toHaveCount(3);
  expect(chatsSim.at(-1)?.cuerpo.conversacionId).toBe(id);
});

test('CP-133 · una pregunta sin fuente da «no lo sé» con «Agendar demo» y «Hablar con una persona», sin IA', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await simularApi(page, { ...SITIO, chatbotSitio: CHAT });
  await abrirSitio(page);
  await boton(page).click();
  await dialogo(page).getByRole('textbox', { name: 'Escribe tu pregunta' }).fill('¿Cuál es el clima en Cusco?');
  await dialogo(page).getByRole('button', { name: 'Enviar' }).click();
  const respuesta = log(page).locator('.ch-bot').last();
  await expect(respuesta).toContainText('No tengo ese dato en la información de Aptio. Puedo agendarte una demo o pasarte con una persona del equipo.');
  await expect(respuesta.getByRole('button', { name: 'Agendar demo' })).toBeVisible();
  await expect(respuesta.getByRole('button', { name: 'Hablar con una persona' })).toBeVisible();
  expect(chatsSim.at(-1)?.ia).toBe(false);
  await sinViolaciones(page, '.ch-caja');
});

test('CP-134 · agenda una demo desde el chat solo con el teclado y aparece en Captación › Agendamiento con el lead en Demo', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, chatbotSitio: CHAT, agendaSitio: { tipos: [DEMO], asesores: [CARLA], ajustes: { anticipacionHoras: 0 } } });
  await abrirSitio(page);
  await boton(page).focus();
  await page.keyboard.press('Enter');
  // Shift+Tab desde el campo de texto llega a la última respuesta rápida; dos más atrás, «Agendar demo».
  await page.keyboard.press('Shift+Tab');
  await page.keyboard.press('Shift+Tab');
  await expect(dialogo(page).getByRole('button', { name: 'Agendar demo' })).toBeFocused();
  const horarios = page.waitForResponse((r) => new URL(r.url()).pathname === '/s/_agenda.json');
  await page.keyboard.press('Enter');
  await horarios;
  const grupo = dialogo(page).getByRole('group', { name: 'Elige un horario (hora de Lima):' });
  await expect(grupo.getByRole('button')).toHaveCount(6);
  await expect(grupo.getByRole('button').first()).toBeFocused();
  expect(chatsSim.at(-1)).toMatchObject({ ia: false, cuerpo: { accion: 'agendar_demo' } });
  await page.keyboard.press('Enter');
  await expect(grupo.getByRole('button').first()).toHaveAttribute('aria-pressed', 'true');
  await expect(dialogo(page).getByLabel('Nombre')).toBeFocused();
  await page.keyboard.type('Mariana Paredes');
  await page.keyboard.press('Tab');
  await page.keyboard.type('mparedes@minera.example');
  await page.keyboard.press('Tab');
  await page.keyboard.type('Minera Andina');
  await page.keyboard.press('Tab');
  await page.keyboard.press('Space');
  await expect(dialogo(page).getByRole('checkbox')).toBeChecked();
  await page.keyboard.press('Tab');
  await expect(dialogo(page).getByRole('button', { name: /^Confirmar demo · / })).toBeFocused();
  await page.keyboard.press('Enter');
  const listo = log(page).locator('.ch-bot', { hasText: 'Tu demo está agendada:' });
  await expect(listo).toBeFocused();
  await expect(listo).toContainText('Demo del generador');
  await expect(listo.getByRole('link', { name: 'Añadir a Google Calendar (se abre en una pestaña nueva)' })).toHaveAttribute('href', /^https:\/\/calendar\.google\.com\//);
  await expect(listo.getByRole('link', { name: 'Descargar .ics' })).toHaveAttribute('href', /^data:text\/calendar/);
  expect(reservasSim.at(-1)).toMatchObject({ status: 201, cuerpo: { via: 'chatbot', nombre: 'Mariana Paredes', correo: 'mparedes@minera.example' } });
  expect(reservasSim.at(-1)?.cuerpo.conversacionId).toMatch(/^[0-9a-f-]{36}$/);

  await page.goto('/captacion/agendamiento');
  await expect(page.getByRole('heading', { level: 1, name: 'Agendamiento' })).toBeVisible();
  await expect(page.locator('main')).toContainText('Mariana Paredes');
  await page.goto('/captacion/leads');
  const fila = page.getByRole('row').filter({ hasText: 'mparedes@minera.example' });
  await expect(fila).toContainText('Chatbot');
  await expect(fila).toContainText('Demo');
  await page.goto('/captacion/chatbot');
  await expect(page.getByRole('region', { name: /^Conversaciones/ }).locator('summary .chip', { hasText: 'Demo agendada' })).toBeVisible();
});

test('traspaso: en horario ofrece WhatsApp; fuera de horario pide el correo y responde el siguiente día hábil', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await simularApi(page, { ...SITIO, chatbotSitio: CHAT });
  await abrirSitio(page);
  await boton(page).click();
  await dialogo(page).getByRole('button', { name: 'Hablar con una persona' }).click();
  const enHorario = log(page).locator('.ch-bot').last();
  await expect(enHorario).toContainText('Puedes escribirnos por WhatsApp o dejarnos tu correo y tu pregunta.');
  await expect(enHorario.getByRole('link', { name: 'Escribir por WhatsApp (se abre en una pestaña nueva)' })).toHaveAttribute('href', 'https://wa.me/51987654321');
  expect(chatsSim.at(-1)).toMatchObject({ ia: false, cuerpo: { accion: 'hablar_persona' } });

  await page.evaluate(() => sessionStorage.clear());
  await simularApi(page, { ...SITIO, chatbotSitio: { ...CHAT, ajustes: { ...CHAT.ajustes, ...NUNCA } } });
  await abrirSitio(page);
  await boton(page).click();
  await dialogo(page).getByRole('button', { name: 'Hablar con una persona' }).click();
  const fuera = log(page).locator('.ch-bot').last();
  await expect(fuera).toContainText('Ahora no hay nadie del equipo en línea. Déjanos tu correo y tu pregunta: te respondemos el siguiente día hábil.');
  await expect(fuera.getByRole('link', { name: /WhatsApp/ })).toHaveCount(0);
  await expect(fuera.getByLabel('Correo de trabajo')).toBeFocused();
  await fuera.getByLabel('Correo de trabajo').fill('lrios@banco.example');
  await fuera.getByLabel('Tu pregunta').fill('¿Integran con SAP SuccessFactors?');
  await fuera.getByRole('button', { name: 'Enviar mi pregunta' }).click();
  await expect(fuera.getByRole('alert')).toContainText('Revisa estos datos:');
  await fuera.getByRole('checkbox').check();
  await fuera.getByRole('button', { name: 'Enviar mi pregunta' }).click();
  await expect(log(page).locator('.ch-bot').last()).toHaveText(/Listo: te respondemos el siguiente día hábil a ese correo\./);
  await page.goto('/captacion/leads');
  await expect(page.getByRole('row').filter({ hasText: 'lrios@banco.example' })).toContainText('Chatbot');
});

test('no aparece en el pago ni con el chatbot oculto', async ({ page }) => {
  await simularApi(page, { ...SITIO, chatbotSitio: CHAT });
  await page.goto('/s/pago');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.ch-abrir')).toHaveCount(0);
  await abrirSitio(page);
  await expect(boton(page)).toBeVisible();
  // Con el WhatsApp flotante, el botón del chat va arriba de él (los dos son fijos: no mueven la página).
  await expect(boton(page)).toHaveClass(/ch-arriba/);

  await simularApi(page, { ...SITIO, chatbotSitio: { ...CHAT, ajustes: { ...CHAT.ajustes, visible: false } } });
  await abrirSitio(page);
  await page.waitForLoadState('networkidle');
  await expect(page.locator('.ch-abrir')).toHaveCount(0);
});

for (const ancho of [390, 1280]) {
  test(`el chat abierto pasa axe a ${ancho} px y #chat lo abre al cargar`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: ancho === 390 ? 844 : 900 });
    await simularApi(page, { ...SITIO, chatbotSitio: CHAT });
    await abrirSitio(page, '/s/#chat');
    await expect(dialogo(page)).toBeVisible();
    await expect(dialogo(page).getByRole('group', { name: 'Respuestas rápidas' }).getByRole('button')).toHaveCount(3);
    await sinViolaciones(page, '.ch-caja');
    await sinViolaciones(page, '.ch-abrir');
  });

  test(`PNT-32 · el panel edita la identidad, las respuestas rápidas, las fuentes y ve las conversaciones (axe a ${ancho} px)`, async ({ page }) => {
    await page.setViewportSize({ width: ancho, height: 900 });
    await simularApi(page, {
      ...SITIO,
      chatbotSitio: {
        ajustes: { visible: false }, rapidas: [rapida(1, '¿Funciona con Moodle?', 'consulta_ia'), rapida(2, 'Agendar demo', 'agendar_demo', { ficticio: true })],
        conversaciones: [{ id: '00000000-0000-4000-9d00-000000000001', idioma: 'es', resultado: 'persona', creadoEn: F, actualizadoEn: F, expiraEn: '2099-01-01T00:00:00.000Z', mensajes: [{ de: 'visitante', texto: '¿Tienen soporte en inglés?', en: F }, { de: 'bot', texto: 'No tengo ese dato.', en: F, acciones: ['agendar_demo', 'hablar_persona'] }] }],
      },
    });
    await page.goto('/captacion/chatbot');
    await expect(page.getByRole('heading', { level: 1, name: 'Chatbot' })).toBeVisible();
    await expect(page.getByRole('navigation').getByRole('link', { name: 'Chatbot' })).toHaveAttribute('aria-current', 'page');
    await sinViolaciones(page);

    // Mostrar en el sitio, en vivo.
    const mostrar = page.getByRole('switch', { name: 'Mostrar chatbot en el sitio' });
    await expect(mostrar).toHaveAttribute('aria-checked', 'false');
    await mostrar.click();
    await expect(page.getByRole('status')).toHaveText('El chatbot ya se muestra en el sitio, sin publicar.');
    await expect(mostrar).toHaveAttribute('aria-checked', 'true');

    // Identidad y objetivo.
    const identidad = page.getByRole('form', { name: 'Identidad y objetivo' });
    await identidad.getByLabel('Nombre').fill('');
    await identidad.getByRole('button', { name: 'Guardar' }).click();
    await expect(identidad.getByRole('alert')).toContainText('No puede quedar vacío');
    await identidad.getByLabel('Nombre').fill('Luz');
    await identidad.getByLabel('Tono').selectOption({ label: 'Formal' });
    await identidad.getByLabel('Objetivo principal').selectOption({ label: 'Captar lead' });
    await identidad.getByRole('checkbox', { name: 'sábado' }).check();
    await identidad.getByRole('button', { name: 'Guardar' }).click();
    await expect(page.getByRole('status')).toHaveText('Se guardaron la identidad y el objetivo. El sitio los usa desde ya.');
    await expect(page.getByText('Ahora: Lun a sáb, 9:00 a 18:00.')).toBeVisible();

    // Respuestas rápidas: alta, orden, mostrar y borrar.
    const rapidas = page.getByRole('region', { name: 'Respuestas rápidas' });
    await expect(rapidas.getByText('Ficticio')).toBeVisible();
    await rapidas.getByRole('button', { name: 'Nueva respuesta' }).click();
    const nueva = page.getByRole('form', { name: 'Nueva respuesta rápida' });
    await nueva.getByLabel('Texto (español)').fill('Hablar con una persona');
    await nueva.getByLabel('Texto (inglés)').fill('Talk to a person');
    await nueva.getByLabel('Al pulsarla').selectOption({ label: 'Hablar con una persona' });
    await nueva.getByRole('button', { name: 'Guardar respuesta' }).click();
    await expect(page.getByRole('status')).toHaveText('Se agregó «Hablar con una persona» al final.');
    await rapidas.getByRole('button', { name: 'Subir Hablar con una persona' }).click();
    await expect(page.getByRole('status')).toHaveText('«Hablar con una persona» quedó en la posición 2.');
    await expect(rapidas.locator('.chat-lista > li b')).toHaveText(['¿Funciona con Moodle?', 'Hablar con una persona', 'Agendar demo']);
    await rapidas.getByRole('switch', { name: 'Mostrar ¿Funciona con Moodle?' }).click();
    await expect(page.getByRole('status')).toHaveText('«¿Funciona con Moodle?» ya no se muestra en el chat.');
    await rapidas.getByRole('button', { name: 'Borrar Agendar demo' }).click();
    await rapidas.getByRole('group', { name: 'Confirmar el borrado de Agendar demo' }).getByRole('button', { name: 'Sí, borrar' }).click();
    await expect(page.getByRole('status')).toHaveText('Se borró «Agendar demo».');

    // Base de conocimiento: lo que toma del sitio y una fuente manual.
    const baseC = page.getByRole('region', { name: 'Base de conocimiento' });
    await expect(baseC).toContainText('toma 0 páginas y 1 preguntas frecuentes en español');
    await baseC.getByRole('button', { name: 'Agregar fuente' }).click();
    const fuente = page.getByRole('form', { name: 'Nueva fuente' });
    await fuente.getByLabel('Título').fill('Tiempos de producción');
    await fuente.getByLabel(/^Contenido/).fill('<b>x</b>');
    await fuente.getByRole('button', { name: 'Guardar fuente' }).click();
    await expect(fuente.getByRole('alert')).toContainText('Solo texto, sin etiquetas HTML');
    await fuente.getByLabel(/^Contenido/).fill('Una cápsula de 5 minutos se entrega en 3 días hábiles.');
    await fuente.getByRole('button', { name: 'Guardar fuente' }).click();
    await expect(page.getByRole('status')).toHaveText('Se agregó «Tiempos de producción». El chatbot ya puede usarla.');
    await baseC.getByRole('switch', { name: 'Usar Tiempos de producción' }).click();
    await expect(page.getByRole('status')).toHaveText('«Tiempos de producción» ya no se usa en las respuestas.');

    // Conversaciones y «Probar».
    const conv = page.getByRole('region', { name: /^Conversaciones/ });
    await expect(conv.getByText('¿Tienen soporte en inglés?', { exact: true })).toBeVisible();
    await conv.getByText('¿Tienen soporte en inglés?', { exact: true }).click();
    await expect(conv.getByText('Ofreció: Agendar demo y Hablar con una persona')).toBeVisible();
    await conv.getByLabel('Resultado').selectOption('demo');
    await expect(conv.getByText('No hay conversaciones con ese resultado.')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Abrir el chat en el sitio (se abre en una pestaña nueva)' })).toHaveAttribute('href', '/s/#chat');
    await sinViolaciones(page);
  });
}
