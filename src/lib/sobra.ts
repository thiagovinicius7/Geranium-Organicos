// Sobra da Bioloja: tipos e contas usados pelo formulário da loja.
// O formulário (sobras/{id}) é criado a partir do quadro de colheita pelo
// script ferramentas/sobra/sobra.py, que segue as mesmas regras daqui.

export type Destino = "xepa" | "fica";

export interface SobraItem {
  cultura: string;
  unidade: string;      // unidade do app: KG, MÇ, UN, BJ
  rotulo: string;       // como a loja lê: kg, maço, pés, un, bandeja
  destino: Destino;     // folhas e alfaces: xepa; o resto fica para a próxima feira
  anterior: number;     // o que ficou da última sobra conferida
  colhido: number;      // o que chegou nos quadros desta feira
}

export interface SobraResposta {
  sobrou: number;
  perdeu: number;
}

/** Dias de feira da Bioloja: terça, quarta, sexta e sábado (getDay). */
export const DIAS_FEIRA = [2, 3, 5, 6];

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

function dataLocal(iso: string): Date {
  const [a, m, d] = iso.split("-").map(Number);
  return new Date(a, m - 1, d);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A feira de um quadro: o próprio dia, se for dia de feira, senão a próxima. */
export function proximaFeira(dataQuadro: string): string {
  const d = dataLocal(dataQuadro);
  while (!DIAS_FEIRA.includes(d.getDay())) d.setDate(d.getDate() + 1);
  return iso(d);
}

/** "terça-feira, 24/11" (sábado fica "sábado, 22/11"). */
export function dataFeiraExtensa(feira: string): string {
  const d = dataLocal(feira);
  const dia = DIAS[d.getDay()];
  const nome = d.getDay() === 0 || d.getDay() === 6 ? dia : `${dia}-feira`;
  return `${nome.charAt(0).toUpperCase()}${nome.slice(1)}, ${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Lê números digitados no celular: "3", "2,5" ou "2.5". Qualquer outra coisa é null. */
export function lerNumero(texto: string): number | null {
  const t = texto.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

export function totalNaLoja(it: SobraItem): number {
  return Math.round(((it.anterior || 0) + (it.colhido || 0)) * 1000) / 1000;
}

/** Vendido = o que havia na loja − sobrou − perdeu. */
export function vendido(it: SobraItem, r: SobraResposta): number {
  return Math.round((totalNaLoja(it) - r.sobrou - r.perdeu) * 1000) / 1000;
}

/** Grupos da tela, na ordem: o que vai para a xepa e o que fica. */
export function agruparItens(itens: SobraItem[]) {
  const xepa: number[] = [], fica: number[] = [];
  itens.forEach((it, i) => (it.destino === "xepa" ? xepa : fica).push(i));
  return [
    { titulo: "Folhas, ervas e alfaces", nota: "O que sobrar vai para a xepa.", indices: xepa },
    { titulo: "Frutas, legumes e raízes", nota: "O que sobrar fica para a próxima feira.", indices: fica },
  ].filter(g => g.indices.length > 0);
}

// ---------------------------------------------------------------- aba Sobras

export type StatusSobra = "aberta" | "enviada" | "conferida";

export interface Sobra {
  id: string;
  feira: string;
  status: StatusSobra;
  itens: SobraItem[];
  sessoes: string[];
  respostas?: SobraResposta[];
  quemContou?: string;
  obs?: string;
  enviadoEm?: Date | null;
  conferidoEm?: Date | null;
}

export interface LinhaResumo {
  cultura: string;
  unidade: string;
  rotulo: string;
  destino: Destino;
  anterior: number;
  colhido: number;
  total: number;
  sobrou: number;
  perdeu: number;
  vendido: number;
  fica: number;
  xepa: number;
}

const r3 = (x: number) => Math.round(x * 1000) / 1000;

/** Mesma conta do script (sobra.py resumo_de): o que a conferência grava. */
export function resumoSobra(s: Pick<Sobra, "itens" | "respostas">): { linhas: LinhaResumo[]; incoerencias: string[] } {
  const linhas: LinhaResumo[] = [];
  const incoerencias: string[] = [];
  const f = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
  (s.respostas || []).forEach((r, i) => {
    const it = s.itens[i];
    if (!it) return;
    const total = totalNaLoja(it);
    const sob = r3(r.sobrou || 0), per = r3(r.perdeu || 0);
    const vend = r3(total - sob - per);
    linhas.push({
      cultura: it.cultura, unidade: it.unidade, rotulo: it.rotulo, destino: it.destino,
      anterior: it.anterior || 0, colhido: it.colhido || 0, total,
      sobrou: sob, perdeu: per, vendido: vend,
      fica: it.destino === "fica" ? sob : 0, xepa: it.destino === "xepa" ? sob : 0,
    });
    if (vend < 0) incoerencias.push(`${it.cultura}: sobrou + perdeu (${f(r3(sob + per))}) passa do total (${f(total)}).`);
    else if (total > 0 && sob + per === 0 && !it.colhido) incoerencias.push(`${it.cultura}: tinha ${f(total)} da feira anterior e sobrou 0 — vendeu tudo?`);
  });
  return { linhas, incoerencias };
}

/** Sobra cujos quadros foram todos levados para uma sobra de feira posterior (sobra.py ativas). */
export function substitutaDe(s: Sobra, todas: Sobra[]): Sobra | null {
  if (!s.sessoes?.length) return null;
  return todas.find(o => o.id !== s.id && o.feira > s.feira && s.sessoes.every(x => (o.sessoes || []).includes(x))) || null;
}

// ---------------------------------------------------------------- rastreabilidade

export interface DestinoLoja {
  sobraId: string;
  feira: string;
  status: StatusSobra;
  /** Sessões de colheita deste plantio que foram para esta feira. */
  sessoes: string[];
  rotulo: string;
  destino: Destino;
  /** Colhido deste plantio que foi para esta feira. */
  doPlantio: number;
  /** Parte deste plantio na sobra e na perda da cultura naquela feira (null = loja ainda não contou). */
  sobrou: number | null;
  perdeu: number | null;
}

const semAcento = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

/** Arredonda a parte do plantio: kg com 2 casas, o resto (pés, maços, bandejas) inteiro. */
function arredondaParte(x: number, unidade: string): number {
  return unidade === "KG" ? Math.round(x * 100) / 100 : Math.round(x);
}

/**
 * A sobra de cada feira que recebeu colheitas de um plantio. A loja conta por
 * cultura; quando a feira teve mais de um plantio da cultura, a sobra e a
 * perda são divididas na proporção do que cada um mandou.
 */
export function destinoNaLoja(
  colheitas: { idSessao: string; cultura: string; qtd: number }[],
  sobras: (Sobra & { resumo?: LinhaResumo[] })[]
): DestinoLoja[] {
  const ativas = sobras.filter(s => !substitutaDe(s, sobras));
  const out: DestinoLoja[] = [];
  for (const s of ativas) {
    const minhas = colheitas.filter(h => (s.sessoes || []).includes(h.idSessao));
    if (!minhas.length) continue;
    const cultura = minhas[0].cultura;
    const i = s.itens.findIndex(it => semAcento(it.cultura) === semAcento(cultura));
    if (i < 0) continue;
    const it = s.itens[i];
    const doPlantio = r3(minhas.reduce((a, h) => a + (Number(h.qtd) || 0), 0));
    let sob: number | null = null, per: number | null = null;
    const conferida = s.status === "conferida" ? s.resumo?.find(l => semAcento(l.cultura) === semAcento(cultura)) : undefined;
    if (conferida) { sob = conferida.sobrou; per = conferida.perdeu; }
    else if (s.status !== "aberta" && s.respostas?.[i]) { sob = s.respostas[i].sobrou || 0; per = s.respostas[i].perdeu || 0; }
    const total = totalNaLoja(it);
    const parte = total > 0 ? Math.min(1, doPlantio / total) : 0;
    out.push({
      sobraId: s.id, feira: s.feira, status: s.status,
      sessoes: Array.from(new Set(minhas.map(h => h.idSessao))),
      rotulo: it.rotulo, destino: conferida?.destino || it.destino, doPlantio,
      sobrou: sob === null ? null : arredondaParte(sob * parte, it.unidade),
      perdeu: per === null ? null : arredondaParte(per * parte, it.unidade),
    });
  }
  return out.sort((a, b) => a.feira.localeCompare(b.feira));
}
