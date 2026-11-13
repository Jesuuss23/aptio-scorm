/**
 * HU-1508 · CSS del sitio público, en línea en cada página (no hay hojas que bloqueen el primer pintado). Toma la
 * dirección visual de `docs/diseno/sitio-comercial.html` (landing v6: azules, el naranja solo en el logo) y su escala de
 * letra 56 / 40 / 26 / 20 / 16 / 14 / 12. Celular primero: a 640 px y menos, márgenes de 16 px y títulos más chicos.
 */
import { CARPETA_FUENTES, type Fuente } from './fuentes.js';

export function fuentesCss(lista: readonly Fuente[], base: string): string {
  return lista.map((f) =>
    `@font-face{font-family:"${f.familia}";font-style:normal;font-weight:${f.peso};font-display:swap;src:url(${base}/${CARPETA_FUENTES}/${f.archivo}) format("woff2")}`).join('');
}

export const CSS_SITIO = `
:root{color-scheme:light;--ink:#0B1C30;--muted:#4B5B72;--line:#E2E8F0;--bg:#F4F6F9;--panel:#FFFFFF;
--b900:#003EA3;--b700:#004ECC;--b200:#C9D9FF;--b100:#DCE6FF;--b50:#EFF4FF;--orange:#FF6B35;--warn:#92400E;--warn-soft:#FEF3C7;
--f-ui:"Plus Jakarta Sans",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;
--f-body:"Atkinson Hyperlegible",ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;scroll-padding-top:80px}
body{margin:0;font-family:var(--f-body);font-size:16px;line-height:1.65;color:var(--ink);background:var(--panel)}
h1,h2,h3,p,figure,blockquote{margin:0}
h1,h2,h3{font-family:var(--f-ui);line-height:1.1;text-wrap:balance}
h1{font-size:56px;font-weight:800;letter-spacing:-.04em;line-height:1.05}
h2{font-size:40px;font-weight:800;letter-spacing:-.03em}
h3{font-size:20px;font-weight:700;letter-spacing:-.015em}
p{text-wrap:pretty}
a{color:var(--b700)}
a:focus-visible,summary:focus-visible{outline:3px solid var(--b700);outline-offset:3px;border-radius:4px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.saltar{position:absolute;left:16px;top:-48px;z-index:50;background:var(--b700);color:#fff;padding:8px 14px;border-radius:8px;font-family:var(--f-ui);font-weight:700;text-decoration:none}
.saltar:focus{top:8px}
.in{max-width:1160px;margin:0 auto;padding:0 32px}
section{padding:96px 0}
.lead{font-size:20px;line-height:1.5;color:var(--muted);max-width:36em}
.btn{display:inline-block;font-family:var(--f-ui);font-size:16px;font-weight:700;padding:12px 20px;border-radius:8px;border:1px solid var(--line);background:var(--panel);color:var(--ink);text-decoration:none}
.btn.primary{background:var(--b700);border-color:var(--b700);color:#fff;box-shadow:0 6px 16px -8px rgba(0,78,204,.6)}
.tagp{display:inline-flex;align-items:center;gap:8px;font-family:var(--f-ui);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--b700);background:var(--b50);border:1px solid var(--b200);border-radius:999px;padding:5px 12px}
.tagp::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--b700)}
.sh{text-align:center;max-width:760px;margin:0 auto 48px}
.sh h2{margin-top:16px}
.sh p{color:var(--muted);font-size:20px;margin-top:14px}
.bg-ice{background:var(--b50)}
.bg-ice2{background:var(--b100)}
.aviso-pruebas{background:var(--warn-soft);color:var(--warn);font-family:var(--f-ui);font-size:14px;font-weight:700;text-align:center;padding:8px 16px}
.fic{display:inline-block;margin-left:8px;font-family:var(--f-ui);font-size:12px;font-weight:700;color:var(--warn);background:var(--warn-soft);border-radius:999px;padding:2px 8px;vertical-align:middle}
.shead{position:sticky;top:0;z-index:30;background:var(--panel);border-bottom:1px solid var(--line)}
.shead .in{display:flex;align-items:center;gap:32px;min-height:72px}
.wm{display:flex;align-items:center;gap:10px;font-family:var(--f-ui);font-weight:800;font-size:20px;letter-spacing:-.02em;text-decoration:none;color:var(--ink)}
.wm .logo{width:32px;height:32px;border-radius:8px;background:var(--orange);display:grid;place-items:center;flex:none}
.wm b{color:var(--b700);font-weight:800}
.wm .logo-img{width:32px;height:32px;object-fit:contain;flex:none}
.whatsapp{position:fixed;right:20px;bottom:20px;z-index:40;width:56px;height:56px;border-radius:50%;background:#1F7A4D;display:grid;place-items:center;box-shadow:0 10px 24px -10px rgba(11,28,48,.5)}
.whatsapp:focus-visible{outline:3px solid var(--b700);outline-offset:3px}
.mantenimiento{padding:120px 0;text-align:center}
.mantenimiento p{margin:16px auto 0;color:var(--muted);max-width:32em}
.nav-escritorio ul,.nav-celular ul{list-style:none;margin:0;padding:0}
.nav-escritorio ul{display:flex;flex-wrap:wrap;gap:24px;font-family:var(--f-ui);font-size:14px;font-weight:700}
.nav-escritorio a,.nav-celular a{color:var(--muted);text-decoration:none;display:inline-block;padding:12px 0}
.nav-escritorio a:hover,.nav-celular a:hover{color:var(--ink)}
.nav-escritorio a[aria-current="page"]{color:var(--ink);box-shadow:inset 0 -2px 0 var(--ink)}
.menu-celular{display:none;margin-left:auto}
.menu-celular summary{list-style:none;cursor:pointer;border:1px solid var(--line);border-radius:8px;padding:10px 14px;font-family:var(--f-ui);font-size:14px;font-weight:700;min-height:44px}
.menu-celular summary::-webkit-details-marker{display:none}
.menu-celular[open] .nav-celular{position:absolute;left:0;right:0;top:100%;background:var(--panel);border-bottom:1px solid var(--line);padding:8px 16px 16px}
.nav-celular a{display:block;font-family:var(--f-ui);font-size:16px;font-weight:700;padding:12px 0;border-top:1px solid var(--line)}
.nav-celular li:first-child a{border-top:0}
.hero{padding:80px 0 72px;background:linear-gradient(180deg,var(--b50) 0%,#fff 100%);text-align:center}
.hero h1{max-width:15em;margin:20px auto 0}
.hero h1 em{font-style:normal;color:var(--b700)}
.hero .lead{margin:24px auto 0}
.hero .facts{margin-top:12px;color:var(--muted)}
.cta-fila{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin-top:32px}
.shot{max-width:880px;margin:56px auto 0;text-align:left}
.stage{background:#fff;border:1px solid var(--line);border-radius:12px;box-shadow:0 30px 60px -30px rgba(11,28,48,.35);overflow:hidden}
.stage .bar5{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:10px 16px;background:var(--b100);border-bottom:1px solid var(--line);font-family:var(--f-ui);font-size:12px;color:var(--muted)}
.stage .bar5 b{color:var(--ink)}
.stage .scene{display:grid;grid-template-columns:160px minmax(0,1fr);gap:20px;align-items:center;padding:28px}
.stage .slide b{font-family:var(--f-ui);font-size:26px;display:block;margin-bottom:6px;line-height:1.25}
.stage .slide p{font-size:14px;color:var(--muted)}
.stage .subs{background:#102033;color:#fff;border-radius:8px;margin:0 16px 16px;padding:10px 14px;text-align:center}
.shot figcaption{font-size:14px;color:var(--muted);margin-top:12px;text-align:center}
.proof{text-align:center;font-family:var(--f-ui);color:var(--muted)}
.proof b{color:var(--ink)}
.statrow{list-style:none;margin:0;padding:0;display:flex;justify-content:center;flex-wrap:wrap;gap:12px}
.stat{background:#fff;border:1px solid var(--b200);border-radius:12px;padding:14px 20px;min-width:170px;text-align:center}
.stat b{display:block;font-family:var(--f-ui);font-size:26px;font-weight:800;letter-spacing:-.03em;color:var(--b700);font-variant-numeric:tabular-nums}
.stat span{display:block;font-family:var(--f-ui);font-size:12px;color:var(--muted);margin-top:2px;max-width:16em}
.stat:nth-child(2){background:var(--b700);border-color:var(--b700)}
.stat:nth-child(2) b{color:#fff}
.stat:nth-child(2) span{color:#DCE6FF}
.stat:nth-child(3){background:var(--b100)}
.stat:nth-child(3) b{color:var(--b900)}
.logos-t{font-size:14px;color:var(--muted);margin-bottom:24px;text-align:center}
.logos{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:16px 48px;justify-content:center}
.logos li{font-family:var(--f-ui);font-weight:800;font-size:20px;letter-spacing:-.02em;color:#4B5B72}
.cards3{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:20px}
.pcard{background:#fff;border:1px solid var(--b200);border-radius:14px;padding:28px;display:flex;flex-direction:column;gap:10px}
.pcard .n{font-family:var(--f-ui);font-size:14px;font-weight:800;color:var(--b700);background:var(--b50);border-radius:8px;width:40px;height:40px;display:grid;place-items:center}
.pcard p{color:var(--muted)}
.pcard.ia{background:var(--b700);border-color:var(--b700);color:#fff}
.pcard.ia p{color:#DCE6FF}
.pcard.ia .n{background:#fff;color:var(--b700)}
.fcards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:20px}
.fcard{background:#fff;border:1px solid var(--b200);border-radius:14px;padding:24px}
.fcard .ic{font-family:var(--f-ui);font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--b700)}
.fcard h3{margin-top:8px}
.fcard p{color:var(--muted);margin-top:8px}
.fcard ul{margin:14px 0 0;padding-left:18px}
.fcard.sector{display:block;height:100%;color:inherit;text-decoration:none}
.fcard.sector:hover{border-color:var(--b700)}
.fcard.sector .more{display:inline-block;margin-top:16px;font-family:var(--f-ui);font-size:14px;font-weight:700;color:var(--b700)}
.lmscards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px}
.lmscards li{background:#fff;border:1px solid var(--b200);border-radius:12px;padding:18px;text-align:center}
.lmscards b{display:block;font-family:var(--f-ui);font-size:16px}
.lmscards span{font-family:var(--f-ui);font-size:12px;color:var(--muted)}
.tcards{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
.tcard{height:100%;background:#fff;border:1px solid var(--b200);border-radius:14px;padding:26px;display:flex;flex-direction:column;gap:16px}
.tcard blockquote{flex:1}
.tcard figcaption{font-size:14px;color:var(--muted);border-top:1px solid var(--b50);padding-top:14px;font-family:var(--f-ui)}
.tcard figcaption b{display:block;color:var(--ink)}
.faq{max-width:820px;margin:0 auto;display:flex;flex-direction:column;gap:10px}
.faq details{border:1px solid var(--b200);border-radius:12px;padding:18px 22px;background:#fff}
.faq details[open]{background:var(--b50)}
.faq summary{font-family:var(--f-ui);font-weight:700;font-size:16px;cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:24px}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:"+";color:var(--b700);font-weight:400}
.faq details[open] summary::after{content:"\\2212"}
.faq details p{margin-top:12px;color:var(--muted)}
.ctabox{background:linear-gradient(135deg,var(--b700) 0%,#1E5FD6 100%);color:#fff;border-radius:20px;padding:56px 32px;text-align:center}
.ctabox .tagp{background:rgba(255,255,255,.14);border-color:rgba(255,255,255,.3);color:#fff}
.ctabox .tagp::before{background:#fff}
.ctabox h2{max-width:16em;margin:16px auto 0}
.ctabox p{color:#DCE6FF;font-size:20px;margin:14px auto 0;max-width:30em}
.ctabox .btn.primary{background:#fff;border-color:#fff;color:var(--b700);box-shadow:none}
.ctabox .btn:not(.primary){background:transparent;border-color:rgba(255,255,255,.7);color:#fff}
.fhero{text-align:left}
.crumb-s{font-family:var(--f-ui);font-size:14px;color:var(--muted);margin-bottom:32px}
.crumb-s a{color:var(--muted)}
.fhero h1{font-size:40px;margin-top:16px}
.fhero .lead{margin-top:16px}
.vs2{display:grid;grid-template-columns:1fr 1fr;gap:32px}
.vs2>div{border-radius:14px;padding:28px;border:1px solid var(--line)}
.vs2 .new{background:var(--b100);border-color:var(--b200)}
.vs2 ul{margin:16px 0 0;padding-left:20px;display:flex;flex-direction:column;gap:8px}
.vs2 .old li{color:var(--muted)}
.titulo-pagina{padding:72px 0 48px}
.sfoot{background:var(--b700);color:#DCE6FF;padding:64px 0 32px;font-size:14px}
.sfoot .cols{display:grid;grid-template-columns:1.4fr repeat(auto-fit,minmax(140px,1fr));gap:32px}
.sfoot .flogo{color:#fff;font-family:var(--f-ui);font-weight:800;font-size:16px}
.sfoot h2{color:#fff;font-size:14px;letter-spacing:0;margin-bottom:12px}
.sfoot ul{list-style:none;margin:0;padding:0}
.sfoot a{color:#DCE6FF;text-decoration:none;display:inline-block;padding:6px 0}
.sfoot a:hover{color:#fff;text-decoration:underline}
.sfoot .bottom{border-top:1px solid rgba(255,255,255,.2);margin-top:48px;padding-top:20px;font-size:12px}
.no-encontrada{padding:120px 0;text-align:center}
.no-encontrada p{margin:16px auto 0;color:var(--muted);max-width:30em}
.no-encontrada .btn{margin-top:32px}
@media (max-width:980px){
.cards3{grid-template-columns:minmax(0,1fr)}
.nav-escritorio{display:none}
.menu-celular{display:block}
.shead .in{position:relative}
.sfoot .cols{grid-template-columns:1fr 1fr}
}
@media (max-width:640px){
h1{font-size:40px}
h2,.fhero h1{font-size:26px}
.lead,.sh p,.ctabox p{font-size:16px}
section{padding:56px 0}
.hero{padding:40px 0 48px}
.in{padding:0 16px}
.shead .in{gap:12px;min-height:64px}
.wm{font-size:16px}
.stage .scene{grid-template-columns:88px minmax(0,1fr);padding:16px;gap:12px}
.stage .slide b{font-size:20px}
.stat{min-width:0;flex:1 1 140px}
.vs2{grid-template-columns:minmax(0,1fr)}
.ctabox{padding:36px 20px}
.sfoot .cols{grid-template-columns:1fr}
}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important}}
`.replace(/\n/g, '');
