import React, { useState, useEffect, useMemo } from "react";
import { CanEdit, launchStamp } from "../lib/permissions";
import { normalizarUnidade, calcularHistorico,
  statusCalculado, STATUS_INFO, hojeLocal, somarDias, buscarCultura, unidadeColheita,
  colheitasDoPlantio
} from "../lib/producao";
import ProgressoColheita from "./ProgressoColheita";
import { collection, getDocs, addDoc, updateDoc, doc, writeBatch, query, orderBy, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Planting, Purchase, Crop, Harvest } from "../types";
import { Plus, Trash, Eye, Edit2, Calendar, CheckSquare, Loader2, ArrowLeft, X, AlertTriangle, FileText } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PlantingsProps {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

interface CanteiroItem {
  tipo: "Muda" | "Semente" | "Perene";
  loteId: string; // reference to Purchase doc ID
  cultura: string;
  talhao: string;
  quantidade: number;
  aduboQt: number;
  aduboComp: string;
  acaoSobra: "dividido" | "perda";
  motivoPerda: string;
  loteSaldoMax?: number;
  /** Perene que já está produzindo: entra direto em colheita. */
  jaProduzindo: boolean;
  /** Estimativa de colheita (kg, maço…) quando não se conta por unidade. */
  estimativa: number;
}

export default function Plantings({ onNotify }: PlantingsProps) {
  const [plantings, setPlantings] = useState<Planting[]>([]);
  // Rendimento médio dos plantios finalizados, para estimar kg/maço sem digitar nada.
  const historico = useMemo(() => calcularHistorico(plantings), [plantings]);
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const getCropHarvestUnit = (culturaName: string, fallback?: string): string => {
    if (!culturaName) return normalizarUnidade(fallback) || "KG";
    const found = crops.find(c => c.nome.toLowerCase().trim() === culturaName.toLowerCase().trim());
    return normalizarUnidade(found?.unidadeColheita || fallback) || "KG";
  };
  
  const [viewMode, setViewMode] = useState<"actives" | "finalized" | "create">("actives");
  
  // Modals state
  const [selectedPlanting, setSelectedPlanting] = useState<Planting | null>(null);
  const [associatedPurchase, setAssociatedPurchase] = useState<Purchase | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState<boolean>(false);
  
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [editCultura, setEditCultura] = useState<string>("");
  const [editTalhao, setEditTalhao] = useState<string>("");
  const [editQt, setEditQt] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<"No campo" | "Esperando colheita" | "Colhendo">("No campo");
  const [editPerdas, setEditPerdas] = useState<number>(0);
  const [editObs, setEditObs] = useState<string>("");
  const [editData, setEditData] = useState<string>("");
  const [editPrevisao, setEditPrevisao] = useState<string>("");
  const [editEstimativa, setEditEstimativa] = useState<number>(0);
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  const [isFinalizeOpen, setIsFinalizeOpen] = useState<boolean>(false);
  const [finData, setFinData] = useState<string>(hojeLocal());
  const [finPerdas, setFinPerdas] = useState<number>(0);
  const [finObs, setFinObs] = useState<string>("");
  const [savingFin, setSavingFin] = useState<boolean>(false);

  // Form states (new planting)
  const [formDate, setFormDate] = useState<string>(hojeLocal());
  const [canteiros, setCanteiros] = useState<CanteiroItem[]>([
    { tipo: "Muda", loteId: "", cultura: "", talhao: "", quantidade: 0, aduboQt: 0, aduboComp: "", acaoSobra: "dividido", motivoPerda: "", jaProduzindo: false, estimativa: 0 }
  ]);
  const [savingNew, setSavingNew] = useState<boolean>(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // 1. Fetch crops for estimated calculations
      const cropsSnapshot = await getDocs(collection(db, "crops"));
      const cropsList = cropsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Crop));
      setCrops(cropsList);

      // 2. Fetch purchases for active lots
      const purchasesSnapshot = await getDocs(collection(db, "purchases"));
      const purchasesList = purchasesSnapshot.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          docId: d.id,
          id: data.id || d.id,
        } as Purchase;
      });
      setPurchases(purchasesList);

      // 3. Fetch canteiro plantings
      const plantingsSnapshot = await getDocs(collection(db, "plantings"));
      const plantingsList = plantingsSnapshot.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          docId: d.id,
          id: data.id || d.id,
        } as Planting;
      });
      setPlantings(plantingsList);

      // 4. Fetch harvests
      const harvestsSnapshot = await getDocs(collection(db, "harvests"));
      const harvestsList = harvestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Harvest));
      setHarvests(harvestsList);
    } catch (err) {
      console.error("Error fetching canteiro data:", err);
      onNotify("Erro ao buscar dados do campo.", "error");
    } finally {
      setLoading(false);
    }
  };

  const getEstimatedDate = (cropName: string, plantingDateStr: string): string => {
    const crop = buscarCultura(crops, cropName);
    if (!crop || !crop.dias) return plantingDateStr;
    return somarDias(plantingDateStr, crop.dias);
  };

  // Estimativa só faz sentido quando a colheita não é contada por unidade plantada.
  const precisaEstimativa = (c: CanteiroItem): boolean => {
    if (!c.cultura) return false;
    const un = unidadeColheita(crops, c.cultura).toLowerCase();
    return c.tipo === "Semente" || !["un", "und", "unid", "unidade", "unidades"].includes(un);
  };

  const addCanteiroRow = () => {
    setCanteiros([
      ...canteiros,
      { tipo: "Muda", loteId: "", cultura: "", talhao: "", quantidade: 0, aduboQt: 0, aduboComp: "", acaoSobra: "dividido", motivoPerda: "", jaProduzindo: false, estimativa: 0 }
    ]);
  };

  const removeCanteiroRow = (index: number) => {
    if (canteiros.length > 1) {
      setCanteiros(canteiros.filter((_, i) => i !== index));
    }
  };

  const updateCanteiroRow = (index: number, field: keyof CanteiroItem, value: any) => {
    const updated = [...canteiros];
    
    // Additional triggers on lot selection
    if (field === "loteId") {
      const selectedLot = purchases.find(p => p.id === value);
      if (selectedLot) {
        updated[index].cultura = selectedLot.cultura;
        updated[index].loteSaldoMax = selectedLot.saldo;
        // Limit current planting quantity if it exceeds stock balance ONLY for Mudas
        if (updated[index].tipo === "Muda" && updated[index].quantidade > selectedLot.saldo) {
          updated[index].quantidade = selectedLot.saldo;
        }
      }
    }

    if (field === "tipo") {
      updated[index].loteId = "";
      updated[index].cultura = "";
      updated[index].loteSaldoMax = undefined;
    }

    updated[index] = { ...updated[index], [field]: value } as CanteiroItem;
    setCanteiros(updated);
  };

  const handleOpenDetails = (p: Planting) => {
    setSelectedPlanting(p);
    const linkedLot = purchases.find(pur => pur.id === p.idLote || pur.docId === p.idLote) || null;
    setAssociatedPurchase(linkedLot);
    setIsDetailOpen(true);
  };

  const handleOpenEdit = () => {
    if (!selectedPlanting) return;
    setEditCultura(selectedPlanting.cultura);
    setEditTalhao(selectedPlanting.talhao);
    setEditQt(selectedPlanting.quantidade);
    setEditStatus(selectedPlanting.status === "Colhendo" ? "Colhendo" : "No campo");
    setEditPerdas(selectedPlanting.perdas || 0);
    setEditObs(selectedPlanting.obs || "");
    setEditData(selectedPlanting.data || "");
    setEditPrevisao(selectedPlanting.previsao || "");
    setEditEstimativa(selectedPlanting.estimativaColheita || 0);
    setIsEditOpen(true);
  };

  const handleOpenFinalize = (pId: string) => {
    setIsFinalizeOpen(true);
    setFinData(hojeLocal());
    setFinPerdas(0);
    setFinObs("");
  };

  const handleSaveEdit = async () => {
    if (!selectedPlanting) return;
    const targetDocId = selectedPlanting.docId || selectedPlanting.id;
    if (!targetDocId) return;

    try {
      setSavingEdit(true);
      const docRef = doc(db, "plantings", targetDocId);
      
      const updatePayload: Partial<Planting> = {
        cultura: editCultura.trim(),
        talhao: editTalhao.trim(),
        quantidade: Number(editQt) || 0,
        status: editStatus,
        perdas: Number(editPerdas) || 0,
        obs: editObs.trim(),
        data: editData,
        previsao: editPrevisao,
        estimativaColheita: Number(editEstimativa) || 0,
      };

      await updateDoc(docRef, updatePayload);
      onNotify("Plantio atualizado com sucesso!", "success");
      setIsEditOpen(false);
      setIsDetailOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error updating planting:", err);
      onNotify("Erro ao atualizar o plantio.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleConfirmFinalize = async () => {
    if (!selectedPlanting) return;
    const targetDocId = selectedPlanting.docId || selectedPlanting.id;
    if (!targetDocId) return;

    try {
      setSavingFin(true);
      const docRef = doc(db, "plantings", targetDocId);

      const updatePayload: Partial<Planting> = {
        status: "Finalizado",
        dataFim: finData,
        perdas: Number(finPerdas) || 0,
        obs: finObs.trim(),
      };

      await updateDoc(docRef, updatePayload);
      onNotify("Plantio finalizado e arquivado com sucesso!", "success");
      setIsFinalizeOpen(false);
      setIsDetailOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error finalizing planting:", err);
      onNotify("Erro ao finalizar o plantio.", "error");
    } finally {
      setSavingFin(false);
    }
  };

  const handleSaveNewPlanting = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validations
    for (let i = 0; i < canteiros.length; i++) {
      const c = canteiros[i];
      if (c.tipo === "Muda" && !c.loteId) {
        onNotify(`Selecione o lote de mudas no Canteiro ${i + 1}.`, "error");
        return;
      }
      if (c.tipo === "Perene" && !c.cultura) {
        onNotify(`Selecione a cultura perene no Canteiro ${i + 1}.`, "error");
        return;
      }
      if (!c.talhao.trim()) {
        onNotify(`Preencha o talhão no Canteiro ${i + 1}.`, "error");
        return;
      }
      if (c.quantidade <= 0) {
        onNotify(`A quantidade plantada no Canteiro ${i + 1} deve ser maior que zero.`, "error");
        return;
      }
    }

    // Mudas: a soma dos canteiros não pode passar do saldo de cada lote.
    const usoPorLote: Record<string, number> = {};
    for (const c of canteiros) {
      if (c.tipo === "Muda" && c.loteId) usoPorLote[c.loteId] = (usoPorLote[c.loteId] || 0) + Number(c.quantidade);
    }
    for (const [loteId, total] of Object.entries(usoPorLote)) {
      const lote = purchases.find(p => p.id === loteId || p.docId === loteId);
      if (lote && total > lote.saldo) {
        onNotify(`O lote ${lote.id} tem ${lote.saldo} mudas, mas os canteiros somam ${total}.`, "error");
        return;
      }
    }

    try {
      setSavingNew(true);
      const batch = writeBatch(db);
      const dateForId = formDate.replace(/-/g, "").substring(2); // yyMMdd format

      // Track updated balances locally within this session's save loop
      const localStockBalances: Record<string, number> = {};

      for (const c of canteiros) {
        const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
        const plantingId = `PLAN-${dateForId}-${randomHex}`;
        const newDocRef = doc(collection(db, "plantings"));

        // Generate dynamic estimated harvest date
        const comecaColhendo = c.tipo === "Perene" && c.jaProduzindo;
        const previsaoDate = comecaColhendo ? formDate : getEstimatedDate(c.cultura, formDate);

        const payload: Planting = {
          id: plantingId,
          idLote: c.tipo !== "Perene" ? c.loteId || "" : "",
          data: formDate,
          cultura: c.cultura,
          tipo: c.tipo,
          talhao: c.talhao.trim(),
          quantidade: Number(c.quantidade),
          previsao: previsaoDate,
          status: comecaColhendo ? "Colhendo" : "No campo",
          totalColhido: 0,
          ...(precisaEstimativa(c) && c.estimativa > 0 ? { estimativaColheita: Number(c.estimativa) } : {}),
          unidade: c.tipo === "Semente" ? "m²" : "Unidades",
          aduboQt: Number(c.aduboQt) || 0,
          aduboComp: c.aduboComp.trim() || "Nenhum",
          ...launchStamp(),
        };

        // Deduct from purchase stock batch if not perene
        if (c.tipo !== "Perene" && c.loteId) {
          const matchingPurchaseDoc = purchases.find(p => p.id === c.loteId || p.docId === c.loteId);
          if (matchingPurchaseDoc) {
            const targetDocId = matchingPurchaseDoc.docId || matchingPurchaseDoc.id || c.loteId;
            const purchaseRef = doc(db, "purchases", targetDocId);
            
            // Use localStockBalances if already deducted in this session, otherwise use matchingPurchaseDoc.saldo
            const currentBalance = localStockBalances[c.loteId] !== undefined
              ? localStockBalances[c.loteId]
              : matchingPurchaseDoc.saldo;

            let stockStatus = "Ativo";
            let finalRemainingBalance = currentBalance - c.quantidade;

            if (c.tipo === "Semente") {
              // For seeds: c.quantidade is area in m² (e.g. 20m²). Seed stock is measured in packages/kg.
              if (c.acaoSobra === "perda") {
                stockStatus = `Esgotado (Sementes finalizadas/perda: ${c.motivoPerda || "Não especificado"})`;
                finalRemainingBalance = 0;
              } else {
                // Decrement 1 package/unit from seed balance or set to 0 if 1 unit was used
                finalRemainingBalance = Math.max(0, currentBalance - 1);
                stockStatus = finalRemainingBalance <= 0 ? "Esgotado" : "Ativo";
              }
            } else {
              if (c.acaoSobra === "perda") {
                stockStatus = `Esgotado (Perda: ${c.motivoPerda || "Não especificado"})`;
                finalRemainingBalance = 0;
              } else if (finalRemainingBalance <= 0) {
                stockStatus = "Esgotado";
                finalRemainingBalance = 0;
              }
            }

            // Update local stock tracking
            localStockBalances[c.loteId] = finalRemainingBalance;

            batch.update(purchaseRef, {
              saldo: finalRemainingBalance,
              status: stockStatus,
            });
          }
        }

        batch.set(newDocRef, payload);
      }

      await batch.commit();
      onNotify("Plantio registrado com sucesso!", "success");
      setViewMode("actives");
      fetchData();
    } catch (err) {
      console.error("Error logging plantings:", err);
      onNotify("Erro ao registrar os plantios.", "error");
    } finally {
      setSavingNew(false);
    }
  };

  const formatToBrazDate = (dateStr: string) => {
    if (!dateStr) return "";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  // Planting delayed / wait classifications
  const getCalculatedStatus = (p: Planting) => statusCalculado(p);

  const getStatusLabelAndColor = (status: string) =>
    STATUS_INFO[status as keyof typeof STATUS_INFO] || STATUS_INFO["No campo"];

  // State for search and filters
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterTalhao, setFilterTalhao] = useState<string>("Todos");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");

  const parseDateToTimestamp = (dateStr?: string): number => {
    if (!dateStr) return 0;
    const str = dateStr.trim();
    if (str.includes("/")) {
      const parts = str.split("/");
      if (parts.length === 3) {
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10) - 1;
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        const d = new Date(year, month, day);
        return isNaN(d.getTime()) ? 0 : d.getTime();
      }
    }
    const d = new Date(str);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  };

  // Dynamic values
  const uniqueTalhoes = Array.from(new Set(plantings.map(p => p.talhao).filter(Boolean))).sort();

  // Grouping & Filtering
  const activePlantings = plantings.filter(p => {
    if (p.status === "Finalizado") return false;
    const matchesSearch = p.cultura.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTalhao = filterTalhao === "Todos" || p.talhao === filterTalhao;
    return matchesSearch && matchesTalhao;
  });

  const finalizedPlantings = plantings.filter(p => {
    if (p.status !== "Finalizado") return false;
    const matchesSearch = p.cultura.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.id.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTalhao = filterTalhao === "Todos" || p.talhao === filterTalhao;
    return matchesSearch && matchesTalhao;
  });

  // Groups order for display
  const groupOrder = ["Colhendo", "Colheita atrasada", "Pronto para colher", "No campo"];

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        
        {viewMode === "actives" ? (
          <motion.div
            key="actives-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Plantios Ativos</h1>
                <p className="text-slate-500 text-sm mt-1">Monitore o progresso e o rendimento dos plantios no campo.</p>
              </div>
              <div className="flex flex-wrap gap-3 w-full md:w-auto">
                <button
                  onClick={() => setViewMode("finalized")}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl transition text-sm cursor-pointer border border-slate-200"
                >
                  <FileText className="w-4 h-4" />
                  Ver Finalizados
                </button>
                <button
                  onClick={() => setViewMode("create")}
                  className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl transition text-sm cursor-pointer shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  Novo Plantio
                </button>
              </div>
            </div>

            {/* Active Filters Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar por cultura ou ID do canteiro..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-emerald-500 outline-none transition font-semibold text-slate-800"
                />
              </div>
              <div className="w-full sm:w-[180px]">
                <select
                  value={filterTalhao}
                  onChange={(e) => setFilterTalhao(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-emerald-500 outline-none transition font-bold text-slate-700 cursor-pointer"
                >
                  <option value="Todos">Todos os Talões</option>
                  {uniqueTalhoes.map(t => (
                    <option key={t} value={t}>Talhão {t}</option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-[220px]">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-emerald-500 outline-none transition font-bold text-slate-700 cursor-pointer"
                >
                  <option value="asc">Plantio: Crescente (Antigos → Novos)</option>
                  <option value="desc">Plantio: Decrescente (Novos → Antigos)</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                <p className="text-sm text-slate-400 mt-2">Carregando canteiros ativos...</p>
              </div>
            ) : plantings.filter(p => p.status !== "Finalizado").length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-6">
                <AlertTriangle className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum plantio ativo em campo.</p>
                <p className="text-xs text-slate-400 mt-1">Registre um novo plantio para iniciar o monitoramento.</p>
              </div>
            ) : activePlantings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-6">
                <AlertTriangle className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum plantio encontrado.</p>
                <p className="text-xs text-slate-400 mt-1">Tente ajustar seus termos de busca ou filtros.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {groupOrder.map((groupKey) => {
                  const groupItems = activePlantings
                    .filter(p => getCalculatedStatus(p) === groupKey)
                    .sort((a, b) => {
                      const timeA = parseDateToTimestamp(a.data);
                      const timeB = parseDateToTimestamp(b.data);
                      return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
                    });
                  if (groupItems.length === 0) return null;
                  const groupTheme = getStatusLabelAndColor(groupKey);

                  return (
                    <div key={groupKey} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className={`p-4 border-b border-slate-200 flex justify-between items-center ${groupTheme.color}`}>
                        <h2 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                          {groupTheme.label}
                        </h2>
                        <span className="text-xs font-mono font-bold">({groupItems.length}) canteiro{groupItems.length > 1 ? "s" : ""}</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="bg-slate-50/55 border-b border-slate-150 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <th className="p-4">Canteiro ID</th>
                              <th className="p-4">Cultura</th>
                              <th className="p-4 text-center">Talhão</th>
                              <th className="p-4 text-center">Data Plantio</th>
                              <th className="p-4 text-center">Previsão Colheita</th>
                              <th className="p-4 text-center">Rendimento / Total</th>
                              <th className="p-4 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {groupItems.map((p) => {
                              const pct = p.tipo === "Muda" && p.quantidade > 0 
                                ? Math.min(100, (p.totalColhido / p.quantidade) * 100).toFixed(1) + "%" 
                                : "—";
                              return (
                                <tr key={p.id} className="hover:bg-slate-50/40 transition">
                                  <td className="p-4 font-mono text-xs text-slate-400 font-bold">{p.id}</td>
                                  <td className="p-4 font-bold text-slate-800">{p.cultura}</td>
                                  <td className="p-4 text-center text-slate-600 font-bold">{p.talhao}</td>
                                  <td className="p-4 text-center text-slate-500 text-xs font-medium">{formatToBrazDate(p.data)}</td>
                                  <td className="p-4 text-center text-xs font-bold text-indigo-600">{formatToBrazDate(p.previsao) || "—"}</td>
                                  <td className="p-4 text-center text-xs">
                                    <div className="font-bold text-slate-800">{p.totalColhido} {getCropHarvestUnit(p.cultura, p.unidade)}</div>
                                    <div className="text-[10px] text-slate-400 font-medium">de {p.quantidade} {p.unidade} ({pct})</div>
                                  </td>
                                  <td className="p-4 text-right">
                                    <button
                                      onClick={() => handleOpenDetails(p)}
                                      className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer border border-slate-200"
                                    >
                                      <Eye className="w-3.5 h-3.5" />
                                      Detalhes
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        ) : viewMode === "finalized" ? (
          <motion.div
            key="finalized-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Histórico de Plantios Finalizados</h1>
                <p className="text-slate-500 text-sm mt-1">Consulte os registros arquivados e as métricas finais de rendimento.</p>
              </div>
              <button
                onClick={() => setViewMode("actives")}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl shadow-xs transition text-sm self-stretch sm:self-auto justify-center cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar aos Ativos
              </button>
            </div>

            {/* Finalized Filters Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar por cultura ou ID do canteiro..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-emerald-500 outline-none transition font-semibold text-slate-800"
                />
              </div>
              <div className="w-full sm:w-[180px]">
                <select
                  value={filterTalhao}
                  onChange={(e) => setFilterTalhao(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-emerald-500 outline-none transition font-bold text-slate-700 cursor-pointer"
                >
                  <option value="Todos">Todos os Talões</option>
                  {uniqueTalhoes.map(t => (
                    <option key={t} value={t}>Talhão {t}</option>
                  ))}
                </select>
              </div>
              <div className="w-full sm:w-[220px]">
                <select
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value as "asc" | "desc")}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-emerald-500 outline-none transition font-bold text-slate-700 cursor-pointer"
                >
                  <option value="asc">Plantio: Crescente (Antigos → Novos)</option>
                  <option value="desc">Plantio: Decrescente (Novos → Antigos)</option>
                </select>
              </div>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                <p className="text-sm text-slate-400 mt-2">Buscando canteiros arquivados...</p>
              </div>
            ) : plantings.filter(p => p.status === "Finalizado").length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-6">
                <FileText className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum plantio finalizado encontrado.</p>
                <p className="text-xs text-slate-400 mt-1">Conclua colheitas para enviar plantios ao histórico.</p>
              </div>
            ) : finalizedPlantings.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-6">
                <AlertTriangle className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum plantio encontrado.</p>
                <p className="text-xs text-slate-400 mt-1">Tente ajustar seus termos de busca ou filtros.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        <th className="p-4">ID</th>
                        <th className="p-4">Cultura</th>
                        <th className="p-4 text-center">Talhão</th>
                        <th className="p-4 text-center">Plantado</th>
                        <th className="p-4 text-center">Encerramento</th>
                        <th className="p-4 text-center">Total Colhido</th>
                        <th className="p-4 text-center">Perdas Finais</th>
                        <th className="p-4 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...finalizedPlantings].sort((a, b) => {
                        const timeA = parseDateToTimestamp(a.data);
                        const timeB = parseDateToTimestamp(b.data);
                        return sortOrder === "asc" ? timeA - timeB : timeB - timeA;
                      }).map((p) => (
                        <tr key={p.id} className="hover:bg-slate-50/30 transition text-slate-600">
                          <td className="p-4 font-mono text-xs font-bold text-slate-400">{p.id}</td>
                          <td className="p-4 font-bold text-slate-800">{p.cultura}</td>
                          <td className="p-4 text-center font-semibold text-slate-700">{p.talhao}</td>
                          <td className="p-4 text-center text-xs font-medium">{formatToBrazDate(p.data)}</td>
                          <td className="p-4 text-center text-xs font-bold text-rose-600">{formatToBrazDate(p.dataFim || "")}</td>
                          <td className="p-4 text-center text-xs font-bold text-emerald-600">{p.totalColhido} {getCropHarvestUnit(p.cultura, p.unidade)}</td>
                          <td className="p-4 text-center text-xs font-bold text-red-600">{p.perdas || 0}</td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleOpenDetails(p)}
                              className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer border border-slate-200"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              Ver Ficha
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </motion.div>
        ) : (
          <motion.div
            key="create-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-4xl mx-auto space-y-6"
          >
            {/* Header */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4 bg-slate-50/50">
              <button
                type="button"
                onClick={() => setViewMode("actives")}
                className="p-2 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition cursor-pointer border border-slate-200"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h2 className="text-lg font-bold text-slate-800">Registrar Novo Plantio</h2>
                <p className="text-xs text-slate-500 mt-0.5">Adicione canteiros e vincule lotes do estoque para sincronizar.</p>
              </div>
            </div>

            <form onSubmit={handleSaveNewPlanting} className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-6">
              
              {/* Date selection */}
              <div className="space-y-1.5 max-w-xs">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Data de Plantio
                </label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none transition font-medium"
                />
              </div>

              <hr className="border-slate-100" />

              {/* Dynamic Beds */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Canteiros do Plantio</h3>
                  <button
                    type="button"
                    onClick={addCanteiroRow}
                    className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs px-3 py-2 rounded-lg transition cursor-pointer border border-emerald-100/30"
                  >
                    + Adicionar Canteiro
                  </button>
                </div>

                <div className="space-y-6">
                  {canteiros.map((c, idx) => {
                    // Filter available active lots for type
                    const activeLots = purchases.filter(p => p.tipo === c.tipo && p.saldo > 0 && p.status === "Ativo");
                    const showSobraBox = c.tipo === "Muda" && c.loteId && c.quantidade > 0 && c.loteSaldoMax !== undefined && c.quantidade < c.loteSaldoMax;

                    return (
                      <div key={idx} className="bg-slate-50 p-5 rounded-2xl border border-slate-200 relative space-y-4 shadow-2xs">
                        
                        {/* Remove button */}
                        {canteiros.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeCanteiroRow(idx)}
                            className="absolute top-4 right-4 text-rose-500 hover:text-rose-700 text-xs font-bold transition cursor-pointer"
                          >
                            Excluir Canteiro
                          </button>
                        )}

                        <div className="font-extrabold text-[10px] text-slate-400 uppercase tracking-widest">Canteiro {idx + 1}</div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          
                          {/* Bed Type selection */}
                          <div className="space-y-1.5">
                            <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Tipo</span>
                            <div className="flex items-center gap-3 bg-white px-3 py-2 border border-slate-200 rounded-lg">
                              <label className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer font-semibold">
                                <input
                                  type="radio"
                                  name={`bed-tipo-${idx}`}
                                  checked={c.tipo === "Muda"}
                                  onChange={() => updateCanteiroRow(idx, "tipo", "Muda")}
                                  className="text-emerald-600 focus:ring-emerald-500"
                                />
                                Muda
                              </label>
                              <label className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer font-semibold">
                                <input
                                  type="radio"
                                  name={`bed-tipo-${idx}`}
                                  checked={c.tipo === "Semente"}
                                  onChange={() => updateCanteiroRow(idx, "tipo", "Semente")}
                                  className="text-emerald-600 focus:ring-emerald-500"
                                />
                                Semente
                              </label>
                              <label className="flex items-center gap-1 text-xs text-slate-700 cursor-pointer font-semibold">
                                <input
                                  type="radio"
                                  name={`bed-tipo-${idx}`}
                                  checked={c.tipo === "Perene"}
                                  onChange={() => updateCanteiroRow(idx, "tipo", "Perene")}
                                  className="text-emerald-600 focus:ring-emerald-500"
                                />
                                Perene
                              </label>
                            </div>
                          </div>

                          {/* Lot / Crop dropdown */}
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                              {c.tipo === "Perene" ? "Cultura Perene" : c.tipo === "Semente" ? "Compra de Sementes (opcional)" : "Lote de Mudas"}
                            </label>
                            {c.tipo === "Perene" ? (
                              <select
                                required
                                value={c.cultura}
                                onChange={(e) => updateCanteiroRow(idx, "cultura", e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-semibold"
                              >
                                <option value="" disabled>Selecione a cultura perene...</option>
                                {crops.map((cr) => (
                                  <option key={cr.nome} value={cr.nome}>
                                    {cr.nome}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <select
                                required={c.tipo === "Muda"}
                                value={c.loteId}
                                onChange={(e) => updateCanteiroRow(idx, "loteId", e.target.value)}
                                className="w-full px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-semibold"
                              >
                                {c.tipo === "Muda" ? (
                                  <option value="" disabled>Selecione o lote de mudas...</option>
                                ) : (
                                  <option value="">Sem vínculo com compra (opcional)</option>
                                )}
                                {activeLots.map((l) => (
                                  <option key={l.id} value={l.id}>
                                    [{l.cultura}] Saldo: {l.saldo} (Lote: {l.id} • NF: {l.nf})
                                  </option>
                                ))}
                              </select>
                            )}
                            {c.tipo === "Semente" && !c.loteId && (
                              <select
                                required
                                value={c.cultura}
                                onChange={(e) => updateCanteiroRow(idx, "cultura", e.target.value)}
                                className="w-full mt-2 px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-semibold"
                              >
                                <option value="" disabled>Cultura semeada...</option>
                                {crops.map((cr) => (
                                  <option key={cr.nome} value={cr.nome}>{cr.nome}</option>
                                ))}
                              </select>
                            )}
                            {c.tipo === "Perene" && (
                              <label className="flex items-start gap-2 mt-2 text-xs text-slate-700 font-semibold cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={c.jaProduzindo}
                                  onChange={(e) => updateCanteiroRow(idx, "jaProduzindo", e.target.checked)}
                                  className="mt-0.5 accent-emerald-600"
                                />
                                <span>
                                  Já está no campo e produzindo (banana, chuchu…)
                                  <span className="block text-[10px] text-slate-400 font-medium">Entra direto em colheita. Use a data de plantio aproximada, se souber.</span>
                                </span>
                              </label>
                            )}
                          </div>

                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          
                          {/* Plot Bed identifier */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                              Talhão (Quadra / Canteiro)
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="Ex: Talhão 4A"
                              value={c.talhao}
                              onChange={(e) => updateCanteiroRow(idx, "talhao", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-medium"
                            />
                          </div>

                          {/* Plated Quantity */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                              {c.tipo === "Semente" ? "Área Plantada (m²)" : c.tipo === "Perene" ? "Quantidade de Plantas (unid)" : "Quantidade de Mudas (unid)"}
                            </label>
                            <input
                              type="number"
                              required
                              min="0.1"
                              step="0.01"
                              value={c.quantidade || ""}
                              onChange={(e) => {
                                const q = Math.max(0, parseFloat(e.target.value) || 0);
                                const max = c.loteSaldoMax;
                                if (c.tipo === "Muda" && max !== undefined && q > max) {
                                  onNotify(`Você só possui ${max} mudas disponíveis neste lote!`, "error");
                                  updateCanteiroRow(idx, "quantidade", max);
                                } else {
                                  updateCanteiroRow(idx, "quantidade", q);
                                }
                              }}
                              className="w-full px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-mono font-bold"
                            />
                          </div>

                        </div>

                        {precisaEstimativa(c) && (
                          <div className="space-y-1.5 max-w-xs">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                              Estimativa de colheita ({unidadeColheita(crops, c.cultura)}) — opcional
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="0.1"
                              value={c.estimativa || ""}
                              onChange={(e) => updateCanteiroRow(idx, "estimativa", Math.max(0, parseFloat(e.target.value) || 0))}
                              placeholder="Ex: 40"
                              className="w-full px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-mono font-bold"
                            />
                            <p className="text-[10px] text-slate-400">Pode deixar em branco: o sistema usa a média dos plantios já finalizados desta cultura. Passar da estimativa só gera um aviso.</p>
                          </div>
                        )}

                        {/* Leftover stock warning box */}
                        {showSobraBox && (
                          <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            className="bg-amber-50 border-l-4 border-amber-500 p-4 rounded-r-xl space-y-2 border border-amber-200/50"
                          >
                            <p className="text-xs text-amber-800 font-bold">
                              Você está plantando {c.quantidade} mudas, mas o lote original possui {c.loteSaldoMax}. O que aconteceu com as {c.loteSaldoMax! - c.quantidade} mudas restantes?
                            </p>
                            <div className="flex gap-4">
                              <label className="flex items-center gap-1 text-xs text-amber-800 cursor-pointer font-semibold">
                                <input
                                  type="radio"
                                  name={`sobra-bed-${idx}`}
                                  checked={c.acaoSobra === "dividido"}
                                  onChange={() => updateCanteiroRow(idx, "acaoSobra", "dividido")}
                                  className="text-amber-600 focus:ring-amber-500"
                                />
                                Plantio Dividido (guardar o restante no estoque)
                              </label>
                              <label className="flex items-center gap-1 text-xs text-amber-800 cursor-pointer font-semibold">
                                <input
                                  type="radio"
                                  name={`sobra-bed-${idx}`}
                                  checked={c.acaoSobra === "perda"}
                                  onChange={() => updateCanteiroRow(idx, "acaoSobra", "perda")}
                                  className="text-amber-600 focus:ring-amber-500"
                                />
                                Perda (as mudas estragaram/morreram)
                              </label>
                            </div>
                            
                            {c.acaoSobra === "perda" && (
                              <input
                                type="text"
                                placeholder="Descreva o motivo da perda..."
                                value={c.motivoPerda}
                                onChange={(e) => updateCanteiroRow(idx, "motivoPerda", e.target.value)}
                                className="w-full px-3 py-1.5 bg-white border border-amber-200 focus:border-amber-500 text-xs text-amber-800 rounded outline-none"
                              />
                            )}
                          </motion.div>
                        )}

                        {/* Bed prep details */}
                        <div className="bg-slate-100 p-3 rounded-lg flex flex-col sm:flex-row gap-4 items-center">
                          <span className="text-xs font-bold text-slate-500 shrink-0 uppercase tracking-widest">Preparo do Solo</span>
                          <div className="flex gap-3 w-full">
                            <input
                              type="number"
                              step="0.5"
                              placeholder="Carrinhos de Adubo"
                              value={c.aduboQt || ""}
                              onChange={(e) => updateCanteiroRow(idx, "aduboQt", Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-28 px-3 py-1.5 bg-white border border-slate-200 text-xs rounded-lg outline-none focus:border-emerald-500 font-semibold"
                            />
                            <input
                              type="text"
                              placeholder="Composição / Adubo utilizado..."
                              value={c.aduboComp}
                              onChange={(e) => updateCanteiroRow(idx, "aduboComp", e.target.value)}
                              className="flex-1 px-3 py-1.5 bg-white border border-slate-200 text-xs rounded-lg outline-none focus:border-emerald-500 font-semibold"
                            />
                          </div>
                        </div>

                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Submit panel */}
              <div className="flex gap-4 pt-4 border-t border-slate-200 font-bold">
                <button
                  type="submit"
                  disabled={savingNew}
                  className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-xs transition duration-150 flex items-center justify-center gap-2 text-sm cursor-pointer"
                >
                  {savingNew && <Loader2 className="w-5 h-5 animate-spin" />}
                  {savingNew ? "Salvando..." : "Salvar Plantio"}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("actives")}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition text-sm cursor-pointer border border-slate-200"
                >
                  Cancelar
                </button>
              </div>

            </form>
          </motion.div>
        )}

      </AnimatePresence>

      {/* Details Slide-Over / Modal */}
      {isDetailOpen && selectedPlanting && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsDetailOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-6 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <h3 className="font-bold text-slate-800">Detalhes do Plantio</h3>
              </div>
              <button onClick={() => setIsDetailOpen(false)} className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto max-h-[480px]">
              {/* Origin block */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest">📦 Origem e Compra</h4>
                <p className="text-sm text-slate-700">
                  <span className="font-bold text-slate-500">ID da Compra:</span>{" "}
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    {selectedPlanting.idLote || associatedPurchase?.id || "N/A (Cultura Perene)"}
                  </span>
                </p>
                {associatedPurchase && (
                  <>
                    <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Fornecedor:</span> {associatedPurchase.fornecedor}</p>
                    <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Nota Fiscal:</span> {associatedPurchase.nf}</p>
                    <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Data Compra:</span> {formatToBrazDate(associatedPurchase.data)}</p>
                  </>
                )}
              </div>

              {/* Plant block */}
              <div className="bg-emerald-50/35 p-4 rounded-xl border border-emerald-200/30 space-y-2">
                <h4 className="text-xs font-bold text-emerald-800 uppercase tracking-widest">🌿 Canteiro</h4>
                <p className="text-sm text-slate-700">
                  <span className="font-bold text-slate-500">ID do Plantio:</span>{" "}
                  <span className="font-mono text-xs font-bold text-emerald-800 bg-white px-2 py-0.5 rounded border border-emerald-200">{selectedPlanting.id}</span>
                </p>
                <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Cultura:</span> {selectedPlanting.cultura}</p>
                <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Talhão:</span> {selectedPlanting.talhao}</p>
                <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Data de Plantio:</span> {formatToBrazDate(selectedPlanting.data)}</p>
                <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Quantidade:</span> {selectedPlanting.quantidade} {selectedPlanting.unidade}</p>
                {selectedPlanting.aduboQt ? (
                  <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Adubo:</span> {selectedPlanting.aduboQt} carrinhos • {selectedPlanting.aduboComp}</p>
                ) : null}
              </div>

              {/* Harvest block */}
              <div className="bg-indigo-50/35 p-4 rounded-xl border border-indigo-200/30 space-y-3">
                <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-widest">🍓 Produção Acumulada e Colheitas</h4>
                <ProgressoColheita plantio={selectedPlanting} crops={crops} historico={historico} />
                <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Status atual:</span> <span className="font-bold text-indigo-700">{getStatusLabelAndColor(getCalculatedStatus(selectedPlanting)).label}</span></p>
                {selectedPlanting.status === "Finalizado" && (
                  <>
                    <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Finalizado em:</span> {formatToBrazDate(selectedPlanting.dataFim || "")}</p>
                    <p className="text-sm text-slate-700"><span className="font-bold text-slate-500">Perdas registradas:</span> {selectedPlanting.perdas || 0} {selectedPlanting.unidade}</p>
                    {selectedPlanting.obs && <p className="text-sm text-slate-600 italic bg-white p-2 rounded border border-slate-200">"{selectedPlanting.obs}"</p>}
                  </>
                )}

                {/* IDs das Colheitas */}
                <div className="pt-2 border-t border-indigo-200/50 space-y-1.5">
                  <span className="text-xs font-bold text-indigo-900 block uppercase tracking-wider">
                    Colheitas deste plantio ({colheitasDoPlantio(harvests, selectedPlanting).length}):
                  </span>
                  {colheitasDoPlantio(harvests, selectedPlanting).length === 0 ? (
                    <p className="text-xs text-slate-500 italic bg-white/60 p-2 rounded border border-slate-200/60">
                      Nenhuma colheita registrada para este plantio.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {colheitasDoPlantio(harvests, selectedPlanting)
                        .map((h, idx) => (
                          <div key={h.id || idx} className="text-xs font-mono bg-white p-2.5 rounded-lg border border-indigo-100 flex justify-between items-center text-slate-700 shadow-xs">
                            <div>
                              <span className="font-bold text-indigo-700 block">{h.idSessao || h.id}</span>
                              <span className="text-[10px] text-slate-500 block font-sans">{formatToBrazDate(h.data)}</span>
                            </div>
                            <span className="font-bold text-emerald-600 font-mono text-sm">{h.qtd} {h.unidade || getCropHarvestUnit(selectedPlanting.cultura)}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Modal actions */}
            <div className="p-6 border-t border-slate-200 flex gap-3 bg-slate-50/50">
              {selectedPlanting.status !== "Finalizado" && (
                <CanEdit><button
                  onClick={() => handleOpenFinalize(selectedPlanting.id!)}
                  className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
                >
                  🏁 Finalizar Plantio
                </button></CanEdit>
              )}
              <CanEdit><button
                onClick={handleOpenEdit}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 rounded-xl text-xs transition cursor-pointer"
              >
                ✏️ Editar
              </button></CanEdit>
              <button
                onClick={() => setIsDetailOpen(false)}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl text-xs transition cursor-pointer border border-slate-200"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Edit Planting Modal */}
      {isEditOpen && selectedPlanting && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsEditOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-slate-800">Editar Dados do Plantio</h3>
              <button onClick={() => setIsEditOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Cultura</label>
                <input
                  type="text"
                  value={editCultura}
                  onChange={(e) => setEditCultura(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-sm font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Talhão</label>
                  <input
                    type="text"
                    value={editTalhao}
                    onChange={(e) => setEditTalhao(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-sm font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Planted Qty</label>
                  <input
                    type="number"
                    value={editQt}
                    onChange={(e) => setEditQt(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-sm font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Data do Plantio</label>
                  <input
                    type="date"
                    value={editData}
                    onChange={(e) => setEditData(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-sm font-medium"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Previsão Colheita</label>
                  <input
                    type="date"
                    value={editPrevisao}
                    onChange={(e) => setEditPrevisao(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-sm font-medium"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Status</label>
                  <select
                    value={editStatus}
                    onChange={(e: any) => setEditStatus(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-xs font-bold"
                  >
                    <option value="No campo">No campo (pronto/atrasado é calculado pela previsão)</option>
                    <option value="Colhendo">Em colheita</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Perdas (unid)</label>
                  <input
                    type="number"
                    value={editPerdas}
                    onChange={(e) => setEditPerdas(parseInt(e.target.value) || 0)}
                    className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-sm font-mono font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  Estimativa de colheita ({unidadeColheita(crops, editCultura)}) — para kg, maço etc.
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  value={editEstimativa || ""}
                  onChange={(e) => setEditEstimativa(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-sm font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Observações</label>
                <textarea
                  value={editObs}
                  rows={2}
                  onChange={(e) => setEditObs(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 focus:border-indigo-500 rounded-lg text-xs font-medium"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 bg-slate-50/50">
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
              >
                {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar Alterações
              </button>
              <button
                onClick={() => setIsEditOpen(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-xs transition cursor-pointer border border-slate-200"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Finalize Planting Modal */}
      {isFinalizeOpen && selectedPlanting && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsFinalizeOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-rose-700 flex items-center gap-2">🏁 Finalizar Plantio</h3>
              <button onClick={() => setIsFinalizeOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Data de Encerramento</label>
                <input
                  type="date"
                  value={finData}
                  onChange={(e) => setFinData(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 focus:border-rose-500 rounded-lg text-sm font-medium"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Perdas Totais ({selectedPlanting.unidade})</label>
                <input
                  type="number"
                  value={finPerdas}
                  onChange={(e) => setFinPerdas(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 focus:border-rose-500 rounded-lg text-sm font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Observações Finais</label>
                <textarea
                  placeholder="Relato sobre a colheita, ocorrência de pragas, clima, etc..."
                  value={finObs}
                  rows={3}
                  onChange={(e) => setFinObs(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 focus:border-rose-500 rounded-lg text-xs font-medium"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 bg-slate-50/50">
              <button
                onClick={handleConfirmFinalize}
                disabled={savingFin}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
              >
                {savingFin && <Loader2 className="w-4 h-4 animate-spin" />}
                Confirmar Finalização
              </button>
              <button
                onClick={() => setIsFinalizeOpen(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-lg text-xs transition cursor-pointer border border-slate-200"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
