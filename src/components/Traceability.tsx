import React, { useState, useEffect } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Planting, Purchase, Harvest, Crop } from "../types";
import { Search, Loader2, Award, Printer, MapPin, Calendar, HelpCircle, FileText, CheckCircle2 } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import GeraniumLogo from "./GeraniumLogo";
import { normalizarUnidade, compraDoPlantio, colheitasDoPlantio, statusCalculado, STATUS_INFO } from "../lib/producao";

interface TraceabilityProps {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

export default function Traceability({ onNotify }: TraceabilityProps) {
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [search, setSearch] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<"todos" | "ativos" | "finalizados">("todos");
  const [selectedPlanting, setSelectedPlanting] = useState<Planting | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const plantingsSnapshot = await getDocs(collection(db, "plantings"));
      setPlantings(plantingsSnapshot.docs.map(d => {
        const data = d.data();
        return { ...data, docId: d.id, id: data.id || d.id } as Planting;
      }));

      const purchasesSnapshot = await getDocs(collection(db, "purchases"));
      setPurchases(purchasesSnapshot.docs.map(d => {
        const data = d.data();
        return { ...data, docId: d.id, id: data.id || d.id } as Purchase;
      }));

      const harvestsSnapshot = await getDocs(collection(db, "harvests"));
      setHarvests(harvestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Harvest)));

      const cropsSnapshot = await getDocs(collection(db, "crops"));
      setCrops(cropsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Crop)));
    } catch (err) {
      console.error("Error fetching traceability logs:", err);
      onNotify("Erro ao carregar dados de rastreabilidade.", "error");
    } finally {
      setLoading(false);
    }
  };

  const getCropHarvestUnit = (culturaName: string, fallback?: string): string => {
    if (!culturaName) return normalizarUnidade(fallback) || "KG";
    const found = crops.find(c => c.nome.toLowerCase().trim() === culturaName.toLowerCase().trim());
    return normalizarUnidade(found?.unidadeColheita || fallback) || "KG";
  };



  // Só a compra realmente vinculada ao plantio. Sem vínculo, a ficha diz isso.
  const getAssociatedPurchase = (p: Planting): Purchase | null => compraDoPlantio(purchases, p);

  const getAssociatedHarvests = (p: Planting): Harvest[] => colheitasDoPlantio(harvests, p);

  const formatToBrazDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return "N/A";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const handlePrint = () => {
    window.print();
  };

  // Busca por plantio, cultura, talhão, lote de compra, nota fiscal, fornecedor
  // ou ID de sessão/lançamento de colheita.
  const filteredPlantings = plantings.filter(p => {
    const termo = search.trim().toLowerCase();
    let matchesSearch = !termo;
    if (termo) {
      const compra = getAssociatedPurchase(p);
      const campos = [
        p.cultura, p.id, p.docId, p.talhao, p.idLote,
        compra?.id, compra?.nf, compra?.fornecedor,
        ...getAssociatedHarvests(p).flatMap(h => [h.idSessao, h.id])
      ];
      matchesSearch = campos.some(c => (c || "").toString().toLowerCase().includes(termo));
    }
    if (filterStatus === "ativos") {
      return matchesSearch && p.status !== "Finalizado";
    }
    if (filterStatus === "finalizados") {
      return matchesSearch && p.status === "Finalizado";
    }
    return matchesSearch;
  });

  const selectedPurchase = selectedPlanting ? getAssociatedPurchase(selectedPlanting) : null;
  const selectedHarvests = selectedPlanting ? getAssociatedHarvests(selectedPlanting) : [];

  return (
    <div className="space-y-6 print:m-0 print:p-0">
      
      {/* Search and Navigation Panel (Hidden during Printing) */}
      <div className="print:hidden space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div>
            <h1 className="text-xl font-bold text-slate-800 tracking-tight">Rastreabilidade e Fichas Técnicas</h1>
            <p className="text-slate-500 text-sm mt-1">Consulte o histórico auditável de cada canteiro, desde a semente até a colheita final.</p>
          </div>
        </div>

        {/* Filters and List view */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          
          {/* Side Search list */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4 lg:col-span-1">
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-slate-700">Selecione o Plantio</h2>
              <p className="text-xs text-slate-400 font-medium">Pesquise por plantio, cultura, talhão, lote, nota fiscal ou sessão de colheita</p>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Pesquisar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 rounded-xl text-xs outline-none font-bold text-slate-700 focus:bg-white transition"
              />
            </div>

            <div className="flex gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-200 font-bold">
              {(["todos", "ativos", "finalizados"] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setFilterStatus(mode)}
                  className={`flex-1 py-1.5 text-[10px] uppercase tracking-widest rounded-lg transition cursor-pointer ${
                    filterStatus === mode 
                      ? "bg-white text-indigo-700 shadow-xs border border-slate-150" 
                      : "text-slate-400 hover:text-slate-600"
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
              </div>
            ) : filteredPlantings.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-10 font-medium">Nenhum plantio correspondente.</p>
            ) : (
              <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                {filteredPlantings.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPlanting(p)}
                    className={`w-full p-3 rounded-xl text-left border transition cursor-pointer ${
                      selectedPlanting?.id === p.id 
                        ? "bg-indigo-50/75 border-indigo-200 text-indigo-900" 
                        : "bg-slate-50/40 hover:bg-slate-50 border-slate-200/60"
                    }`}
                  >
                    <div className="flex justify-between items-center text-[10px] font-mono font-bold">
                      <span className="text-slate-400">{p.id}</span>
                      <span className={`px-1.5 py-0.5 rounded-full font-sans text-[8px] font-black uppercase tracking-widest ${
                        p.status === "Finalizado" ? "bg-slate-200 text-slate-600" : "bg-emerald-100 text-emerald-800"
                      }`}>{STATUS_INFO[statusCalculado(p)].label}</span>
                    </div>
                    <h3 className="font-bold text-slate-800 text-xs mt-1">{p.cultura}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5 font-bold">Talhão: {p.talhao} • {formatToBrazDate(p.data)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Report viewer panel */}
          <div className="lg:col-span-2">
            {!selectedPlanting ? (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
                <FileText className="w-12 h-12 text-slate-300" />
                <h3 className="text-sm font-bold text-slate-700 mt-4">Nenhum canteiro selecionado</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-xs font-medium">Selecione um lote de plantio ativo ou finalizado no menu lateral para visualizar e imprimir a ficha auditável.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 relative space-y-6">
                
                {/* Panel action buttons */}
                <div className="flex justify-between items-center border-b border-slate-200 pb-4">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-600 animate-pulse" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Visualizando Ficha Oficial</span>
                  </div>
                  <button
                    onClick={handlePrint}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2.5 rounded-xl transition shadow-xs cursor-pointer"
                  >
                    <Printer className="w-4 h-4" />
                    Imprimir Ficha
                  </button>
                </div>

                {/* Printable Document Core */}
                <div className="space-y-6" id="traceability-document">
                  
                  {/* Document Header */}
                  <div className="flex justify-between items-start border-b-2 border-slate-800 pb-5">
                    <div>
                      <GeraniumLogo variant="horizontal" size={165} className="!-ml-1" />
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest font-black mt-1">Fazenda Certificada Orgânica • Distrito Federal</p>
                      <p className="text-xs text-indigo-700 font-bold italic mt-1">Ficha de Rastreabilidade de Alimentos</p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Código Canteiro</span>
                      <p className="font-mono text-base font-bold text-slate-900 bg-slate-50 px-3 py-1 rounded border border-slate-200 mt-1">{selectedPlanting.id}</p>
                    </div>
                  </div>

                  {/* Top Stats Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Cultura / Planta</span>
                      <span className="text-sm font-extrabold text-slate-800 mt-1 block">{selectedPlanting.cultura}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Localização Campo</span>
                      <span className="text-sm font-extrabold text-slate-800 mt-1 block">Talhão {selectedPlanting.talhao}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Data Plantio</span>
                      <span className="text-sm font-extrabold text-slate-800 mt-1 block">{formatToBrazDate(selectedPlanting.data)}</span>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">Quantidade</span>
                      <span className="text-sm font-extrabold text-slate-800 mt-1 block">{selectedPlanting.quantidade} {selectedPlanting.unidade}</span>
                    </div>
                  </div>

                  {/* Section 1: Origem */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1.5">1. Origem e Insumos Adquiridos</h3>
                    {selectedPurchase ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="space-y-0.5">
                          <span className="text-slate-400 font-bold uppercase text-[9px]">Fornecedor do Lote</span>
                          <p className="font-extrabold text-slate-800">{selectedPurchase.fornecedor}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-slate-400 font-bold uppercase text-[9px]">Nota Fiscal de Entrada</span>
                          <p className="font-extrabold text-slate-800">{selectedPurchase.nf}</p>
                        </div>
                        <div className="space-y-0.5">
                          <span className="text-slate-400 font-bold uppercase text-[9px]">Tipo / Lote Adquirido</span>
                          <p className="font-extrabold text-slate-800">{selectedPurchase.tipo} ({selectedPurchase.id})</p>
                        </div>
                      </div>
                    ) : (
                      <p className="text-xs text-amber-700 font-bold">
                        {selectedPlanting.idLote
                          ? `Lote ${selectedPlanting.idLote} informado, mas não encontrado nas compras.`
                          : "Sem lote de compra vinculado."}
                      </p>
                    )}
                  </div>

                  {/* Section 2: Preparo de Solo */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1.5">2. Manejo e Fertilização Orgânica</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Insumo Adubo Incorporado</span>
                        <p className="font-extrabold text-slate-800">{selectedPlanting.aduboQt || 0} Carrinhos</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Composição e Detalhes</span>
                        <p className="font-extrabold text-slate-800">{selectedPlanting.aduboComp || "Nenhum insumo extra inserido."}</p>
                      </div>
                    </div>
                  </div>

                  {/* Section 3: Produção */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1.5">3. Dados de Colheita e Rendimento</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
                      <div className="space-y-0.5">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Total Colhido Saudável</span>
                        <p className="font-extrabold text-emerald-700 text-sm">{selectedPlanting.totalColhido} {getCropHarvestUnit(selectedPlanting.cultura, selectedPlanting.unidade)}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Perdas Finais Campo</span>
                        <p className="font-extrabold text-red-600 text-sm">{selectedPlanting.perdas || 0} {selectedPlanting.unidade}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Status Atual Campo</span>
                        <p className="font-extrabold text-indigo-700">{STATUS_INFO[statusCalculado(selectedPlanting)].label}</p>
                      </div>
                      <div className="space-y-0.5">
                        <span className="text-slate-400 font-bold uppercase text-[9px]">Previsão Estimada / Fim</span>
                        <p className="font-extrabold text-slate-800">{selectedPlanting.status === "Finalizado" ? formatToBrazDate(selectedPlanting.dataFim) : formatToBrazDate(selectedPlanting.previsao)}</p>
                      </div>
                    </div>

                    {selectedPlanting.obs && (
                      <div className="bg-slate-50 p-2.5 rounded border border-slate-200 mt-2 text-xs">
                        <span className="text-slate-400 uppercase font-black text-[8px] block">Observações do Encerramento</span>
                        <p className="text-slate-600 mt-0.5 italic font-medium">"{selectedPlanting.obs}"</p>
                      </div>
                    )}
                  </div>

                  {/* Section 4: Colheitas Individuais */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest border-b border-slate-200 pb-1.5">4. Diário Detalhado de Coletas</h3>
                    {selectedHarvests.length === 0 ? (
                      <p className="text-xs text-slate-400 italic font-medium">Nenhum lançamento de colheita diária registrado.</p>
                    ) : (
                      <div className="overflow-hidden border border-slate-200 rounded-lg">
                        <table className="w-full text-left text-xs divide-y divide-slate-200">
                          <thead>
                            <tr className="bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <th className="p-2.5">Data da Colheita</th>
                              <th className="p-2.5">Grupo Sessão</th>
                              <th className="p-2.5 text-right">Qtd Colhida ({getCropHarvestUnit(selectedPlanting.cultura, selectedPlanting.unidade)})</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono font-bold">
                            {selectedHarvests.map((h, index) => (
                              <tr key={index} className="hover:bg-slate-50/20">
                                <td className="p-2.5 text-slate-700 font-sans">{formatToBrazDate(h.data)}</td>
                                <td className="p-2.5 text-slate-400">{h.idSessao}</td>
                                <td className="p-2.5 text-right text-emerald-600">{h.qtd} {h.unidade || getCropHarvestUnit(h.cultura)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Auditor footer stamps */}
                  <div className="grid grid-cols-2 gap-10 pt-10 border-t border-slate-200 text-center text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                    <div className="space-y-10">
                      <div className="h-0.5 bg-slate-200 w-44 mx-auto" />
                      <span>Responsável Técnico Fazenda</span>
                    </div>
                    <div className="space-y-10">
                      <div className="h-0.5 bg-slate-200 w-44 mx-auto" />
                      <span>Assinatura Auditor Certificador</span>
                    </div>
                  </div>

                </div>

              </div>
            )}
          </div>

        </div>
      </div>

      {/* Screen view strictly optimized for printing */}
      {selectedPlanting && (
        <div className="hidden print:block space-y-6 text-black bg-white p-4">
          {/* Exact clean carbon document layout */}
          <div className="flex justify-between items-start border-b-2 border-black pb-4">
            <div>
              <h2 className="text-xl font-black uppercase tracking-tight">Geranium Orgânicos</h2>
              <p className="text-[10px] uppercase tracking-widest mt-0.5">Fazenda Certificada Orgânica • Distrito Federal</p>
              <p className="text-xs font-serif italic mt-1">Ficha de Rastreabilidade de Alimentos</p>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold tracking-wider text-gray-500">Código Canteiro</span>
              <p className="font-mono text-lg font-bold text-black border border-black px-3 py-1 rounded mt-1">{selectedPlanting.id}</p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-4 text-xs border border-black p-3 rounded">
            <div>
              <span className="text-[9px] font-bold text-gray-500 block uppercase">Cultura / Planta</span>
              <span className="font-bold">{selectedPlanting.cultura}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-gray-500 block uppercase">Localização Campo</span>
              <span className="font-bold">Talhão {selectedPlanting.talhao}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-gray-500 block uppercase">Data Plantio</span>
              <span className="font-bold">{formatToBrazDate(selectedPlanting.data)}</span>
            </div>
            <div>
              <span className="text-[9px] font-bold text-gray-500 block uppercase">Quantidade</span>
              <span className="font-bold">{selectedPlanting.quantidade} {selectedPlanting.unidade}</span>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider border-b border-black pb-0.5">1. Origem e Insumos Adquiridos</h3>
            {selectedPurchase ? (
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-gray-500 uppercase text-[8px] block">Fornecedor do Lote</span>
                  <p className="font-bold">{selectedPurchase.fornecedor}</p>
                </div>
                <div>
                  <span className="text-gray-500 uppercase text-[8px] block">Nota Fiscal de Entrada</span>
                  <p className="font-bold">{selectedPurchase.nf}</p>
                </div>
                <div>
                  <span className="text-gray-500 uppercase text-[8px] block">Tipo / Lote Adquirido</span>
                  <p className="font-bold">{selectedPurchase.tipo} ({selectedPurchase.id})</p>
                </div>
              </div>
            ) : (
              <p className="text-xs font-bold">{selectedPlanting.idLote ? `Lote ${selectedPlanting.idLote} informado, mas não encontrado nas compras.` : "Sem lote de compra vinculado."}</p>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider border-b border-black pb-0.5">2. Manejo e Fertilização Orgânica</h3>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-gray-500 uppercase text-[8px] block">Insumo Adubo Incorporado</span>
                <p className="font-bold">{selectedPlanting.aduboQt || 0} Carrinhos</p>
              </div>
              <div>
                <span className="text-gray-500 uppercase text-[8px] block">Composição e Detalhes</span>
                <p className="font-bold">{selectedPlanting.aduboComp || "Nenhum insumo extra inserido."}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider border-b border-black pb-0.5">3. Dados de Colheita e Rendimento</h3>
            <div className="grid grid-cols-4 gap-4 text-xs font-sans">
              <div>
                <span className="text-gray-500 uppercase text-[8px] block">Total Colhido</span>
                <p className="font-bold">{selectedPlanting.totalColhido} {getCropHarvestUnit(selectedPlanting.cultura, selectedPlanting.unidade)}</p>
              </div>
              <div>
                <span className="text-gray-500 uppercase text-[8px] block">Perdas Campo</span>
                <p className="font-bold">{selectedPlanting.perdas || 0} {selectedPlanting.unidade}</p>
              </div>
              <div>
                <span className="text-gray-500 uppercase text-[8px] block">Status</span>
                <p className="font-bold">{STATUS_INFO[statusCalculado(selectedPlanting)].label}</p>
              </div>
              <div>
                <span className="text-gray-500 uppercase text-[8px] block">Previsão / Fim</span>
                <p className="font-bold">{selectedPlanting.status === "Finalizado" ? formatToBrazDate(selectedPlanting.dataFim) : formatToBrazDate(selectedPlanting.previsao)}</p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider border-b border-black pb-0.5">4. Diário Detalhado de Coletas</h3>
            {selectedHarvests.length === 0 ? (
              <p className="text-xs italic text-gray-500">Nenhum lançamento registrado.</p>
            ) : (
              <table className="w-full text-left text-xs divide-y divide-black border border-black">
                <thead>
                  <tr className="bg-gray-100 font-bold uppercase text-[9px]">
                    <th className="p-2">Data da Colheita</th>
                    <th className="p-2">Grupo Sessão</th>
                    <th className="p-2 text-right">Qtd Colhida</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-300 font-mono font-bold">
                  {selectedHarvests.map((h, idx) => (
                    <tr key={idx}>
                      <td className="p-2 text-black font-sans">{formatToBrazDate(h.data)}</td>
                      <td className="p-2 text-gray-600">{h.idSessao}</td>
                      <td className="p-2 text-right font-bold">{h.qtd} {h.unidade || getCropHarvestUnit(h.cultura)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="grid grid-cols-2 gap-10 pt-20 text-center text-[10px] uppercase font-bold text-gray-500 tracking-wider">
            <div className="space-y-12">
              <div className="h-0.5 bg-black w-48 mx-auto" />
              <span>Responsável Técnico Fazenda</span>
            </div>
            <div className="space-y-12">
              <div className="h-0.5 bg-black w-48 mx-auto" />
              <span>Assinatura Auditor Certificador</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
