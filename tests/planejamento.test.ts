// Testes do planejamento de plantio.
// Para rodar: npx esbuild tests/planejamento.test.ts --bundle --platform=node --format=cjs --outfile=/tmp/plan.cjs && node /tmp/plan.cjs
import { calcularPlanejamento, CONFIG_PADRAO as PADRAO } from "../src/lib/planejamento";
// A maioria dos testes mede o cálculo contínuo; a bandeja tem testes próprios no fim.
const CONFIG_PADRAO = { ...PADRAO, bandeja: 0 };
import { somarDias } from "../src/lib/producao";

let ok = 0, fail = 0;
const t = (n: string, cond: boolean, info: any = "") => { cond ? ok++ : fail++; console.log(cond ? "ok   " : "FALHOU", n, cond ? "" : JSON.stringify(info)); };

const hoje = "2026-11-04";
const crops: any[] = [
  { nome: "Alface Crespa verde", unidadeColheita: "UN", dias: 35, duracao: 28 },
  { nome: "Rúcula", unidadeColheita: "MÇ", dias: 35, duracao: 14 },
  { nome: "Banana", unidadeColheita: "KG", dias: 0, duracao: 0 },
  { nome: "Couve", unidadeColheita: "MÇ", dias: 60, duracao: 120, planejamento: { rendimento: 3 } }
];
// 4 semanas de colheita: alface 100 pés/semana (20 por dia útil)
const harvests: any[] = [];
for (let d = 1; d <= 28; d++) {
  const data = somarDias(hoje, -d);
  const dow = new Date(data + "T12:00:00").getDay();
  if (dow === 0 || dow === 6) continue;
  harvests.push({ cultura: "Alface Crespa verde", data, qtd: 20, idPlantio: "x" });
  harvests.push({ cultura: "Banana", data, qtd: 5, idPlantio: "b" });
  harvests.push({ cultura: "Couve", data, qtd: 6, idPlantio: "c" });
}
const perene: any = { id: "b", cultura: "Banana", tipo: "Perene", status: "Colhendo", data: "2026-10-21", quantidade: 0, unidade: "Unidades" };

// 1) Sem nada no campo: planta acima do normal (até 2x), com margem.
let r = calcularPlanejamento(crops, [perene], harvests, CONFIG_PADRAO, hoje);
const alface = r.culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("saída semanal da alface entre 90 e 100 (hoje ainda sem colheita)", alface.saidaSemanal >= 90 && alface.saidaSemanal <= 100, alface.saidaSemanal);
t("perene fica de fora", !r.culturas.some(c => c.cultura === "Banana"));
t("campo vazio: planta acima do normal (1,5x)", alface.plantar[0].quantidade >= 1.4 * alface.plantar[0].base, alface.plantar[0]);
t("campo vazio: avisa da falta que o plantio novo não alcança", alface.avisos.some(a => a.startsWith("Vai faltar")), alface.avisos);
t("aponta falta já na 1ª semana", alface.primeiraFalta === hoje, alface.primeiraFalta);
t("simulação: semanas seguintes diminuem", alface.plantar[3].quantidade < alface.plantar[0].quantidade, alface.plantar.map(p => p.quantidade));

// 2) Regime: um plantio por semana nas últimas semanas, 100 mudas cada.
const regime: any[] = [perene];
for (let i = 1; i <= 10; i++) {
  const data = somarDias(hoje, -7 * i);
  regime.push({ id: `P${i}`, cultura: "Alface Crespa verde", tipo: "Muda", status: "No campo", data, previsao: somarDias(data, 35), quantidade: 100, unidade: "Unidades", totalColhido: 0 });
}
r = calcularPlanejamento(crops, regime, harvests, CONFIG_PADRAO, hoje);
const a2 = r.culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("100 mudas/semana para saída de ~93: fica perto do normal, sem oscilar", a2.plantar.every(p => p.quantidade >= 70 && p.quantidade <= 130), a2.plantar);

// 3) Campo cheio demais: não planta.
const cheio: any[] = [perene, ...regime.slice(1).map(p => ({ ...p, quantidade: 400 }))];
r = calcularPlanejamento(crops, cheio, harvests, CONFIG_PADRAO, hoje);
t("campo cheio: não sugere plantio", (r.culturas.find(c => c.cultura === "Alface Crespa verde")!.plantar.at(0)?.quantidade ?? 0) === 0);

// 4) Saída maior → planta mais.
const mais = harvests.map(h => h.cultura === "Alface Crespa verde" ? { ...h, qtd: 40 } : h);
r = calcularPlanejamento(crops, regime, mais, CONFIG_PADRAO, hoje);
t("saída dobra → plantio sobe", r.culturas.find(c => c.cultura === "Alface Crespa verde")!.plantar[0].quantidade > a2.plantar[0].quantidade);

// 5) Rendimento informado (couve 3 MÇ por muda) e meta manual.
r = calcularPlanejamento(crops, [perene], harvests, CONFIG_PADRAO, hoje);
const couve = r.culturas.find(c => c.cultura === "Couve")!;
t("couve usa rendimento informado", couve.rendimentoOrigem === "informado" && couve.rendimento === 3, couve);
const comMeta = crops.map(c => c.nome === "Couve" ? { ...c, planejamento: { rendimento: 3, metaSemanal: 60 } } : c);
r = calcularPlanejamento(comMeta, [perene], harvests, CONFIG_PADRAO, hoje);
t("meta semanal substitui a média", r.culturas.find(c => c.cultura === "Couve")!.saidaSemanal === 60);

// 6) Sem rendimento para MÇ: pede o dado em vez de inventar.
const rucH = [...harvests, { cultura: "Rúcula", data: somarDias(hoje, -2), qtd: 30, idPlantio: "r" }];
r = calcularPlanejamento(crops, [perene], rucH, CONFIG_PADRAO, hoje);
const ruc = r.culturas.find(c => c.cultura === "Rúcula")!;
t("rúcula sem rendimento: não sugere número", ruc.plantar.length === 0 && ruc.avisos.some(a => a.includes("rende")), ruc);

// 7) Ignorar tira da lista.
r = calcularPlanejamento(crops.map(c => c.nome === "Couve" ? { ...c, planejamento: { ignorar: true } } : c), [perene], harvests, CONFIG_PADRAO, hoje);
t("ignorar tira da lista", !r.culturas.some(c => c.cultura === "Couve"));

// 8) Bandeja de 200: só bandejas inteiras, e a média de longo prazo acompanha a saída.
const longo = { ...PADRAO, semanasPlantio: 12 };
r = calcularPlanejamento(crops, regime, harvests, longo, hoje);
const ab = r.culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("bandeja: só múltiplos de 200", ab.plantar.every(p => p.quantidade % 200 === 0), ab.plantar.map(p => p.quantidade));
const mediaSemana = ab.plantar.reduce((s, p) => s + p.quantidade, 0) / ab.plantar.length;
t("bandeja: média semanal perto do normal (±30%)", Math.abs(mediaSemana - ab.plantar[0].base) <= 0.3 * ab.plantar[0].base, { mediaSemana, base: ab.plantar[0].base });
t("bandeja: não planta toda semana uma variedade de saída ~100", ab.plantar.some(p => p.quantidade === 0), ab.plantar.map(p => p.quantidade));
r = calcularPlanejamento(crops, regime, harvests, { ...longo, bandeja: 0 }, hoje);
t("sem bandeja: volta ao contínuo", r.culturas.find(c => c.cultura === "Alface Crespa verde")!.plantar.some(p => p.quantidade % 200 !== 0));

// 9) Referência da bibliografia: usada só sem histórico e sem valor informado.
const cropsRef: any[] = [...crops, { nome: "Coentro", unidadeColheita: "MÇ", dias: 30, duracao: 20 }];
const coH = [...harvests, { cultura: "Coentro", data: somarDias(hoje, -3), qtd: 40, idPlantio: "co" }];
const coP: any[] = [perene, { id: "co", cultura: "Coentro", tipo: "Semente", unidade: "m²", status: "Colhendo", data: "2026-10-01", quantidade: 40, totalColhido: 40 }];
r = calcularPlanejamento(cropsRef, coP, coH, CONFIG_PADRAO, hoje);
const co = r.culturas.find(c => c.cultura === "Coentro")!;
t("coentro usa referência (5 MÇ/m²)", co.rendimentoOrigem === "referencia" && co.rendimento === 5, co);
t("coentro: sugere área em m²", co.plantar[0].quantidade > 0 && co.unidadePlantio === "m²", co.plantar);
r = calcularPlanejamento(cropsRef.map(c => c.nome === "Coentro" ? { ...c, planejamento: { rendimento: 8 } } : c), coP, coH, CONFIG_PADRAO, hoje);
t("valor informado vence a referência", r.culturas.find(c => c.cultura === "Coentro")!.rendimento === 8);

// 10) Compra de muda sem plantio lançado conta como plantio previsto (sem duplicar o pedido).
const semCompra = calcularPlanejamento(crops, [perene], harvests, CONFIG_PADRAO, hoje);
const base10 = semCompra.culturas.find(c => c.cultura === "Alface Crespa verde")!;
const compra: any = { id: "COMP-1", data: somarDias(hoje, -5), fornecedor: "Brazplant", nf: "S/N", tipo: "Muda", cultura: "Alface Crespa verde", quantidade: 200, saldo: 200, status: "Ativo", pedido: "22514", aguardandoNota: true };
r = calcularPlanejamento(crops, [perene], harvests, CONFIG_PADRAO, hoje, [compra]);
const a10 = r.culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("compra pendente: sugestão desta semana diminui", a10.plantar[0].quantidade < base10.plantar[0].quantidade, { antes: base10.plantar[0], depois: a10.plantar[0] });
t("compra pendente: aparece na lista da cultura", a10.comprasPendentes.length === 1 && a10.comprasPendentes[0].pedido === "22514" && a10.comprasPendentes[0].aguardandoNota);
t("compra pendente: não conta como plantio no campo", a10.plantiosAbertos === 0);
// Plantio lançado: o saldo zera e quem conta é o plantio. Mesmo resultado, sem somar duas vezes.
const plantada = { ...compra, saldo: 0, status: "Esgotado" };
const plantio10: any = { id: "P-C1", idLote: "COMP-1", cultura: "Alface Crespa verde", tipo: "Muda", status: "No campo", data: hoje, previsao: somarDias(hoje, 35), quantidade: 200, unidade: "Unidades", totalColhido: 0 };
r = calcularPlanejamento(crops, [perene, plantio10], harvests, CONFIG_PADRAO, hoje, [plantada]);
const b10 = r.culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("plantio lançado substitui a compra (mesma sugestão)", b10.plantar[0].quantidade === a10.plantar[0].quantidade && b10.comprasPendentes.length === 0, { compra: a10.plantar[0], plantio: b10.plantar[0] });
// Semente não conta; compra antiga só avisa.
r = calcularPlanejamento(crops, [perene], harvests, CONFIG_PADRAO, hoje, [{ ...compra, tipo: "Semente" }]);
t("semente comprada não conta", r.culturas.find(c => c.cultura === "Alface Crespa verde")!.comprasPendentes.length === 0);
r = calcularPlanejamento(crops, [perene], harvests, CONFIG_PADRAO, hoje, [{ ...compra, data: somarDias(hoje, -40) }]);
const velha = r.culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("compra antiga sem plantio: avisa e não conta", velha.comprasPendentes.length === 0 && velha.avisos.some(a => a.includes("zere o saldo")) && velha.plantar[0].quantidade === base10.plantar[0].quantidade, velha.avisos);
// Plantio atrasado: avisa, mas ainda conta.
r = calcularPlanejamento(crops, [perene], harvests, CONFIG_PADRAO, hoje, [{ ...compra, data: somarDias(hoje, -12) }]);
const atras = r.culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("plantio previsto passou: avisa e ainda conta", atras.comprasPendentes.length === 1 && atras.avisos.some(a => a.includes("ainda não foi lançado")), atras.avisos);
// Com bandeja: a compra desta semana tira a bandeja da semana.
const sem200 = calcularPlanejamento(crops, [perene], harvests, PADRAO, hoje).culturas.find(c => c.cultura === "Alface Crespa verde")!;
const com200 = calcularPlanejamento(crops, [perene], harvests, PADRAO, hoje, [{ ...compra, saldo: sem200.plantar[0].quantidade, quantidade: sem200.plantar[0].quantidade }]).culturas.find(c => c.cultura === "Alface Crespa verde")!;
t("bandeja: compra da semana vale como a bandeja da semana e a cadência segue", sem200.plantar[0].quantidade > 0 && com200.plantar[0].quantidade === 0 && com200.plantar.slice(1).some(p => p.quantidade > 0), { sem: sem200.plantar.map(p => p.quantidade), com: com200.plantar.map(p => p.quantidade) });
// Plantio previsto informado (compra para a semana que vem).
r = calcularPlanejamento(crops, [perene], harvests, PADRAO, hoje, [{ ...compra, data: hoje, plantioPrevisto: somarDias(hoje, 7), saldo: 200, quantidade: 200 }]);
t("plantio previsto informado é respeitado", r.culturas.find(c => c.cultura === "Alface Crespa verde")!.comprasPendentes[0].plantio === somarDias(hoje, 7));

console.log(`\n${ok} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);
