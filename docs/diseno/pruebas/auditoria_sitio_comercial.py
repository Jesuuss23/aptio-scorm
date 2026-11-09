"""Auditoría del prototipo docs/diseno/sitio-comercial.html (o de apps/web, cambiando URL).

Mide, en 1280, 1440, 1920 y 390 px:
- panel superadmin: el h1 a 32 px de la barra lateral (16 px en celular) y solo los tamaños 11, 12, 14, 16, 20 y 26 px;
- todas las vistas: sin desborde horizontal y sin errores de la página.

Uso: pip install playwright && playwright install chromium
     python auditoria_sitio_comercial.py file:///ruta/docs/diseno/sitio-comercial.html
"""
import asyncio, json, sys
from playwright.async_api import async_playwright

URL = sys.argv[1] if len(sys.argv) > 1 else "file:///" + __file__.rsplit("/pruebas/", 1)[0] + "/sitio-comercial.html"
PANEL = ["resumen", "paginas", "editor", "contenido", "blog", "seo", "seo-ia", "popups", "chatbot",
         "agendamiento", "leads", "planes", "suscripciones", "facturacion", "ajustes"]
SITIO = ["sitio", "sitio-personaje", "sitio-precios", "sitio-demo", "sitio-mineria", "sitio-banca"]
ESCALA = {11, 12, 14, 16, 20, 26}

MEDIR_PANEL = """() => {
  const s = document.querySelector('.side').getBoundingClientRect();
  const h = document.querySelector('.view h1').getBoundingClientRect();
  const tam = new Set();
  document.querySelectorAll('.adm *').forEach(e => {
    if (e.closest('.prev')) return;
    const texto = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!texto && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName)) return;
    tam.add(parseFloat(getComputedStyle(e).fontSize));
  });
  return { margen: innerWidth > 900 ? Math.round(h.left - s.right) : Math.round(h.left),
           tamanos: [...tam].sort((a, b) => a - b),
           desborde: document.documentElement.scrollWidth > innerWidth };
}"""

async def main():
    fallas = []
    async with async_playwright() as p:
        nav = await p.chromium.launch()
        for ancho in (1280, 1440, 1920, 390):
            pg = await nav.new_page(viewport={"width": ancho, "height": 900})
            errores = []
            pg.on("pageerror", lambda e: errores.append(str(e)))
            await pg.goto(URL + "#panel-resumen")
            for v in PANEL:
                await pg.evaluate(f"location.hash='panel-{v}'"); await pg.wait_for_timeout(150)
                r = await pg.evaluate(MEDIR_PANEL)
                esperado = 32 if ancho > 900 else 16
                if r["margen"] != esperado or r["desborde"] or not set(r["tamanos"]) <= ESCALA:
                    fallas.append({"ancho": ancho, "vista": v, **r})
            for v in SITIO:
                await pg.evaluate(f"location.hash='{v}'"); await pg.wait_for_timeout(150)
                if await pg.evaluate("document.documentElement.scrollWidth > innerWidth"):
                    fallas.append({"ancho": ancho, "vista": v, "desborde": True})
            if errores:
                fallas.append({"ancho": ancho, "errores": errores})
            await pg.close()
        await nav.close()
    print(json.dumps(fallas, ensure_ascii=False, indent=2) if fallas else "Sin fallas")
    sys.exit(1 if fallas else 0)

asyncio.run(main())
