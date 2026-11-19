// Manual de usuario v1.00 · Capturas de los pasos clave con el caso LOTO y la API simulada. No es una prueba: solo
// corre con CAPTURAS=1 y deja los PNG en docs/manuales/capturas/ (1280 × 800).
//   CAPTURAS=1 pnpm --dir apps/web exec playwright test e2e/capturas-manual.spec.ts --workers=1 --trace off
import { fileURLToPath } from 'node:url';
import { expect, type Page, test } from '@playwright/test';
import { CLIENTE_ID, type OpcionesSimulacion, simularApi } from './api-simulada';

test.skip(process.env.CAPTURAS !== '1', 'Solo genera las capturas del manual (CAPTURAS=1)');

const CARPETA = fileURLToPath(new URL('../../../docs/manuales/capturas/', import.meta.url));
const PROYECTO = '00000000-0000-4000-8000-000000000701';
const F = '2026-11-10T15:00:00.000Z';
const pagina = (n: number, ruta: string, titulo: string) => ({ id: `00000000-0000-4000-8000-00000000020${n}`, ruta, idioma: 'es' as const, titulo, estado: 'PUBLICADA' as const, publicarEn: null, publicadaEn: F, creadoEn: F, actualizadoEn: F });
const PAGINAS = [pagina(0, '/', 'Inicio'), pagina(1, '/precios', 'Precios')];
const bloque = (n: number, paginaId: string, tipo: string) => ({ id: `00000000-0000-4000-9100-00000000020${n}`, paginaId, tipo, orden: 0, visible: true, ajustes: null, creadoEn: F, actualizadoEn: F });
const BLOQUES = [bloque(0, PAGINAS[0]!.id, 'hero'), bloque(1, PAGINAS[1]!.id, 'precios')];
const SITIO: Partial<OpcionesSimulacion> = { versionSitio: true, paginasSitio: PAGINAS, bloquesSitio: BLOQUES, planesSitio: { ejemplo: true } };
const CUOTA = { incluidas: 20, usadas: 3, plan: 'productora' };

interface Captura {
  archivo: string;
  ruta: string;
  opciones: OpcionesSimulacion;
  /** Lo que debe verse antes de capturar. */
  espera?: (page: Page) => Promise<void>;
  /** Pasos antes de capturar (abrir un panel, elegir una pestaña). */
  pasos?: (page: Page) => Promise<void>;
}

const titulo = (nombre: RegExp | string) => async (page: Page) => { await expect(page.getByRole('heading', { name: nombre }).first()).toBeVisible(); };

const CAPTURAS: Captura[] = [
  // Ingreso
  { archivo: 'ingreso', ruta: '/', opciones: { conSesion: false }, espera: titulo('Ingresar') },
  // Superadministrador
  { archivo: 'superadmin-sitio-resumen', ruta: '/sitio', opciones: { ...SITIO, conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' } },
  { archivo: 'superadmin-sitio-paginas', ruta: '/sitio/paginas', opciones: { ...SITIO, conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' } },
  { archivo: 'superadmin-leads', ruta: '/captacion/leads', opciones: { ...SITIO, conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' } },
  { archivo: 'superadmin-planes', ruta: '/ventas/planes', opciones: { ...SITIO, conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' } },
  { archivo: 'superadmin-pasarelas', ruta: '/ventas/pasarelas', opciones: { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas', pasarelasSitio: { stripe: true } } },
  { archivo: 'superadmin-facturacion', ruta: '/ventas/facturacion', opciones: { conSesion: true, rol: 'SUPERADMIN', entornoSitio: 'pruebas' } },
  // Administrador de organización
  { archivo: 'admin-clientes', ruta: '/clientes', opciones: { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: CUOTA } },
  { archivo: 'admin-conexiones-ia', ruta: '/conexiones-ia', opciones: { conSesion: true, rol: 'ADMINISTRADOR' } },
  { archivo: 'admin-rentabilidad', ruta: '/rentabilidad', opciones: { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR' } },
  { archivo: 'admin-plan', ruta: '/plan', opciones: { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: CUOTA } },
  { archivo: 'admin-facturacion', ruta: '/facturacion', opciones: { conSesion: true, conProyectos: true, rol: 'ADMINISTRADOR', cuotaSitio: CUOTA } },
  { archivo: 'admin-operacion', ruta: '/operacion', opciones: { conSesion: true, rol: 'ADMINISTRADOR' } },
  // Diseñador instruccional
  { archivo: 'di-proyectos', ruta: '/', opciones: { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL', cuotaSitio: CUOTA } },
  { archivo: 'di-nuevo-scorm', ruta: '/nuevo', opciones: { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' } },
  { archivo: 'di-proyecto-loto', ruta: `/proyectos/${PROYECTO}`, opciones: { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' } },
  { archivo: 'di-revision', ruta: `/proyectos/${PROYECTO}/revision`, opciones: { conSesion: true, conProyectos: true, rol: 'DISENADOR_INSTRUCCIONAL' } },
  // Diseñador gráfico
  { archivo: 'dg-kit', ruta: `/clientes/${CLIENTE_ID}`, opciones: { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' } },
  { archivo: 'dg-editor', ruta: `/proyectos/${PROYECTO}/editor?pantalla=p01`, opciones: { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' } },
  { archivo: 'dg-voz', ruta: `/proyectos/${PROYECTO}/voz`, opciones: { conSesion: true, conProyectos: true, rol: 'DISENADOR_GRAFICO' } },
  // Productor
  { archivo: 'productor-vista-previa', ruta: `/proyectos/${PROYECTO}/vista-previa`, opciones: { conSesion: true, conProyectos: true, rol: 'PRODUCTOR' } },
  { archivo: 'productor-entrega', ruta: `/proyectos/${PROYECTO}/entrega`, opciones: { conSesion: true, conProyectos: true, rol: 'PRODUCTOR' } },
  // Revisor del cliente
  { archivo: 'revisor-revision', ruta: `/proyectos/${PROYECTO}/revision`, opciones: { conSesion: true, conProyectos: true, rol: 'REVISOR_CLIENTE' } },
  // Visitante y comprador
  { archivo: 'visitante-precios', ruta: '/s/precios', opciones: { ...SITIO, conSesion: false, entornoSitio: 'pruebas' }, espera: async (page) => { await expect(page.locator('article.plan').first()).toBeVisible(); } },
  { archivo: 'visitante-pago', ruta: '/s/pago?plan=productora', opciones: { ...SITIO, conSesion: false, entornoSitio: 'pruebas' }, espera: titulo('Suscríbete a Aptio SCORM') },
];

for (const c of CAPTURAS) {
  test(`captura · ${c.archivo}`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await simularApi(page, c.opciones);
    await page.goto(c.ruta);
    if (c.espera) await c.espera(page);
    else await expect(page.locator('main h1, main h2').first()).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/^Cargando/)).toHaveCount(0, { timeout: 20_000 });
    if (c.pasos) await c.pasos(page);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${CARPETA}${c.archivo}.png` });
  });
}
