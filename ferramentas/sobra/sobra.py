#!/usr/bin/env python3
"""
Sobra da Bioloja → Geranium Orgânicos (Firestore), pelo perfil Lançamentos.

Cada quadro de colheita gera um formulário de sobra (coleção "sobras") com os
itens daquele quadro mais o que ficou da última sobra conferida. A loja abre o
link sem login, digita Sobrou e Perdeu e envia. Depois o Claude confere:
    vendido = ficou da feira anterior + chegou − sobrou − perdeu

A feira é a do dia do quadro, se for dia de feira (ter, qua, sex, sáb), senão a
próxima. Um segundo quadro da mesma feira entra no mesmo formulário enquanto a
loja não respondeu. Folhas, ervas, alfaces e brócolis vão para a xepa; o resto fica.
Regras iguais a src/lib/sobra.ts.

Quadro só com o previsto (P), no dia da feira: "previsto" gera a sobra com o
previsto como "chegou" (campo previsto=true), para a loja já contar. Quando o
quadro definitivo (R) é lançado, a mesma sobra recebe o realizado: o "chegou"
de cada item vira o colhido de verdade (0 se não colheu) e itens colhidos fora
do previsto entram no fim da lista, sem resposta da loja (sobra 0). A ordem
dos itens não muda, para as respostas da loja continuarem nos mesmos itens.
Sobra com previsto não se confere.

Uso:
  python3 sobra.py previsto previsto.json            sobra pelo previsto (não grava)
  python3 sobra.py previsto previsto.json --gravar   grava e aponta o link fixo
        previsto.json = {"data": "2026-11-25", "itens": [{"cultura": "Couve", "qtd": 10}, …]}
  python3 sobra.py gerar COL-261121-AB12 [COL-…]     mostra o formulário (não grava)
  python3 sobra.py gerar COL-261121-AB12 --gravar    grava e imprime o link da loja
  python3 sobra.py listar                            formulários recentes e status
  python3 sobra.py link                              link fixo da Bioloja (cria se não existir)
  python3 sobra.py conferir <id>                     conta do vendido e incoerências
  python3 sobra.py conferir <id> --gravar [--xepa "Banana Prata"] [--fica "Couve"]
        marca como conferida; --xepa/--fica trocam o destino da sobra de um item

Login: variáveis GERANIUM_EMAIL e GERANIUM_SENHA (nunca gravadas em arquivo).
"""
import os, sys, string
from datetime import date, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "quadro"))
from lancar_quadro import (login, http, listar, rand, ROOT, BASE, norm)  # noqa: E402
from lancar_quadro import para_fs as _para_fs_simples  # noqa: E402


def para_fs(x):
    """Como no script do quadro, mais listas e mapas (itens, respostas, resumo)."""
    if isinstance(x, dict): return {"mapValue": {"fields": {k: para_fs(v) for k, v in x.items()}}}
    if isinstance(x, (list, tuple)): return {"arrayValue": {"values": [para_fs(v) for v in x]}}
    return _para_fs_simples(x)


def campos_fs(d):
    return {k: para_fs(v) for k, v in d.items()}

LINK = "https://thiagovinicius7.github.io/Geranium-Organicos/#/sobra/"
LINK_FIXO = "https://thiagovinicius7.github.io/Geranium-Organicos/#/loja/"
DIAS_FEIRA = {1, 2, 4, 5}  # date.weekday(): ter, qua, sex, sáb
DIAS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"]


def proxima_feira(iso):
    d = date.fromisoformat(iso)
    while d.weekday() not in DIAS_FEIRA:
        d += timedelta(days=1)
    return d.isoformat()


def feira_extensa(iso):
    d = date.fromisoformat(iso)
    return f"{DIAS[d.weekday()]} {d.day:02d}/{d.month:02d}"


def unidade_app(u):
    u = norm(u).upper()
    if u in ("KG", "KGS", "QUILO", "QUILOS"): return "KG"
    if u in ("MC", "MACO", "MACOS"): return "MÇ"
    if u in ("BJ", "BANDEJA", "BANDEJAS"): return "BJ"
    return "UN"


def rotulo(cultura, unidade):
    if unidade == "UN":
        return "pés" if norm(cultura).startswith("alface") else "un"
    return {"KG": "kg", "MÇ": "maço", "BJ": "bandeja"}[unidade]


def destino(cultura, unidade):
    """Folhas, ervas, alfaces e brócolis vão para a xepa; o resto fica para a próxima feira."""
    if unidade == "MÇ" or (unidade == "UN" and norm(cultura).startswith("alface")) or norm(cultura).startswith("brocolis"):
        return "xepa"
    return "fica"


def r3(x):
    return round(x + 0.0, 3)


def fmt(x):
    return f"{x:g}".replace(".", ",")


def ordenar(itens):
    return sorted(itens, key=lambda i: (i["destino"] != "xepa", norm(i["cultura"])))


def ativas(sobras):
    """Ignora a sobra cujos quadros foram todos levados para outra sobra."""
    out = []
    for s in sobras:
        meus = set(s.get("sessoes", []))
        if meus and any(o is not s and meus <= set(o.get("sessoes", [])) and o.get("feira", "") > s.get("feira", "")
                        for o in sobras):
            continue
        out.append(s)
    return out


def ultima_conferida(sobras, antes_de):
    conf = [s for s in sobras if s.get("status") == "conferida" and s.get("feira", "") < antes_de]
    return max(conf, key=lambda s: s["feira"]) if conf else None


# ---------------------------------------------------------------- link fixo

def apontar_loja(did, feira, token):
    """O link fixo da Bioloja (lojas/<token>) passa a abrir esta sobra.
    O token só existe no banco; se ainda não houver, cria um."""
    lojas = listar("lojas", token)
    tok = lojas[0]["_docId"] if lojas else rand(24, string.ascii_letters + string.digits)
    w = {"update": {"name": f"{ROOT}/lojas/{tok}", "fields": campos_fs({"sobraId": did, "feira": feira})},
         "updateTransforms": [{"fieldPath": "atualizadoEm", "setToServerValue": "REQUEST_TIME"}]}
    http("POST", f"{BASE}:commit", {"writes": [w]}, token=token)
    return tok


# ---------------------------------------------------------------- gerar

def cmd_gerar(sessoes, gravar, token, uid, email):
    harvests = [h for h in listar("harvests", token) if h.get("idSessao") in sessoes]
    faltam = [s for s in sessoes if not any(h.get("idSessao") == s for h in harvests)]
    if faltam:
        sys.exit(f"Sessão sem colheitas: {', '.join(faltam)}")
    datas = sorted({h["data"] for h in harvests})
    feiras = sorted({proxima_feira(d) for d in datas})
    if len(feiras) > 1:
        sys.exit(f"Essas sessões caem em feiras diferentes ({', '.join(feiras)}). Gere uma de cada vez.")
    feira = feiras[0]

    crops = {norm(c["nome"]): c for c in listar("crops", token)}
    sobras = ativas(listar("sobras", token))
    pend, avisos = [], []

    # Colhido por cultura, na unidade da cultura.
    colhido = {}
    for h in harvests:
        crop = crops.get(norm(h["cultura"]), {})
        u = unidade_app(crop.get("unidadeColheita") or h.get("unidade", "UN"))
        if unidade_app(h.get("unidade", u)) != u:
            avisos.append(f"{h['cultura']} {fmt(h['qtd'])} lançada em {h.get('unidade')}, a cultura é {u}: somei como {u}.")
        k = (h["cultura"], u)
        colhido[k] = r3(colhido.get(k, 0) + (h.get("qtd") or 0))

    # Formulário já existente para esta feira?
    mesma = [s for s in sobras if s.get("feira") == feira]
    prev = next((s for s in mesma if s.get("previsto") and s.get("status") in ("aberta", "enviada")), None)
    if prev:
        return realizar(prev, sessoes, colhido, avisos, gravar, token)
    existente = None
    for s in mesma:
        if set(sessoes) <= set(s.get("sessoes", [])):
            sys.exit(f"Este quadro já está no formulário da feira {feira_extensa(feira)}: {LINK}{s['_docId']}")
        if s.get("status") == "aberta":
            existente = s
        else:
            pend.append(f"A loja já respondeu a sobra de {feira_extensa(feira)} ({s['_docId']}). "
                        f"Um quadro novo para a mesma feira não pode entrar nela.")

    # Abertas ou não conferidas de feiras anteriores: o "ficou" pode estar desatualizado.
    for s in sobras:
        if s.get("feira", "") < feira and s.get("status") in ("aberta", "enviada"):
            avisos.append(f"A sobra de {feira_extensa(s['feira'])} ainda está {s['status']} (não conferida): "
                          f"o que ficou dela não entra neste formulário.")

    if existente:
        itens = {(i["cultura"], i["unidade"]): dict(i) for i in existente["itens"]}
        for k, q in colhido.items():
            if k in itens:
                itens[k]["colhido"] = r3(itens[k]["colhido"] + q)
            else:
                itens[k] = {"cultura": k[0], "unidade": k[1], "rotulo": rotulo(*k), "destino": destino(*k),
                            "anterior": 0, "colhido": q}
        base = None
    else:
        itens = {k: {"cultura": k[0], "unidade": k[1], "rotulo": rotulo(*k), "destino": destino(*k),
                     "anterior": 0, "colhido": q} for k, q in colhido.items()}
        base = ultima_conferida(sobras, feira)
        if base:
            for r in base.get("resumo", []):
                if r.get("fica", 0) > 0:
                    k = (r["cultura"], r["unidade"])
                    if k not in itens:
                        itens[k] = {"cultura": k[0], "unidade": k[1], "rotulo": r.get("rotulo") or rotulo(*k),
                                    "destino": r.get("destino") or destino(*k), "anterior": 0, "colhido": 0}
                    itens[k]["anterior"] = r3(r["fica"])

    lista = ordenar(itens.values())

    print(f"\nSOBRA DA FEIRA DE {feira_extensa(feira).upper()}")
    print(f"Quadros: {', '.join(sessoes)} ({', '.join(datas)})" + (f" — entra no formulário aberto {existente['_docId']}" if existente else ""))
    if base:
        print(f"Ficou de: sobra de {feira_extensa(base['feira'])} (conferida)")
    print(f"\n{'Produto':26} {'unid.':8} {'ficou':>7} {'chegou':>7} {'total':>7}  destino")
    for i in lista:
        print(f"{i['cultura']:26} {i['rotulo']:8} {fmt(i['anterior']):>7} {fmt(i['colhido']):>7} "
              f"{fmt(r3(i['anterior'] + i['colhido'])):>7}  {i['destino']}")
    for a in avisos:
        print("AVISO:", a)
    for p in pend:
        print("PENDÊNCIA:", p)

    if not gravar:
        print("\n(nada gravado; use --gravar depois do ok)")
        return
    if pend:
        sys.exit("\nNão gravei: resolva as pendências.")

    if existente:
        doc = f"{ROOT}/sobras/{existente['_docId']}"
        w = {"update": {"name": doc, "fields": campos_fs({"itens": lista, "sessoes": existente.get("sessoes", []) + sessoes})},
             "updateMask": {"fieldPaths": ["itens", "sessoes"]}, "currentDocument": {"exists": True}}
        did = existente["_docId"]
    else:
        did = rand(20, string.ascii_letters + string.digits)
        doc = f"{ROOT}/sobras/{did}"
        dados = {"feira": feira, "sessoes": sessoes, "status": "aberta", "itens": lista,
                 "criadoPor": uid, "criadoPorEmail": email, "origem": "quadro"}
        if base:
            dados["anteriorId"] = base["_docId"]
        w = {"update": {"name": doc, "fields": campos_fs(dados)}, "currentDocument": {"exists": False},
             "updateTransforms": [{"fieldPath": "criadoEm", "setToServerValue": "REQUEST_TIME"}]}
    http("POST", f"{BASE}:commit", {"writes": [w]}, token=token)
    tok = apontar_loja(did, feira, token)
    print(f"\nGRAVADO. O link fixo da Bioloja já abre esta sobra:\n{LINK_FIXO}{tok}")
    print(f"(link só desta sobra: {LINK}{did})")


# ---------------------------------------------------------------- previsto

def itens_do_previsto(prev_json, crops):
    itens, faltam = {}, []
    for it in prev_json["itens"]:
        crop = crops.get(norm(it["cultura"]))
        if not crop:
            faltam.append(it["cultura"]); continue
        u = unidade_app(crop.get("unidadeColheita") or "UN")
        k = (crop["nome"], u)
        q = r3(itens.get(k, {}).get("colhido", 0) + (it.get("qtd") or 0))
        itens[k] = {"cultura": k[0], "unidade": u, "rotulo": rotulo(*k), "destino": destino(*k),
                    "anterior": 0, "colhido": q, "previsto": q}
    return itens, faltam


def cmd_previsto(caminho, gravar, token, uid, email):
    import json
    q = json.load(open(caminho, encoding="utf-8"))
    data = q["data"]
    feira = proxima_feira(data)
    crops = {norm(c["nome"]): c for c in listar("crops", token)}
    sobras = ativas(listar("sobras", token))
    itens, faltam = itens_do_previsto(q, crops)
    if faltam:
        sys.exit(f"Culturas que não existem no app: {', '.join(faltam)}")
    mesma = [s for s in sobras if s.get("feira") == feira]
    if mesma:
        sys.exit(f"Já existe sobra para a feira {feira_extensa(feira)} ({mesma[0]['_docId']}, {mesma[0].get('status')}).")
    avisos = []
    for s in sobras:
        if s.get("feira", "") < feira and s.get("status") in ("aberta", "enviada"):
            avisos.append(f"A sobra de {feira_extensa(s['feira'])} ainda está {s['status']} (não conferida): "
                          f"o que ficou dela não entra neste formulário.")
    base = ultima_conferida(sobras, feira)
    if base:
        for r in base.get("resumo", []):
            if r.get("fica", 0) > 0:
                k = (r["cultura"], r["unidade"])
                if k not in itens:
                    itens[k] = {"cultura": k[0], "unidade": k[1], "rotulo": r.get("rotulo") or rotulo(*k),
                                "destino": r.get("destino") or destino(*k), "anterior": 0, "colhido": 0, "previsto": 0}
                itens[k]["anterior"] = r3(r["fica"])
    lista = ordenar(itens.values())
    print(f"\nSOBRA (PREVISTO) DA FEIRA DE {feira_extensa(feira).upper()} — quadro de {data}")
    if base:
        print(f"Ficou de: sobra de {feira_extensa(base['feira'])} (conferida)")
    print(f"\n{'Produto':26} {'unid.':8} {'ficou':>7} {'previsto':>8} {'total':>7}  destino")
    for i in lista:
        print(f"{i['cultura']:26} {i['rotulo']:8} {fmt(i['anterior']):>7} {fmt(i['colhido']):>8} "
              f"{fmt(r3(i['anterior'] + i['colhido'])):>7}  {i['destino']}")
    for a in avisos:
        print("AVISO:", a)
    if not gravar:
        print("\n(nada gravado; use --gravar depois do ok)")
        return
    did = rand(20, string.ascii_letters + string.digits)
    dados = {"feira": feira, "sessoes": [], "status": "aberta", "itens": lista, "previsto": True,
             "dataQuadro": data, "criadoPor": uid, "criadoPorEmail": email, "origem": "previsto"}
    if base:
        dados["anteriorId"] = base["_docId"]
    w = {"update": {"name": f"{ROOT}/sobras/{did}", "fields": campos_fs(dados)}, "currentDocument": {"exists": False},
         "updateTransforms": [{"fieldPath": "criadoEm", "setToServerValue": "REQUEST_TIME"}]}
    http("POST", f"{BASE}:commit", {"writes": [w]}, token=token)
    tok = apontar_loja(did, feira, token)
    print(f"\nGRAVADO (previsto). O link fixo da Bioloja já abre esta sobra:\n{LINK_FIXO}{tok}")
    print(f"(link só desta sobra: {LINK}{did})")


def realizar(prev, sessoes, colhido, avisos, gravar, token):
    """O quadro definitivo entra na sobra que estava com o previsto."""
    por_cultura = {}
    for (cult, u), q in colhido.items():
        por_cultura[norm(cult)] = (cult, u, q)
    itens, usados, mudou = [], set(), []
    resp = prev.get("respostas") or []
    for i, it in enumerate(prev["itens"]):
        it = dict(it)
        real = por_cultura.get(norm(it["cultura"]))
        novo = real[2] if real else 0
        if real: usados.add(norm(it["cultura"]))
        if novo != it.get("colhido", 0):
            mudou.append(f"{it['cultura']}: previsto {fmt(it.get('colhido', 0))} → colhido {fmt(novo)} {it['rotulo']}")
        it.setdefault("previsto", it.get("colhido", 0))
        it["colhido"] = novo
        r = resp[i] if i < len(resp) else None
        if novo == 0 and it.get("anterior", 0) == 0 and r and (r.get("sobrou") or r.get("perdeu")):
            avisos.append(f"{it['cultura']}: não foi colhido, mas a loja anotou sobra/perda.")
        itens.append(it)
    novos = [v for k, v in por_cultura.items() if k not in usados]
    for cult, u, q in sorted(novos, key=lambda x: norm(x[0])):
        itens.append({"cultura": cult, "unidade": u, "rotulo": rotulo(cult, u), "destino": destino(cult, u),
                      "anterior": 0, "colhido": q, "previsto": 0})
        if prev.get("status") == "enviada":
            avisos.append(f"{cult}: colhido {fmt(q)} {rotulo(cult, u)} sem estar no previsto — a loja não contou a sobra (entra 0). Confirme com a loja.")
    print(f"\nSOBRA DA FEIRA DE {feira_extensa(prev['feira']).upper()} — previsto → realizado ({prev['_docId']}, {prev.get('status')})")
    for m in mudou:
        print("  ", m)
    if not mudou:
        print("   (realizado igual ao previsto)")
    for a in avisos:
        print("AVISO:", a)
    if not gravar:
        print("\n(nada gravado; use --gravar depois do ok)")
        return
    w = {"update": {"name": f"{ROOT}/sobras/{prev['_docId']}",
                    "fields": campos_fs({"itens": itens, "sessoes": prev.get("sessoes", []) + sessoes, "previsto": False})},
         "updateMask": {"fieldPaths": ["itens", "sessoes", "previsto", "realizadoEm"]}, "currentDocument": {"exists": True},
         "updateTransforms": [{"fieldPath": "realizadoEm", "setToServerValue": "REQUEST_TIME"}]}
    http("POST", f"{BASE}:commit", {"writes": [w]}, token=token)
    print(f"\nGRAVADO: a sobra de {feira_extensa(prev['feira'])} agora tem o realizado. "
          + ("Já dá para conferir." if prev.get("status") == "enviada" else "A loja ainda não enviou."))


# ---------------------------------------------------------------- conferir

def resumo_de(s, xepa, fica):
    linhas, incoer = [], []
    resp = s.get("respostas", [])
    for i, it in enumerate(s["itens"]):
        r = resp[i] if i < len(resp) and resp[i] else {"sobrou": 0, "perdeu": 0}
        dest = it["destino"]
        if norm(it["cultura"]) in xepa: dest = "xepa"
        if norm(it["cultura"]) in fica: dest = "fica"
        total = r3(it.get("anterior", 0) + it.get("colhido", 0))
        sob, per = r3(r.get("sobrou", 0)), r3(r.get("perdeu", 0))
        vend = r3(total - sob - per)
        linha = {"cultura": it["cultura"], "unidade": it["unidade"], "rotulo": it["rotulo"], "destino": dest,
                 "anterior": it.get("anterior", 0), "colhido": it.get("colhido", 0), "total": total,
                 "sobrou": sob, "perdeu": per, "vendido": vend,
                 "fica": sob if dest == "fica" else 0, "xepa": sob if dest == "xepa" else 0}
        linhas.append(linha)
        if vend < 0:
            incoer.append(f"{it['cultura']}: sobrou + perdeu ({fmt(r3(sob + per))}) passa do total ({fmt(total)}).")
        elif total > 0 and sob + per == 0 and it.get("colhido", 0) == 0:
            incoer.append(f"{it['cultura']}: tinha {fmt(total)} da feira anterior e sobrou 0 — vendeu tudo?")
    return linhas, incoer


def cmd_conferir(did, gravar, xepa, fica, token, uid):
    s = next((x for x in listar("sobras", token) if x["_docId"] == did), None)
    if not s:
        sys.exit("Formulário não encontrado.")
    if s.get("status") != "enviada":
        sys.exit(f"Status '{s.get('status')}': só dá para conferir depois que a loja envia (e uma vez só).")
    if s.get("previsto"):
        sys.exit("Esta sobra ainda está com o PREVISTO. Lance o quadro definitivo antes de conferir.")
    linhas, incoer = resumo_de(s, xepa, fica)
    print(f"\nSOBRA DA FEIRA DE {feira_extensa(s['feira']).upper()} — contou: {s.get('quemContou', '')}")
    if s.get("obs"):
        print(f"Observação da loja: {s['obs']}")
    print(f"\n{'Produto':26} {'unid.':8} {'ficou':>6} {'chegou':>7} {'total':>6} {'sobrou':>7} {'perdeu':>7} {'VENDIDO':>8}  sobra vai para")
    for l in linhas:
        print(f"{l['cultura']:26} {l['rotulo']:8} {fmt(l['anterior']):>6} {fmt(l['colhido']):>7} {fmt(l['total']):>6} "
              f"{fmt(l['sobrou']):>7} {fmt(l['perdeu']):>7} {fmt(l['vendido']):>8}  {l['destino'] if l['sobrou'] else '—'}")
    for i in incoer:
        print("INCOERÊNCIA:", i)
    if not gravar:
        print("\n(nada gravado; use --gravar depois do ok)")
        return
    w = {"update": {"name": f"{ROOT}/sobras/{did}",
                    "fields": campos_fs({"status": "conferida", "resumo": linhas, "conferidoPor": uid})},
         "updateMask": {"fieldPaths": ["status", "resumo", "conferidoPor"]},
         "currentDocument": {"exists": True},
         "updateTransforms": [{"fieldPath": "conferidoEm", "setToServerValue": "REQUEST_TIME"}]}
    http("POST", f"{BASE}:commit", {"writes": [w]}, token=token)
    print("\nGRAVADO: sobra conferida. O que ficou entra no próximo formulário.")


def cmd_listar(token):
    for s in sorted(listar("sobras", token), key=lambda x: x.get("feira", ""), reverse=True)[:12]:
        st = s.get('status') + (" (previsto)" if s.get("previsto") else "")
        print(f"{s.get('feira')}  {feira_extensa(s['feira']):20} {st:21} {len(s.get('itens', [])):3} itens  "
              f"{s.get('quemContou', ''):15} {LINK}{s['_docId']}")


def cmd_link(token):
    lojas = listar("lojas", token)
    if lojas:
        l = lojas[0]
        print(f"Link fixo da Bioloja (abre a sobra de {feira_extensa(l['feira'])}):\n{LINK_FIXO}{l['_docId']}")
        return
    sobras = sorted(listar("sobras", token), key=lambda x: x.get("feira", ""))
    if not sobras:
        sys.exit("Ainda não há nenhuma sobra: gere a primeira com um quadro.")
    tok = apontar_loja(sobras[-1]["_docId"], sobras[-1]["feira"], token)
    print(f"Link fixo criado (abre a sobra de {feira_extensa(sobras[-1]['feira'])}):\n{LINK_FIXO}{tok}")


def main():
    args = sys.argv[1:]
    gravar = "--gravar" in args
    xepa, fica, pos, i = set(), set(), [], 0
    while i < len(args):
        a = args[i]
        if a in ("--xepa", "--fica") and i + 1 < len(args):
            (xepa if a == "--xepa" else fica).add(norm(args[i + 1])); i += 2; continue
        if not a.startswith("--"):
            pos.append(a)
        i += 1
    if not pos or pos[0] not in ("gerar", "conferir", "listar", "link", "previsto"):
        sys.exit(__doc__)
    token, uid, email = login(os.environ["GERANIUM_EMAIL"], os.environ["GERANIUM_SENHA"])
    if pos[0] == "gerar" and len(pos) >= 2:
        cmd_gerar(pos[1:], gravar, token, uid, email)
    elif pos[0] == "conferir" and len(pos) == 2:
        cmd_conferir(pos[1], gravar, xepa, fica, token, uid)
    elif pos[0] == "previsto" and len(pos) == 2:
        cmd_previsto(pos[1], gravar, token, uid, email)
    elif pos[0] == "listar":
        cmd_listar(token)
    elif pos[0] == "link":
        cmd_link(token)
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main()
