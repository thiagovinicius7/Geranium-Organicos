import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { usePermissions } from "../lib/permissions";
import {
  Sobra, LinhaResumo, resumoSobra, substitutaDe, dataFeiraExtensa, totalNaLoja
} from "../lib/sobra";
import { Store, Loader2, Copy, CheckCircle2, AlertTriangle, RefreshCw, ChevronRight } from "lucide-react";

interface Props {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

const LINK_FIXO = "https://thiagovinicius7.github.io/Geranium-Organicos/#/loja/";

const fmt = (n: number) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 3 });

const toDate = (v: any): Date | null => (v && typeof v.toDate === "function" ? v.toDate() : null);
const fmtHora = (d?: Date | null) =>
  d ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

const STATUS: Record<string, { rotulo: string; cor: string }> = {
  aberta: { rotulo: "Aguardando a loja", cor: "bg-amber-100 text-amber-800 border-amber-200" },
  enviada: { rotulo: "Enviada pela loja", cor: "bg-sky-100 text-sky-800 border-sky-200" },
  conferida: { rotulo: "Conferida", cor: "bg-emerald-100 text-emerald-800 border-emerald-200" },
};

export default function Sobras({ onNotify }: Props) {
  const { canEdit, isLauncher, uid } = usePermissions();
  const [sobras, setSobras] = useState<(Sobra & { resumo?: LinhaResumo[] })[]>([]);
  const [lojaToken, setLojaToken] = useState<string | null>(null);
  const [lojaSobraId, setLojaSobraId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [conferindo, setConferindo] = useState(false);

  const carregar = async () => {
    try {
      setLoading(true);
      const [s, l] = await Promise.all([getDocs(collection(db, "sobras")), getDocs(collection(db, "lojas"))]);
      const lista = s.docs.map(d => {
        const x = d.data() as any;
        return {
          id: d.id,
          feira: x.feira || "",
          status: x.status || "aberta",
          itens: x.itens || [],
          sessoes: x.sessoes || [],
          respostas: x.respostas,
          previsto: !!x.previsto,
          quemContou: x.quemContou,
          obs: x.obs,
          resumo: x.resumo,
          enviadoEm: toDate(x.enviadoEm),
          conferidoEm: toDate(x.conferidoEm),
        };
      }).sort((a, b) => b.feira.localeCompare(a.feira));
      setSobras(lista);
      if (!l.empty) {
        setLojaToken(l.docs[0].id);
        setLojaSobraId((l.docs[0].data() as any).sobraId || null);
      }
      setSelecionada(atual => atual && lista.some(x => x.id === atual) ? atual : lista[0]?.id || null);
    } catch (err) {
      console.error("Erro ao carregar sobras:", err);
      onNotify("Erro ao carregar as sobras da Bioloja.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const sel = sobras.find(s => s.id === selecionada) || null;
  const substituta = sel ? substitutaDe(sel, sobras) : null;

  const { linhas, incoerencias } = useMemo(() => {
    if (!sel) return { linhas: [] as LinhaResumo[], incoerencias: [] as string[] };
    if (sel.status === "conferida" && sel.resumo?.length) return { linhas: sel.resumo, incoerencias: [] };
    if (sel.status === "enviada") return resumoSobra(sel);
    return {
      linhas: sel.itens.map(it => ({
        cultura: it.cultura, unidade: it.unidade, rotulo: it.rotulo, destino: it.destino,
        anterior: it.anterior || 0, colhido: it.colhido || 0, total: totalNaLoja(it),
        sobrou: 0, perdeu: 0, vendido: 0, fica: 0, xepa: 0,
      })),
      incoerencias: [],
    };
  }, [sel]);

  const respondida = sel?.status === "enviada" || sel?.status === "conferida";
  const grupos = [
    { titulo: "Folhas, ervas, alfaces e brócolis", nota: "A sobra vai para a xepa.", linhas: linhas.filter(l => l.destino === "xepa") },
    { titulo: "Frutas, legumes e raízes", nota: "A sobra fica para a próxima feira.", linhas: linhas.filter(l => l.destino !== "xepa") },
  ].filter(g => g.linhas.length);

  const podeConferir = sel?.status === "enviada" && !sel?.previsto && !substituta && (canEdit || isLauncher) && !!uid;

  const conferir = async () => {
    if (!sel || !uid) return;
    if (incoerencias.length && !window.confirm(`Há ${incoerencias.length} ponto(s) para conferir:\n\n${incoerencias.join("\n")}\n\nMarcar como conferida mesmo assim?`)) return;
    if (!incoerencias.length && !window.confirm("Marcar esta sobra como conferida? O que ficou entra no próximo formulário da loja. Não dá para desfazer.")) return;
    try {
      setConferindo(true);
      await updateDoc(doc(db, "sobras", sel.id), {
        status: "conferida",
        resumo: linhas,
        conferidoPor: uid,
        conferidoEm: serverTimestamp(),
      });
      onNotify("Sobra conferida.", "success");
      await carregar();
    } catch (err) {
      console.error(err);
      onNotify("Não foi possível marcar como conferida.", "error");
    } finally {
      setConferindo(false);
    }
  };

  const copiarLink = async () => {
    if (!lojaToken) return;
    const link = LINK_FIXO + lojaToken;
    try {
      await navigator.clipboard.writeText(link);
      onNotify("Link da loja copiado.", "success");
    } catch {
      window.prompt("Copie o link da loja:", link);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando sobras…
      </div>
    );
  }

  const tot = (k: "vendido" | "sobrou" | "perdeu", unidade: string) =>
    linhas.filter(l => l.unidade === unidade).reduce((a, l) => a + (l[k] || 0), 0);
  const unidades: string[] = Array.from(new Set<string>(linhas.map(l => l.unidade)));
  const rotuloUnid = (u: string) => ({ KG: "kg", "MÇ": "maços", UN: "un", BJ: "bandejas" } as Record<string, string>)[u] || u;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <Store className="w-6 h-6 text-emerald-700" /> Sobras da Bioloja
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            O que chegou dos quadros, o que sobrou, perdeu e foi vendido em cada feira.
          </p>
        </div>
        <div className="flex gap-2">
          {lojaToken && (
            <button onClick={copiarLink} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
              <Copy className="w-4 h-4" /> Link da loja
            </button>
          )}
          <button onClick={carregar} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      {sobras.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          Nenhuma sobra ainda. O formulário é criado quando um quadro de colheita é lançado.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          {/* Lista de feiras */}
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 h-fit">
            {sobras.map(s => {
              const st = STATUS[s.status] || STATUS.aberta;
              const sub = substitutaDe(s, sobras);
              const ativa = s.id === selecionada;
              return (
                <button key={s.id} onClick={() => setSelecionada(s.id)}
                  className={`w-full text-left px-4 py-3 flex items-center gap-3 ${ativa ? "bg-emerald-50" : "hover:bg-slate-50"} ${sub ? "opacity-60" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-slate-800">{dataFeiraExtensa(s.feira)}</div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${st.cor}`}>{st.rotulo}</span>
                      {s.previsto && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-orange-100 text-orange-800 border-orange-200">Previsto</span>}
                      {s.id === lojaSobraId && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-violet-100 text-violet-800 border-violet-200">No link da loja</span>}
                      {sub && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-slate-100 text-slate-600 border-slate-200">Passada para {sub.feira.slice(8, 10)}/{sub.feira.slice(5, 7)}</span>}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">{s.itens.length} itens{s.quemContou ? ` · ${s.quemContou}` : ""}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400" />
                </button>
              );
            })}
          </div>

          {/* Detalhe */}
          {sel && (
            <div className="space-y-4">
              <div className="bg-white rounded-xl border border-slate-200 p-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Feira de {dataFeiraExtensa(sel.feira)}</h3>
                    <p className="text-sm text-slate-500 mt-1">
                      {sel.status === "aberta" && "A loja ainda não enviou a contagem."}
                      {sel.status === "enviada" && `Contagem de ${sel.quemContou || "—"}, enviada em ${fmtHora(sel.enviadoEm)}.`}
                      {sel.status === "conferida" && `Contagem de ${sel.quemContou || "—"}, conferida em ${fmtHora(sel.conferidoEm)}.`}
                    </p>
                    <p className="text-xs text-slate-400 mt-1">Quadros: {sel.sessoes.join(", ") || "—"}</p>
                  </div>
                  {podeConferir && (
                    <button onClick={conferir} disabled={conferindo}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-700 text-white text-sm font-bold hover:bg-emerald-800 disabled:opacity-60">
                      {conferindo ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Marcar como conferida
                    </button>
                  )}
                </div>

                {sel.previsto && (
                  <div className="mt-3 text-sm bg-orange-50 border border-orange-200 rounded-lg p-3 text-orange-900">
                    Lista feita pelo <b>previsto</b> do quadro. Quando o quadro definitivo for lançado, o “chegou” vira o colhido de verdade; só então dá para conferir.
                  </div>
                )}
                {substituta && (
                  <div className="mt-3 text-sm bg-slate-50 border border-slate-200 rounded-lg p-3 text-slate-600">
                    Os quadros desta sobra foram levados para a feira de {dataFeiraExtensa(substituta.feira)}. Use aquela; esta não entra na conta.
                  </div>
                )}
                {sel.obs && (
                  <div className="mt-3 text-sm bg-amber-50 border border-amber-200 rounded-lg p-3 text-amber-900">
                    <span className="font-semibold">Observação:</span> {sel.obs}
                  </div>
                )}
                {incoerencias.length > 0 && (
                  <div className="mt-3 text-sm bg-rose-50 border border-rose-200 rounded-lg p-3 text-rose-800 space-y-1">
                    {incoerencias.map((t, i) => <div key={i} className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />{t}</div>)}
                  </div>
                )}

                {respondida && (
                  <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(["vendido", "sobrou", "perdeu"] as const).map(k => (
                      <div key={k} className="rounded-lg border border-slate-200 p-3">
                        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">{k === "vendido" ? "Vendido" : k === "sobrou" ? "Sobrou" : "Perdeu"}</div>
                        <div className="text-sm text-slate-800 mt-1 space-y-0.5">
                          {unidades.map(u => <div key={u}><span className="font-bold text-lg">{fmt(tot(k, u))}</span> {rotuloUnid(u)}</div>)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {grupos.map(g => (
                <div key={g.titulo} className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
                    <div className="font-bold text-slate-800">{g.titulo}</div>
                    <div className="text-xs text-slate-500">{g.nota}</div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-xs uppercase text-slate-500">
                        <tr>
                          <th className="text-left px-4 py-2 font-semibold">Produto</th>
                          <th className="text-right px-3 py-2 font-semibold">Ficou</th>
                          <th className="text-right px-3 py-2 font-semibold">Chegou</th>
                          <th className="text-right px-3 py-2 font-semibold">Total</th>
                          {respondida && <>
                            <th className="text-right px-3 py-2 font-semibold">Sobrou</th>
                            <th className="text-right px-3 py-2 font-semibold">Perdeu</th>
                            <th className="text-right px-4 py-2 font-semibold text-emerald-700">Vendido</th>
                          </>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {g.linhas.map(l => (
                          <tr key={l.cultura} className={l.vendido < 0 ? "bg-rose-50" : ""}>
                            <td className="px-4 py-2 text-slate-800">{l.cultura} <span className="text-xs text-slate-400">({l.rotulo})</span></td>
                            <td className="px-3 py-2 text-right text-slate-500">{fmt(l.anterior)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{fmt(l.colhido)}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{fmt(l.total)}</td>
                            {respondida && <>
                              <td className="px-3 py-2 text-right text-slate-700">{fmt(l.sobrou)}</td>
                              <td className="px-3 py-2 text-right text-slate-700">{fmt(l.perdeu)}</td>
                              <td className="px-4 py-2 text-right font-bold text-emerald-800">{fmt(l.vendido)}</td>
                            </>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
