/**
 * Planejamento de plantio semanal.
 *
 * Para cada cultura de ciclo (perenes ficam de fora):
 *  1. Saída semanal: média das colheitas recentes (as 2 últimas semanas pesam
 *     mais), ou a meta semanal informada na cultura.
 *  2. Rendimento: quanto cada muda (ou m²) rende na unidade de colheita.
 *     Histórico dos plantios finalizados > valor informado na cultura >
 *     1 por muda quando a colheita é em unidades.
 *  3. Oferta: o que os plantios abertos ainda vão produzir, espalhado pela
 *     janela de colheita de cada um (previsão até previsão + duração).
 *  4. Plantio da semana: o que falta para a primeira semana de colheita do
 *     plantio novo ficar coberta, considerando que se planta toda semana.
 *     Em regime, isso dá saída ÷ rendimento. Se já há muito no campo, diminui;
 *     se falta, aumenta (até 2× o normal). Mais a margem de segurança.
 *  5. Simula as próximas semanas supondo que as sugestões anteriores foram
 *     plantadas, para dar tempo de encomendar as mudas.
 *
 * Compras de muda com saldo e ainda sem plantio (pedido feito, muda a caminho
 * ou esperando o plantio) contam como plantio previsto: assim a sugestão não
 * se repete no intervalo entre o pedido e o lançamento do plantio. Quando o
 * plantio é lançado, o saldo da compra cai e quem conta é o plantio.
 */
import { Crop, Harvest, Planting, Purchase } from "../types";
import {
  buscarCultura, unidadeColheita, calcularHistorico, colheitasDoPlantio, formatarData,
  hojeLocal, somarDias, diasEntre, parseData, normalizarUnidade
} from "./producao";

export interface PlanejamentoCultura {
  /** Fixa a cultura entre as principais. */
  principal?: boolean;
  /** Tira a cultura do planejamento. */
  ignorar?: boolean;
  /** Saída semanal desejada, na unidade de colheita. Substitui a média. */
  metaSemanal?: number;
  /** Quanto rende 1 muda (ou 1 m² nas sementes), na unidade de colheita. */
  rendimento?: number;
}

export interface ConfigPlanejamento {
  /** Margem de segurança sobre o plantio sugerido (0.1 = 10%). */
  margem: number;
  /** Semanas de colheita usadas na média longa. */
  semanasHistorico: number;
  /** Quantas semanas de plantio sugerir (esta + próximas). */
  semanasPlantio: number;
  /** Mudas por bandeja: o pedido de mudas vem em bandejas inteiras (0 = sem bandeja). */
  bandeja: number;
}

export const CONFIG_PADRAO: ConfigPlanejamento = { margem: 0.1, semanasHistorico: 8, semanasPlantio: 8, bandeja: 200 };

export type OrigemRendimento = "historico" | "informado" | "referencia" | "unidade" | null;

/**
 * Rendimento de referência (bibliografia), usado só quando não há histórico
 * nem valor informado. Por muda (forma "Muda") ou por m² (forma "Semente"),
 * na unidade de colheita. Maços convertidos pelo peso do maço do Sítio
 * (informado em 04/11/2026): coentro 150–200 g; rúcula, rabanete e couve
 * 250–300 g; alho-poró 250–300 g.
 */
export const REFERENCIAS: Record<string, { valor: number; forma: "Muda" | "Semente"; unidade: string; fonte: string }> = {
  "coentro": { valor: 5, forma: "Semente", unidade: "MÇ", fonte: "Linhares et al. 2014 (Revista Verde): 1,0 a 1,2 kg/m²" },
  "rucula": { valor: 4, forma: "Semente", unidade: "MÇ", fonte: "Embrapa Agropecuária Oeste 2016: cerca de 1,1 kg/m²" },
  "rabanete": { valor: 5, forma: "Semente", unidade: "MÇ", fonte: "Rev. Bras. Agroecologia 2009: 1,3 a 1,6 kg/m², orgânico" },
  "cenoura": { valor: 2.5, forma: "Semente", unidade: "KG", fonte: "Embrapa/Hortic. Brasileira 2016: 2,2 a 5,4 kg/m², orgânico" },
  "couve": { valor: 6, forma: "Muda", unidade: "MÇ", fonte: "Noboa et al. 2019: cerca de 78 folhas por planta em 167 dias" },
  "alho-porro": { valor: 0.8, forma: "Muda", unidade: "MÇ", fonte: "Revista Ceres: cerca de 225 g por planta" },
  "couve-flor": { valor: 0.5, forma: "Muda", unidade: "KG", fonte: "Cadernos de Agroecologia: 0,38 a 0,74 kg por cabeça, orgânico" },
  "brocolis japones": { valor: 0.25, forma: "Muda", unidade: "KG", fonte: "Cadernos de Agroecologia 2018: 0,17 a 0,29 kg por cabeça, orgânico" },
  "repolho verde": { valor: 1.2, forma: "Muda", unidade: "KG", fonte: "Embrapa (Amapá 1986, Acre 2000): 0,6 a 1,3 kg por cabeça" },
  "repolho": { valor: 1.2, forma: "Muda", unidade: "KG", fonte: "Embrapa (Amapá 1986, Acre 2000): 0,6 a 1,3 kg por cabeça" },
  "cebola": { valor: 0.06, forma: "Muda", unidade: "KG", fonte: "Embrapa 2013: bulbos de 50 a 70 g, base ecológica" }
};

function chaveReferencia(nome: string): string {
  return (nome || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export interface SemanaCobertura {
  inicio: string;
  oferta: number;
  /** oferta ÷ saída (1 = coberto). */
  cobertura: number | null;
}

export interface PlanoCultura {
  cultura: string;
  unidade: string;
  /** "Muda" (quantidade em mudas) ou "Semente" (área em m²). */
  forma: "Muda" | "Semente";
  unidadePlantio: "mudas" | "m²";
  principal: boolean;
  fixada: boolean;
  semanasNaJanela: number;
  /** Saída usada no cálculo, por semana. */
  saidaSemanal: number;
  saidaOrigem: "meta" | "media";
  /** Média das 2 últimas semanas e das 2 anteriores, para a tendência. */
  recente: number;
  anterior: number | null;
  tendencia: number | null;
  diasComColheita: number;
  rendimento: number | null;
  rendimentoOrigem: OrigemRendimento;
  amostrasRendimento?: number;
  fonteRendimento?: string;
  /** Plantio sugerido por semana (índice 0 = esta semana). */
  plantar: { data: string; quantidade: number; base: number }[];
  /** Cobertura das próximas semanas só com o que já está no campo. */
  cobertura: SemanaCobertura[];
  /** Primeira semana com oferta abaixo de 70% da saída. */
  primeiraFalta: string | null;
  plantiosAbertos: number;
  /** Compras de muda com saldo, contadas como plantio previsto. */
  comprasPendentes: CompraPendente[];
  avisos: string[];
}

export interface CompraPendente {
  id: string;
  pedido?: string;
  data: string;
  saldo: number;
  /** Data em que a compra entra no cálculo como plantada. */
  plantio: string;
  aguardandoNota: boolean;
}

export interface ResultadoPlanejamento {
  hoje: string;
  inicioDados: string | null;
  semanasDeDados: number;
  culturas: PlanoCultura[];
}

const DIA = 1;
const SEMANAS_COBERTURA = 8;
/** Plantio fora da janela que ainda colhe: quantas semanas a mais, no máximo. */
const MAX_SEMANAS_ALEM = 4;
/** Compra sem plantio conta até 14 dias depois do plantio previsto; depois só avisa. */
const DIAS_COMPRA_PENDENTE = 14;
/** Sem plantio previsto informado, a compra é plantada 7 dias depois (retira na quinta, planta na semana seguinte). */
const DIAS_COMPRA_ATE_PLANTIO = 7;

function ehCompraDeMuda(c: Purchase): boolean {
  return !(c.tipo || "").toLowerCase().includes("semente");
}

/** Data prevista de plantio de uma compra (AAAA-MM-DD). */
export function plantioPrevistoDaCompra(c: Purchase): string {
  return c.plantioPrevisto || somarDias(c.data, DIAS_COMPRA_ATE_PLANTIO);
}

function arred(n: number, casas = 1): number {
  const f = Math.pow(10, casas);
  return Math.round(n * f) / f;
}

function chave(s: string): string {
  return (s || "").toLowerCase().trim();
}

/** Perene se o plantio mais recente da cultura é Perene. */
function ehPerene(plantios: Planting[]): boolean {
  if (plantios.length === 0) return false;
  const maisRecente = [...plantios].sort((a, b) => (b.data || "").localeCompare(a.data || ""))[0];
  return maisRecente.tipo === "Perene";
}

function formaDePlantio(plantios: Planting[]): "Muda" | "Semente" {
  const ciclo = plantios.filter(p => p.tipo !== "Perene").sort((a, b) => (b.data || "").localeCompare(a.data || ""));
  return ciclo[0]?.tipo === "Semente" || ciclo[0]?.unidade === "m²" ? "Semente" : "Muda";
}

/** Soma da colheita no intervalo [de, ate) de datas AAAA-MM-DD. */
function somaEntre(colheitas: Harvest[], de: string, ate: string): number {
  return colheitas
    .filter(h => h.data >= de && h.data < ate)
    .reduce((s, h) => s + (parseFloat(String(h.qtd)) || 0), 0);
}

/**
 * Espalha `total` uniformemente entre os dias [inicio, fim) e soma nas semanas
 * a partir de `hoje` (semana k = dias 7k..7k+6). Ignora o que cai antes de hoje.
 */
function espalhar(semanas: number[], hoje: string, inicio: string, fim: string, total: number) {
  const dias = Math.max(1, diasEntre(inicio, fim));
  const porDia = total / dias;
  for (let d = 0; d < dias; d++) {
    const offset = diasEntre(hoje, somarDias(inicio, d * DIA));
    if (offset < 0) continue;
    const k = Math.floor(offset / 7);
    if (k >= semanas.length) break;
    semanas[k] += porDia;
  }
}

export function calcularPlanejamento(
  crops: Crop[],
  plantings: Planting[],
  harvests: Harvest[],
  config: ConfigPlanejamento = CONFIG_PADRAO,
  hoje: string = hojeLocal(),
  compras: Purchase[] = []
): ResultadoPlanejamento {
  const datas = harvests.map(h => h.data).filter(Boolean).sort();
  const inicioDados = datas[0] || null;
  const diasDeDados = inicioDados ? Math.max(1, diasEntre(inicioDados, hoje) + 1) : 0;
  const semanasDeDados = arred(diasDeDados / 7, 1);

  // Janelas da média: recente (14 dias) e longa (semanasHistorico), limitadas aos dados.
  const diasLonga = Math.min(config.semanasHistorico * 7, diasDeDados);
  const diasRecente = Math.min(14, diasDeDados);
  const amanha = somarDias(hoje, 1);
  const historico = calcularHistorico(plantings, inicioDados);

  const porCultura = new Map<string, { nome: string; plantios: Planting[]; colheitas: Harvest[]; compras: Purchase[] }>();
  const reg = (nome: string) => {
    const k = chave(nome);
    if (!porCultura.has(k)) porCultura.set(k, { nome, plantios: [], colheitas: [], compras: [] });
    return porCultura.get(k)!;
  };
  crops.forEach(c => reg(c.nome));
  plantings.forEach(p => reg(p.cultura).plantios.push(p));
  harvests.forEach(h => reg(h.cultura).colheitas.push(h));
  compras
    .filter(c => c.data && c.cultura && ehCompraDeMuda(c) && (c.status === "Ativo" || !c.status) && (Number(c.saldo) || 0) > 0)
    .forEach(c => reg(c.cultura).compras.push(c));

  const culturas: PlanoCultura[] = [];
  const paraBandejas: ContextoBandeja[] = [];

  porCultura.forEach(({ nome, plantios, colheitas, compras: comprasDaCultura }) => {
    const crop = buscarCultura(crops, nome);
    const cfg: PlanejamentoCultura = crop?.planejamento || {};
    if (cfg.ignorar) return;
    if (ehPerene(plantios)) return;
    if (!crop || !(crop.dias > 0)) return;

    const unidade = unidadeColheita(crops, nome);
    const forma = formaDePlantio(plantios);
    const avisos: string[] = [];

    // ---- Saída semanal
    const recente = diasRecente > 0 ? somaEntre(colheitas, somarDias(amanha, -diasRecente), amanha) / (diasRecente / 7) : 0;
    const longa = diasLonga > 0 ? somaEntre(colheitas, somarDias(amanha, -diasLonga), amanha) / (diasLonga / 7) : 0;
    const temAnterior = diasDeDados >= 28;
    const anterior = temAnterior ? somaEntre(colheitas, somarDias(amanha, -28), somarDias(amanha, -14)) / 2 : null;
    const media = diasLonga > diasRecente ? 0.6 * recente + 0.4 * longa : recente;
    const meta = typeof cfg.metaSemanal === "number" && cfg.metaSemanal > 0 ? cfg.metaSemanal : null;
    const saidaSemanal = meta ?? media;
    const tendencia = anterior && anterior > 0 ? (recente - anterior) / anterior : null;
    const diasComColheita = new Set(
      colheitas.filter(h => h.data >= somarDias(amanha, -diasLonga) && h.data < amanha).map(h => h.data)
    ).size;

    // ---- Rendimento por muda / m²
    let rendimento: number | null = null;
    let rendimentoOrigem: OrigemRendimento = null;
    let amostrasRendimento: number | undefined;
    let fonteRendimento: string | undefined;
    const hist = historico.get(`${chave(nome)}|${forma === "Semente" ? "m2" : "un"}`);
    if (hist && hist.porUnidade > 0) {
      rendimento = hist.porUnidade; rendimentoOrigem = "historico"; amostrasRendimento = hist.amostras;
    } else if (typeof cfg.rendimento === "number" && cfg.rendimento > 0) {
      rendimento = cfg.rendimento; rendimentoOrigem = "informado";
    } else if (forma === "Muda" && normalizarUnidade(unidade) === "UN") {
      rendimento = 1; rendimentoOrigem = "unidade";
    } else {
      const ref = REFERENCIAS[chaveReferencia(nome)];
      if (ref && ref.forma === forma && normalizarUnidade(unidade) === ref.unidade) {
        rendimento = ref.valor; rendimentoOrigem = "referencia"; fonteRendimento = ref.fonte;
      }
    }

    // ---- Oferta dos plantios abertos
    const horizonte = SEMANAS_COBERTURA + config.semanasPlantio + Math.ceil(((crop.dias || 0) + (crop.duracao || 0)) / 7) + 2;
    const oferta = new Array(horizonte).fill(0);
    const abertos = plantios.filter(p => p.status !== "Finalizado" && p.tipo !== "Perene");

    // Compras de muda com saldo: entram como plantio previsto.
    const comprasPendentes: CompraPendente[] = [];
    const virtuais: Planting[] = [];
    for (const c of [...comprasDaCultura].sort((a, b) => a.data.localeCompare(b.data))) {
      const previsto = plantioPrevistoDaCompra(c);
      const saldo = Number(c.saldo) || 0;
      const ref = c.pedido ? `pedido ${c.pedido}` : c.id;
      if (diasEntre(previsto, hoje) > DIAS_COMPRA_PENDENTE) {
        avisos.push(`Compra ${ref} de ${formatarData(c.data).slice(0, 5)} ainda tem ${saldo} mudas sem plantio. Lance o plantio ou zere o saldo; até lá ela não conta no planejamento.`);
        continue;
      }
      // Alinha ao início da semana do plano (semana k = hoje + 7k), como as sugestões.
      const plantio = previsto > hoje ? somarDias(hoje, 7 * Math.floor(diasEntre(hoje, previsto) / 7)) : hoje;
      comprasPendentes.push({ id: c.id, pedido: c.pedido, data: c.data, saldo, plantio, aguardandoNota: !!c.aguardandoNota });
      virtuais.push({
        id: c.id, idLote: c.id, data: plantio, cultura: c.cultura, tipo: "Muda", talhao: "—",
        quantidade: saldo, previsao: somarDias(plantio, crop.dias), status: "No campo", totalColhido: 0, unidade: "Unidades"
      });
      if (diasEntre(previsto, hoje) > 3) {
        avisos.push(`Compra ${ref}: plantio previsto para ${formatarData(previsto).slice(0, 5)} ainda não foi lançado (${saldo} mudas).`);
      }
    }
    abertos.push(...virtuais);
    let semQuantidade = 0;
    let estoqueIncerto = false;
    for (const p of abertos) {
      const fimJanela = somarDias(p.previsao || somarDias(p.data, crop.dias), Math.max(7, crop.duracao || 0));
      const ultima = colheitasDoPlantio(harvests, p)[0]?.data;
      if (diasEntre(fimJanela, hoje) > 14 && (!ultima || diasEntre(ultima, hoje) > 14)) {
        avisos.push(`Plantio ${p.id} (talhão ${p.talhao}) passou da janela de colheita em ${formatarData(fimJanela)} e não tem colheita recente: encerrar?`);
        continue;
      }
      const colhido = colheitasDoPlantio(harvests, p).reduce((s, h) => s + (parseFloat(String(h.qtd)) || 0), 0);
      const quantidade = Number(p.quantidade) || 0;
      let esperado: number | null = null;
      if (typeof p.estimativaColheita === "number" && p.estimativaColheita > 0) esperado = p.estimativaColheita;
      else if (rendimento !== null && quantidade > 0) esperado = quantidade * rendimento - (rendimentoOrigem === "unidade" ? Number(p.perdas) || 0 : 0);
      if (esperado === null || esperado <= 0) {
        if (!(quantidade > 0)) semQuantidade++;
        continue;
      }
      let resto = Math.max(0, esperado - colhido);
      if (resto <= 0) continue;
      const previsao = p.previsao || somarDias(p.data, crop.dias);
      // Já colhendo (mesmo antes da previsão) conta desde hoje.
      const inicio = p.status === "Colhendo" || previsao <= hoje ? hoje : previsao;
      let fim = somarDias(previsao, Math.max(7, crop.duracao || 0));
      if (fim <= somarDias(hoje, 7)) {
        // Passou da janela e ainda colhe: segue no ritmo da saída, por no máximo 4 semanas.
        const ritmo = Math.max(saidaSemanal, 0.1);
        const semanas = Math.min(MAX_SEMANAS_ALEM, Math.max(1, resto / ritmo));
        if (resto > ritmo * MAX_SEMANAS_ALEM) {
          estoqueIncerto = true;
          avisos.push(`Plantio ${p.id} (talhão ${p.talhao}) passou da janela e, pela quantidade plantada, ainda teria muito a colher. Confira no campo quanto falta antes de plantar de novo; até lá, o app não sugere plantio.`);
        }
        resto = Math.min(resto, ritmo * semanas);
        fim = somarDias(hoje, Math.round(7 * semanas));
      }
      if (fim <= inicio) fim = somarDias(inicio, 7);
      espalhar(oferta, hoje, inicio, fim, resto);
    }

    // Sem rendimento não dá para medir a oferta: cobertura fica "sem dado", não "falta".
    // Estoque incerto (plantio grande fora da janela): também não dá para medir.
    const medivel = !estoqueIncerto && (rendimento !== null || abertos.some(p => (p.estimativaColheita || 0) > 0));
    const cobertura: SemanaCobertura[] = [];
    for (let k = 0; k < SEMANAS_COBERTURA; k++) {
      cobertura.push({
        inicio: somarDias(hoje, 7 * k),
        oferta: arred(oferta[k], 1),
        cobertura: medivel && saidaSemanal > 0 ? oferta[k] / saidaSemanal : null
      });
    }
    if (semQuantidade > 0 && medivel) {
      avisos.push(`${semQuantidade} plantio${semQuantidade > 1 ? "s" : ""} no campo sem quantidade: a oferta pode ser maior que a mostrada.`);
    }
    const falta = cobertura.find(s => s.cobertura !== null && s.cobertura < 0.7);
    const primeiraColheitaNova = somarDias(hoje, crop.dias);
    const faltasInevitaveis = cobertura.filter(s => s.cobertura !== null && s.cobertura < 0.7 && somarDias(s.inicio, 7) <= primeiraColheitaNova);
    if (faltasInevitaveis.length > 0) {
      const de = faltasInevitaveis[0].inicio;
      const ate = somarDias(faltasInevitaveis[faltasInevitaveis.length - 1].inicio, 6);
      avisos.push(`Vai faltar entre ${formatarData(de).slice(0, 5)} e ${formatarData(ate).slice(0, 5)}, e um plantio feito agora só colhe a partir de ${formatarData(primeiraColheitaNova).slice(0, 5)}. Segure as vendas ou compre de parceiro nesse período.`);
    }

    // ---- Plantio sugerido (simulação semana a semana)
    const semanasNaJanela = Math.max(1, (crop.duracao || 7) / 7);
    const plantar: PlanoCultura["plantar"] = [];
    const usaBandeja = forma === "Muda" && config.bandeja > 0;
    if (rendimento && rendimento > 0 && !estoqueIncerto && usaBandeja) {
      // Mudas em bandejas: decididas depois, juntas para todas as culturas (agendarBandejas).
      const comprado = new Array(config.semanasPlantio).fill(0);
      comprasPendentes.forEach(cp => {
        const k = Math.floor(diasEntre(hoje, cp.plantio) / 7);
        if (k >= 0 && k < comprado.length) comprado[k] += cp.saldo;
      });
      paraBandejas.push({
        plantar,
        comprado,
        simulada: [...oferta],
        dias: crop.dias,
        duracao: Math.max(7, crop.duracao || 0),
        semanasNaJanela,
        rendimento,
        saida: saidaSemanal
      });
    } else if (rendimento && rendimento > 0 && !estoqueIncerto) {
      const simulada = [...oferta];
      const base = saidaSemanal / rendimento;
      for (let i = 0; i < config.semanasPlantio; i++) {
        const dataPlantio = somarDias(hoje, 7 * i);
        const primeiraColheita = somarDias(dataPlantio, crop.dias);
        const t = Math.floor(diasEntre(hoje, primeiraColheita) / 7);
        const jaTem = t < simulada.length ? simulada[t] : 0;
        // Correção pelo que já há no campo, pela metade para não oscilar;
        // com sobra clara (30% acima da saída) não planta nesta semana.
        const corrigido = Math.max(0, Math.min(((saidaSemanal - jaTem) * semanasNaJanela) / rendimento, 2 * base));
        let q = jaTem >= 1.3 * saidaSemanal ? 0 : base + 0.5 * (corrigido - base);
        q = Math.max(0, Math.min(q, 2 * base));
        q = q * (1 + config.margem);
        const arredonda = forma === "Semente" ? 1 : 10;
        const quantidade = q > 0 ? Math.ceil(q / arredonda) * arredonda : 0;
        plantar.push({ data: dataPlantio, quantidade, base: arred(base * (1 + config.margem), 0) });
        if (quantidade > 0) {
          espalhar(simulada, hoje, primeiraColheita, somarDias(primeiraColheita, Math.max(7, crop.duracao || 0)), quantidade * rendimento);
        }
      }
    } else if (saidaSemanal > 0 && !estoqueIncerto) {
      avisos.push(
        forma === "Semente"
          ? `Informe quanto rende 1 m² (em ${unidade}) para calcular a área.`
          : `Informe quanto rende cada muda (em ${unidade}) para calcular a quantidade.`
      );
    }

    if (!meta && diasComColheita === 0 && abertos.length === 0 && avisos.length === 0) return; // sem movimento: fora da lista
    if (!meta && saidaSemanal === 0) avisos.push("Sem colheita nas últimas semanas.");
    if (rendimentoOrigem === "unidade") avisos.push("Rendimento de 1 pé por muda até haver plantio finalizado para medir a perda.");
    if (rendimentoOrigem === "referencia") avisos.push("Rendimento de referência da bibliografia: confira no campo; o histórico substitui quando houver plantio completo.");
    if (crop.duracao <= 0) avisos.push("Cultura sem duração de colheita: usei 1 semana.");

    culturas.push({
      cultura: crop.nome,
      unidade,
      forma,
      unidadePlantio: forma === "Semente" ? "m²" : "mudas",
      principal: false,
      fixada: !!cfg.principal,
      semanasNaJanela: arred(semanasNaJanela, 1),
      saidaSemanal: arred(saidaSemanal, 1),
      saidaOrigem: meta ? "meta" : "media",
      recente: arred(recente, 1),
      anterior: anterior === null ? null : arred(anterior, 1),
      tendencia,
      diasComColheita,
      rendimento: rendimento === null ? null : arred(rendimento, 2),
      rendimentoOrigem,
      amostrasRendimento,
      fonteRendimento,
      plantar,
      cobertura,
      primeiraFalta: falta ? falta.inicio : null,
      plantiosAbertos: abertos.length - virtuais.length,
      comprasPendentes,
      avisos
    });
  });

  agendarBandejas(paraBandejas, config, hoje);

  // Principais: fixadas + as de colheita mais frequente (até 12 no total).
  const ordem = [...culturas].sort((a, b) =>
    (Number(b.fixada) - Number(a.fixada)) || (b.diasComColheita - a.diasComColheita) || (b.saidaSemanal - a.saidaSemanal)
  );
  const limite = Math.max(12, ordem.filter(c => c.fixada).length);
  ordem.forEach((c, i) => {
    c.principal = c.fixada || (i < limite && c.diasComColheita > 0);
  });

  return { hoje, inicioDados, semanasDeDados, culturas: ordem };
}

interface ContextoBandeja {
  plantar: PlanoCultura["plantar"];
  /** Mudas já compradas para plantar em cada semana (já somadas na oferta). */
  comprado: number[];
  simulada: number[];
  dias: number;
  duracao: number;
  semanasNaJanela: number;
  rendimento: number;
  saida: number;
}

/**
 * Rodízio de bandejas para todas as culturas de muda, em cadência fixa.
 *
 * Cada cultura tem um intervalo entre bandejas: bandeja × rendimento ÷ (saída
 * com margem). Ex.: 200 mudas ÷ 56 pés/semana = uma bandeja a cada 3,6 semanas.
 * Como a margem deixa esse intervalo menor que a janela de colheita, uma
 * bandeja sempre começa antes de a anterior acabar.
 *  - Início: a primeira bandeja entra na semana em que o campo atual deixaria
 *    faltar meia bandeja ou mais nas duas primeiras semanas de colheita dela.
 *  - Depois: segue a cadência. Se a saída mudar, o cálculo da semana seguinte
 *    já usa o intervalo novo.
 *  - Semana abaixo da média de bandejas: adianta a cultura mais perto da vez
 *    (pelo menos 60% do intervalo). Adiantar é seguro; atrasar não acontece.
 */
function agendarBandejas(ctxs: ContextoBandeja[], config: ConfigPlanejamento, hoje: string) {
  const b = config.bandeja;
  const n = config.semanasPlantio;
  if (!(b > 0) || ctxs.length === 0) return;
  const m = 1 + config.margem;
  const base = (c: ContextoBandeja) => (c.saida * m) / c.rendimento;
  const porBandeja = (c: ContextoBandeja) => (b * c.rendimento) / c.semanasNaJanela;
  ctxs.forEach(c => {
    for (let i = 0; i < n; i++) c.plantar.push({ data: somarDias(hoje, 7 * i), quantidade: 0, base: arred(base(c), 0) });
  });
  // Bandejas por semana para equilibrar: a média arredondada. Com menos de 1,5
  // bandeja por semana em média não há o que equilibrar.
  const media = ctxs.reduce((s, c) => s + base(c), 0) / b;
  const alvo = media >= 1.5 ? Math.round(media) : 0;
  const faltaEmBandejas = (c: ContextoBandeja, i: number) => {
    if (!(c.saida > 0)) return 0;
    const t = Math.floor((7 * i + c.dias) / 7);
    const menor = Math.min(c.simulada.at(t) ?? 0, c.simulada.at(t + 1) ?? 0);
    return Math.max(0, c.saida * m - menor) / porBandeja(c);
  };
  const plantar = (c: ContextoBandeja, i: number, bandejas: number) => {
    const inicio = somarDias(hoje, 7 * i + c.dias);
    espalhar(c.simulada, hoje, inicio, somarDias(inicio, c.duracao), bandejas * b * c.rendimento);
    c.plantar[i].quantidade += bandejas * b;
  };
  // Fração do intervalo já cumprida desde a última bandeja (1 = é a vez).
  const passo = new Map(ctxs.map(c => [c, c.saida > 0 ? base(c) / b : 0] as [ContextoBandeja, number]));
  const vez = new Map<ContextoBandeja, number | null>(ctxs.map(c => [c, null]));
  for (let i = 0; i < n; i++) {
    let total = 0;
    for (const c of ctxs) {
      if ((c.comprado[i] || 0) > 0) {
        // A bandeja desta semana já foi comprada: conta no rodízio e reinicia a cadência.
        total += Math.max(1, Math.round(c.comprado[i] / b));
        vez.set(c, 0);
        continue;
      }
      const f = faltaEmBandejas(c, i);
      const v = vez.get(c);
      if (v === null || v === undefined) {
        if (f >= 0.5) { plantar(c, i, 1); total++; vez.set(c, 0); }
        continue;
      }
      const agora = v + (passo.get(c) || 0);
      if (agora >= 1 - 1e-9) {
        plantar(c, i, 1); total++; vez.set(c, agora - 1);
      } else {
        vez.set(c, agora);
      }
    }
    if (total < alvo) {
      const adiantaveis = ctxs
        .filter(c => c.plantar[i].quantidade === 0 && (vez.get(c) ?? -1) >= 0.6)
        .sort((x, y) => (vez.get(y) ?? 0) - (vez.get(x) ?? 0));
      for (const c of adiantaveis) {
        if (total >= alvo) break;
        plantar(c, i, 1); total++; vez.set(c, (vez.get(c) ?? 0) - 1);
      }
    }
  }
}

/** Texto do pedido de mudas / sementes, pronto para mandar no WhatsApp. */
export function textoPedido(res: ResultadoPlanejamento, semana: number, bandeja = 0): string {
  const itens = res.culturas.filter(c => c.principal && (c.plantar[semana]?.quantidade || 0) > 0);
  if (itens.length === 0) return "";
  const data = itens[0].plantar[semana].data;
  const d = parseData(data);
  const titulo = `Plantio da semana de ${d ? d.toLocaleDateString("pt-BR") : data}`;
  const linhas = itens.map(c => {
    const q = c.plantar[semana].quantidade;
    if (bandeja > 0 && c.forma === "Muda" && q % bandeja === 0) {
      const n = q / bandeja;
      return `• ${c.cultura}: ${n} bandeja${n > 1 ? "s" : ""} (${q} mudas)`;
    }
    return `• ${c.cultura}: ${q} ${c.unidadePlantio}`;
  });
  return [titulo, ...linhas].join("\n");
}
