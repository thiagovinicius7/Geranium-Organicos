// Análise de vendas da Bioloja a partir das sobras (sobras/{id}).
// Vendido = o que havia na loja − sobrou − perdeu, feira a feira; aqui só se
// soma por semana (segunda a domingo) ou por mês, item a item.

import { Sobra, LinhaResumo, resumoSobra, substitutaDe } from "./sobra";

export type Modo = "semana" | "mes";

export interface RegistroFeira {
  feira: string;
  linhas: LinhaResumo[];
}

export interface ItemPeriodo {
  cultura: string;
  unidade: string;
  rotulo: string;
  feiras: number;
  /** O que havia na loja no começo do período (ficou da feira anterior). */
  inicio: number;
  chegou: number;
  vendido: number;
  xepa: number;
  perdeu: number;
  /** O que ficou na loja no fim do período, para a feira seguinte. */
  fim: number;
  /** vendido ÷ (início + chegou); null quando não havia nada. */
  aproveitamento: number | null;
}

export interface Periodo {
  chave: string;
  feiras: string[];
  itens: ItemPeriodo[];
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

function dataLocal(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}
const isoDe = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Chave do período de uma feira: segunda-feira da semana ("2026-11-23") ou mês ("2026-11"). */
export function chavePeriodo(feira: string, modo: Modo): string {
  if (modo === "mes") return feira.slice(0, 7);
  const d = dataLocal(feira);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoDe(d);
}

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** "Semana de 23/11 a 29/11" ou "Novembro de 2026". */
export function rotuloPeriodo(chave: string, modo: Modo): string {
  if (modo === "mes") {
    const [a, m] = chave.split("-").map(Number);
    const nome = MESES[m - 1];
    return `${nome.charAt(0).toUpperCase()}${nome.slice(1)} de ${a}`;
  }
  const ini = dataLocal(chave);
  const fim = dataLocal(chave);
  fim.setDate(fim.getDate() + 6);
  const f = (d: Date) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
  return `Semana de ${f(ini)} a ${f(fim)}`;
}

/** Rótulo curto para o eixo do gráfico: "23/11" ou "nov/26". */
export function rotuloCurto(chave: string, modo: Modo): string {
  if (modo === "mes") {
    const [a, m] = chave.split("-").map(Number);
    return `${MESES[m - 1].slice(0, 3)}/${String(a).slice(2)}`;
  }
  return `${chave.slice(8, 10)}/${chave.slice(5, 7)}`;
}

/**
 * As feiras que contam: sobra enviada ou conferida, e não substituída por outra.
 * A conferida usa o resumo gravado (com o destino ajustado na conferência).
 */
export function feirasRespondidas(sobras: (Sobra & { resumo?: LinhaResumo[] })[]): RegistroFeira[] {
  return sobras
    .filter(s => (s.status === "enviada" || s.status === "conferida") && !s.previsto && !substitutaDe(s, sobras))
    .map(s => ({
      feira: s.feira,
      linhas: s.status === "conferida" && s.resumo?.length ? s.resumo : resumoSobra(s).linhas,
    }))
    .sort((a, b) => a.feira.localeCompare(b.feira));
}

/** Soma as feiras por período, item a item. Períodos em ordem cronológica. */
export function agruparPorPeriodo(registros: RegistroFeira[], modo: Modo): Periodo[] {
  const porChave = new Map<string, RegistroFeira[]>();
  for (const r of registros) {
    const k = chavePeriodo(r.feira, modo);
    if (!porChave.has(k)) porChave.set(k, []);
    porChave.get(k)!.push(r);
  }
  return Array.from(porChave.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([chave, feiras]) => {
      feiras.sort((a, b) => a.feira.localeCompare(b.feira));
      const itens = new Map<string, ItemPeriodo>();
      for (const f of feiras) {
        for (const l of f.linhas) {
          let it = itens.get(l.cultura);
          if (!it) {
            it = { cultura: l.cultura, unidade: l.unidade, rotulo: l.rotulo, feiras: 0, inicio: l.anterior || 0,
                   chegou: 0, vendido: 0, xepa: 0, perdeu: 0, fim: 0, aproveitamento: null };
            itens.set(l.cultura, it);
          }
          it.feiras++;
          it.chegou = r3(it.chegou + (l.colhido || 0));
          it.vendido = r3(it.vendido + (l.vendido || 0));
          it.xepa = r3(it.xepa + (l.xepa || 0));
          it.perdeu = r3(it.perdeu + (l.perdeu || 0));
          it.fim = l.fica || 0; // a última feira do período em que o item apareceu
        }
      }
      const lista = Array.from(itens.values()).map(it => {
        const disponivel = it.inicio + it.chegou;
        return { ...it, aproveitamento: disponivel > 0 ? Math.min(1, Math.max(0, it.vendido / disponivel)) : null };
      });
      return { chave, feiras: feiras.map(f => f.feira), itens: lista.sort((a, b) => a.cultura.localeCompare(b.cultura, "pt-BR")) };
    });
}

export interface Destaque {
  tipo: "esgotou" | "xepa" | "perda" | "subiu" | "caiu";
  texto: string;
}

/**
 * Variação da venda média por feira contra o período anterior. Por feira,
 * porque a semana em andamento tem menos feiras que a anterior.
 */
export function variacaoPorFeira(it: ItemPeriodo, anterior: Periodo | null): number | null {
  const a = anterior?.itens.find(x => x.cultura === it.cultura);
  if (!a || a.vendido <= 0 || !a.feiras || !it.feiras) return null;
  const antes = a.vendido / a.feiras, agora = it.vendido / it.feiras;
  return (agora - antes) / antes;
}

/** Leitura automática do período, em poucas linhas: esgotou, muita xepa, perdas e variação. */
export function destaques(atual: Periodo, anterior: Periodo | null): Destaque[] {
  const out: Destaque[] = [];
  const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const esgotou = atual.itens.filter(i => i.chegou > 0 && i.vendido > 0 && i.xepa === 0 && i.perdeu === 0 && i.fim === 0);
  if (esgotou.length) out.push({ tipo: "esgotou", texto: `Venderam tudo: ${esgotou.map(i => i.cultura).join(", ")}. Pode faltar produto — vale colher mais.` });
  const xepa = atual.itens
    .map(i => ({ i, p: i.inicio + i.chegou > 0 ? i.xepa / (i.inicio + i.chegou) : 0 }))
    .filter(x => x.p >= 0.3)
    .sort((a, b) => b.p - a.p);
  if (xepa.length) out.push({ tipo: "xepa", texto: `Muita xepa (30% ou mais do que chegou): ${xepa.map(x => `${x.i.cultura} ${pct(x.p)}`).join(", ")}. Colheita acima da venda.` });
  const perdas = atual.itens.filter(i => i.perdeu > 0);
  if (perdas.length) out.push({ tipo: "perda", texto: `Perdas na loja: ${perdas.map(i => `${i.cultura} ${f(i.perdeu)} ${i.rotulo}`).join(", ")}.` });
  if (anterior) {
    const vars = atual.itens.map(i => ({ i, v: variacaoPorFeira(i, anterior) })).filter(x => x.v !== null) as { i: ItemPeriodo; v: number }[];
    const subiu = vars.filter(x => x.v >= 0.25).sort((a, b) => b.v - a.v);
    const caiu = vars.filter(x => x.v <= -0.25).sort((a, b) => a.v - b.v);
    if (subiu.length) out.push({ tipo: "subiu", texto: `Venda subiu (média por feira): ${subiu.map(x => `${x.i.cultura} +${pct(x.v)}`).join(", ")}.` });
    if (caiu.length) out.push({ tipo: "caiu", texto: `Venda caiu (média por feira): ${caiu.map(x => `${x.i.cultura} −${pct(-x.v)}`).join(", ")}.` });
  }
  return out;
}
