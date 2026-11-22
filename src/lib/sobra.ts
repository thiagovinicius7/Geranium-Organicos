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
