/**
 * HU-1508 · CP-120: mide el Inicio publicado con Lighthouse en celular (4G simulado y CPU 4x, la configuración móvil
 * por defecto) y falla si LCP ≥ 2,5 s, SEO < 90 o accesibilidad < 90 (REQ-109).
 *
 * Sin `SITIO_LIGHTHOUSE_URL`, sirve en un puerto local el sitio de ejemplo de producción pre-renderizado con
 * `@aptio/sitio` y las mismas cabeceras que `GET /s/*`. Con `SITIO_LIGHTHOUSE_URL=http://localhost:3000/s/` mide el
 * sitio que sirve la API. Chrome: `CHROME_PATH`, o el Chromium de Playwright si está instalado.
 */
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import * as chromeLauncher from 'chrome-launcher';
import lighthouse from 'lighthouse';
import { cabecerasSitio, instantaneaDeEjemplo, leerFuente, noModificado, renderizar404, renderizarSitio, resolverPedido } from '../src/index.js';

export const UMBRALES = { lcpMs: 2500, seo: 0.9, accesibilidad: 0.9 };

function rutaChrome(): string | undefined {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  try {
    return (createRequire(import.meta.url)('playwright') as { chromium: { executablePath(): string } }).chromium.executablePath();
  } catch {
    return undefined;
  }
}

async function servirEjemplo(): Promise<{ url: string; cerrar: () => void }> {
  const servidor = createServer();
  await new Promise<void>((ok) => servidor.listen(0, '127.0.0.1', ok));
  const origen = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  // El sitio vive bajo /s: el canonical y el sitemap apuntan ahí, como detrás de la CDN apuntarían a la raíz.
  const op = { entorno: 'produccion' as const, sitioUrl: `${origen}/s`, base: '/s' };
  const inst = instantaneaDeEjemplo('produccion');
  const archivos = new Map(renderizarSitio(inst, op).map((a) => [a.archivo, a.contenido]));
  servidor.on('request', (req, res) => {
    const url = req.url ?? '/';
    // robots.txt va en la raíz del dominio, como lo sirve la API.
    const pedido = url === '/robots.txt' ? resolverPedido(url) : url === '/s' || url.startsWith('/s/') ? resolverPedido(url.slice(2) || '/') : null;
    const cuerpo = pedido ? (pedido.tipo === 'fuente' ? leerFuente(pedido.archivo) : archivos.get(pedido.archivo) ?? null) : null;
    if (!pedido || cuerpo === null) {
      const html = archivos.get('404.html') ?? renderizar404(inst, op);
      res.writeHead(404, cabecerasSitio('404', html)).end(html);
      return;
    }
    const cab = cabecerasSitio(pedido.tipo, cuerpo);
    if (noModificado(req.headers['if-none-match'], cab.ETag!)) return void res.writeHead(304, cab).end();
    res.writeHead(200, cab).end(cuerpo);
  });
  return { url: `${origen}/s/`, cerrar: () => servidor.close() };
}

const local = process.env.SITIO_LIGHTHOUSE_URL ? null : await servirEjemplo();
const url = process.env.SITIO_LIGHTHOUSE_URL ?? local!.url;
const ruta = rutaChrome();
const chrome = await chromeLauncher.launch({ ...(ruta ? { chromePath: ruta } : {}), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
try {
  const r = await lighthouse(url, { port: chrome.port, output: ['json', 'html'], onlyCategories: ['performance', 'seo', 'accessibility'], logLevel: 'error' });
  if (!r) throw new Error('Lighthouse no devolvió resultados');
  const { lhr } = r;
  const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY;
  const seo = lhr.categories.seo?.score ?? 0;
  const a11y = lhr.categories.accessibility?.score ?? 0;
  const rendimiento = lhr.categories.performance?.score ?? 0;
  mkdirSync('lighthouse', { recursive: true });
  const [json, html] = r.report as string[];
  writeFileSync('lighthouse/inicio.json', json!);
  writeFileSync('lighthouse/inicio.html', html!);
  const filas = [
    ['LCP', `${(lcp / 1000).toFixed(2)} s`, `< ${UMBRALES.lcpMs / 1000} s`, lcp < UMBRALES.lcpMs],
    ['SEO', String(Math.round(seo * 100)), `≥ ${UMBRALES.seo * 100}`, seo >= UMBRALES.seo],
    ['Accesibilidad', String(Math.round(a11y * 100)), `≥ ${UMBRALES.accesibilidad * 100}`, a11y >= UMBRALES.accesibilidad],
  ] as const;
  console.log(`CP-120 · Lighthouse ${lhr.lighthouseVersion} en celular sobre ${url}`);
  for (const [n, v, u, ok] of filas) console.log(`  ${ok ? '✓' : '✗'} ${n}: ${v} (umbral ${u})`);
  console.log(`  · Rendimiento (informativo): ${Math.round(rendimiento * 100)}. Informe en packages/sitio/lighthouse/inicio.html`);
  for (const a of Object.values(lhr.audits)) {
    if (a.score !== null && a.score < 1 && ['seo', 'accessibility'].some((c) => lhr.categories[c]?.auditRefs.some((x) => x.id === a.id && x.weight > 0))) console.log(`  - ${a.id}: ${a.title}`);
  }
  if (!filas.every((f) => f[3])) process.exitCode = 1;
} finally {
  await chrome.kill();
  local?.cerrar();
}
