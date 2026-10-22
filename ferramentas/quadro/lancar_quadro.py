#!/usr/bin/env python3
"""
Quadro de colheita → Geranium Orgânicos (Firestore), pelo perfil Lançamentos.

Grava do mesmo jeito que o app (src/lib/producao.ts):
  - colheita: documento novo em "harvests" (mesmo idSessao para o quadro todo)
    e, no plantio, totalColhido += qtd (increment no servidor) e status "Colhendo";
  - Mudar ID: plantio antigo vai para "Finalizado" com dataFim e observação;
  - plantio novo e cultura nova, quando você informar os dados (decisoes);
  - tudo com criadoPor / criadoPorEmail / criadoEm e origem = "quadro".

Uso:
  python3 lancar_quadro.py quadro.json            confere e lista pendências (não grava)
  python3 lancar_quadro.py quadro.json --gravar   grava (só se não houver pendência)

quadro.json:
{
  "data": "2026-10-21",
  "itens": [ {"cultura": "Alface Americana", "talhao": "11", "qtd": 10} ],
  "decisoes": {                                   (opcional, vem das suas respostas)
    "culturas_novas": [ {"nome": "Quiabo", "dias": 70, "duracao": 60, "unidadeColheita": "KG"} ],
    "plantios_novos": [ {"cultura": "Alface Americana", "talhao": "11", "data": "2026-09-10",
                         "quantidade": 300, "tipo": "Muda", "unidade": "Unidades"} ],
    "usar_plantio":   { "Alface Americana|11": "PLAN-260910-AB12" },
    "nao_encerrar":   [ "PLAN-260801-XY34" ],
    "ignorar":        [ "Couve|11" ]
  }
}
Perene sem talhão no quadro: talhao "Sítio". Perene novo: tipo "Perene" (entra em colheita).

Login: variáveis GERANIUM_EMAIL e GERANIUM_SENHA (nunca gravadas em arquivo).
Saída extra: plano.json ao lado do quadro, com tudo que seria gravado e as pendências.
"""
import json, os, random, re, string, sys, unicodedata, urllib.request, urllib.error
from datetime import date, timedelta

API_KEY = "AIzaSyDnvodjfg8hFMh1ctGYcsqco77Poa2M3xM"
PROJECT = "geranium-organicos"
ROOT = f"projects/{PROJECT}/databases/(default)/documents"
BASE = f"https://firestore.googleapis.com/v1/{ROOT}"
REFERER = "https://thiagovinicius7.github.io/"


# ---------------------------------------------------------------- HTTP / login

def http(method, url, body=None, token=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header("Referer", REFERER)
    if token:
        req.add_header("Authorization", f"Bearer {token}")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        msg = e.read().decode(errors="replace")
        sys.exit(f"ERRO {e.code} em {method} {url.split('?')[0]}:\n{msg[:1200]}")


def login(email, senha):
    r = http("POST", f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={API_KEY}",
             {"email": email, "password": senha, "returnSecureToken": True})
    return r["idToken"], r["localId"], r["email"]


def de_fs(v):
    if "stringValue" in v: return v["stringValue"]
    if "integerValue" in v: return int(v["integerValue"])
    if "doubleValue" in v: return float(v["doubleValue"])
    if "booleanValue" in v: return v["booleanValue"]
    if "nullValue" in v: return None
    if "timestampValue" in v: return v["timestampValue"]
    if "mapValue" in v: return {k: de_fs(x) for k, x in v["mapValue"].get("fields", {}).items()}
    if "arrayValue" in v: return [de_fs(x) for x in v["arrayValue"].get("values", [])]
    return None


def para_fs(x):
    if isinstance(x, bool): return {"booleanValue": x}
    if isinstance(x, int): return {"integerValue": str(x)}
    if isinstance(x, float): return {"doubleValue": x}
    if x is None: return {"nullValue": None}
    return {"stringValue": str(x)}


def campos_fs(d):
    return {k: para_fs(v) for k, v in d.items()}


def listar(colecao, token):
    docs, page = [], None
    while True:
        url = f"{BASE}/{colecao}?pageSize=300" + (f"&pageToken={page}" if page else "")
        r = http("GET", url, token=token)
        for d in r.get("documents", []):
            c = {k: de_fs(v) for k, v in d.get("fields", {}).items()}
            c["_docId"] = d["name"].rsplit("/", 1)[1]
            docs.append(c)
        page = r.get("nextPageToken")
        if not page:
            return docs


# ---------------------------------------------------------------- utilidades

def norm(s):
    s = unicodedata.normalize("NFKD", str(s or "")).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def norm_talhao(s):
    """'TH8', '08', 'Talhão 8' → '08'. Texto (ex.: 'Sítio') fica como está."""
    s = str(s or "").strip()
    m = re.fullmatch(r"(?i)\s*(?:th|talh[aã]o)?\s*0*(\d+)\s*", s)
    if m:
        return f"{int(m.group(1)):02d}"
    return s or "Sítio"


def chave_talhao(s):
    t = norm_talhao(s)
    return t if t.isdigit() else norm(t)


def rand(n, chars=string.ascii_uppercase + string.digits):
    return "".join(random.choices(chars, k=n))


def somar_dias(iso, dias):
    return (date.fromisoformat(iso) + timedelta(days=int(dias or 0))).isoformat()


def br(iso):
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def chave(cultura, talhao):
    return f"{norm(cultura)}|{chave_talhao(talhao)}"


# ---------------------------------------------------------------- plano

def novo_plantio(d, crop, talhao, data_quadro):
    tipo = d.get("tipo") or "Muda"
    perene = tipo == "Perene"
    dplant = d.get("data") or data_quadro
    return {
        "id": f"PLAN-{dplant.replace('-', '')[2:]}-{rand(4)}",
        "idLote": "", "data": dplant, "cultura": crop["nome"], "tipo": tipo, "talhao": talhao,
        "quantidade": d.get("quantidade") or 0,
        "previsao": dplant if perene else somar_dias(dplant, crop.get("dias") or 0),
        "status": "Colhendo" if perene else "No campo",
        "totalColhido": 0, "unidade": d.get("unidade") or "Unidades",
        "aduboQt": d.get("aduboQt") or 0, "aduboComp": d.get("aduboComp") or "",
        "dataFim": None, "perdas": 0,
        "obs": d.get("obs") or f"Cadastrado a partir do quadro de {br(data_quadro)}.",
        "displayInSitio": not talhao.isdigit(),
        "origem": "quadro",
    }


def montar_plano(q, plantios, crops, harvests):
    data = q["data"]
    dec = q.get("decisoes") or {}
    usar = {chave(*k.split("|", 1)): v for k, v in (dec.get("usar_plantio") or {}).items()}
    ignorar = {chave(*k.split("|", 1)) for k in (dec.get("ignorar") or [])}
    nao_encerrar = set(dec.get("nao_encerrar") or [])
    novos_crop = {norm(c["nome"]): c for c in (dec.get("culturas_novas") or [])}
    novos_plant = {chave(p["cultura"], p["talhao"]): p for p in (dec.get("plantios_novos") or [])}

    crop_por_nome = {norm(c.get("nome")): c for c in crops}
    abertos = [p for p in plantios if p.get("status") != "Finalizado"]

    plano = {"data": data, "culturas": [], "plantios": [], "encerrar": [], "colheitas": [], "pendencias": []}
    encerrar_ids = {}

    def pend(tipo, item, texto, extra=None):
        plano["pendencias"].append({"tipo": tipo, "cultura": item.get("cultura"),
                                    "talhao": norm_talhao(item.get("talhao")), "texto": texto, **(extra or {})})

    usados = set()

    # Colheitas já lançadas nesse dia (evita lançar o mesmo quadro duas vezes)
    ja = {chave(h.get("cultura"), h.get("talhao")) for h in harvests if h.get("data") == data}

    for it in q["itens"]:
        qtd = it.get("qtd")
        if not (isinstance(qtd, (int, float)) and qtd > 0):
            continue
        k = chave(it["cultura"], it["talhao"])
        talhao = norm_talhao(it["talhao"])
        if k in ignorar:
            continue
        if k in ja:
            pend("ja_lancado", it, f"Já existe colheita de {it['cultura']} no talhão {talhao} em {br(data)}.")
            continue

        # 1. Cultura
        crop = crop_por_nome.get(norm(it["cultura"]))
        if not crop:
            nc = novos_crop.get(norm(it["cultura"]))
            if not nc:
                parecidas = [c["nome"] for c in crops
                             if norm(it["cultura"]).split(" ")[0] in norm(c.get("nome")).split(" ")]
                pend("cultura_nova", it, f"A cultura '{it['cultura']}' não existe no app.",
                     {"parecidas": parecidas})
                continue
            crop = {"nome": nc["nome"], "dias": int(nc.get("dias") or 0), "duracao": int(nc.get("duracao") or 0),
                    "unidadeColheita": nc.get("unidadeColheita") or "UN", "cientifico": nc.get("cientifico") or ""}
            plano["culturas"].append(crop)
            crop_por_nome[norm(crop["nome"])] = crop
        nome = crop["nome"]
        unidade = crop.get("unidadeColheita") or "UN"

        # 2. Plantio
        mesma = [p for p in abertos if norm(p.get("cultura")) == norm(nome)]
        aqui = [p for p in mesma if chave_talhao(p.get("talhao")) == chave_talhao(talhao)]
        alvo, novo = None, None
        if k in usar:
            alvo = next((p for p in plantios if usar[k] in (p.get("id"), p["_docId"])), None)
            if not alvo:
                pend("plantio_invalido", it, f"Plantio {usar[k]} não encontrado.")
                continue
        elif aqui:
            colhendo = [p for p in aqui if p.get("status") == "Colhendo"]
            if len(colhendo) == 1:
                alvo = colhendo[0]
            elif len(colhendo) == 0 and len(aqui) == 1:
                alvo = aqui[0]
            else:
                opcoes = colhendo or aqui
                pend("varios_plantios", it, f"Há {len(opcoes)} plantios abertos de {nome} no talhão {talhao}.",
                     {"opcoes": [{"id": p.get("id"), "data": p.get("data"), "status": p.get("status"),
                                  "quantidade": p.get("quantidade")} for p in opcoes]})
                continue
        elif k in novos_plant:
            novo = novo_plantio(novos_plant[k], crop, talhao, data)
            usados.add(k)
            plano["plantios"].append(novo)
            alvo = dict(novo, _docId=None, _novo=True)
        else:
            outros = [{"id": p.get("id"), "talhao": p.get("talhao"), "status": p.get("status"),
                       "data": p.get("data")} for p in mesma]
            texto = f"Não há plantio aberto de {nome} no talhão {talhao}."
            if outros:
                texto += " Há plantio aberto em outro talhão (ver 'outros')."
            pend("sem_plantio", it, texto, {"outros": outros})
            continue

        # 3. Mudar ID: outros plantios dessa cultura em colheita, em outro talhão,
        #    plantados antes deste, são encerrados na data do quadro.
        for p in mesma:
            if p is alvo or p.get("id") == alvo.get("id") or p.get("status") != "Colhendo":
                continue
            if p.get("tipo") == "Perene" or alvo.get("tipo") == "Perene":
                continue
            if chave_talhao(p.get("talhao")) == chave_talhao(talhao):
                continue
            if (p.get("data") or "") > (alvo.get("data") or ""):
                continue
            if p.get("id") in nao_encerrar or p["_docId"] in encerrar_ids:
                continue
            nota = f"Colheita encerrada em {br(data)} pela troca para o plantio {alvo.get('id')}."
            encerrar_ids[p["_docId"]] = True
            plano["encerrar"].append({"_docId": p["_docId"], "id": p.get("id"), "cultura": p.get("cultura"),
                                      "talhao": p.get("talhao"), "dataFim": data,
                                      "obs": " ".join(x for x in [(p.get("obs") or "").strip(), nota] if x),
                                      "novo": alvo.get("id")})

        plano["colheitas"].append({"cultura": nome, "talhao": alvo.get("talhao"), "qtd": qtd, "unidade": unidade,
                                   "idPlantio": alvo.get("id"), "_docId": alvo.get("_docId"),
                                   "idLote": alvo.get("idLote") or "", "status_antes": alvo.get("status")})

    # Plantios informados sem colheita no quadro (ex.: quadro de plantio)
    for k, d in novos_plant.items():
        if k in usados:
            continue
        crop = crop_por_nome.get(norm(d["cultura"]))
        if not crop:
            pend("cultura_nova", d, f"A cultura '{d['cultura']}' não existe no app.")
            continue
        aqui = [p for p in abertos if norm(p.get("cultura")) == norm(crop["nome"])
                and chave_talhao(p.get("talhao")) == chave_talhao(d["talhao"]) and p.get("data") == d.get("data")]
        if aqui:
            pend("plantio_existe", d, f"Já existe plantio de {crop['nome']} no talhão {norm_talhao(d['talhao'])} "
                                      f"com data {br(d['data'])} ({aqui[0].get('id')}).")
            continue
        plano["plantios"].append(novo_plantio(d, crop, norm_talhao(d["talhao"]), data))

    # Plantio que ainda está sendo colhido neste quadro não é encerrado
    colhidos = {c["idPlantio"] for c in plano["colheitas"]}
    plano["encerrar"] = [e for e in plano["encerrar"] if e["id"] not in colhidos]
    return plano


def imprimir(plano):
    print(f"Quadro de {br(plano['data'])}\n")
    if plano["culturas"]:
        print("CULTURAS NOVAS")
        for c in plano["culturas"]:
            print(f"  + {c['nome']} (ciclo {c['dias']} d, colheita {c['duracao']} d, {c['unidadeColheita']})")
    if plano["plantios"]:
        print("PLANTIOS NOVOS")
        for p in plano["plantios"]:
            print(f"  + {p['id']}  {p['cultura']}  talhão {p['talhao']}  {p['tipo']}  {p['quantidade']} {p['unidade']}"
                  f"  plantado {br(p['data'])}")
    if plano["encerrar"]:
        print("MUDAR ID (encerrar colheita)")
        for e in plano["encerrar"]:
            print(f"  × {e['id']}  {e['cultura']}  talhão {e['talhao']}  → passa para {e['novo']}")
    print(f"COLHEITAS ({len(plano['colheitas'])})")
    for c in plano["colheitas"]:
        print(f"  {c['cultura']:<24} talhão {str(c['talhao']):<6} {c['qtd']:>6} {c['unidade']:<4} → {c['idPlantio']}")
    if plano["pendencias"]:
        print(f"\nPENDÊNCIAS ({len(plano['pendencias'])})")
        for p in plano["pendencias"]:
            print(f"  ! [{p['tipo']}] {p['texto']}")
            for k in ("parecidas", "outros", "opcoes"):
                if p.get(k):
                    print(f"      {k}: {json.dumps(p[k], ensure_ascii=False)}")


# ---------------------------------------------------------------- gravação

def gravar(plano, token, uid, email):
    stamp = {"criadoPor": uid, "criadoPorEmail": email}
    now = [{"fieldPath": "criadoEm", "setToServerValue": "REQUEST_TIME"}]

    # Etapa 1: culturas e plantios novos
    w1, novos_doc = [], {}
    for c in plano["culturas"]:
        w1.append({"update": {"name": f"{ROOT}/crops/{rand(20, string.ascii_letters + string.digits)}",
                              "fields": campos_fs({**c, **stamp, "origem": "quadro"})},
                   "currentDocument": {"exists": False}, "updateTransforms": now})
    for p in plano["plantios"]:
        did = rand(20, string.ascii_letters + string.digits)
        novos_doc[p["id"]] = did
        w1.append({"update": {"name": f"{ROOT}/plantings/{did}", "fields": campos_fs({**p, **stamp})},
                   "currentDocument": {"exists": False}, "updateTransforms": now})
    if w1:
        http("POST", f"{BASE}:commit", {"writes": w1}, token=token)

    # Etapa 2: Mudar ID + colheitas
    sessao = f"COL-{plano['data'].replace('-', '')[2:]}-{rand(4)}"
    w2 = []
    for e in plano["encerrar"]:
        w2.append({"update": {"name": f"{ROOT}/plantings/{e['_docId']}",
                              "fields": campos_fs({"status": "Finalizado", "dataFim": e["dataFim"], "obs": e["obs"]})},
                   "updateMask": {"fieldPaths": ["status", "dataFim", "obs"]},
                   "currentDocument": {"exists": True}})
    for c in plano["colheitas"]:
        did = c["_docId"] or novos_doc[c["idPlantio"]]
        h = {"idSessao": sessao, "idPlantio": c["idPlantio"], "data": plano["data"], "cultura": c["cultura"],
             "talhao": c["talhao"], "qtd": c["qtd"], "unidade": c["unidade"], **stamp, "origem": "quadro"}
        if c["idLote"]:
            h["idLote"] = c["idLote"]
        w2.append({"update": {"name": f"{ROOT}/harvests/{rand(20, string.ascii_letters + string.digits)}",
                              "fields": campos_fs(h)},
                   "currentDocument": {"exists": False}, "updateTransforms": now})
        w2.append({"update": {"name": f"{ROOT}/plantings/{did}", "fields": {"status": {"stringValue": "Colhendo"}}},
                   "updateMask": {"fieldPaths": ["status"]}, "currentDocument": {"exists": True},
                   "updateTransforms": [{"fieldPath": "totalColhido", "increment": para_fs(c["qtd"])}]})
    if w2:
        http("POST", f"{BASE}:commit", {"writes": w2}, token=token)
    return sessao


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    if len(args) != 1:
        sys.exit(__doc__)
    caminho = args[0]
    q = json.load(open(caminho, encoding="utf-8"))
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", q.get("data", "")):
        sys.exit("'data' deve ser AAAA-MM-DD")
    email, senha = os.environ.get("GERANIUM_EMAIL"), os.environ.get("GERANIUM_SENHA")
    if not email or not senha:
        sys.exit("Defina GERANIUM_EMAIL e GERANIUM_SENHA.")
    token, uid, email = login(email, senha)

    plano = montar_plano(q, listar("plantings", token), listar("crops", token), listar("harvests", token))
    saida = os.path.join(os.path.dirname(os.path.abspath(caminho)), "plano.json")
    json.dump(plano, open(saida, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    imprimir(plano)

    if "--gravar" not in sys.argv:
        print("\nConferência apenas. Nada foi gravado.")
        return
    if plano["pendencias"]:
        sys.exit("\nHá pendências. Nada foi gravado.")
    if not (plano["colheitas"] or plano["plantios"] or plano["culturas"]):
        sys.exit("\nNada para gravar.")
    sessao = gravar(plano, token, uid, email)
    print(f"\nGRAVADO: sessão {sessao} — {len(plano['colheitas'])} colheitas, {len(plano['plantios'])} plantios novos,"
          f" {len(plano['culturas'])} culturas novas, {len(plano['encerrar'])} Mudar ID.")


if __name__ == "__main__":
    main()
