"""Construye el caso de referencia LOTO: entradas, salidas esperadas por etapa y curso esperado.
Uso: python3 construir_caso.py <raiz-repo> <S.json>"""
import json, os, sys, re, hashlib
ROOT, SJ = sys.argv[1], sys.argv[2]
BASE = f"{ROOT}/packages/ai/casos/loto"
ENT, SAL = f"{BASE}/entrada", f"{BASE}/salidas"
os.makedirs(ENT, exist_ok=True); os.makedirs(SAL, exist_ok=True)
S = json.load(open(SJ))
S[0]["sub"] = "Cápsula de seguridad · 15 min · 3 retos"
def W(path, obj):
    with open(path, "w") as f: json.dump(obj, f, ensure_ascii=False, indent=2); f.write("\n")
PID = [f"p{i+1:02d}" for i in range(30)]
CHS = 65  # ms por carácter (igual que el prototipo; con voz real lo reemplaza Rhubarb)
VOZ = {"proveedor": "google", "voz": "es-US-Neural2-A", "velocidad": 1.0}
KIT = "kit-minera-andina"

# ---------------- entradas ----------------
W(f"{ENT}/proyecto.json", {
    "cliente": {"id": "minera-andina", "nombre": "Minera Andina S.A.C. (ficticia)"},
    "titulo": "Bloqueo y etiquetado", "tema": "Bloqueo y etiquetado de energías peligrosas (LOTO)",
    "publico": "Operarios y técnicos de mantenimiento de planta", "nivel": "basico",
    "metaMinutos": 15, "pantallasMeta": 30, "idiomas": ["es", "en"], "modoIdioma": "mismo-paquete",
    "dispositivoPrincipal": "celular", "gamificacion": True, "tono": "cercano",
    "personaje": {"nombre": "Ana", "rol": "supervisora de seguridad", "recursoId": "svg-ana"},
    "objetivos": None, "documentos": [{"id": "doc-pets-seg-014", "nombre": "PETS-SEG-014 Bloqueo y etiquetado.pdf", "archivo": "manual-loto.md", "paginas": 30}]})
GLOS = [["bloqueo y etiquetado", "lockout/tagout"], ["energía cero", "zero energy state"], ["energía peligrosa", "hazardous energy"], ["energía residual", "residual energy"],
        ["candado personal", "personal lock"], ["tarjeta de bloqueo", "lockout tag"], ["pinza de bloqueo grupal", "group lockout hasp"], ["punto de aislamiento", "isolation point"], ["supervisor", "supervisor"]]
W(f"{ENT}/glosario.json", [{"es": a, "en": b} for a, b in GLOS])
DISPS = ["portada", "objetivos", "personaje", "dato", "idea", "lista", "memoria", "clasificar", "ordenar", "decision", "video", "hotspot", "quiz", "vf", "resumen", "seccion", "resultados", "cierre"]
W(f"{ENT}/kit.json", {"id": KIT, "nombre": "Minera Andina", "paleta": {"primario": "#0F2A44", "secundario": "#1F7A5C", "acento": "#F2A900", "texto": "#102033", "fondo": "#F5F7FA"},
    "tipografias": {"titulos": "Archivo", "texto": "Source Sans 3"}, "estilo": {"ilustracion": "plana", "esquinas": "suaves", "tono": "industrial, claro y cercano"},
    "disposiciones": DISPS, "personaje": {"recursoId": "svg-ana", "nombre": "Ana", "poses": ["explicando", "advirtiendo", "celebrando", "pensando", "neutral"]},
    "biblioteca": [{"id": "ico-candado", "descripcion": "Candado personal rojo con tarjeta, estilo plano", "formato": "svg"},
                   {"id": "img-alerta-energia", "descripcion": "Señal de advertencia con rayo y manómetro, estilo plano", "formato": "svg"},
                   {"id": "img-trofeo", "descripcion": "Trofeo con estrella, estilo plano", "formato": "svg"}]})

# ---------------- etapa 1: IA-01, IA-02, IA-03, IA-13 ----------------
TEMAS = [
 ("t01", "Datos del documento y control de cambios", "Portada, control de versiones e índice del procedimiento.", [1, 2, 3], 1, "otro"),
 ("t02", "Objetivo y alcance", "Para qué sirve el procedimiento y a quién aplica; excluye alta tensión.", [4, 5], 2, "norma"),
 ("t03", "Referencias", "Normas y manuales de referencia.", [6], 1, "otro"),
 ("t04", "Definiciones clave", "Bloqueo, etiquetado, energía cero, dispositivo de aislamiento y energía residual.", [7, 8], 4, "concepto"),
 ("t05", "Responsabilidades y capacitación", "Qué hace cada rol; capacitación obligatoria; el incumplimiento es falta grave.", [9, 10, 11], 2, "norma"),
 ("t06", "Qué es la energía peligrosa", "Energía que puede mover, calentar o liberar algo de forma inesperada; apagado no es energía cero.", [12], 5, "concepto"),
 ("t07", "Seis tipos de energía", "Eléctrica, mecánica, hidráulica, neumática, térmica y química, con ejemplos.", [13], 5, "concepto"),
 ("t08", "Energía residual", "La energía que queda tras apagar y aislar se libera o bloquea antes de intervenir.", [14], 5, "advertencia"),
 ("t09", "Dispositivos de bloqueo", "Candado personal, tarjeta, pinza y caja grupal, otros bloqueadores.", [15, 16, 17, 18, 19], 3, "dato"),
 ("t10", "Inspección de dispositivos", "Revisar candados y tarjetas antes de cada uso.", [20], 2, "procedimiento"),
 ("t11", "Los seis pasos del bloqueo", "Preparar, avisar, apagar, aislar, bloquear y etiquetar, verificar.", [21, 22, 26], 5, "procedimiento"),
 ("t12", "Prácticas seguras y un candado por persona", "Qué es seguro y qué es riesgoso; cada uno su candado y su única llave.", [23, 24], 5, "norma"),
 ("t13", "Bloqueo grupal", "Pinza o caja grupal; el equipo se libera cuando sale el último.", [17, 18, 25], 4, "procedimiento"),
 ("t14", "Verificar energía cero", "Intentar arrancar y medir; es el paso que más se omite.", [26, 27], 5, "advertencia"),
 ("t15", "Retiro del bloqueo", "Revisar, avisar y retirar solo tu candado; en ausencia, solo el supervisor y sin llave maestra.", [28], 5, "procedimiento"),
 ("t16", "Registros y anexos", "Formatos F-014-01 y F-014-02, conservación y anexos.", [29, 30], 1, "otro")]
W(f"{SAL}/01-IA-01-mapa-temas.json", {"documentoId": "doc-pets-seg-014", "totalPaginas": 30,
  "temas": [{"id": i, "titulo": t, "resumen": r, "paginas": p, "peso": w, "tipoContenido": c} for i, t, r, p, w, c in TEMAS],
  "observaciones": ["El documento no trae objetivos de aprendizaje; se proponen en la etapa 2."]})
DEC = {"t01": ("omitir", "Información administrativa del documento; no aporta al desempeño."),
       "t02": ("omitir", "El alcance se menciona en una frase de la portada; no requiere pantalla."),
       "t03": ("omitir", "Referencias normativas; quedan en el documento original."),
       "t04": ("conservar", "Los términos clave se enseñan dentro de las pantallas que los usan."),
       "t05": ("complementario", "Útil para supervisores; se entrega como ficha descargable."),
       "t06": ("conservar", "Concepto base de la cápsula."), "t07": ("conservar", "Necesario para identificar fuentes (objetivo 1)."),
       "t08": ("conservar", "Advertencia crítica de seguridad."), "t09": ("complementario", "Detalle técnico de dispositivos; va en la ficha descargable."),
       "t10": ("complementario", "Se incluye como consejo en la ficha descargable."), "t11": ("conservar", "Procedimiento central (objetivo 3)."),
       "t12": ("conservar", "Prácticas que el participante debe distinguir (objetivo 2)."), "t13": ("conservar", "Situación frecuente en planta."),
       "t14": ("conservar", "Paso más omitido según la empresa."), "t15": ("conservar", "Cierre seguro del procedimiento."),
       "t16": ("omitir", "Formatos internos; los gestiona Seguridad.")}
W(f"{SAL}/01-IA-02-clasificacion.json", {"metaMinutos": 15, "minutosEstimados": 15,
  "clasificacion": [{"temaId": k, "decision": d, "motivo": m} for k, (d, m) in DEC.items()]})
FR = {
 "t04": [("idea", "Bloqueo: colocar un candado personal en un dispositivo de aislamiento para impedir que el equipo se energice.", [7], True),
         ("definicion", "Energía cero: estado verificado en el que el equipo no tiene energía capaz de causar daño.", [7], True),
         ("advertencia", "Un pulsador de parada no es un dispositivo de aislamiento.", [8], True)],
 "t06": [("definicion", "Energía peligrosa es cualquier energía que puede mover, calentar o liberar algo de forma inesperada mientras se trabaja en un equipo.", [12], True),
         ("advertencia", "Un equipo apagado puede seguir teniendo energía peligrosa: apagado no significa energía cero.", [12], True)],
 "t07": [("dato", "Eléctrica: tableros, motores, condensadores.", [13], True), ("dato", "Mecánica: ejes, volantes, resortes, piezas elevadas.", [13], True),
         ("dato", "Hidráulica: cilindros y mangueras con aceite a presión.", [13], True), ("dato", "Neumática: aire comprimido en líneas y tanques.", [13], True),
         ("dato", "Térmica: vapor, superficies calientes, fluidos a alta temperatura.", [13], True), ("dato", "Química: tuberías y tanques de proceso con reactivos.", [13], True)],
 "t08": [("advertencia", "Después de apagar y aislar puede quedar presión en una manguera, carga en un condensador o un resorte tenso.", [14], True),
         ("paso", "La energía residual se libera o bloquea antes de intervenir: purgar, descargar, bajar o calzar.", [14], False)],
 "t11": [("paso", "Preparar: identifica todas las fuentes de energía y sus puntos de aislamiento.", [21], False), ("paso", "Avisar: informa a operadores y afectados.", [21], False),
         ("paso", "Apagar: detén el equipo con su control normal.", [21], False), ("paso", "Aislar: opera cada dispositivo de aislamiento para cortar cada fuente.", [22], False),
         ("paso", "Bloquear y etiquetar: coloca tu candado y tu tarjeta en cada punto de aislamiento.", [22], False),
         ("paso", "Verificar: intenta arrancar y mide la ausencia de energía; luego vuelve el control a apagado.", [26], False)],
 "t12": [("idea", "Seguro: usar solo tu candado, bloquear cada fuente y guardar tu llave contigo.", [23], True),
         ("idea", "Riesgoso: bloquear solo el pulsador de parada, prestar candados, confiar en que otro bloqueó, dejar la llave puesta.", [23], True),
         ("advertencia", "Cada trabajador coloca su propio candado y guarda su única llave; nadie más puede retirarlo.", [24], True),
         ("paso", "Si olvidaste tu candado, solicita uno al supervisor; nunca uses el de otra persona.", [24], True)],
 "t13": [("paso", "Si trabajan varios, cada uno pone su candado en la pinza o caja de bloqueo grupal.", [25], True),
         ("advertencia", "El equipo se libera solo cuando el último trabajador retira su candado.", [25], True)],
 "t14": [("paso", "Intenta arrancar el equipo con su control normal y mide la ausencia de tensión o presión.", [26], True),
         ("dato", "La falta de verificación de energía cero es el error más frecuente en las investigaciones de la empresa.", [27], True)],
 "t15": [("paso", "Revisa que herramientas y personas estén fuera, avisa que se energizará y retira solo tu candado con tu llave.", [28], True),
         ("advertencia", "En ausencia del trabajador, solo el supervisor autoriza el retiro; nunca se usa una llave maestra.", [28], True)]}
W(f"{SAL}/01-IA-03-resumenes.json", [{"temaId": t, "fragmentos": [{"id": f"{t}-f{j+1:02d}", "texto": x, "paginas": p, "tipo": ty, "literal": l} for j, (ty, x, p, l) in enumerate(fs)]} for t, fs in FR.items()])
om = [(k, t, p, DEC[k][1]) for k, t, r, p, w, c in TEMAS if DEC[k][0] == "omitir"]
co = [(k, t, p, DEC[k][1]) for k, t, r, p, w, c in TEMAS if DEC[k][0] == "complementario"]
acta = ["Estimados, compartimos el alcance de la cápsula «Bloqueo y etiquetado» (15 minutos). Estos temas del PETS-SEG-014 no se convierten en pantallas:", "",
        "**Omitidos**", "", "| Tema | Páginas | Motivo |", "| --- | --- | --- |"] + [f"| {t} | {', '.join(map(str, p))} | {m} |" for k, t, p, m in om] + [
        "", "**Complementarios** (se entregan como ficha descargable dentro de la cápsula)", "", "| Tema | Páginas | Motivo |", "| --- | --- | --- |"] + [f"| {t} | {', '.join(map(str, p))} | {m} |" for k, t, p, m in co] + [
        "", "Si desean incluir alguno, indíquenlo antes de aprobar el guion y lo incorporamos."]
W(f"{SAL}/01-IA-13-acta-omitidos.json", {"titulo": "Acta de temas omitidos · Bloqueo y etiquetado", "temas": [{"temaId": k, "titulo": t, "paginas": p, "motivo": m} for k, t, p, m in om], "textoActa": "\n".join(acta)})

# ---------------- etapa 2: IA-04 ----------------
OBJ = [("obj-1", "Identificar las fuentes de energía peligrosa de un equipo.", "recordar", "identificar"),
       ("obj-2", "Distinguir prácticas seguras de prácticas riesgosas durante el bloqueo.", "comprender", "distinguir"),
       ("obj-3", "Aplicar los pasos de bloqueo y etiquetado en una situación de trabajo.", "aplicar", "aplicar")]
def objs(o):
    if o in ("—", None): return []
    if "–" in o: return ["obj-1", "obj-2", "obj-3"]
    return [f"obj-{o[1]}"]
INTOF = {"memoria": "INT-01", "clasificar": "INT-02", "ordenar": "INT-03", "quiz": "INT-05", "hotspot": "INT-06", "vf": "INT-07", "decision": "INT-08"}
def tipo_est(s):
    L = s["L"]
    if L in ("portada", "objetivos", "seccion", "resumen", "resultados", "cierre"): return L
    if L == "quiz" and s.get("sum"): return "evaluacion"
    if L in INTOF or L == "video": return "actividad"
    return "contenido"
FRAG_P = {4: ["t06-f02"], 5: ["t06-f01"], 6: [f"t07-f0{i}" for i in range(1, 7)], 7: [f"t07-f0{i}" for i in range(1, 7)], 8: ["t08-f01", "t08-f02"], 9: ["t08-f01"],
          10: ["t12-f01", "t12-f02"], 11: ["t06-f02", "t08-f02"], 13: ["t11-f01", "t11-f02", "t11-f03"], 14: ["t11-f04", "t11-f05", "t11-f06"], 15: [f"t11-f0{i}" for i in range(1, 7)],
          16: ["t12-f03"], 17: ["t12-f04"], 18: [f"t11-f0{i}" for i in range(1, 7)], 19: ["t14-f01", "t14-f02"], 20: ["t04-f01", "t11-f04"], 21: ["t13-f01", "t13-f02"],
          22: ["t11-f06", "t14-f01"], 24: ["t15-f01"], 25: ["t15-f02"], 26: ["t06-f02"], 27: ["t11-f06", "t12-f03", "t14-f01"], 28: ["t12-f03", "t11-f06", "t14-f01", "t07-f01"]}
PROP = {"portada": "Presentar el tema y motivar", "objetivos": "Mostrar lo que el participante logrará", "seccion": "Abrir una nueva parte", "resumen": "Repasar las ideas clave",
        "resultados": "Mostrar puntaje y estado", "cierre": "Cerrar y felicitar"}
est_p = []
for i, s in enumerate(S):
    e = {"id": PID[i], "tipo": tipo_est(s), "proposito": PROP.get(s["L"], s["t"]), "objetivoIds": objs(s.get("o")), "fragmentoIds": FRAG_P.get(i + 1, [])}
    if s["L"] in INTOF: e["actividadSugerida"] = INTOF[s["L"]]
    est_p.append(e)
W(f"{SAL}/02-IA-04-estructura.json", {"objetivos": [{"id": a, "texto": {"es": b}, "nivelBloom": c, "verbo": d} for a, b, c, d in OBJ],
  "modulos": [{"id": "mod-1", "titulo": {"es": "Control de energías peligrosas"}, "capsulas": [{"id": "cap-loto", "titulo": {"es": "Bloqueo y etiquetado"}, "objetivoIds": ["obj-1", "obj-2", "obj-3"], "duracionEstimadaMin": 15, "pantallas": est_p}]}],
  "supuestos": ["Sin objetivos del cliente: se proponen tres (recordar, comprender, aplicar).", "Responsabilidades y dispositivos van como ficha descargable."]})

# ---------------- etapa 3: IA-05 ----------------
VIS = {"portada": "Ana con casco frente a un tablero con candados rojos", "objetivos": "Lista con tres íconos de check", "personaje": "Ana de cuerpo entero, explicando",
       "dato": "Cifra o frase grande con ícono de alerta", "lista": "Íconos del kit para cada elemento", "memoria": "Tarjetas volteables con íconos de energía",
       "clasificar": "Dos columnas: Seguro y Riesgoso", "ordenar": "Seis tarjetas de pasos desordenadas", "decision": "Escena de dos compañeros frente a un equipo bloqueado",
       "video": "Video del procedimiento real en la planta del cliente", "hotspot": "Escena de una faja transportadora con tablero y válvulas", "quiz": "Pregunta con opciones y temporizador",
       "vf": "Tarjeta para deslizar: mito o realidad", "resumen": "Lista de ideas clave con checks", "seccion": "Número de sección grande", "resultados": "Puntaje, estrellas e insignia", "cierre": "Ana celebrando con trofeo"}
IMGV = {"tablero": "Tablero eléctrico con rayo de advertencia", "alerta": "Manguera presurizada y resorte tenso con señal de alerta", "candado": "Mano colocando un candado rojo con tarjeta"}
def pags(src):
    if not src: return None
    n = re.findall(r"\d+", src); return list(range(int(n[0]), int(n[-1]) + 1))
def txt_pant(s):
    L = s["L"]
    if L in ("idea", "personaje", "dato"): return s.get("tx", "")
    if L in ("lista",): return " · ".join(x[1] for x in s["items"])
    if L in ("objetivos", "resumen"): return " · ".join(s["items"])
    if L == "decision": return s["sc"]
    if L == "quiz": return s["q"]
    if L == "vf": return s["stm"]
    if L == "portada": return s["sub"]
    return ""
CONS = {"memoria": "Encuentra las parejas: cada energía con su ejemplo.", "clasificar": "Arrastra cada práctica a Seguro o Riesgoso.", "ordenar": "Ordena los seis pasos del bloqueo.",
        "decision": "Elige qué harías en esta situación.", "hotspot": "Encuentra los tres puntos de aislamiento.", "quiz": "Responde antes de que se acabe el tiempo.", "vf": "Desliza: ¿mito o realidad?"}
sb = []
for i, s in enumerate(S):
    pg = pags(s.get("src"))
    e = {"id": PID[i], "titulo": s["t"], "textoPantalla": txt_pant(s), "narracion": s["n"], "visual": IMGV[s["img"]] if s.get("img") else VIS[s["L"]],
         "objetivoIds": objs(s.get("o")), "origen": {"tipo": "documento", "documentoId": "doc-pets-seg-014", "paginas": pg, "revisado": False} if pg else {"tipo": "ia", "revisado": False}}
    if s["L"] in INTOF: e["actividad"] = {"tipo": INTOF[s["L"]], "consigna": CONS[s["L"]]}
    if s.get("warn"): e["notas"] = s["warn"]
    sb.append(e)
W(f"{SAL}/03-IA-05-storyboard.json", {"capsulaId": "cap-loto", "pantallas": sb})

# ---------------- etapa 4: IA-15, IA-06, IA-07, IA-08, IA-09 ----------------
def campos(s):
    L, c = s["L"], {"titulo": s["t"]}
    if L == "portada": c["subtitulo"] = s["sub"]
    if L == "objetivos":
        c["items"] = [{"icono": "check", "titulo": x.split(" ", 1)[0], "texto": x.split(" ", 1)[1]} for x in s["items"]]
    if L == "personaje": c["burbuja"] = s["tx"]
    if L == "dato": c.update(datoGrande=s["big"], texto=s["tx"])
    if L == "idea": c.update(texto=s["tx"], dato=s["key"])
    if L == "lista": c["items"] = [{"icono": a, "titulo": b, "texto": t} for a, b, t in s["items"]]
    if L == "resumen": c["items"] = [{"icono": "check", "titulo": x} for x in s["items"]]
    if L == "seccion": c["numero"] = s["num"]
    if L == "decision": c.update(situacion=s["sc"], opciones=s["ops"], correcta=s["ok"])
    if L == "quiz": c.update(pregunta=s["q"], opciones=s["ops"], correcta=s["ok"])
    if L == "vf": c.update(afirmacion=s["stm"], correcta=s["ok"])
    if L == "cierre": c["subtitulo"] = "Ya sabes bloquear y etiquetar de forma segura."
    if L == "resultados": c["subtitulo"] = "Tu puntaje y tu insignia"
    return c
POSE = {"personaje": "explicando", "cierre": "celebrando", "dato": "advirtiendo"}
MOT = {"portada": "Portada del kit con el personaje.", "objetivos": "Lista corta de objetivos con verbo.", "personaje": "El mensaje es testimonial: lo dice Ana.",
       "dato": "Una idea contundente se lee mejor como dato grande.", "idea": "Concepto con imagen de apoyo y dato clave.", "lista": "Varios elementos paralelos con ícono.",
       "resumen": "Repaso en lista corta.", "seccion": "Separador de parte.", "resultados": "Pantalla fija de resultados.", "cierre": "Cierre con celebración."}
comp = []
for i, s in enumerate(S):
    L = s["L"]
    e = {"pantallaId": PID[i], "disposicion": L, "fondo": "primario" if L in ("portada", "seccion", "cierre") else "fondo", "campos": campos(s), "pedidosImagen": [],
         "motivo": MOT.get(L, "Actividad del catálogo según el objetivo.")}
    if L in POSE: e["personaje"] = {"pose": POSE[L], "lado": "derecha" if L != "personaje" else "izquierda"}
    if L == "idea": e["pedidosImagen"] = [{"id": f"{PID[i]}-img", "uso": "principal", "descripcion": IMGV[s["img"]]}]
    if L == "hotspot": e["pedidosImagen"] = [{"id": f"{PID[i]}-img", "uso": "escena", "descripcion": "Faja transportadora con tablero eléctrico, válvula de aire comprimido y válvula de vapor visibles"}]
    if L == "cierre": e["pedidosImagen"] = [{"id": f"{PID[i]}-img", "uso": "icono", "descripcion": "Trofeo con estrella"}]
    if L in INTOF: e["actividad"] = {"tipo": INTOF[L]}
    comp.append(e)
W(f"{SAL}/04-IA-15-pantallas.json", comp)
W(f"{SAL}/04-IA-06-sugerencia-p10.json", {"recomendada": {"tipo": "INT-02", "motivo": "El objetivo 2 pide distinguir prácticas: clasificar en dos grupos hace visible la diferencia.", "nivelBloom": "comprender"},
  "alternativas": [{"tipo": "INT-07", "motivo": "Deslizar mito o realidad sirve como repaso rápido, pero con menos contraste entre grupos."}]})
def vt(t): return {"texto": {"es": t}}
I18 = lambda t: {"es": t}
fb = lambda ok, no: {"correcta": I18(ok), "incorrecta": I18(no)}
def pq(pid, enun, ops, ok, fbok, fbno, obj=None):
    q = {"id": pid, "enunciado": I18(enun), "opciones": [{"id": f"{pid}-{'abcd'[j]}", "contenido": vt(o), "correcta": j == ok} for j, o in enumerate(ops)], "retroalimentacion": fb(fbok, fbno)}
    if obj: q["objetivoId"] = obj
    return q
INTS = [
 {"pantallaId": "p07", "tipo": "INT-01", "modo": "formativa", "instruccion": I18("Encuentra las parejas: cada energía con su ejemplo."),
  "datos": {"pares": [{"id": f"p07-par-{j+1}", "a": vt(a), "b": vt(b)} for j, (a, b) in enumerate([("Eléctrica", "Tableros y motores"), ("Mecánica", "Ejes y resortes"), ("Hidráulica", "Cilindros y mangueras"), ("Neumática", "Aire comprimido"), ("Térmica", "Vapor y superficies"), ("Química", "Tuberías de proceso")])], "intentosMaximos": 12}},
 {"pantallaId": "p10", "tipo": "INT-02", "modo": "formativa", "instruccion": I18("Arrastra cada práctica a Seguro o Riesgoso."),
  "datos": {"grupos": [{"id": "p10-seguro", "etiqueta": I18("Seguro")}, {"id": "p10-riesgoso", "etiqueta": I18("Riesgoso")}],
   "elementos": [{"id": f"p10-el-{j+1}", "contenido": vt(t), "grupoCorrecto": g, "retroalimentacion": I18(r)} for j, (t, g, r) in enumerate([
     ("Usar solo mi candado", "p10-seguro", "Tu candado, tu llave: solo tú lo retiras."), ("Bloquear cada fuente de energía", "p10-seguro", "Un equipo puede tener varias fuentes."),
     ("Guardar mi llave conmigo", "p10-seguro", "Así nadie puede retirar tu candado."), ("Bloquear solo el pulsador de parada", "p10-riesgoso", "El pulsador no aísla la energía."),
     ("Pedir prestado un candado", "p10-riesgoso", "Pide uno al supervisor."), ("Confiar en que otro ya bloqueó", "p10-riesgoso", "Cada persona pone su propio candado."),
     ("Dejar la llave en el candado", "p10-riesgoso", "Cualquiera podría retirarlo.")])]}},
 {"pantallaId": "p15", "tipo": "INT-03", "modo": "formativa", "instruccion": I18("Ordena los seis pasos del bloqueo."),
  "datos": {"pasos": [{"id": f"p15-paso-{j+1}", "contenido": vt(t)} for j, t in enumerate(["Preparar", "Avisar", "Apagar", "Aislar", "Bloquear y etiquetar", "Verificar energía cero"])]}},
 {"pantallaId": "p17", "tipo": "INT-08", "modo": "formativa", "instruccion": I18("Elige qué harías."),
  "datos": {"inicioId": "p17-n1", "nodos": [{"id": "p17-n1", "situacion": I18(S[16]["sc"]), "opciones": [
    {"id": "p17-o1", "texto": I18("Le presto mi candado"), "consecuencia": I18("Si tú retiras tu candado, él queda expuesto. Cada uno usa el suyo."), "puntaje": 0},
    {"id": "p17-o2", "texto": I18("Le pido que solicite uno al supervisor"), "consecuencia": I18("Correcto: el supervisor le entrega un candado y cada uno protege su vida."), "puntaje": 100}]}]}},
 {"pantallaId": "p20", "tipo": "INT-06", "modo": "formativa", "instruccion": I18("Toca los tres puntos de aislamiento de la faja."),
  "datos": {"imagenId": "img-p20-faja", "alt": I18("Faja transportadora con un tablero eléctrico, una válvula de aire y una válvula de vapor."), "puntos": [
    {"id": "p20-pt-1", "x": 18, "y": 40, "titulo": I18("Tablero eléctrico"), "contenido": I18("Abre el interruptor y coloca tu candado y tarjeta."), "obligatorio": True},
    {"id": "p20-pt-2", "x": 55, "y": 62, "titulo": I18("Válvula de aire"), "contenido": I18("Cierra, bloquea y purga la línea neumática."), "obligatorio": True},
    {"id": "p20-pt-3", "x": 82, "y": 35, "titulo": I18("Válvula de vapor"), "contenido": I18("Cierra y bloquea; espera que la superficie se enfríe."), "obligatorio": True}]}},
 {"pantallaId": "p22", "tipo": "INT-05", "modo": "formativa", "instruccion": I18("Responde las tres preguntas."),
  "datos": {"preguntas": [pq("p22-q1", S[21]["q"], S[21]["ops"], 1, "Exacto: primero verificas energía cero.", "Aún falta verificar energía cero.", "obj-3"),
    pq("p22-q2", "¿Qué haces después de colocar tu candado y tarjeta?", ["Empiezo a trabajar", "Intento arrancar el equipo y mido", "Aviso que terminé"], 1, "Así compruebas que no queda energía.", "Primero verifica: intenta arrancar y mide.", "obj-3"),
    pq("p22-q3", "¿Qué paso va justo antes de bloquear y etiquetar?", ["Aislar", "Verificar", "Avisar"], 0, "Primero cortas cada fuente; luego bloqueas.", "El orden es aislar y después bloquear.", "obj-3")], "barajarOpciones": True}},
 {"pantallaId": "p25", "tipo": "INT-08", "modo": "formativa", "instruccion": I18("Elige qué harías."),
  "datos": {"inicioId": "p25-n1", "nodos": [{"id": "p25-n1", "situacion": I18(S[24]["sc"]), "opciones": [
    {"id": "p25-o1", "texto": I18("Lo retiro con la llave maestra"), "consecuencia": I18("No existe llave maestra: tu compañero podría estar dentro del equipo."), "puntaje": 0},
    {"id": "p25-o2", "texto": I18("Aviso al supervisor para el procedimiento de retiro"), "consecuencia": I18("Correcto: solo el supervisor autoriza el retiro y lo registra."), "puntaje": 100}]}]}},
 {"pantallaId": "p26", "tipo": "INT-07", "modo": "formativa", "instruccion": I18("Desliza a la derecha si es realidad y a la izquierda si es mito."),
  "datos": {"afirmaciones": [{"id": f"p26-af-{j+1}", "texto": I18(t), "verdadera": v, "retroalimentacion": I18(r)} for j, (t, v, r) in enumerate([
    ("Si el equipo está apagado, no hace falta bloquearlo.", False, "Mito: apagado no es energía cero."),
    ("Un pulsador de parada no aísla la energía.", True, "Realidad: hay que operar el dispositivo de aislamiento."),
    ("Puedo usar el candado de un compañero si él está de acuerdo.", False, "Mito: cada uno usa su propio candado."),
    ("En bloqueo grupal, el equipo se libera cuando sale el último.", True, "Realidad: mientras haya un candado, nadie energiza.")])]}},
 {"pantallaId": "p28", "tipo": "INT-05", "modo": "sumativa", "peso": 100, "instruccion": I18("Reto final: 5 preguntas, 30 segundos cada una y 3 vidas."), "datos": None}]
BANCO = [
 pq("bq-01", "¿Quién puede retirar tu candado?", ["Solo yo", "Mi supervisor", "Cualquier compañero"], 0, "Tu candado, tu llave.", "Solo quien lo colocó lo retira (salvo el procedimiento de ausencia).", "obj-2"),
 pq("bq-02", "¿Cuál de estas es una fuente de energía mecánica?", ["Un resorte tenso", "Aire comprimido", "Un condensador"], 0, "Resortes, ejes y piezas elevadas son mecánicos.", "El aire es neumático y el condensador es eléctrico.", "obj-1"),
 pq("bq-03", "Apagaste el equipo. ¿Ya no tiene energía peligrosa?", ["Sí, está apagado", "No necesariamente: puede quedar energía residual", "Solo si es eléctrico"], 1, "Apagado no es energía cero.", "Puede quedar presión, carga o un resorte tenso.", "obj-1"),
 pq("bq-04", "Una manguera hidráulica tiene aceite a presión. ¿Qué tipo de energía es?", ["Hidráulica", "Neumática", "Térmica"], 0, "Aceite a presión = hidráulica.", "La neumática es aire; la hidráulica, aceite.", "obj-1"),
 pq("bq-05", "Tu compañero te pide tu candado prestado. ¿Qué es lo seguro?", ["Prestárselo un rato", "Que pida uno al supervisor", "Compartir el mismo candado"], 1, "Cada persona usa su propio candado.", "Prestar candados deja a alguien sin protección.", "obj-2"),
 pq("bq-06", "Terminaste de bloquear. ¿Qué haces antes de empezar?", ["Empiezo de inmediato", "Intento arrancar y mido energía cero", "Retiro la tarjeta"], 1, "Verificar es el paso que más se omite.", "Primero verifica energía cero.", "obj-3"),
 pq("bq-07", "Trabajan tres personas en la misma faja. ¿Cómo se bloquea?", ["Bloquea solo el supervisor", "Cada uno pone su candado en la pinza grupal", "Basta con la tarjeta"], 1, "Cada uno protege su propia vida.", "Cada trabajador coloca su propio candado.", "obj-3"),
 pq("bq-08", "¿Qué es riesgoso durante el bloqueo?", ["Guardar mi llave", "Bloquear solo el pulsador de parada", "Bloquear cada fuente"], 1, "El pulsador no aísla la energía.", "Bloquear el pulsador no corta la fuente.", "obj-2")]
NIV = {"obj-1": "recordar", "obj-2": "comprender", "obj-3": "aplicar"}
W(f"{SAL}/04-IA-08-banco-preguntas.json", {"preguntas": BANCO, "metadatos": [{"preguntaId": q["id"], "nivelBloom": NIV[q["objetivoId"]], "dificultad": "media" if NIV[q["objetivoId"]] != "recordar" else "baja"} for q in BANCO]})
INTS[-1]["datos"] = {"preguntas": BANCO, "segundosPorPregunta": 30, "vidas": 3, "preguntasPorIntento": 5, "barajarOpciones": True}
W(f"{SAL}/04-IA-07-interacciones.json", INTS)
VID = {"duracionMs": 150000, "marcadores": [
  {"id": "vm-1", "tiempoMs": 0, "tipo": "capitulo", "obligatorio": False, "titulo": I18("Preparar, avisar y apagar")},
  {"id": "vm-2", "tiempoMs": 62000, "tipo": "pregunta", "obligatorio": True, "pregunta": pq("vm-2-q", "¿Qué hizo el técnico justo después de apagar?", ["Aisló cada fuente", "Empezó a trabajar", "Retiró la tarjeta"], 0, "Exacto: aislar viene después de apagar.", "Después de apagar se aísla cada fuente.", "obj-3")},
  {"id": "vm-3", "tiempoMs": 95000, "tipo": "punto", "obligatorio": False, "titulo": I18("Tarjeta de bloqueo"), "contenido": I18("Nombre, área, fecha, hora y motivo."), "posicion": {"x": 62, "y": 48}},
  {"id": "vm-4", "tiempoMs": 130000, "tipo": "pregunta", "obligatorio": True, "pregunta": pq("vm-4-q", "¿Cómo comprobó el técnico la energía cero?", ["Miró el tablero", "Intentó arrancar y midió", "Preguntó al operador"], 1, "Así se verifica.", "Hay que intentar arrancar y medir.", "obj-3")}],
  "observaciones": ["Video del cliente pendiente: tiempos estimados sobre un guion de 2:30; recalcular con la transcripción real."]}
W(f"{SAL}/04-IA-09-video-p18.json", VID)

# ---------------- etapa 5: IA-11 ----------------
PED = []
for e in comp:
    for pdd in e["pedidosImagen"]:
        reuse = {"p16-img": "ico-candado", "p08-img": "img-alerta-energia", "p30-img": "img-trofeo"}.get(pdd["id"])
        PED.append({"pedidoId": pdd["id"], "reutilizarRecursoId": reuse,
            "prompt": "reutilizar" if reuse else f"{ {'p05-img': 'An electrical control panel with a lightning warning symbol on its door, closed and labeled', 'p20-img': 'A conveyor belt in a mineral processing plant with an electrical panel on the left, a compressed air valve in the middle and a steam valve on the right, no people'}[pdd['id']] }. Flat vector illustration, clean geometric shapes, soft rounded corners, limited palette #0F2A44 #1F7A5C #F2A900 on #F5F7FA background, no text, no logos.",
            "evitar": "" if reuse else "text, letters, logos, real brands, photorealism, people faces", "formato": "png" if pdd["uso"] == "escena" else "svg",
            "relacionAspecto": "16:9" if pdd["uso"] == "escena" else "1:1", "alt": I18(pdd["descripcion"]), "decorativa": pdd["uso"] == "icono"})
W(f"{SAL}/05-IA-11-imagenes.json", {"pedidos": PED})
IMGID = {"p05-img": "img-p05-tablero", "p08-img": "img-alerta-energia", "p16-img": "ico-candado", "p20-img": "img-p20-faja", "p30-img": "img-trofeo"}

# ---------------- etapas 6-8: voz, boca, subtítulos (sin IA) ----------------
def visemas(t):
    out = []
    for c in t.lower():
        out.append("D" if c in "aá" else "C" if c in "eé" else "B" if c in "ií" else "E" if c in "oó" else "F" if c in "uúw" else "A" if c in "mbp" else "G" if c in "fv" else "H" if c == "l" else "X" if c in " .,;:¿?¡!" else "B")
    return out
def bocas(t):
    m, last = [], None
    for i, v in enumerate(visemas(t)):
        if v != last: m.append([i * CHS, v]); last = v
    m.append([len(t) * CHS, "X"]); return m
def ms(x): h = x // 3600000; m_ = x // 60000 % 60; s_ = x // 1000 % 60; return f"{h:02d}:{m_:02d}:{s_:02d}.{x % 1000:03d}"
def vtt(t):
    out, pos = ["WEBVTT", ""], 0
    for n, m_ in enumerate(re.finditer(r"[^.?!]+[.?!]*", t)):
        tx = m_.group(0).strip()
        if not tx: continue
        a, b = (m_.start() + m_.group(0).index(tx)) * CHS, m_.end() * CHS
        out += [str(n + 1), f"{ms(a)} --> {ms(b)}", tx, ""]
    return "\n".join(out)
def hsh(t): return hashlib.sha256(f"{t}|{VOZ['voz']}|{VOZ['velocidad']}".encode()).hexdigest()
NAR = [{"pantallaId": PID[i], "texto": s["n"], "hashTexto": hsh(s["n"]), "duracionMs": len(s["n"]) * CHS, "voz": VOZ, "recursoAudioId": f"aud-{PID[i]}-es", "subtitulosId": f"vtt-{PID[i]}-es"} for i, s in enumerate(S)]
W(f"{SAL}/06-voz-es.json", {"nota": "Sin IA de texto. Duraciones simuladas (65 ms por carácter); con la voz real las da el audio.", "narraciones": NAR})
W(f"{SAL}/07-boca-p03.json", {"nota": "Simulado con regla por letras para el modo sin red. En producción lo calcula Rhubarb desde el audio.", "pantallaId": "p03", "bocas": bocas(S[2]["n"])})
open(f"{SAL}/08-subtitulos-p03-es.vtt", "w").write(vtt(S[2]["n"]) + "\n")

# ---------------- conversión al curso (etapa 4 → documento) ----------------
TIPO = {"portada": "portada", "cierre": "cierre", "evaluacion": "evaluacion", "actividad": "interactiva"}
recursos = {"svg-ana": {"id": "svg-ana", "tipo": "svg", "origen": "biblioteca", "nombre": "ana.svg", "mime": "image/svg+xml", "licencia": "propia",
            "capas": ["cuerpo", "cabeza", "ojos", "boca_A", "boca_B", "boca_C", "boca_D", "boca_E", "boca_F", "boca_G", "boca_H", "boca_X"]}}
def rec(id, tipo, origen, nombre, mime, **k): recursos[id] = {"id": id, "tipo": tipo, "origen": origen, "nombre": nombre, "mime": mime, **k}
pantallas = []
intmap = {x["pantallaId"]: x for x in INTS}
for i, (s, e, st, sbx) in enumerate(zip(S, comp, est_p, sb)):
    pid, c, L = PID[i], e["campos"], e["disposicion"]
    org = sbx["origen"]; bl = []
    def T(rol, txt, sfx): bl.append({"id": f"{pid}-{sfx}", "tipo": "texto", "rol": rol, "contenido": I18(txt), "origen": org})
    T("titulo", c["titulo"], "titulo")
    if c.get("subtitulo"): T("subtitulo", c["subtitulo"], "subtitulo")
    if c.get("numero"): T("subtitulo", f"Parte {c['numero']}", "numero")
    if c.get("datoGrande"): T("destacado", c["datoGrande"], "dato-grande")
    for k_, rol in (("texto", "cuerpo"), ("burbuja", "cuerpo"), ("dato", "destacado")):
        if c.get(k_): T(rol, c[k_], k_)
    for j, it in enumerate(c.get("items", [])):
        tx = it.get("texto")
        T("cuerpo", it["titulo"] + ((" " if tx[0].islower() else ": ") + tx if tx else ""), f"item-{j+1}")
    if "personaje" in e: bl.append({"id": f"{pid}-ana", "tipo": "personaje", "recursoId": "svg-ana", "pose": e["personaje"]["pose"], "lado": e["personaje"]["lado"]})
    for pdd in e["pedidosImagen"]:
        if pdd["uso"] == "escena": continue  # la escena la usa la exploración (imagenId)
        rid = IMGID[pdd["id"]]
        bl.append({"id": f"{pid}-imagen", "tipo": "imagen", "recursoId": rid, "decorativa": pdd["uso"] == "icono", **({} if pdd["uso"] == "icono" else {"alt": I18(pdd["descripcion"])})})
    for pdd in e["pedidosImagen"]:
        rid = IMGID[pdd["id"]]
        if rid not in recursos:
            reuse = rid in ("ico-candado", "img-alerta-energia", "img-trofeo")
            rec(rid, "svg" if not rid.startswith("img-p20") else "imagen", "biblioteca" if reuse else "generado", rid + (".svg" if not rid.startswith("img-p20") else ".png"), "image/svg+xml" if not rid.startswith("img-p20") else "image/png")
    if pid in intmap:
        x = {k: v for k, v in intmap[pid].items() if k != "pantallaId"}
        bl.append({"id": f"{pid}-actividad", "tipo": "interaccion", "interaccion": x})
    if L == "video":
        rec("vid-procedimiento", "video", "cliente", "procedimiento-loto.mp4", "video/mp4")
        bl.append({"id": f"{pid}-video", "tipo": "video", "recursoId": "vid-procedimiento", "marcadores": VID["marcadores"], "reglas": {"impedirAdelantar": True, "porcentajeMinimo": 90}})
    n = NAR[i]
    rec(n["recursoAudioId"], "audio", "generado", f"{pid}-es.mp3", "audio/mpeg", idioma="es")
    rec(n["subtitulosId"], "subtitulos", "generado", f"{pid}-es.vtt", "text/vtt", idioma="es")
    nar = {"texto": I18(s["n"]), "porIdioma": {"es": {"estado": "generado", "recursoAudioId": n["recursoAudioId"], "voz": VOZ, "hashTexto": n["hashTexto"], "duracionMs": n["duracionMs"], "bocas": bocas(s["n"]), "subtitulosId": n["subtitulosId"]}}}
    if "personaje" in e: nar["personajeBloqueId"] = f"{pid}-ana"
    tipo = "video" if L == "video" else TIPO.get(st["tipo"], "contenido")
    p = {"id": pid, "titulo": I18(s["t"]), "tipo": tipo, "objetivoIds": st["objetivoIds"], "plantilla": f"{KIT}-{L}", "estado": "propuesta-ia", "obligatoria": True,
         "bloques": bl, "narracion": nar, "disposicion": L, "fondo": e["fondo"]}
    if not p["objetivoIds"]: del p["objetivoIds"]
    pantallas.append(p)
rec("img-p20-faja", "imagen", "generado", "img-p20-faja.png", "image/png")
rec("doc-pets-seg-014", "documento", "cliente", "PETS-SEG-014 Bloqueo y etiquetado.pdf", "application/pdf")
NAVEG = {"patron": "historias", "modo": "condiciones", "siguienteSeHabilita": "actividad", "reanudar": "preguntar", "mostrar": ["progreso", "temario", "puntos", "idioma", "accesibilidad"], "objetivosAlInicio": True, "atajosTeclado": True}
W(f"{SAL}/04-IA-14-navegacion.json", {"recomendado": {"patron": "historias", "motivo": "Público operativo que verá la cápsula en el celular: toques cortos, una idea por pantalla."},
  "alternativa": {"patron": "clasico", "motivo": "Si se proyecta en sala o se usa en computadora, el clásico con botones es más familiar."}, "navegacion": NAVEG})
curso = {"versionEsquema": "0.2.0", "id": "curso-loto-referencia",
  "metadatos": {"titulo": I18("Bloqueo y etiquetado"), "descripcion": I18("Caso de referencia del generador: salida esperada de las etapas 1 a 8 en español."),
    "cliente": {"id": "minera-andina", "nombre": "Minera Andina S.A.C. (ficticia)"}, "publico": "Operarios y técnicos de mantenimiento de planta", "nivel": "basico",
    "duracionEstimadaMin": 15, "autor": "Generador · caso de referencia", "creado": "2026-10-31T10:00:00-05:00", "actualizado": "2026-10-31T10:00:00-05:00"},
  "idiomas": ["es"], "modoIdioma": "unico", "kitMarcaId": KIT,
  "objetivos": [{"id": a, "texto": I18(b), "nivelBloom": c} for a, b, c, d in OBJ],
  "modulos": [{"id": "mod-1", "titulo": I18("Control de energías peligrosas"), "capsulas": [{"id": "cap-loto", "titulo": I18("Bloqueo y etiquetado"), "objetivoIds": ["obj-1", "obj-2", "obj-3"], "duracionEstimadaMin": 15, "pantallas": pantallas}]}],
  "seguimiento": {"criterioCompletado": "sumativa", "notaMinima": 70, "intentosMaximos": None, "notaReportada": "mejor"},
  "recursos": list(recursos.values()), "navegacion": NAVEG, "gamificacion": {"nivel": "ligera", "puntosPorAcierto": 10}}
W(f"{BASE}/curso-esperado-es.json", curso)

# ---------------- etapa 10 y propuestas: IA-12, IA-16, IA-17, IA-18 ----------------
W(f"{SAL}/10-IA-12-calidad.json", {"observaciones": [
  {"id": "obs-1", "pantallaId": "p18", "tipo": "faltante", "gravedad": "alta", "mensaje": "Falta el video del cliente; la pantalla usa un marcador de lugar.", "sugerencia": "Pedir el video al cliente o cambiar la pantalla por «Ordenar pasos» con ilustraciones."},
  {"id": "obs-2", "pantallaId": "p07", "tipo": "longitud", "gravedad": "media", "mensaje": "En inglés, la tarjeta «Cylinders and hoses» desborda el espacio.", "sugerencia": "Usar «Cylinders, hoses».", "ruta": "/modulos/0/capsulas/0/pantallas/6/bloques/1/interaccion/datos/pares/2/b"},
  {"id": "obs-3", "pantallaId": "p20", "tipo": "exactitud", "gravedad": "media", "mensaje": "La ilustración es genérica; los puntos de aislamiento reales de la faja 3 están en el Anexo B (p. 30).", "sugerencia": "Pedir al cliente una foto o el diagrama del Anexo B."},
  {"id": "obs-4", "pantallaId": "p09", "tipo": "exactitud", "gravedad": "baja", "mensaje": "El ejemplo de la faja es contenido creado por la IA, no está en el manual.", "sugerencia": "Confirmar con el cliente o marcarlo como caso ilustrativo."},
  {"id": "obs-5", "pantallaId": "p04", "tipo": "accesibilidad", "gravedad": "baja", "mensaje": "El símbolo «≠» puede leerse mal con lector de pantalla.", "sugerencia": "Texto alternativo: «Apagado no es igual a energía cero»."}],
  "resumen": "Cápsula coherente con el manual; 1 observación alta (video faltante) y 4 menores. Los tres objetivos tienen actividad y preguntas en el reto final."})
# HU-0608 (SUP-48): es la salida de la heurística `sincronizarConVoz` de @aptio/schema/tiempos; una prueba las compara.
W(f"{SAL}/X-IA-16-sincronizar-p05.json", {"tipo": "sincronizar-voz", "titulo": "Sincronizar con la voz", "resumen": "El texto aparece cuando Ana dice «cualquier» y el dato clave con «puede»; la imagen no se nombra y conserva su tiempo.",
  "patch": [{"op": "add", "path": "/ajustes", "value": {"p05-titulo": {"retardoS": 0}, "p05-texto": {"retardoS": 0.2, "anclaPalabra": 1}, "p05-dato": {"retardoS": 1.63, "anclaPalabra": 4}}}]})
W(f"{SAL}/X-IA-17-alineacion.json", {"resumen": "El objetivo 3 (aplicar) solo tiene preguntas de recordar en el quiz formativo p22; se propone una situación.",
  "cambios": [{"tipo": "ajustar-pregunta", "objetivoId": "obj-3", "nivelBloom": "aplicar", "motivo": "Convertir p22-q3 en una situación de trabajo.", "pantallaId": "p22"}],
  "patch": [{"op": "replace", "path": "/modulos/0/capsulas/0/pantallas/21/bloques/1/interaccion/datos/preguntas/2/enunciado", "value": {"es": "Cortaste la energía del motor con el interruptor. ¿Qué haces ahora?"}}]})
W(f"{SAL}/X-IA-18-kit.json", {"paleta": {"primario": "#0F2A44", "secundario": "#1F7A5C", "acento": "#F2A900", "texto": "#102033", "fondo": "#F5F7FA"},
  "tipografias": {"titulos": "Archivo", "texto": "Source Sans 3", "alternativasLibres": ["Inter", "IBM Plex Sans"]},
  "estilo": {"ilustracion": "plana", "esquinas": "suaves", "tono": "Industrial, claro, con amarillo de seguridad como acento"},
  "contrasteOk": True, "evidencias": ["Azul marino dominante en portada y encabezados", "Amarillo de seguridad en señalética", "Fuente sin serifa geométrica en títulos"], "confianza": 0.8})
print("pantallas", len(pantallas), "recursos", len(recursos))

# ---------------- etapa 9: IA-10 (muestra: pantallas p01 a p06) ----------------
EN = {"Bloqueo y etiquetado": "Lockout/tagout", "Cápsula de seguridad · 15 min · 3 retos": "Safety capsule · 15 min · 3 challenges",
 "Hola, te doy la bienvenida a esta cápsula sobre bloqueo y etiquetado.": "Hi, welcome to this capsule on lockout/tagout.",
 "Al terminar podrás": "By the end, you can", "Identificar las fuentes de energía peligrosa de un equipo": "Identify the hazardous energy sources of a machine",
 "Distinguir prácticas seguras y riesgosas durante el bloqueo": "Tell safe from unsafe practices during lockout",
 "Aplicar los pasos de bloqueo y etiquetado en una situación real": "Apply the lockout/tagout steps in a real situation",
 "Al terminar podrás identificar, distinguir y aplicar los pasos del bloqueo.": "When you finish, you will be able to identify, distinguish and apply the lockout steps.",
 "Te acompaña Ana": "Meet Ana", "Soy Ana, supervisora de seguridad. Te voy a mostrar cómo protegerte cuando intervengas un equipo.": "I'm Ana, a safety supervisor. I'll show you how to protect yourself when you work on a machine.",
 "Apagado no es lo mismo que seguro": "Off is not the same as safe", "Apagado ≠ energía cero": "Off ≠ zero energy state",
 "Un equipo puede guardar energía aunque esté apagado.": "A machine can store energy even when it is off.",
 "Ojo: apagado no significa energía cero. Un equipo puede guardar energía aunque esté apagado.": "Careful: off does not mean zero energy state. A machine can store energy even when it is off.",
 "¿Qué es la energía peligrosa?": "What is hazardous energy?",
 "Es cualquier energía que puede mover, calentar o liberar algo de forma inesperada mientras trabajas en un equipo.": "It is any energy that can move, heat or release something unexpectedly while you work on a machine.",
 "Si puede moverse, calentarse o descargarse, se bloquea.": "If it can move, heat up or discharge, lock it out.", "Tablero eléctrico con rayo de advertencia": "Electrical panel with a lightning warning sign",
 "Es cualquier energía que puede mover, calentar o liberar algo de forma inesperada.": "It is any energy that can move, heat or release something unexpectedly.",
 "Seis tipos de energía": "Six types of energy", "Eléctrica: Tableros y motores": "Electrical: Panels and motors", "Mecánica: Ejes y resortes": "Mechanical: Shafts and springs",
 "Hidráulica: Cilindros y mangueras": "Hydraulic: Cylinders and hoses", "Neumática: Aire comprimido": "Pneumatic: Compressed air", "Térmica: Vapor y superficies": "Thermal: Steam and surfaces",
 "Química: Tuberías de proceso": "Chemical: Process pipes", "Hay seis tipos: eléctrica, mecánica, hidráulica, neumática, térmica y química.": "There are six types: electrical, mechanical, hydraulic, pneumatic, thermal and chemical."}
tr = []
def walk(n, path):
    if isinstance(n, dict):
        if set(n) == {"es"} and isinstance(n["es"], str):
            en = EN[n["es"]]; lim = max(20, int(len(n["es"]) * 1.25))
            terms = [b for a, b in GLOS if a in n["es"].lower()]
            t = {"ruta": path, "texto": en, "limiteCaracteres": lim}
            if terms: t["terminosGlosario"] = terms
            tr.append(t); return
        for k, v in n.items(): walk(v, f"{path}/{k}")
    elif isinstance(n, list):
        for i, v in enumerate(n): walk(v, f"{path}/{i}")
for i in range(6): walk(pantallas[i], f"/modulos/0/capsulas/0/pantallas/{i}")
W(f"{SAL}/09-IA-10-traduccion-p01-p06.json", {"idiomaDestino": "en", "traducciones": tr, "dudas": [{"ruta": "/modulos/0/capsulas/0/pantallas/3/bloques/1/contenido", "motivo": "«≠» se mantiene; confirmar con el cliente si prefiere «Off is not zero energy»."}]})
print("traducciones", len(tr))
