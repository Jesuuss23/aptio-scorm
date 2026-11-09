// HU-0110 · Auditoría visual de docs/22-auditoria-prototipo.md repetida sobre apps/web.
import { expect, type Page, test } from '@playwright/test';
import { ANCHO_BARRA_LATERAL, ESCALA_TIPOGRAFICA, MARGEN_ESCRITORIO, TAMANO_TITULO_PAGINA } from '../../../packages/ui/src/tokens';
import { simularApi } from './api-simulada';

const CON_ESTRUCTURA = ['/', '/no-existe'];
const SIN_ESTRUCTURA = ['/ingresar', '/olvido', '/clave?token=vigente'];

async function abrir(page: Page, ruta: string) {
  await simularApi(page, { conSesion: CON_ESTRUCTURA.includes(ruta) });
  await page.goto(ruta);
  await expect(page.locator('h1')).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

/** Tamaños de letra de todo elemento con texto visible, y cuáles usan el tamaño del título. */
const medirLetra = (page: Page) =>
  page.evaluate(() => {
    const tamanos = new Map<number, string[]>();
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      const conTexto = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
      const r = el.getBoundingClientRect();
      if (!conTexto || r.width === 0 || r.height === 0 || el.closest('.sr')) continue;
      const t = parseFloat(getComputedStyle(el).fontSize);
      tamanos.set(t, [...(tamanos.get(t) ?? []), el.tagName.toLowerCase()]);
    }
    return [...tamanos.entries()];
  });

test.describe('CP-013 · margen de 32 px desde la barra lateral', () => {
  for (const ancho of [1280, 1440, 1920]) {
    for (const ruta of CON_ESTRUCTURA) {
      test(`${ruta} a ${ancho} px`, async ({ page }) => {
        await page.setViewportSize({ width: ancho, height: 900 });
        await abrir(page, ruta);
        const barra = await page.locator('.ap-lateral').boundingBox();
        const titulo = await page.locator('main h1').boundingBox();
        const ruta_ = await page.locator('.ap-ruta').boundingBox();
        expect(barra!.width).toBe(ANCHO_BARRA_LATERAL);
        expect(titulo!.x - (barra!.x + barra!.width)).toBe(MARGEN_ESCRITORIO);
        // La ruta de la barra superior queda alineada con el título.
        expect(ruta_!.x).toBe(titulo!.x);
      });
    }
  }
});

test.describe('CP-014 · escala tipográfica', () => {
  for (const ruta of [...CON_ESTRUCTURA, ...SIN_ESTRUCTURA]) {
    test(`${ruta} solo usa 11, 12, 14, 16, 20 y 26 px`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await abrir(page, ruta);
      const tamanos = await medirLetra(page);
      for (const [t] of tamanos) expect(ESCALA_TIPOGRAFICA, `tamaño ${t} px fuera de la escala`).toContain(t);
      const titulos = tamanos.find(([t]) => t === TAMANO_TITULO_PAGINA)?.[1] ?? [];
      expect(titulos).toEqual(['h1']);
    });
  }
});

test.describe('CP-015 · celular sin desborde horizontal', () => {
  for (const ruta of [...CON_ESTRUCTURA, ...SIN_ESTRUCTURA]) {
    test(`${ruta} a 390 px`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await abrir(page, ruta);
      const { scroll, ancho } = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        ancho: document.documentElement.clientWidth,
      }));
      expect(scroll).toBeLessThanOrEqual(ancho);
    });
  }
});
