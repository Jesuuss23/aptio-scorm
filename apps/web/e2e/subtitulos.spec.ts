// HU-0801 · Subtítulos WebVTT en la vista previa (CP-075): con «CC», mientras suena la narración se ve la frase que se
// está diciendo, según el VTT que escribió la etapa 8; en pausa, el texto completo. La preferencia se recuerda.
import { expect, test } from '@playwright/test';
import { simularApi } from './api-simulada';

const URL_VISTA = '/proyectos/00000000-0000-4000-8000-000000000701/vista-previa';
const FRASE_1 = 'Soy Ana, supervisora de seguridad.';
const FRASE_2 = 'Te voy a mostrar cómo protegerte cuando intervengas un equipo.';

test('CP-075 · la narración tiene su VTT y la vista previa muestra cada frase al decirla', async ({ page }) => {
  await simularApi(page, { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' });
  await page.goto(URL_VISTA);
  const siguiente = page.getByRole('button', { name: 'Siguiente', exact: true });
  await siguiente.click();
  await siguiente.click();
  await expect(page.locator('[data-pantalla="p03"]')).toBeVisible();

  const cc = page.getByRole('button', { name: 'CC Subtítulos' });
  const subtitulos = page.locator('.ap-subtitulos');
  await expect(cc).toHaveAttribute('aria-pressed', 'false');
  await expect(subtitulos).toBeHidden();
  await cc.click();
  await expect(cc).toHaveAttribute('aria-pressed', 'true');
  // En pausa, el texto completo de la narración.
  await expect(subtitulos).toHaveText(`${FRASE_1} ${FRASE_2}`);

  await page.getByRole('button', { name: 'Escuchar narración' }).click();
  await expect(subtitulos).toHaveText(FRASE_1);
  // La segunda frase empieza a los 2,275 s del audio (caso LOTO).
  await expect(subtitulos).toHaveText(FRASE_2, { timeout: 5_000 });
  const t = await page.evaluate(() => {
    const raiz = [...document.querySelectorAll('*')].map((el) => el.shadowRoot).find((s) => s?.querySelector('.ap-r'))!;
    return raiz.querySelector('audio')!.currentTime * 1000;
  });
  expect(t).toBeGreaterThanOrEqual(2275);
  expect(t).toBeLessThan(2275 + 1000);

  await page.getByRole('button', { name: 'Pausar narración' }).click();
  await expect(subtitulos).toHaveText(`${FRASE_1} ${FRASE_2}`);

  // La preferencia se recuerda en el navegador: al volver, «CC» sigue activo.
  await page.reload();
  await expect(page.getByRole('button', { name: 'CC Subtítulos' })).toHaveAttribute('aria-pressed', 'true');
});
