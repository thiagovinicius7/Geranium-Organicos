/**
 * Regras da produção num só lugar.
 *
 * A tela de Colheitas (computador), o App Celular, Plantios e Rastreabilidade
 * usam este arquivo para calcular status, separar talhões, medir o quanto
 * falta colher e gravar colheitas. Mudou uma regra? Mude aqui e as telas
 * acompanham juntas.
 */
import { doc, collection, writeBatch, increment, updateDoc, getDocs } from "firebase/firestore";
import { db } from "./firebase";
import { launchStamp } from "./permissions";
import { Crop, Harvest, Planting, Purchase } from "../types";

// ---------------------------------------------------------------------------
// Datas (sempre no fuso do aparelho, nunca em UTC)
// ---------------------------------------------------------------------------

/** Data de hoje no fuso local, no formato AAAA-MM-DD. */
export function hojeLocal(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Converte AAAA-MM-DD (ou DD/MM/AAAA) para um Date ao meio-dia local. */
export function parseData(str?: string | null): Date | null {
  if (!str) return null;
  const s = str.trim();
  let y: number, m: number, d: number;
  if (s.includes("/")) {
    const [dd, mm, yy] = s.split("/").map(n => parseInt(n, 10));
    y = yy < 100 ? yy + 2000 : yy; m = mm; d = dd;
  } else {
    const [yy, mm, dd] = s.slice(0, 10).split("-").map(n => parseInt(n, 10));
    y = yy; m = mm; d = dd;
  }
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0);
}

/** Soma dias a uma data AAAA-MM-DD. */
export function somarDias(str: string, dias: number): string {
  const base = parseData(str);
  if (!base) return "";
  base.setDate(base.getDate() + dias);
  return hojeLocal(base);
}

/** Dias de `de` até `ate` (positivo se `ate` for depois). */
export function diasEntre(de: string, ate: string): number {
  const a = parseData(de), b = parseData(ate);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** AAAA-MM-DD -> DD/MM/AAAA. */
export function formatarData(str?: string | null): string {
  const d = parseData(str);
  if (!d) return str || "";
  return d.toLocaleDateString("pt-BR");
}

// ---------------------------------------------------------------------------
// Culturas e unidades
// ---------------------------------------------------------------------------

export function buscarCultura(crops: Crop[], cultura: string): Crop | undefined {
  const alvo = (cultura || "").toLowerCase().trim();
  return crops.find(c => c.nome.toLowerCase().trim() === alvo);
}

/**
 * Grafia única das unidades: "kg", "Kg", "quilo" → "KG"; "un", "unid" → "UN";
 * "maço", "mc" → "MÇ". As outras ficam em maiúsculas. "m²" e "g" ficam como estão.
 */
export function normalizarUnidade(unidade?: string | null): string {
  const u = (unidade || "").trim();
  if (!u) return "";
  const k = u.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\.$/, "");
  if (["kg", "kgs", "quilo", "quilos", "quilograma", "quilogramas"].includes(k)) return "KG";
  if (["un", "und", "unid", "unidade", "unidades", "pe", "pes"].includes(k)) return "UN";
  if (["mc", "maco", "macos", "mç"].includes(k) || u.toUpperCase() === "MÇ") return "MÇ";
  if (["bj", "bandeja", "bandejas"].includes(k)) return "BJ";
  if (["cx", "caixa", "caixas"].includes(k)) return "CX";
  if (["pct", "pacote", "pacotes"].includes(k)) return "PCT";
  if (["dz", "duzia", "duzias"].includes(k)) return "DZ";
  if (k === "g" || k === "m2" || u === "m²") return u === "m2" ? "m²" : u;
  return u.toUpperCase();
}

export function unidadeColheita(crops: Crop[], cultura: string): string {
  return normalizarUnidade(buscarCultura(crops, cultura)?.unidadeColheita) || "KG";
}

/** Total colhido por unidade, ex.: [{unidade:"UN", qtd:217}, {unidade:"KG", qtd:69}]. */
export function totaisPorUnidade(harvests: Harvest[], crops: Crop[]): { unidade: string; qtd: number }[] {
  const t = new Map<string, number>();
  for (const h of harvests) {
    const u = normalizarUnidade(h.unidade) || unidadeColheita(crops, h.cultura);
    t.set(u, (t.get(u) || 0) + (parseFloat(String(h.qtd)) || 0));
  }
  return Array.from(t, ([unidade, qtd]) => ({ unidade, qtd })).sort((a, b) => b.qtd - a.qtd);
}

let unidadesPadronizadas = false;

/**
 * Uma vez por sessão (Admin/Editor): grava a grafia padrão nas culturas e
 * colheitas que ainda usam outra (ex.: "kg" → "KG"). Só toca no que mudou.
 */
export async function padronizarUnidades(): Promise<number> {
  if (unidadesPadronizadas) return 0;
  unidadesPadronizadas = true;
  const [cropsSnap, harvestsSnap] = await Promise.all([
    getDocs(collection(db, "crops")),
    getDocs(collection(db, "harvests"))
  ]);
  const mudar: { col: string; id: string; campo: string; valor: string }[] = [];
  cropsSnap.docs.forEach(d => {
    const atual = d.data().unidadeColheita;
    const nova = normalizarUnidade(atual);
    if (atual && nova && atual !== nova) mudar.push({ col: "crops", id: d.id, campo: "unidadeColheita", valor: nova });
  });
  harvestsSnap.docs.forEach(d => {
    const atual = d.data().unidade;
    const nova = normalizarUnidade(atual);
    if (atual && nova && atual !== nova) mudar.push({ col: "harvests", id: d.id, campo: "unidade", valor: nova });
  });
  for (let i = 0; i < mudar.length; i += 400) {
    const batch = writeBatch(db);
    mudar.slice(i, i + 400).forEach(m => batch.update(doc(db, m.col, m.id), { [m.campo]: m.valor }));
    await batch.commit();
  }
  return mudar.length;
}

function ehUnidade(unidade: string): boolean {
  return ["un", "und", "unid", "unidade", "unidades"].includes((unidade || "").toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// Status do plantio
// ---------------------------------------------------------------------------

/** Dias depois da previsão para o plantio virar "Colheita atrasada". */
export const DIAS_PARA_ATRASO = 15;

export type StatusCalculado =
  | "No campo"
  | "Pronto para colher"
  | "Colheita atrasada"
  | "Colhendo"
  | "Finalizado";

export function statusCalculado(p: Planting, hoje: string = hojeLocal()): StatusCalculado {
  if (p.status === "Finalizado") return "Finalizado";
  if (p.status === "Colhendo") return "Colhendo";
  if (!p.previsao) return "No campo";
  const atraso = diasEntre(p.previsao, hoje);
  if (atraso >= DIAS_PARA_ATRASO) return "Colheita atrasada";
  if (atraso >= 0) return "Pronto para colher";
  return "No campo";
}

export const STATUS_INFO: Record<StatusCalculado, { label: string; color: string }> = {
  "Colhendo": { label: "🍓 Em colheita", color: "text-emerald-700 bg-emerald-100/60 border-emerald-100" },
  "Colheita atrasada": { label: "⚠️ Colheita atrasada", color: "text-rose-700 bg-rose-100/60 border-rose-100" },
  "Pronto para colher": { label: "✅ Pronto para colher", color: "text-amber-700 bg-amber-100/60 border-amber-100" },
  "No campo": { label: "🌱 No campo", color: "text-indigo-700 bg-indigo-100/60 border-indigo-100" },
  "Finalizado": { label: "🏁 Finalizado", color: "text-slate-600 bg-slate-100 border-slate-200" }
};

/** Talhão numérico (ex.: "12") ou Sítio (nome ou marcado como Sítio). */
export function grupoTalhao(p: Planting): "numerico" | "sitio" {
  if (p.displayInSitio) return "sitio";
  const t = (p.talhao || "").trim();
  return t !== "" && !isNaN(Number(t)) ? "numerico" : "sitio";
}

/**
 * Grupos do menu de colheita, na ordem de exibição:
 *  0 Em colheita — talhões numéricos
 *  1 Em colheita — Sítio
 *  2 Colheita atrasada (bloco minimizado)
 *  3 Pronto para colher (só ao pedir)
 *  4 No campo (só ao pedir)
 */
export function grupoColheita(p: Planting, hoje: string = hojeLocal()): number {
  const s = statusCalculado(p, hoje);
  if (s === "Colheita atrasada") return 2;
  if (s === "Pronto para colher") return 3;
  if (s === "No campo") return 4;
  return grupoTalhao(p) === "numerico" ? 0 : 1;
}

export const GRUPOS_COLHEITA = [
  { id: 0, label: "🔢 Talhões numéricos — em colheita", color: "text-emerald-700 bg-emerald-100/60 border-emerald-100", minimizado: false, sobDemanda: false },
  { id: 1, label: "🌿 Sítio — em colheita", color: "text-teal-700 bg-teal-100/60 border-teal-100", minimizado: false, sobDemanda: false },
  { id: 2, label: "⚠️ Colheita atrasada", color: "text-rose-700 bg-rose-100/60 border-rose-100", minimizado: true, sobDemanda: false },
  { id: 3, label: "✅ Pronto para colher", color: "text-amber-700 bg-amber-100/60 border-amber-100", minimizado: false, sobDemanda: true },
  { id: 4, label: "🌱 No campo — em desenvolvimento", color: "text-sky-700 bg-sky-100/60 border-sky-100", minimizado: false, sobDemanda: true }
];

// ---------------------------------------------------------------------------
// Prazo da colheita (usa a "duração da colheita" da cultura)
// ---------------------------------------------------------------------------

/** Data prevista para terminar a colheita: previsão + duração da cultura. */
export function fimPrevistoColheita(p: Planting, crops: Crop[]): string {
  const duracao = buscarCultura(crops, p.cultura)?.duracao || 0;
  if (!p.previsao || !duracao) return "";
  return somarDias(p.previsao, duracao);
}

export function alemDoPrazo(p: Planting, crops: Crop[], hoje: string = hojeLocal()): boolean {
  const fim = fimPrevistoColheita(p, crops);
  return !!fim && p.status !== "Finalizado" && diasEntre(fim, hoje) > 0;
}

// ---------------------------------------------------------------------------
// Quanto já foi colhido e quanto falta
// ---------------------------------------------------------------------------

export interface Expectativa {
  unidade: string;
  colhido: number;
  /** Total esperado, ou null quando não há como estimar. */
  esperado: number | null;
  falta: number | null;
  percentual: number | null;
  /** Mudas/unidades colhidas por unidade: não deixa passar do plantado. */
  bloqueia: boolean;
  /** De onde veio o esperado. */
  origem: "plantado" | "informada" | "historico" | null;
  /** Quantos plantios finalizados formam a média, quando origem = historico. */
  amostras?: number;
}

export interface Rendimento {
  /** Colhido por muda (ou por m², nas sementes). */
  porUnidade: number;
  amostras: number;
}

/** Rendimentos médios, por cultura e forma de plantio. */
export type HistoricoRendimento = Map<string, Rendimento>;

function chaveRendimento(cultura: string, unidadePlantio: string): string {
  return `${(cultura || "").toLowerCase().trim()}|${unidadePlantio === "m²" ? "m2" : "un"}`;
}

/**
 * Média do que cada cultura rendeu nos plantios já finalizados:
 * total colhido ÷ quantidade plantada (mudas ou m²), ponderada pelo tamanho.
 */
export function calcularHistorico(plantings: Planting[]): HistoricoRendimento {
  const soma = new Map<string, { colhido: number; plantado: number; n: number }>();
  for (const p of plantings) {
    const colhido = Number(p.totalColhido) || 0;
    const plantado = Number(p.quantidade) || 0;
    if (p.status !== "Finalizado" || colhido <= 0 || plantado <= 0) continue;
    const k = chaveRendimento(p.cultura, p.unidade);
    const acc = soma.get(k) || { colhido: 0, plantado: 0, n: 0 };
    acc.colhido += colhido; acc.plantado += plantado; acc.n += 1;
    soma.set(k, acc);
  }
  const out: HistoricoRendimento = new Map();
  soma.forEach((v, k) => out.set(k, { porUnidade: v.colhido / v.plantado, amostras: v.n }));
  return out;
}

export function expectativa(p: Planting, crops: Crop[], historico?: HistoricoRendimento): Expectativa {
  const unidade = unidadeColheita(crops, p.cultura);
  const colhido = Math.max(0, Number(p.totalColhido) || 0);
  const contavel = ehUnidade(unidade) && p.unidade === "Unidades";
  let esperado: number | null = null;
  let origem: Expectativa["origem"] = null;
  let amostras: number | undefined;
  if (contavel) {
    esperado = Math.max(0, (Number(p.quantidade) || 0) - (Number(p.perdas) || 0));
    origem = "plantado";
  } else if (typeof p.estimativaColheita === "number" && p.estimativaColheita > 0) {
    esperado = p.estimativaColheita;
    origem = "informada";
  } else if (historico) {
    const r = historico.get(chaveRendimento(p.cultura, p.unidade));
    const plantado = Number(p.quantidade) || 0;
    if (r && plantado > 0) {
      esperado = Math.round(r.porUnidade * plantado * 10) / 10;
      origem = "historico";
      amostras = r.amostras;
    }
  }
  const falta = esperado === null ? null : Math.max(0, esperado - colhido);
  const percentual = esperado ? Math.min(100, Math.round((colhido / esperado) * 100)) : null;
  return { unidade, colhido, esperado, falta, percentual, bloqueia: contavel, origem, amostras };
}

export type ResultadoLimite =
  | { tipo: "ok" }
  | { tipo: "bloqueado"; mensagem: string }
  | { tipo: "aviso"; mensagem: string };

/**
 * Confere se lançar `acrescimo` passa do esperado. Para mudas/unidades bloqueia;
 * para kg, maço e outras unidades só avisa.
 */
export function verificarLimite(
  p: Planting,
  crops: Crop[],
  acrescimo: number,
  historico?: HistoricoRendimento
): ResultadoLimite {
  const e = expectativa(p, crops, historico);
  if (e.esperado === null || acrescimo <= 0) return { tipo: "ok" };
  const novoTotal = e.colhido + acrescimo;
  if (novoTotal <= e.esperado + 1e-9) return { tipo: "ok" };
  const fmt = (n: number) => Number(n.toFixed(2)).toLocaleString("pt-BR");
  if (e.bloqueia) {
    return {
      tipo: "bloqueado",
      mensagem: `${p.cultura} (talhão ${p.talhao}): faltam só ${fmt(e.falta || 0)} ${e.unidade} para colher, de ${fmt(e.esperado)} plantados.`
    };
  }
  return {
    tipo: "aviso",
    mensagem: `${p.cultura} (talhão ${p.talhao}) passa da estimativa${e.origem === "historico" ? " pelo histórico" : ""}: ${fmt(novoTotal)} de ${fmt(e.esperado)} ${e.unidade}.`
  };
}

// ---------------------------------------------------------------------------
// Ligações entre compra, plantio e colheita
// ---------------------------------------------------------------------------

export function docIdPlantio(p: Planting): string {
  return p.docId || p.id;
}

/** Colheitas de um plantio, gravadas pelo ID do plantio ou pelo ID do documento. */
export function colheitasDoPlantio(harvests: Harvest[], p: Planting): Harvest[] {
  const ids = new Set([p.id, p.docId].filter(Boolean) as string[]);
  return harvests
    .filter(h => ids.has(h.idPlantio))
    .sort((a, b) => (b.data || "").localeCompare(a.data || ""));
}

export function encontrarPlantio(plantings: Planting[], idPlantio: string): Planting | undefined {
  return plantings.find(p => p.id === idPlantio || p.docId === idPlantio);
}

/** Compra de origem do plantio, só se estiver vinculada. Nunca adivinha. */
export function compraDoPlantio(purchases: Purchase[], p: Planting): Purchase | null {
  const lote = (p.idLote || "").trim().toUpperCase();
  if (!lote) return null;
  return purchases.find(c =>
    (c.id || "").trim().toUpperCase() === lote || (c.docId || "").trim().toUpperCase() === lote
  ) || null;
}

/** Plantios que saíram de uma compra. */
export function plantiosDaCompra(plantings: Planting[], c: Purchase): Planting[] {
  const ids = new Set([c.id, c.docId].filter(Boolean).map(s => (s as string).trim().toUpperCase()));
  return plantings.filter(p => ids.has((p.idLote || "").trim().toUpperCase()));
}

// ---------------------------------------------------------------------------
// Gravação de colheitas (mesmo código no computador e no celular)
// ---------------------------------------------------------------------------

export function novoIdSessao(data: string = hojeLocal()): string {
  const aammdd = data.replace(/-/g, "").substring(2);
  const sufixo = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `COL-${aammdd}-${sufixo}`;
}

export interface ItemColheita {
  plantio: Planting;
  qtd: number;
}

/**
 * Grava novas colheitas de uma sessão. O total do plantio é somado no
 * servidor (increment), então dois lançamentos ao mesmo tempo não se perdem.
 */
export async function lancarColheitas(
  itens: ItemColheita[],
  crops: Crop[],
  idSessao: string,
  data: string
): Promise<number> {
  const batch = writeBatch(db);
  let n = 0;
  for (const { plantio, qtd } of itens) {
    if (!(qtd > 0)) continue;
    const payload: Harvest = {
      idSessao,
      idPlantio: plantio.id,
      data,
      cultura: plantio.cultura,
      talhao: plantio.talhao,
      qtd,
      unidade: unidadeColheita(crops, plantio.cultura),
      ...(plantio.idLote ? { idLote: plantio.idLote } : {}),
      ...launchStamp()
    };
    batch.set(doc(collection(db, "harvests")), payload);
    batch.update(doc(db, "plantings", docIdPlantio(plantio)), {
      totalColhido: increment(qtd),
      status: "Colhendo"
    });
    n++;
  }
  if (n > 0) await batch.commit();
  return n;
}

/** Muda a quantidade de um lançamento e acerta o total do plantio. */
export async function ajustarColheita(log: Harvest, novaQtd: number, plantings: Planting[]): Promise<void> {
  if (!log.id) return;
  const diff = novaQtd - (Number(log.qtd) || 0);
  const batch = writeBatch(db);
  batch.update(doc(db, "harvests", log.id), { qtd: novaQtd });
  const plantio = encontrarPlantio(plantings, log.idPlantio);
  if (plantio && diff !== 0) {
    batch.update(doc(db, "plantings", docIdPlantio(plantio)), { totalColhido: increment(diff) });
  }
  await batch.commit();
}

/** Apaga lançamentos (um ou uma sessão inteira) e acerta os totais. */
export async function excluirColheitas(logs: Harvest[], plantings: Planting[]): Promise<void> {
  const batch = writeBatch(db);
  const porPlantio = new Map<string, number>();
  for (const log of logs) {
    if (!log.id) continue;
    batch.delete(doc(db, "harvests", log.id));
    const plantio = encontrarPlantio(plantings, log.idPlantio);
    if (plantio) {
      const id = docIdPlantio(plantio);
      porPlantio.set(id, (porPlantio.get(id) || 0) + (Number(log.qtd) || 0));
    }
  }
  porPlantio.forEach((qtd, id) => {
    if (qtd) batch.update(doc(db, "plantings", id), { totalColhido: increment(-qtd) });
  });
  await batch.commit();
}

export async function iniciarColheita(p: Planting): Promise<void> {
  await updateDoc(doc(db, "plantings", docIdPlantio(p)), { status: "Colhendo" });
}

/**
 * Mudar ID: encerra a colheita do plantio atual (vai para Finalizados, com
 * as colheitas no histórico dele) e, se escolhido, coloca o próximo em colheita.
 * Mantém as perdas e a observação que o plantio já tinha.
 */
export async function mudarIdColheita(
  atual: Planting,
  proximo: Planting | null,
  data: string = hojeLocal()
): Promise<void> {
  const batch = writeBatch(db);
  const nota = proximo
    ? `Colheita encerrada em ${formatarData(data)} pela troca para o plantio ${proximo.id}.`
    : `Colheita encerrada em ${formatarData(data)}.`;
  const obs = [atual.obs?.trim(), nota].filter(Boolean).join(" ");
  batch.update(doc(db, "plantings", docIdPlantio(atual)), {
    status: "Finalizado",
    dataFim: data,
    obs
  });
  if (proximo) {
    batch.update(doc(db, "plantings", docIdPlantio(proximo)), { status: "Colhendo" });
  }
  await batch.commit();
}
