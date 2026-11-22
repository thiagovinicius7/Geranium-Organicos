// Testes do formulário de sobra da Bioloja (src/lib/sobra.ts).
// Para rodar: npx esbuild tests/sobra.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/sobra.cjs && node /tmp/sobra.cjs

import { proximaFeira, dataFeiraExtensa, lerNumero, totalNaLoja, vendido, agruparItens, SobraItem } from "../src/lib/sobra";
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

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
