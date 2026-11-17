/**
 * HU-1508 · CP-120: mide el Inicio publicado con Lighthouse en celular (4G simulado y CPU 4x, la configuración móvil
 * por defecto) y falla si LCP ≥ 2,5 s, SEO < 90 o accesibilidad < 90 (REQ-109). HU-1603 · El sitio local sirve un popup
 * activo (la barra de anuncio, al cargar) en `_popups.json`; la medición también falla si el CLS no está en verde
 * (< 0,1) o si algún desplazamiento de la página viene de un popup (los popups son fijos: no deben mover nada).
 * HU-1605 · También mide `/agendar-demo` con el agendador (las franjas de ejemplo en `_agenda.json`): mismos umbrales, y
 * falla si algún desplazamiento viene del bloque (el contenedor reserva su alto: el calendario no debe mover nada).
 * HU-1604 · Las dos páginas se miden con el chatbot activo (`_chatbot.json` de ejemplo): el botón del chat es fijo y
 * también falla la medición si algún desplazamiento viene de él.
 * HU-1606 · El sitio de ejemplo trae etiquetas (IDs de ejemplo), así que las dos páginas se miden con el aviso de cookies
 * visible (sin decisión guardada) y la CSP de esa versión; falla si algún desplazamiento viene del aviso.
 * HU-1607 · Cada página medida carga `_visita.js`, que manda su visita a `POST /s/_visita` (aquí, 204 como la API).
 * HU-1703 · También mide `/pago?plan=productora` con el checkout (el plan de ejemplo en `GET /api/v1/publico/planes/…`):
 * LCP, accesibilidad y CLS con los mismos umbrales, y falla si algún desplazamiento viene del checkout. La página no se
 * indexa a propósito (`noindex`), así que su SEO se informa sin umbral.
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
import { planesServidos } from '@aptio/schema/sitio-versiones';
import { agendaDeEjemplo, ARCHIVO_AGENDA_JSON, ARCHIVO_CHATBOT_JSON, ARCHIVO_POPUPS_JSON, chatbotDeEjemplo, cabecerasSitio, instantaneaDeEjemplo, leerFuente, noModificado, popupsDeEjemplo, renderizar404, renderizarSitio, resolverPedido, RUTA_EVENTO_POPUP, RUTA_VISITA } from '../src/index.js';

export const UMBRALES = { lcpMs: 2500, seo: 0.9, accesibilidad: 0.9, cls: 0.1 };

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
  const inst = instantaneaDeEjemplo('produccion', { agenda: true, cookies: true, planes: true });
  const archivos = new Map(renderizarSitio(inst, op).map((a) => [a.archivo, a.contenido]));
  servidor.on('request', (req, res) => {
    const url = req.url ?? '/';
    // HU-1603 · Los popups en vivo (aquí, uno de ejemplo activo) y sus eventos, como los atiende la API.
    if (url === `/s/${ARCHIVO_POPUPS_JSON}`) return void res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30' }).end(JSON.stringify({ popups: popupsDeEjemplo() }));
    if (url === `/s/${RUTA_EVENTO_POPUP}` && req.method === 'POST') return void res.writeHead(204).end();
    // HU-1607 · La visita anónima que manda `_visita.js` en cada página medida (la API responde 204).
    if (url === `/s/${RUTA_VISITA}` && req.method === 'POST') return void res.writeHead(204, { 'Cache-Control': 'no-store' }).end();
    // HU-1703 · El plan publicado que lee el checkout, como lo sirve la API.
    const plan = url.match(/^\/api\/v1\/publico\/planes\/([a-z0-9-]+)$/);
    if (plan) {
      const servidos = planesServidos(inst, 'produccion');
      const p = servidos?.planes.find((x) => x.slug === plan[1]);
      return void res.writeHead(p ? 200 : 404, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(p ? { ...p, ajustes: servidos!.ajustes } : { codigo: 'NO_ENCONTRADO' }));
    }
    // HU-1605 · Las franjas libres en vivo, como las sirve la API.
    // HU-1604 · El chatbot activo: el botón flotante del chat está en todas las páginas medidas.
    if (url.split('?')[0] === `/s/${ARCHIVO_CHATBOT_JSON}`) return void res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=30' }).end(JSON.stringify(chatbotDeEjemplo(url.includes('idioma=en') ? 'en' : 'es', new Date())));
    if (url.split('?')[0] === `/s/${ARCHIVO_AGENDA_JSON}`) return void res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'public, max-age=0, s-maxage=15' }).end(JSON.stringify(agendaDeEjemplo(new Date())));
    // robots.txt va en la raíz del dominio, como lo sirve la API.
    const pedido = url === '/robots.txt' ? resolverPedido(url) : url === '/s' || url.startsWith('/s/') ? resolverPedido(url.slice(2) || '/') : null;
    const cuerpo = pedido ? (pedido.tipo === 'fuente' ? leerFuente(pedido.archivo) : archivos.get(pedido.archivo) ?? null) : null;
    if (!pedido || cuerpo === null) {
      const html = archivos.get('404.html') ?? renderizar404(inst, op);
      res.writeHead(404, cabecerasSitio('404', html)).end(html);
      return;
    }
    const cab = cabecerasSitio(pedido.tipo, cuerpo, { cookies: inst.sitio?.cookies ?? null });
    if (noModificado(req.headers['if-none-match'], cab.ETag!)) return void res.writeHead(304, cab).end();
    res.writeHead(200, cab).end(cuerpo);
  });
  return { url: `${origen}/s/`, cerrar: () => servidor.close() };
}

const local = process.env.SITIO_LIGHTHOUSE_URL ? null : await servirEjemplo();
const base = process.env.SITIO_LIGHTHOUSE_URL ?? local!.url;
const PAGINAS = [
  { nombre: 'inicio', ruta: '', bloque: 'el popup activo, el chat o el aviso de cookies', propio: /\bpp-|data-popup|\bch-|\bck-/ },
  { nombre: 'agendar-demo', ruta: 'agendar-demo', bloque: 'el agendador, el chat o el aviso de cookies', propio: /booker|\bag-|data-agenda|#agendar|\bch-|\bck-/ },
  // HU-1702 · /precios con los planes de la versión publicada, en HTML estático (CLS 0).
  { nombre: 'precios', ruta: 'precios', bloque: 'los planes, el chat o el aviso de cookies', propio: /\bplan|price|badge5|\bch-|\bck-/ },
  // HU-1703 · /pago con el checkout: sin indexar a propósito, así que el SEO se informa sin umbral.
  { nombre: 'pago', ruta: 'pago?plan=productora', bloque: 'el checkout o el aviso de cookies', propio: /\bpg|data-checkout|\bck-/, sinSeo: true },
] as const;
const ruta = rutaChrome();
const chrome = await chromeLauncher.launch({ ...(ruta ? { chromePath: ruta } : {}), chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'] });
try {
  mkdirSync('lighthouse', { recursive: true });
  for (const p of PAGINAS) {
    const url = `${base}${p.ruta}`;
    const r = await lighthouse(url, { port: chrome.port, output: ['json', 'html'], onlyCategories: ['performance', 'seo', 'accessibility'], logLevel: 'error' });
    if (!r) throw new Error('Lighthouse no devolvió resultados');
    const { lhr } = r;
    const lcp = lhr.audits['largest-contentful-paint']?.numericValue ?? Number.POSITIVE_INFINITY;
    const seo = lhr.categories.seo?.score ?? 0;
    const a11y = lhr.categories.accessibility?.score ?? 0;
    const rendimiento = lhr.categories.performance?.score ?? 0;
    const cls = lhr.audits['cumulative-layout-shift']?.numericValue ?? Number.POSITIVE_INFINITY;
    const desplazamientos = ((lhr.audits['layout-shifts']?.details as { items?: { node?: { selector?: string } }[] } | undefined)?.items ?? []).map((x) => x.node?.selector ?? '');
    const delBloque = desplazamientos.filter((x) => p.propio.test(x));
    const [json, html] = r.report as string[];
    writeFileSync(`lighthouse/${p.nombre}.json`, json!);
    writeFileSync(`lighthouse/${p.nombre}.html`, html!);
    const filas = [
      ['LCP', `${(lcp / 1000).toFixed(2)} s`, `< ${UMBRALES.lcpMs / 1000} s`, lcp < UMBRALES.lcpMs],
      ...('sinSeo' in p ? [] : [['SEO', String(Math.round(seo * 100)), `≥ ${UMBRALES.seo * 100}`, seo >= UMBRALES.seo] as const]),
      ['Accesibilidad', String(Math.round(a11y * 100)), `≥ ${UMBRALES.accesibilidad * 100}`, a11y >= UMBRALES.accesibilidad],
      ['CLS', cls.toFixed(5), `< ${UMBRALES.cls}`, cls < UMBRALES.cls],
      ...(local ? [[`Desplazamientos causados por ${p.bloque}`, String(delBloque.length), '= 0', delBloque.length === 0] as const] : []),
    ] as const;
    console.log(`${p.nombre === 'inicio' ? 'CP-120' : p.nombre === 'precios' ? 'HU-1702' : p.nombre === 'pago' ? 'HU-1703' : 'HU-1605'} · Lighthouse ${lhr.lighthouseVersion} en celular sobre ${url}`);
    for (const [n, v, u, ok] of filas) console.log(`  ${ok ? '✓' : '✗'} ${n}: ${v} (umbral ${u})`);
    if ('sinSeo' in p) console.log(`  · SEO (informativo, la página no se indexa): ${Math.round(seo * 100)}`);
    console.log(`  · Rendimiento (informativo): ${Math.round(rendimiento * 100)}. Informe en packages/sitio/lighthouse/${p.nombre}.html`);
    if (desplazamientos.length) console.log(`  · Elementos que se desplazaron: ${desplazamientos.join(', ')}`);
    for (const a of Object.values(lhr.audits)) {
      if (a.score !== null && a.score < 1 && ('sinSeo' in p ? ['accessibility'] : ['seo', 'accessibility']).some((c) => lhr.categories[c]?.auditRefs.some((x) => x.id === a.id && x.weight > 0))) console.log(`  - ${a.id}: ${a.title}`);
    }
    if (!filas.every((f) => f[3])) process.exitCode = 1;
  }
} finally {
  await chrome.kill();
  local?.cerrar();
}
