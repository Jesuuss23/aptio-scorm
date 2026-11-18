// HU-1515 · Segundo factor del superadmin contra la API simulada: configurar la aplicación con el QR y guardar los
// códigos de recuperación (CP-160), y entrar con el código o con un código de recuperación (CP-161). Solo teclado y
// axe WCAG 2.2 A/AA en 0 violaciones a 390 y 1280 px.
import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { CODIGOS_RECUPERACION_SIM, SECRETO_TOTP_SIM, simularApi, USUARIO } from './api-simulada';

const REGLAS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa'];
const sinViolaciones = async (page: Page) => {
  const axe = await new AxeBuilder({ page }).withTags(REGLAS).include('main').analyze();
  expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`)).toEqual([]);
};

async function conClave(page: Page) {
  await page.goto('/ingresar');
  await page.getByLabel('Correo').fill(USUARIO.email);
  await page.getByLabel('Clave').fill('clave-correcta');
  await page.getByRole('button', { name: 'Ingresar' }).click();
  await expect(page).toHaveURL(/\/ingresar\/segundo-factor$/);
}

for (const ancho of [390, 1280]) {
  test.describe(`a ${ancho} px`, () => {
    test.beforeEach(async ({ page }) => {
      await page.setViewportSize({ width: ancho, height: 900 });
    });

    test('CP-160 · el primer ingreso muestra el QR, activa con el código y entrega los códigos de recuperación', async ({ page }) => {
      await simularApi(page, { conSesion: false, rol: 'SUPERADMIN', segundoFactor: 'configurar' });
      await conClave(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Activa la verificación en dos pasos');
      const qr = page.getByRole('img', { name: 'Código QR para agregar Aptio SCORM a tu aplicación autenticadora' });
      await expect(qr).toBeVisible();
      await expect(qr).toHaveAttribute('src', /^data:image\/svg\+xml/);
      await expect(page.locator('.secreto-totp')).toHaveText(SECRETO_TOTP_SIM.match(/.{4}/g)!.join(' '));
      await sinViolaciones(page);

      await page.getByLabel('Código de 6 dígitos').fill('000000');
      await page.getByRole('button', { name: 'Activar' }).click();
      await expect(page.getByRole('alert')).toHaveText('Código incorrecto');
      await expect(page.getByLabel('Código de 6 dígitos')).toBeFocused();
      await expect(page.getByLabel('Código de 6 dígitos')).toHaveValue('');

      await page.getByLabel('Código de 6 dígitos').fill('123 456');
      await page.getByRole('button', { name: 'Activar' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Guarda tus códigos de recuperación');
      await expect(page.getByRole('status')).toHaveText('La verificación en dos pasos quedó activada.');
      const lista = page.getByRole('list', { name: 'Códigos de recuperación' });
      await expect(lista.getByRole('listitem')).toHaveText(CODIGOS_RECUPERACION_SIM);
      await expect(page.getByRole('link', { name: 'Descargar' })).toHaveAttribute('download', 'aptio-codigos-recuperacion.txt');
      await sinViolaciones(page);

      // Continuar exige confirmar que se guardaron; después entra al panel del superadmin.
      const continuar = page.getByRole('button', { name: 'Continuar' });
      await expect(continuar).toBeDisabled();
      await page.getByLabel('Guardé los códigos en un lugar seguro, fuera de este equipo').check();
      await continuar.click();
      await expect(page).toHaveURL(/\/sitio$/);
    });

    test('CP-161 · con la aplicación ya activa, entra con el código; sin teléfono, con un código de recuperación', async ({ page }) => {
      await simularApi(page, { conSesion: false, rol: 'SUPERADMIN' });
      await conClave(page);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verificación en dos pasos');
      await expect(page.getByRole('img', { name: /Código QR/ })).toHaveCount(0);
      await sinViolaciones(page);
      await page.getByLabel('Código de 6 dígitos').fill('123456');
      await page.getByRole('button', { name: 'Verificar' }).click();
      await expect(page).toHaveURL(/\/sitio$/);

      await page.getByRole('button', { name: 'Salir' }).click();
      await conClave(page);
      await page.getByRole('button', { name: 'No tengo mi teléfono: usar un código de recuperación' }).click();
      await expect(page.getByLabel('Código de recuperación')).toBeVisible();
      await page.getByLabel('Código de recuperación').fill('zzzzz-zzzzz');
      await page.getByRole('button', { name: 'Verificar' }).click();
      await expect(page.getByRole('alert')).toHaveText('Código incorrecto');
      await page.getByLabel('Código de recuperación').fill('abcde-fghjk');
      await page.getByRole('button', { name: 'Verificar' }).click();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingresaste con un código de recuperación');
      await expect(page.getByRole('status')).toHaveText('Te quedan 9 códigos de recuperación.');
      await sinViolaciones(page);
      await page.getByRole('button', { name: 'Continuar' }).click();
      await expect(page).toHaveURL(/\/sitio$/);
    });
  });
}

test('el segundo factor se completa solo con el teclado', async ({ page }) => {
  await simularApi(page, { conSesion: false, rol: 'SUPERADMIN' });
  await page.goto('/ingresar');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ingresar');
  await page.keyboard.press('Tab');
  await page.keyboard.type(USUARIO.email);
  await page.keyboard.press('Tab');
  await page.keyboard.type('clave-correcta');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Verificación en dos pasos');
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Código de 6 dígitos')).toBeFocused();
  await page.keyboard.type('123456');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/sitio$/);
});

test('un desafío vencido (o entrar directo sin la clave) pide volver a ingresar', async ({ page }) => {
  await simularApi(page, { conSesion: false, rol: 'SUPERADMIN' });
  await page.goto('/ingresar/segundo-factor');
  await expect(page.getByRole('alert')).toHaveText('El paso del segundo factor venció. Vuelve a ingresar.');
  await page.getByRole('link', { name: 'Volver a ingresar' }).click();
  await expect(page).toHaveURL(/\/ingresar$/);
});
