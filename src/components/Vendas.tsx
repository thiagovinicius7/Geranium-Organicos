import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Sobra, LinhaResumo, dataFeiraExtensa } from "../lib/sobra";
import {
  Modo, Periodo, feirasRespondidas, agruparPorPeriodo, destaques, variacaoPorFeira, rotuloPeriodo, rotuloCurto
} from "../lib/vendas";
import {
  BarChart3, Loader2, ChevronLeft, ChevronRight, RefreshCw, TrendingUp, TrendingDown, PackageCheck, Recycle, AlertTriangle
} from "lucide-react";

interface Props {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

const fmt = (n: number) => (n || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const pct = (n: number | null) => (n === null ? "—" : `${Math.round(n * 100)}%`);
const toDate = (v: any) => (v && typeof v.toDate === "function" ? v.toDate() : null);

const ICONE = {
  esgotou: { Icone: PackageCheck, cor: "text-emerald-700" },
  xepa: { Icone: Recycle, cor: "text-amber-700" },
  perda: { Icone: AlertTriangle, cor: "text-rose-700" },
  subiu: { Icone: TrendingUp, cor: "text-emerald-700" },
  caiu: { Icone: TrendingDown, cor: "text-rose-700" },
};

/** Barra de aproveitamento: quanto do que havia na loja foi vendido. */
function Aproveitamento({ valor }: { valor: number | null }) {
  if (valor === null) return <span className="text-slate-400">—</span>;
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.round(valor * 100)}%` }} />
      </div>
      <span className="w-9 text-right tabular-nums text-slate-700">{pct(valor)}</span>
    </div>
  );
}

/** Vendido do item, período a período (uma série só: o título diz qual). */
function GraficoItem({ periodos, cultura, modo, atual }: { periodos: Periodo[]; cultura: string; modo: Modo; atual: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const pontos = periodos.slice(-12).map(p => {
    const it = p.itens.find(i => i.cultura === cultura);
    return { chave: p.chave, it };
  });
  const rotulo = pontos.find(p => p.it)?.it?.rotulo || "";
  const max = Math.max(1, ...pontos.map(p => p.it?.vendido || 0));
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="font-bold text-slate-800">{cultura}: vendido por {modo === "semana" ? "semana" : "mês"}</h3>
        <span className="text-xs text-slate-500">{rotulo}</span>
      </div>
      <div className="relative mt-4 h-48 flex items-end gap-2 border-b border-slate-200">
        {pontos.map((p, i) => {
          const v = p.it?.vendido || 0;
          const h = Math.max(v > 0 ? 2 : 0, (v / max) * 100);
          const ativo = p.chave === atual;
          return (
            <div key={p.chave} className="flex-1 h-full flex flex-col justify-end items-center relative cursor-default"
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              {hover === i && (
                <div className="absolute bottom-full mb-1 z-10 whitespace-nowrap rounded-lg bg-slate-900 text-white text-xs px-2.5 py-1.5 shadow-lg pointer-events-none">
                  <div className="font-semibold">{rotuloPeriodo(p.chave, modo)}</div>
                  {p.it ? (
                    <>
                      <div>Vendido: {fmt(p.it.vendido)} {rotulo}</div>
                      <div>Chegou: {fmt(p.it.chegou)} · Xepa: {fmt(p.it.xepa)}</div>
                      <div>Aproveitamento: {pct(p.it.aproveitamento)}</div>
                    </>
                  ) : <div>Sem controle neste período</div>}
                </div>
              )}
              <div className={`w-full max-w-[36px] rounded-t ${ativo ? "bg-emerald-700" : "bg-emerald-400"} ${hover === i ? "opacity-80" : ""}`}
                style={{ height: `${h}%` }} />
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 mt-1.5">
        {pontos.map(p => (
          <div key={p.chave} className={`flex-1 text-center text-[11px] ${p.chave === atual ? "font-bold text-slate-800" : "text-slate-500"}`}>
            {rotuloCurto(p.chave, modo)}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Vendas({ onNotify }: Props) {
  const [sobras, setSobras] = useState<(Sobra & { resumo?: LinhaResumo[] })[]>([]);
  const [loading, setLoading] = useState(true);
  const [modo, setModo] = useState<Modo>("semana");
  const [idx, setIdx] = useState<number | null>(null);
  const [item, setItem] = useState<string | null>(null);

  const carregar = async () => {
    try {
      setLoading(true);
      const s = await getDocs(collection(db, "sobras"));
      setSobras(s.docs.map(d => {
        const x = d.data() as any;
        return {
          id: d.id, feira: x.feira || "", status: x.status || "aberta", itens: x.itens || [], sessoes: x.sessoes || [],
          respostas: x.respostas, previsto: !!x.previsto, quemContou: x.quemContou, resumo: x.resumo,
          enviadoEm: toDate(x.enviadoEm), conferidoEm: toDate(x.conferidoEm),
        };
      }));
    } catch (err) {
      console.error("Erro ao carregar vendas:", err);
      onNotify("Erro ao carregar as vendas da Bioloja.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const periodos = useMemo(() => agruparPorPeriodo(feirasRespondidas(sobras), modo), [sobras, modo]);
  useEffect(() => { setIdx(null); }, [modo]);
  const i = idx === null ? periodos.length - 1 : Math.min(idx, periodos.length - 1);
  const atual = periodos[i] || null;
  const anterior = i > 0 ? periodos[i - 1] : null;
  const notas = useMemo(() => (atual ? destaques(atual, anterior) : []), [atual, anterior]);

  const itens = atual?.itens || [];
  const ordenados = [...itens].sort((a, b) => (b.aproveitamento ?? -1) - (a.aproveitamento ?? -1));
  const selecionado = item && itens.some(x => x.cultura === item) ? item : (ordenados[0]?.cultura || null);

  // Números do topo: aproveitamento geral por unidade (não se somam kg com maços).
  const porUnidade = useMemo(() => {
    const m = new Map<string, { rotulo: string; vendido: number; disp: number; xepa: number }>();
    for (const it of itens) {
      const rot = it.unidade === "KG" ? "kg" : it.unidade === "MÇ" ? "maços" : it.unidade === "BJ" ? "bandejas" : "pés/un";
      const u = m.get(it.unidade) || { rotulo: rot, vendido: 0, disp: 0, xepa: 0 };
      u.vendido += it.vendido; u.disp += it.inicio + it.chegou; u.xepa += it.xepa;
      m.set(it.unidade, u);
    }
    return Array.from(m.values());
  }, [itens]);

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-500"><Loader2 className="w-6 h-6 animate-spin mr-2" /> Carregando vendas…</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-emerald-700" /> Análise de Vendas
          </h2>
          <p className="text-sm text-slate-500 mt-1">Vendas da Bioloja pelas sobras de cada feira: vendido = o que havia na loja − sobrou − perdeu.</p>
        </div>
        <div className="flex gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5">
            {(["semana", "mes"] as Modo[]).map(m => (
              <button key={m} onClick={() => setModo(m)}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold ${modo === m ? "bg-emerald-700 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                {m === "semana" ? "Semanal" : "Mensal"}
              </button>
            ))}
          </div>
          <button onClick={carregar} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className="w-4 h-4" /> Atualizar
          </button>
        </div>
      </div>

      {!atual ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          Ainda não há sobra enviada pela loja. As vendas aparecem aqui assim que a primeira contagem chegar.
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between bg-white rounded-xl border border-slate-200 px-3 py-2">
            <button disabled={i <= 0} onClick={() => setIdx(i - 1)} className="p-2 rounded-lg hover:bg-slate-50 disabled:opacity-30" aria-label="Período anterior">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="text-center">
              <div className="font-bold text-slate-800">{rotuloPeriodo(atual.chave, modo)}</div>
              <div className="text-xs text-slate-500">{atual.feiras.length} feira(s): {atual.feiras.map(f => dataFeiraExtensa(f)).join(" · ")}</div>
            </div>
            <button disabled={i >= periodos.length - 1} onClick={() => setIdx(i + 1)} className="p-2 rounded-lg hover:bg-slate-50 disabled:opacity-30" aria-label="Próximo período">
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {porUnidade.map(u => (
              <div key={u.rotulo} className="bg-white rounded-xl border border-slate-200 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Vendido em {u.rotulo}</div>
                <div className="text-2xl font-bold text-slate-800 mt-1 tabular-nums">{fmt(u.vendido)}</div>
                <div className="text-xs text-slate-500 mt-1">
                  {pct(u.disp > 0 ? u.vendido / u.disp : null)} do que havia na loja · xepa {fmt(u.xepa)}
                </div>
              </div>
            ))}
          </div>

          {notas.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <h3 className="font-bold text-slate-800 mb-3">Leitura {modo === "semana" ? "da semana" : "do mês"}</h3>
              <ul className="space-y-2">
                {notas.map((n, k) => {
                  const { Icone, cor } = ICONE[n.tipo];
                  return <li key={k} className="flex gap-2 text-sm text-slate-700"><Icone className={`w-4 h-4 mt-0.5 shrink-0 ${cor}`} />{n.texto}</li>;
                })}
              </ul>
              {!anterior && <p className="text-xs text-slate-400 mt-3">A comparação com o período anterior aparece quando houver dois períodos controlados.</p>}
            </div>
          )}

          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 bg-slate-50">
              <div className="font-bold text-slate-800">Itens controlados</div>
              <div className="text-xs text-slate-500">Toque num item para ver o gráfico. Aproveitamento = vendido ÷ (ficou do período anterior + chegou). “vs. anterior” compara a venda média por feira.</div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold">Produto</th>
                    <th className="text-right px-3 py-2 font-semibold">Ficou antes</th>
                    <th className="text-right px-3 py-2 font-semibold">Chegou</th>
                    <th className="text-right px-3 py-2 font-semibold text-emerald-700">Vendido</th>
                    <th className="text-right px-3 py-2 font-semibold">Xepa</th>
                    <th className="text-right px-3 py-2 font-semibold">Perdeu</th>
                    <th className="text-right px-3 py-2 font-semibold">Ficou no fim</th>
                    <th className="text-right px-3 py-2 font-semibold">Aproveitamento</th>
                    <th className="text-right px-4 py-2 font-semibold" title="Venda média por feira comparada com o período anterior">vs. anterior</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ordenados.map(it => {
                    const v = variacaoPorFeira(it, anterior);
                    const sel = it.cultura === selecionado;
                    return (
                      <tr key={it.cultura} onClick={() => setItem(it.cultura)}
                        className={`cursor-pointer ${sel ? "bg-emerald-50" : "hover:bg-slate-50"}`}>
                        <td className="px-4 py-2 text-slate-800">{it.cultura} <span className="text-xs text-slate-400">({it.rotulo})</span></td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(it.inicio)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(it.chegou)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-bold text-emerald-800">{fmt(it.vendido)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(it.xepa)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(it.perdeu)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(it.fim)}</td>
                        <td className="px-3 py-2"><Aproveitamento valor={it.aproveitamento} /></td>
                        <td className="px-4 py-2 text-right tabular-nums text-slate-700">
                          {v === null ? <span className="text-slate-400">—</span> : (
                            <span className="inline-flex items-center gap-1">
                              {v >= 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-700" /> : <TrendingDown className="w-3.5 h-3.5 text-rose-700" />}
                              {v >= 0 ? "+" : "−"}{Math.abs(Math.round(v * 100))}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {selecionado && <GraficoItem periodos={periodos} cultura={selecionado} modo={modo} atual={atual.chave} />}
        </>
      )}
    </div>
  );
}
