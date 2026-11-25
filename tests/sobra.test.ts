// Testes do formulário de sobra da Bioloja (src/lib/sobra.ts).
// Para rodar: npx esbuild tests/sobra.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/sobra.cjs && node /tmp/sobra.cjs

import { proximaFeira, dataFeiraExtensa, lerNumero, totalNaLoja, vendido, agruparItens, SobraItem, resumoSobra, substitutaDe, destinoNaLoja, Sobra } from "../src/lib/sobra";
let ok = 0, fail = 0;
const eq = (n: string, a: any, b: any) => { const pass = JSON.stringify(a) === JSON.stringify(b); pass ? ok++ : fail++; console.log(pass ? "ok   " : "FALHOU", n, pass ? "" : `${JSON.stringify(a)} != ${JSON.stringify(b)}`); };

eq("quadro de terça é a feira de terça", proximaFeira("2026-11-24"), "2026-11-24");
eq("quadro de quinta vai para sexta", proximaFeira("2026-11-26"), "2026-11-27");
eq("quadro de domingo vai para terça", proximaFeira("2026-11-22"), "2026-11-24");
eq("quadro de segunda vai para terça", proximaFeira("2026-11-23"), "2026-11-24");
eq("data por extenso (terça)", dataFeiraExtensa("2026-11-24"), "Terça-feira, 24/11");
eq("data por extenso (sábado)", dataFeiraExtensa("2026-11-28"), "Sábado, 28/11");
eq("lê vírgula", lerNumero("2,5"), 2.5);
eq("lê ponto", lerNumero(" 3.25 "), 3.25);
eq("lê zero", lerNumero("0"), 0);
eq("recusa texto", lerNumero("dois"), null);
eq("recusa vazio", lerNumero(""), null);
eq("recusa negativo", lerNumero("-1"), null);
const banana: SobraItem = { cultura: "Banana Prata", unidade: "KG", rotulo: "kg", destino: "fica", anterior: 20, colhido: 10 };
eq("total = ficou + chegou", totalNaLoja(banana), 30);
eq("vendido = total − sobrou − perdeu", vendido(banana, { sobrou: 5, perdeu: 2 }), 23);
eq("decimais sem lixo", vendido({ ...banana, anterior: 0.1, colhido: 0.2 }, { sobrou: 0.1, perdeu: 0 }), 0.2);
const couve: SobraItem = { cultura: "Couve", unidade: "MÇ", rotulo: "maço", destino: "xepa", anterior: 0, colhido: 12 };
eq("xepa primeiro, depois o que fica", agruparItens([banana, couve]).map(g => g.indices), [[1], [0]]);
eq("grupo vazio some", agruparItens([banana]).length, 1);

// Aba Sobras: mesma conta do script.
const r = resumoSobra({ itens: [banana, couve], respostas: [{ sobrou: 2, perdeu: 1 }, { sobrou: 3, perdeu: 0 }] });
eq("resumo: vendido = total − sobrou − perdeu", r.linhas.map(l => l.vendido), [vendido(banana, { sobrou: 2, perdeu: 1 }), vendido(couve, { sobrou: 3, perdeu: 0 })]);
eq("resumo: sobra da banana fica", [r.linhas[0].fica, r.linhas[0].xepa], [2, 0]);
eq("resumo: sobra da couve vai para a xepa", [r.linhas[1].fica, r.linhas[1].xepa], [0, 3]);
eq("resumo: passou do total vira incoerência", resumoSobra({ itens: [couve], respostas: [{ sobrou: 999, perdeu: 0 }] }).incoerencias.length, 1);
const base = { status: "enviada" as const, itens: [], respostas: [] };
const s17: Sobra = { ...base, id: "a", feira: "2026-11-17", sessoes: ["COL-261117-X"] };
const s18: Sobra = { ...base, id: "b", feira: "2026-11-18", sessoes: ["COL-261117-X", "COL-261118-Y"] };
eq("sobra levada para a feira seguinte", substitutaDe(s17, [s17, s18])?.id, "b");
eq("a mais nova não é substituída", substitutaDe(s18, [s17, s18]), null);

// Rastreabilidade: sobra da feira na ficha do plantio.
const alf = { cultura: "Alface Americana", unidade: "UN", rotulo: "pés", destino: "xepa" as const, anterior: 0, colhido: 30 };
const f17: Sobra = { id: "a", feira: "2026-11-17", status: "enviada", sessoes: ["S17"], itens: [alf], respostas: [{ sobrou: 3, perdeu: 0 }] };
const f18: Sobra = { id: "b", feira: "2026-11-18", status: "enviada", sessoes: ["S17", "S18"], itens: [alf], respostas: [{ sobrou: 3, perdeu: 1 }] };
const minhas = [{ idSessao: "S17", cultura: "Alface Americana", qtd: 20 }, { idSessao: "S18", cultura: "Alface Americana", qtd: 10 }];
const dl = destinoNaLoja(minhas, [f17, f18]);
eq("rastreio: só a sobra ativa", dl.map(d => d.feira), ["2026-11-18"]);
eq("rastreio: sessões da feira", dl[0].sessoes, ["S17", "S18"]);
eq("rastreio: plantio único fica com a sobra toda", [dl[0].sobrou, dl[0].perdeu], [3, 1]);
eq("rastreio: dois plantios dividem na proporção", destinoNaLoja([{ idSessao: "S18", cultura: "Alface Americana", qtd: 10 }], [f18])[0].sobrou, 1);
eq("rastreio: aberta sem números", destinoNaLoja(minhas, [{ ...f18, status: "aberta", respostas: undefined }])[0].sobrou, null);
eq("rastreio: plantio fora da feira", destinoNaLoja([{ idSessao: "X", cultura: "Alface Americana", qtd: 1 }], [f18]).length, 0);

// Item colhido fora do previsto entra depois da resposta da loja: conta com sobra 0.
const rx = resumoSobra({ itens: [couve, banana], respostas: [{ sobrou: 2, perdeu: 0 }] });
eq("item sem resposta entra com sobra 0", [rx.linhas.length, rx.linhas[1].sobrou, rx.linhas[1].vendido], [2, 0, totalNaLoja(banana)]);

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
