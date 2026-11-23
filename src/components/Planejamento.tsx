import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, deleteField, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Crop, Harvest, Planting, Purchase } from "../types";
import { usePermissions, launchStamp } from "../lib/permissions";
import { formatarData, hojeLocal } from "../lib/producao";
import {
  calcularPlanejamento, textoPedido, CONFIG_PADRAO, ConfigPlanejamento, PlanoCultura, PlanejamentoCultura
} from "../lib/planejamento";
import {
  CalendarRange, Copy, Loader2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight,
  Settings2, AlertTriangle, Info, Pin, ShoppingCart, X
} from "lucide-react";

interface Props {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

const fmt = (n: number, casas = 1) => Number(n.toFixed(casas)).toLocaleString("pt-BR");

function corCobertura(c: number | null): string {
  if (c === null) return "bg-slate-100";
  if (c < 0.7) return "bg-rose-400";
  if (c > 1.3) return "bg-amber-300";
  return "bg-emerald-400";
}

function Tendencia({ valor }: { valor: number | null }) {
  if (valor === null) return null;
  const pct = Math.round(valor * 100);
  if (Math.abs(pct) < 10) return <span className="inline-flex items-center text-[10px] text-slate-400 font-bold"><Minus className="w-3 h-3" /> estável</span>;
  return pct > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-700 font-bold"><TrendingUp className="w-3 h-3" /> +{pct}%</span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-[10px] text-rose-600 font-bold"><TrendingDown className="w-3 h-3" /> {pct}%</span>
  );
}

const ORIGEM_RENDIMENTO: Record<string, string> = {
  historico: "média dos plantios finalizados",
  informado: "informado na cultura",
  referencia: "referência da bibliografia",
  unidade: "1 pé por muda, sem histórico de perda"
};

export default function Planejamento({ onNotify }: Props) {
  const { canEdit } = usePermissions();
  const [crops, setCrops] = useState<Crop[]>([]);
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [registrando, setRegistrando] = useState(false);
  const [config, setConfig] = useState<ConfigPlanejamento>(CONFIG_PADRAO);
  const [loading, setLoading] = useState(true);
  const [semana, setSemana] = useState(0);
  const [aberta, setAberta] = useState<string | null>(null);
  const [verOutras, setVerOutras] = useState(false);
  const [verConfig, setVerConfig] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      setLoading(true);
      const [c, p, h, cfg, compras] = await Promise.all([
        getDocs(collection(db, "crops")),
        getDocs(collection(db, "plantings")),
        getDocs(collection(db, "harvests")),
        getDoc(doc(db, "metadata", "planejamento")),
        getDocs(collection(db, "purchases"))
      ]);
      setPurchases(compras.docs.map(d => {
        const data = d.data();
        return { ...data, docId: d.id, id: data.id || d.id } as Purchase;
      }));
      setCrops(c.docs.map(d => ({ id: d.id, ...d.data() } as Crop)));
      setPlantings(p.docs.map(d => {
        const data = d.data();
        return { ...data, docId: d.id, id: data.id || d.id } as Planting;
      }));
      setHarvests(h.docs.map(d => ({ id: d.id, ...d.data() } as Harvest)));
      if (cfg.exists()) setConfig({ ...CONFIG_PADRAO, ...(cfg.data() as Partial<ConfigPlanejamento>) });
    } catch (err) {
      console.error("Erro ao carregar planejamento:", err);
      onNotify("Erro ao carregar os dados do planejamento.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { carregar(); }, []);

  const resultado = useMemo(() => calcularPlanejamento(crops, plantings, harvests, config, hojeLocal(), purchases), [crops, plantings, harvests, config, purchases]);
  const principais = resultado.culturas.filter(c => c.principal);
  const outras = resultado.culturas.filter(c => !c.principal);
  const datasSemanas = principais[0]?.plantar.map(p => p.data) ||
    Array.from({ length: config.semanasPlantio }, (_, i) => resultado.hoje);
  const comFalta = principais.filter(c => c.primeiraFalta).length;
  const aPlantar = principais.filter(c => (c.plantar[semana]?.quantidade || 0) > 0);

  const salvarCultura = async (nome: string, mudancas: Partial<PlanejamentoCultura>) => {
    const crop = crops.find(c => c.nome === nome);
    if (!crop?.id) return;
    const atual: PlanejamentoCultura = { ...(crop.planejamento || {}), ...mudancas };
    Object.keys(atual).forEach(k => {
      const v = (atual as any)[k];
      if (v === undefined || v === null || v === "" || v === false || (typeof v === "number" && !(v > 0))) delete (atual as any)[k];
    });
    try {
      setSalvando(true);
      await updateDoc(doc(db, "crops", crop.id), {
        planejamento: Object.keys(atual).length ? atual : deleteField()
      });
      setCrops(prev => prev.map(c => (c.id === crop.id ? { ...c, planejamento: atual } : c)));
      onNotify(`Planejamento de ${nome} atualizado.`, "success");
    } catch (err) {
      console.error(err);
      onNotify("Não foi possível salvar. Só Editor e Administrador alteram o planejamento.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const salvarConfig = async (novo: ConfigPlanejamento) => {
    try {
      setSalvando(true);
      await setDoc(doc(db, "metadata", "planejamento"), novo);
      setConfig(novo);
      onNotify("Configuração do planejamento salva.", "success");
    } catch (err) {
      console.error(err);
      onNotify("Não foi possível salvar a configuração.", "error");
    } finally {
      setSalvando(false);
    }
  };

  const copiarPedido = async () => {
    const texto = textoPedido(resultado, semana, config.bandeja);
    if (!texto) {
      onNotify("Nada a plantar nesta semana.", "info");
      return;
    }
    try {
      await navigator.clipboard.writeText(texto);
      onNotify("Lista copiada. É só colar no WhatsApp.", "success");
    } catch {
      window.prompt("Copie a lista:", texto);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-slate-400">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        <p className="text-sm mt-2 font-medium">Calculando o planejamento…</p>
      </div>
    );
  }

  const linha = (c: PlanoCultura) => {
    const p = c.plantar[semana];
    const expandida = aberta === c.cultura;
    return (
      <React.Fragment key={c.cultura}>
        <tr className="hover:bg-slate-50/60 transition cursor-pointer" onClick={() => setAberta(expandida ? null : c.cultura)}>
          <td className="p-3">
            <div className="flex items-center gap-1.5">
              {expandida ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
              <span className="font-bold text-slate-800">{c.cultura}</span>
              {c.fixada && <Pin className="w-3 h-3 text-emerald-600" />}
            </div>
            <div className="text-[10px] text-slate-400 ml-5">{c.plantiosAbertos} plantio{c.plantiosAbertos === 1 ? "" : "s"} no campo</div>
            {c.comprasPendentes.length > 0 && (
              <div className="text-[10px] text-indigo-700 font-semibold ml-5">
                🛒 {fmt(c.comprasPendentes.reduce((s, x) => s + x.saldo, 0), 0)} mudas compradas, ainda sem plantio
              </div>
            )}
            <div className="md:hidden ml-5 mt-1.5"><FaixaCobertura c={c} /></div>
          </td>
          <td className="p-3 text-center">
            <div className="font-mono font-bold text-slate-800">{fmt(c.saidaSemanal)} <span className="text-[10px] text-slate-400">{c.unidade}</span></div>
            {c.saidaOrigem === "meta" ? <span className="text-[10px] text-indigo-600 font-bold">meta</span> : <Tendencia valor={c.tendencia} />}
          </td>
          <td className="p-3 text-center">
            {p ? (
              <div className={`font-mono font-black text-base ${p.quantidade > 0 ? "text-emerald-700" : "text-slate-300"}`}>
                {p.quantidade > 0 ? fmt(p.quantidade, 0) : "—"}
                {p.quantidade > 0 && <span className="text-[10px] font-bold text-slate-400 ml-1">{c.unidadePlantio}</span>}
              </div>
            ) : (
              <span className="text-[10px] text-amber-700 font-bold">{c.rendimento === null ? "falta rendimento" : "conferir no campo"}</span>
            )}
          </td>
          <td className="p-3 hidden md:table-cell">
            <FaixaCobertura c={c} centro />
          </td>
        </tr>
        {expandida && (
          <tr className="bg-slate-50/70">
            <td colSpan={4} className="p-4 max-md:px-3">
              <Detalhe c={c} canEdit={canEdit} salvando={salvando} onSalvar={m => salvarCultura(c.cultura, m)} crop={crops.find(x => x.nome === c.cultura)} />
            </td>
          </tr>
        )}
      </React.Fragment>
    );
  };

  const tabela = (lista: PlanoCultura[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm border-collapse">
        <thead>
          <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <th className="p-3">Cultura</th>
            <th className="p-3 text-center">Saída por semana</th>
            <th className="p-3 text-center">Plantar</th>
            <th className="p-3 text-center hidden md:table-cell">Cobertura (8 semanas)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{lista.map(linha)}</tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight flex items-center gap-2">
            <CalendarRange className="w-5 h-5 text-emerald-600" /> Planejamento de Plantio
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Quanto plantar por semana para não faltar, a partir das colheitas lançadas
            {resultado.inicioDados ? ` desde ${formatarData(resultado.inicioDados)}` : ""}.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copiarPedido}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            <Copy className="w-4 h-4" /> Copiar lista da semana
          </button>
          <button
            onClick={() => setRegistrando(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" /> Já comprei
          </button>
          {canEdit && (
            <button
              onClick={() => setVerConfig(v => !v)}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
            >
              <Settings2 className="w-4 h-4" /> Ajustes
            </button>
          )}
        </div>
      </div>

      {resultado.semanasDeDados < 4 && (
        <div className="flex gap-3 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 leading-relaxed">
          <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <span>
            Só há <strong>{fmt(resultado.semanasDeDados)} semanas</strong> de colheita lançada. A previsão já serve de guia,
            mas fica mais firme com 4 a 8 semanas de dados. Confira os números com o que você conhece do campo.
          </span>
        </div>
      )}

      {registrando && (
        <RegistrarCompra
          semana={semana}
          dataSemana={datasSemanas[semana] || resultado.hoje}
          itens={aPlantar.filter(c => c.forma === "Muda")}
          bandeja={config.bandeja}
          onFechar={() => setRegistrando(false)}
          onSalvo={msg => { setRegistrando(false); onNotify(msg, "success"); carregar(); }}
          onErro={msg => onNotify(msg, "error")}
        />
      )}

      {verConfig && canEdit && <Config config={config} salvando={salvando} onSalvar={salvarConfig} />}

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Itens a plantar</div>
          <div className="text-2xl font-black text-emerald-700 mt-1">{aPlantar.length}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Com falta prevista</div>
          <div className={`text-2xl font-black mt-1 ${comFalta ? "text-rose-600" : "text-slate-300"}`}>{comFalta}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 col-span-2 md:col-span-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cobertura</div>
          <div className="flex items-center gap-3 mt-2 text-[10px] font-semibold text-slate-500">
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-400" /> falta</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-400" /> ok</span>
            <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-300" /> sobra</span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200 flex flex-wrap gap-2 items-center justify-between">
          <h2 className="text-xs font-black uppercase tracking-widest text-slate-700">Principais itens</h2>
          <div className="flex flex-wrap gap-1 bg-slate-50 p-1 rounded-xl border border-slate-200">
            {datasSemanas.map((d, i) => (
              <button
                key={i}
                onClick={() => setSemana(i)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  semana === i ? "bg-white text-emerald-700 shadow-xs border border-slate-200" : "text-slate-500 hover:text-slate-800"
                }`}
              >
                {i === 0 ? "Esta semana" : formatarData(d).slice(0, 5)}
              </button>
            ))}
          </div>
        </div>
        {principais.length === 0 ? (
          <p className="p-6 text-sm text-slate-500">Ainda não há colheitas de culturas de ciclo para calcular.</p>
        ) : (
          tabela(principais)
        )}
        {semana > 0 && (
          <p className="px-4 py-3 text-[11px] text-slate-500 border-t border-slate-100 flex gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            As semanas seguintes supõem que as sugestões anteriores foram plantadas. Servem para encomendar mudas com antecedência; o número de cada semana é recalculado com os dados novos.
          </p>
        )}
      </div>

      {outras.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <button
            onClick={() => setVerOutras(v => !v)}
            className="w-full p-4 flex items-center justify-between text-xs font-black uppercase tracking-widest text-slate-500 cursor-pointer"
          >
            <span>Outras culturas ({outras.length})</span>
            {verOutras ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
          {verOutras && tabela(outras)}
        </div>
      )}

      <div className="text-[11px] text-slate-500 leading-relaxed bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
        <p><strong>Bandejas:</strong> mudas são sugeridas em bandejas inteiras de {config.bandeja || "—"}. Cada variedade entra no rodízio quando a necessidade acumulada passa de meia bandeja, e as semanas mais cheias antecipam uma bandeja para a semana anterior.</p>
        <p><strong>Como é calculado:</strong> a saída é a média das colheitas (as 2 últimas semanas pesam mais). O plantio da semana é o que falta para a primeira semana de colheita dele ficar coberta, contando que se planta toda semana: em situação normal dá saída ÷ rendimento; se o campo já tem muito, diminui; se falta, aumenta até o dobro. Soma a margem de segurança de {Math.round(config.margem * 100)}%.</p>
        <p>Perenes ficam de fora. A colheita lançada é usada como saída: se um item faltou e por isso não foi colhido, a média fica abaixo da procura real. Nesse caso, defina uma meta semanal na cultura.</p>
      </div>
    </div>
  );
}

function FaixaCobertura({ c, centro = false }: { c: PlanoCultura; centro?: boolean }) {
  return (
    <div>
      <div className={`flex gap-0.5 ${centro ? "justify-center" : ""}`} title="Próximas 8 semanas só com o que já está no campo">
        {c.cobertura.map(s => (
          <div
            key={s.inicio}
            className={`w-3.5 h-5 max-md:w-3 max-md:h-3 rounded-sm ${corCobertura(s.cobertura)}`}
            title={`Semana de ${formatarData(s.inicio)}: ${fmt(s.oferta)} ${c.unidade}${s.cobertura !== null ? ` (${Math.round(s.cobertura * 100)}% da saída)` : ""}`}
          />
        ))}
      </div>
      {c.primeiraFalta && (
        <div className={`text-[10px] text-rose-600 font-bold mt-1 ${centro ? "text-center" : ""}`}>falta a partir de {formatarData(c.primeiraFalta).slice(0, 5)}</div>
      )}
    </div>
  );
}

function Detalhe({
  c, crop, canEdit, salvando, onSalvar
}: {
  c: PlanoCultura;
  crop?: Crop;
  canEdit: boolean;
  salvando: boolean;
  onSalvar: (m: Partial<PlanejamentoCultura>) => void;
}) {
  const cfg = crop?.planejamento || {};
  const [meta, setMeta] = useState<string>(cfg.metaSemanal ? String(cfg.metaSemanal) : "");
  const [rend, setRend] = useState<string>(cfg.rendimento ? String(cfg.rendimento) : "");

  return (
    <div className="grid md:grid-cols-2 gap-5 text-xs text-slate-600">
      <div className="space-y-2">
        <p>
          <strong>Saída:</strong> {fmt(c.recente)} {c.unidade}/semana nas 2 últimas semanas
          {c.anterior !== null && <> · {fmt(c.anterior)} nas 2 anteriores</>}
          {c.saidaOrigem === "meta" && <> · <span className="text-indigo-700 font-bold">usando a meta de {fmt(c.saidaSemanal)}</span></>}
        </p>
        <p>
          <strong>Rendimento:</strong>{" "}
          {c.rendimento !== null
            ? <>{fmt(c.rendimento, 2)} {c.unidade} por {c.unidadePlantio === "m²" ? "m²" : "muda"} ({ORIGEM_RENDIMENTO[c.rendimentoOrigem || ""]}{c.amostrasRendimento ? `, ${c.amostrasRendimento} plantio${c.amostrasRendimento > 1 ? "s" : ""}` : ""}{c.fonteRendimento ? `: ${c.fonteRendimento}` : ""})</>
            : <span className="text-amber-700 font-bold">não informado</span>}
        </p>
        <p><strong>Colheita:</strong> dura cerca de {fmt(c.semanasNaJanela)} semana{c.semanasNaJanela > 1 ? "s" : ""} por plantio.</p>
        {c.plantar.length > 0 && (
          <div className="flex flex-wrap gap-1.5 pt-1">
            {c.plantar.map((p, i) => (
              <span key={i} className="px-2 py-1 bg-white border border-slate-200 rounded-lg font-mono">
                {i === 0 ? "esta semana" : formatarData(p.data).slice(0, 5)}: <strong>{fmt(p.quantidade, 0)}</strong>
              </span>
            ))}
            <span className="px-2 py-1 text-slate-400">normal: {fmt(c.plantar[0].base, 0)} {c.unidadePlantio}/semana</span>
          </div>
        )}
        {c.comprasPendentes.map(cp => (
          <p key={cp.id} className="text-indigo-700">
            🛒 <strong>{fmt(cp.saldo, 0)} mudas</strong> compradas em {formatarData(cp.data).slice(0, 5)}
            {cp.pedido ? ` (pedido ${cp.pedido})` : ""}{cp.aguardandoNota ? ", aguardando nota" : ""}:
            contam como plantio da semana de {formatarData(cp.plantio).slice(0, 5)} até o plantio ser lançado.
          </p>
        ))}
        {c.avisos.map(a => (
          <p key={a} className="text-amber-700 font-semibold">• {a}</p>
        ))}
      </div>

      {canEdit ? (
        <div className="space-y-3 bg-white p-3 rounded-xl border border-slate-200">
          <label className="block">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Meta semanal ({c.unidade}) — opcional</span>
            <input
              type="number" min="0" step="0.1" value={meta} onChange={e => setMeta(e.target.value)}
              placeholder="Deixe em branco para usar a média"
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
            />
          </label>
          <label className="block">
            <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">
              Rendimento por {c.unidadePlantio === "m²" ? "m²" : "muda"} ({c.unidade}) — opcional
            </span>
            <input
              type="number" min="0" step="0.01" value={rend} onChange={e => setRend(e.target.value)}
              placeholder={c.rendimentoOrigem === "historico" ? "O histórico tem prioridade" : "Ex: 0,3"}
              className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={salvando}
              onClick={() => onSalvar({ metaSemanal: parseFloat(meta.replace(",", ".")) || undefined, rendimento: parseFloat(rend.replace(",", ".")) || undefined })}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer disabled:opacity-50"
            >
              Salvar
            </button>
            <button
              disabled={salvando}
              onClick={() => onSalvar({ principal: !cfg.principal })}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg cursor-pointer disabled:opacity-50"
            >
              {cfg.principal ? "Desafixar dos principais" : "Fixar nos principais"}
            </button>
            <button
              disabled={salvando}
              onClick={() => onSalvar({ ignorar: true })}
              className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg cursor-pointer disabled:opacity-50"
            >
              Tirar do planejamento
            </button>
          </div>
        </div>
      ) : (
        <p className="text-slate-400 italic">Ajustes de meta e rendimento: perfil Editor ou Administrador.</p>
      )}
    </div>
  );
}

function Config({ config, salvando, onSalvar }: { config: ConfigPlanejamento; salvando: boolean; onSalvar: (c: ConfigPlanejamento) => void }) {
  const [margem, setMargem] = useState(String(Math.round(config.margem * 100)));
  const [semanas, setSemanas] = useState(String(config.semanasHistorico));
  const [bandeja, setBandeja] = useState(String(config.bandeja));
  return (
    <div className="bg-white p-5 rounded-2xl border border-slate-200 grid sm:grid-cols-4 gap-4 items-end text-xs">
      <label className="block">
        <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Margem de segurança (%)</span>
        <input type="number" min="0" max="100" value={margem} onChange={e => setMargem(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
      </label>
      <label className="block">
        <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Semanas de histórico na média</span>
        <input type="number" min="2" max="26" value={semanas} onChange={e => setSemanas(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
      </label>
      <label className="block">
        <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Mudas por bandeja (0 = sem bandeja)</span>
        <input type="number" min="0" step="1" value={bandeja} onChange={e => setBandeja(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
      </label>
      <button
        disabled={salvando}
        onClick={() => onSalvar({
          ...config,
          margem: Math.max(0, Math.min(1, (parseFloat(margem) || 0) / 100)),
          semanasHistorico: Math.max(2, Math.min(26, parseInt(semanas) || 8)),
          bandeja: Math.max(0, parseInt(bandeja) || 0)
        })}
        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg cursor-pointer disabled:opacity-50"
      >
        Salvar ajustes
      </button>
    </div>
  );
}

/**
 * "Já comprei": registra as mudas da lista da semana como compra antes de a
 * nota chegar. A compra fica "Aguardando nota" e já conta no planejamento
 * como plantio previsto para a semana escolhida.
 */
function RegistrarCompra({ semana, dataSemana, itens, bandeja, onFechar, onSalvo, onErro }: {
  semana: number;
  dataSemana: string;
  itens: PlanoCultura[];
  bandeja: number;
  onFechar: () => void;
  onSalvo: (msg: string) => void;
  onErro: (msg: string) => void;
}) {
  const [data, setData] = useState(hojeLocal());
  const [fornecedor, setFornecedor] = useState("Brazplant");
  const [pedido, setPedido] = useState("");
  const [plantio, setPlantio] = useState(dataSemana);
  const [qtd, setQtd] = useState<Record<string, string>>(
    Object.fromEntries(itens.map(c => [c.cultura, String(c.plantar[semana]?.quantidade || 0)]))
  );
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    const lista = itens.map(c => ({ cultura: c.cultura, quantidade: Math.round(Number(qtd[c.cultura]) || 0) })).filter(i => i.quantidade > 0);
    if (lista.length === 0) return onErro("Informe ao menos uma quantidade.");
    if (!fornecedor.trim()) return onErro("Informe o fornecedor.");
    try {
      setSalvando(true);
      const batch = writeBatch(db);
      const aammdd = data.replace(/-/g, "").substring(2);
      lista.forEach(item => {
        const id = `COMP-${aammdd}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
        const payload: Purchase = {
          id, docId: id, data,
          fornecedor: fornecedor.trim(),
          nf: "S/N",
          tipo: "Muda",
          cultura: item.cultura,
          quantidade: item.quantidade,
          saldo: item.quantidade,
          status: "Ativo",
          aguardandoNota: true,
          plantioPrevisto: plantio,
          ...(pedido.trim() ? { pedido: pedido.trim() } : {}),
          ...launchStamp()
        };
        batch.set(doc(db, "purchases", id), payload);
      });
      await batch.commit();
      onSalvo(`${lista.length} compra${lista.length > 1 ? "s" : ""} registrada${lista.length > 1 ? "s" : ""}, aguardando nota. Complete a nota na aba Compras quando chegar.`);
    } catch (err) {
      console.error(err);
      onErro("Não foi possível registrar a compra.");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onFechar}>
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-5 border-b border-slate-200 flex justify-between items-start">
          <div>
            <h3 className="font-bold text-slate-800 flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-indigo-600" /> Já comprei estas mudas</h3>
            <p className="text-xs text-slate-500 mt-1">A compra entra como <strong>aguardando nota</strong> e sai do planejamento. Quando a nota chegar, complete na aba Compras.</p>
          </div>
          <button onClick={onFechar} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <div className="p-5 space-y-4 text-xs">
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Data do pedido</span>
              <input type="date" value={data} onChange={e => setData(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </label>
            <label className="block">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Plantio previsto</span>
              <input type="date" value={plantio} onChange={e => setPlantio(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </label>
            <label className="block">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Fornecedor</span>
              <input value={fornecedor} onChange={e => setFornecedor(e.target.value)} className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg" />
            </label>
            <label className="block">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Nº do pedido (opcional)</span>
              <input value={pedido} onChange={e => setPedido(e.target.value)} placeholder="ex.: 22514" className="mt-1 w-full px-3 py-2 border border-slate-200 rounded-lg font-mono" />
            </label>
          </div>
          {itens.length === 0 ? (
            <p className="text-slate-500">Nenhuma muda sugerida para esta semana.</p>
          ) : (
            <div className="space-y-2">
              <span className="font-bold text-slate-500 uppercase tracking-wider text-[10px]">Mudas compradas</span>
              {itens.map(c => (
                <div key={c.cultura} className="flex items-center justify-between gap-3">
                  <span className="font-semibold text-slate-700">{c.cultura}</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number" min="0" step={bandeja > 0 ? bandeja : 1}
                      value={qtd[c.cultura] ?? ""}
                      onChange={e => setQtd(q => ({ ...q, [c.cultura]: e.target.value }))}
                      className="w-24 px-2 py-1.5 border border-slate-200 rounded-lg font-mono text-right"
                    />
                    <span className="text-slate-400 w-10">mudas</span>
                  </div>
                </div>
              ))}
              <p className="text-[10px] text-slate-400">Zere o que não foi comprado.</p>
            </div>
          )}
        </div>
        <div className="p-5 border-t border-slate-200 flex justify-end gap-2">
          <button onClick={onFechar} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl cursor-pointer">Cancelar</button>
          <button
            onClick={salvar} disabled={salvando || itens.length === 0}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer inline-flex items-center gap-1.5"
          >
            {salvando && <Loader2 className="w-4 h-4 animate-spin" />} Registrar compra
          </button>
        </div>
      </div>
    </div>
  );
}
