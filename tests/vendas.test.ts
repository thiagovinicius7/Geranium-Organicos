// Testes da análise de vendas (src/lib/vendas.ts).
// Para rodar: npx esbuild tests/vendas.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/vendas.cjs && node /tmp/vendas.cjs

import { chavePeriodo, rotuloPeriodo, agruparPorPeriodo, feirasRespondidas, destaques, RegistroFeira } from "../src/lib/vendas";
import { Sobra } from "../src/lib/sobra";
let ok = 0, fail = 0;
const eq = (n: string, a: any, b: any) => { const pass = JSON.stringify(a) === JSON.stringify(b); pass ? ok++ : fail++; console.log(pass ? "ok   " : "FALHOU", n, pass ? "" : `${JSON.stringify(a)} != ${JSON.stringify(b)}`); };

eq("semana começa na segunda (terça 24/11)", chavePeriodo("2026-11-24", "semana"), "2026-11-23");
eq("sábado 21/11 é da semana de 16/11", chavePeriodo("2026-11-21", "semana"), "2026-11-16");
eq("domingo fica na semana anterior", chavePeriodo("2026-11-29", "semana"), "2026-11-23");
eq("mês", chavePeriodo("2026-11-24", "mes"), "2026-11");
eq("rótulo semana", rotuloPeriodo("2026-11-23", "semana"), "Semana de 23/11 a 29/11");
eq("rótulo mês", rotuloPeriodo("2026-11", "mes"), "Novembro de 2026");

const L = (cultura: string, o: any) => ({ cultura, unidade: "KG", rotulo: "kg", destino: "fica", anterior: 0, colhido: 0, total: 0, sobrou: 0, perdeu: 0, vendido: 0, fica: 0, xepa: 0, ...o });
const regs: RegistroFeira[] = [
  { feira: "2026-11-18", linhas: [L("Inhame", { colhido: 8, vendido: 5.9, fica: 2.1 })] },
  { feira: "2026-11-21", linhas: [L("Inhame", { anterior: 2.1, colhido: 0, vendido: 0.1, fica: 2 })] },
  { feira: "2026-11-24", linhas: [L("Inhame", { anterior: 2, colhido: 6, vendido: 5.128, fica: 2.872 }),
                                  L("Couve", { unidade: "MÇ", rotulo: "maço", destino: "xepa", colhido: 20, vendido: 14, xepa: 6 })] },
];
const sem = agruparPorPeriodo(regs, "semana");
eq("duas semanas", sem.map(p => p.chave), ["2026-11-16", "2026-11-23"]);
const inh = sem[0].itens[0];
eq("semana 16/11: início, chegou, vendido, fim", [inh.inicio, inh.chegou, inh.vendido, inh.fim], [0, 8, 6, 2]);
eq("aproveitamento = vendido ÷ disponível", inh.aproveitamento, 0.75);
const mes = agruparPorPeriodo(regs, "mes");
eq("mês soma as três feiras", mes[0].itens.find(i => i.cultura === "Inhame")!.vendido, 11.128);
eq("mês: ficou no fim é o da última feira", mes[0].itens.find(i => i.cultura === "Inhame")!.fim, 2.872);
const d = destaques(sem[1], sem[0]);
eq("couve com 30% na xepa vira destaque", d.some(x => x.tipo === "xepa" && x.texto.includes("Couve 30%")), true);
eq("inhame: por feira subiu (6 em 2 feiras → 5,13 em 1)", d.some(x => x.tipo === "subiu" && x.texto.includes("Inhame +71%")), true);
const esg = destaques({ chave: "x", feiras: [], itens: [{ cultura: "Taioba", unidade: "MÇ", rotulo: "maço", feiras: 1, inicio: 0, chegou: 3, vendido: 3, xepa: 0, perdeu: 0, fim: 0, aproveitamento: 1 }] }, null);
eq("vendeu tudo", esg[0].tipo, "esgotou");

const it = { cultura: "Couve", unidade: "MÇ", rotulo: "maço", destino: "xepa" as const, anterior: 0, colhido: 10 };
const s1: Sobra = { id: "a", feira: "2026-11-17", status: "enviada", sessoes: ["A"], itens: [it], respostas: [{ sobrou: 1, perdeu: 0 }] };
const s2: Sobra = { id: "b", feira: "2026-11-18", status: "enviada", sessoes: ["A", "B"], itens: [it], respostas: [{ sobrou: 2, perdeu: 0 }] };
const s3: Sobra = { id: "c", feira: "2026-11-21", status: "aberta", sessoes: ["C"], itens: [it] };
eq("conta só respondidas e não substituídas", feirasRespondidas([s1, s2, s3]).map(r => r.feira), ["2026-11-18"]);

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
