import React, { useState, useEffect } from "react";
import { CanEdit, launchStamp } from "../lib/permissions";
import { collection, getDocs, addDoc, updateDoc, doc, query, where, writeBatch } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Purchase, Crop, Planting } from "../types";
import { Plus, Trash, Search, ArrowLeft, Loader2, Info, ChevronDown, ChevronUp, Check, X, Edit2, Calendar, Filter } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface PurchasesProps {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

interface NewPurchaseItem {
  tipo: "Muda" | "Semente";
  cultura: string;
  quantidade: number;
}

export default function Purchases({ onNotify }: PurchasesProps) {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [search, setSearch] = useState<string>("");
  const [selectedDateFilter, setSelectedDateFilter] = useState<string>("");

  // Form states
  const [compraData, setCompraData] = useState<string>(new Date().toISOString().split("T")[0]);
  const [compraFornecedor, setCompraFornecedor] = useState<string>("");
  const [compraNf, setCompraNf] = useState<string>("");
  const [itens, setItens] = useState<NewPurchaseItem[]>([{ tipo: "Muda", cultura: "", quantidade: 0 }]);
  const [saving, setSaving] = useState<boolean>(false);

  // Edit Purchase States
  const [editingPurchase, setEditingPurchase] = useState<Purchase | null>(null);
  const [editData, setEditData] = useState<string>("");
  const [editFornecedor, setEditFornecedor] = useState<string>("");
  const [editNf, setEditNf] = useState<string>("");
  const [editTipo, setEditTipo] = useState<"Muda" | "Semente">("Muda");
  const [editCultura, setEditCultura] = useState<string>("");
  const [editQuantidade, setEditQuantidade] = useState<number>(0);
  const [editSaldo, setEditSaldo] = useState<number>(0);
  const [editStatus, setEditStatus] = useState<string>("Ativo");
  const [savingEdit, setSavingEdit] = useState<boolean>(false);

  // Zerar Estoque Modal States
  const [selectedPurchaseToZero, setSelectedPurchaseToZero] = useState<Purchase | null>(null);
  const [motivoZerarOption, setMotivoZerarOption] = useState<string>("Mortalidade / Perda no viveiro");
  const [detalhesMotivo, setDetalhesMotivo] = useState<string>("");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      // 1. Fetch crops for dropdowns
      const cropsSnapshot = await getDocs(collection(db, "crops"));
      const cropsList = cropsSnapshot.docs.map(d => d.data() as Crop);
      cropsList.sort((a, b) => a.nome.localeCompare(b.nome));
      setCrops(cropsList);

      // 2. Fetch all inventory purchases
      const purchasesSnapshot = await getDocs(collection(db, "purchases"));
      const list = purchasesSnapshot.docs.map(d => {
        const data = d.data();
        return {
          ...data,
          docId: d.id,
          id: data.id || d.id,
        } as Purchase;
      });

      // Sort newest purchases first
      list.sort((a, b) => parseDateToTimestamp(b.data) - parseDateToTimestamp(a.data));
      setPurchases(list);
    } catch (err) {
      console.error("Error fetching inventory data:", err);
      onNotify("Erro ao buscar dados do estoque.", "error");
    } finally {
      setLoading(false);
    }
  };

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

  const addItemRow = () => {
    setItens([...itens, { tipo: "Muda", cultura: "", quantidade: 0 }]);
  };

  const removeItemRow = (index: number) => {
    if (itens.length > 1) {
      setItens(itens.filter((_, i) => i !== index));
    }
  };

  const updateItemRow = (index: number, field: keyof NewPurchaseItem, value: any) => {
    const updated = [...itens];
    updated[index] = { ...updated[index], [field]: value };
    setItens(updated);
  };

  const handleConfirmZerar = async () => {
    if (!selectedPurchaseToZero) return;
    try {
      const finalMotivo = motivoZerarOption === "Outro motivo"
        ? (detalhesMotivo.trim() || "Outro motivo")
        : (detalhesMotivo.trim() ? `${motivoZerarOption}: ${detalhesMotivo.trim()}` : motivoZerarOption);

      const targetDocId = selectedPurchaseToZero.docId || selectedPurchaseToZero.id;
      await updateDoc(doc(db, "purchases", targetDocId), {
        saldo: 0,
        status: "Esgotado",
        motivoZerar: finalMotivo,
      });

      onNotify(`Estoque do lote ${selectedPurchaseToZero.id} zerado (${finalMotivo})`, "success");
      setSelectedPurchaseToZero(null);
      setDetalhesMotivo("");
      fetchData();
    } catch (err) {
      console.error("Error zeroing stock:", err);
      onNotify("Erro ao zerar estoque.", "error");
    }
  };

  const handleRestaurarSaldo = async (p: Purchase) => {
    try {
      const targetDocId = p.docId || p.id;
      await updateDoc(doc(db, "purchases", targetDocId), {
        saldo: p.quantidade,
        status: "Ativo",
        motivoZerar: null,
      });
      onNotify(`Lote ${p.id} reativado no estoque com saldo de ${p.quantidade}!`, "success");
      fetchData();
    } catch (err) {
      console.error("Error restoring balance:", err);
      onNotify("Erro ao reativar lote.", "error");
    }
  };

  const handleOpenEditPurchase = (p: Purchase) => {
    setEditingPurchase(p);
    setEditData(p.data || new Date().toISOString().split("T")[0]);
    setEditFornecedor(p.fornecedor || "");
    setEditNf(p.nf || "");
    setEditTipo(isSemente(p.tipo) ? "Semente" : "Muda");
    setEditCultura(p.cultura || "");
    setEditQuantidade(p.quantidade || 0);
    setEditSaldo(p.saldo !== undefined ? p.saldo : p.quantidade || 0);
    setEditStatus(p.status || "Ativo");
  };

  const handleSaveEditPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;
    if (!editFornecedor.trim()) {
      onNotify("Informe o fornecedor.", "error");
      return;
    }
    if (!editCultura) {
      onNotify("Selecione a cultura.", "error");
      return;
    }
    if (editQuantidade < 0 || editSaldo < 0) {
      onNotify("Quantidade e saldo não podem ser negativos.", "error");
      return;
    }

    try {
      setSavingEdit(true);
      const targetDocId = editingPurchase.docId || editingPurchase.id;
      
      const newStatus = editSaldo <= 0 ? "Esgotado" : editStatus;

      await updateDoc(doc(db, "purchases", targetDocId), {
        data: editData,
        fornecedor: editFornecedor.trim(),
        nf: editNf.trim() || "S/N",
        tipo: editTipo,
        cultura: editCultura,
        quantidade: Number(editQuantidade),
        saldo: Number(editSaldo),
        status: newStatus,
      });

      onNotify("Compra atualizada com sucesso!", "success");
      setEditingPurchase(null);
      fetchData();
    } catch (err) {
      console.error("Error updating purchase:", err);
      onNotify("Erro ao atualizar a compra.", "error");
    } finally {
      setSavingEdit(false);
    }
  };

  const openForm = () => {
    setCompraData(new Date().toISOString().split("T")[0]);
    setCompraFornecedor("");
    setCompraNf("");
    setItens([{ tipo: "Muda", cultura: "", quantidade: 0 }]);
    setIsFormOpen(true);
  };

  const handleSavePurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compraFornecedor.trim()) {
      onNotify("Informe o fornecedor.", "error");
      return;
    }

    // Validate items
    for (let i = 0; i < itens.length; i++) {
      if (!itens[i].cultura) {
        onNotify(`Selecione a cultura no Item ${i + 1}.`, "error");
        return;
      }
      if (itens[i].quantidade <= 0) {
        onNotify(`A quantidade do Item ${i + 1} deve ser maior que zero.`, "error");
        return;
      }
    }

    try {
      setSaving(true);
      const batch = writeBatch(db);
      const dateForId = compraData.replace(/-/g, "").substring(2); // yyMMdd format

      itens.forEach((item) => {
        const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
        const lotId = `COMP-${dateForId}-${randomHex}`;
        const newDocRef = doc(db, "purchases", lotId);

        const payload: Purchase = {
          id: lotId,
          docId: lotId,
          data: compraData,
          fornecedor: compraFornecedor.trim(),
          nf: compraNf.trim() || "S/N",
          tipo: item.tipo,
          cultura: item.cultura,
          quantidade: Number(item.quantidade),
          saldo: Number(item.quantidade),
          status: "Ativo",
          ...launchStamp(),
        };

        batch.set(newDocRef, payload);
      });

      await batch.commit();
      onNotify(`Compra registrada com sucesso! (${itens.length} itens adicionados)`, "success");
      setIsFormOpen(false);
      fetchData();
    } catch (err) {
      console.error("Error saving purchase note:", err);
      onNotify("Erro ao salvar a compra.", "error");
    } finally {
      setSaving(false);
    }
  };

  const formatToBrazDate = (dateStr?: string) => {
    if (!dateStr) return "-";
    if (dateStr.includes("/")) return dateStr;
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2].substring(0, 2)}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const isSemente = (tipo?: string) => {
    if (!tipo) return false;
    return tipo.toLowerCase().includes("semente");
  };

  const isMuda = (tipo?: string) => {
    if (!tipo) return true;
    return !isSemente(tipo);
  };

  // Filter list by search AND selected date filter
  const matchesSearchAndDate = (p: Purchase) => {
    const matchesQuery = !search.trim() || 
      (p.cultura || "").toLowerCase().includes(search.toLowerCase()) || 
      (p.fornecedor || "").toLowerCase().includes(search.toLowerCase()) ||
      (p.id || "").toLowerCase().includes(search.toLowerCase());

    const matchesDate = !selectedDateFilter || p.data === selectedDateFilter;

    return matchesQuery && matchesDate;
  };

  const activeMudas = purchases.filter(p => 
    isMuda(p.tipo) && 
    (p.status === "Ativo" || !p.status) && 
    (p.saldo === undefined || p.saldo > 0) &&
    matchesSearchAndDate(p)
  );

  const activeSementes = purchases.filter(p => 
    isSemente(p.tipo) && 
    (p.status === "Ativo" || !p.status) && 
    (p.saldo === undefined || p.saldo > 0) &&
    matchesSearchAndDate(p)
  );

  const inactivePurchases = purchases.filter(p => 
    (p.status === "Esgotado" || (p.saldo !== undefined && p.saldo <= 0)) &&
    matchesSearchAndDate(p)
  );

  const dateFilteredAllItems = selectedDateFilter
    ? purchases.filter(p => p.data === selectedDateFilter)
    : [];

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {!isFormOpen ? (
          <motion.div
            key="list-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Header section */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
              <div>
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Estoque e Compras</h1>
                <p className="text-slate-500 text-sm mt-1">Gerencie suas entradas de mudas e sementes, consulte compras por data e atualize valores.</p>
              </div>
              <button
                onClick={openForm}
                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-xs transition duration-150 self-stretch sm:self-auto justify-center cursor-pointer"
              >
                <Plus className="w-5 h-5" />
                Nova Compra
              </button>
            </div>

            {/* Quick search and Date Filter bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-stretch md:items-center gap-4">
              <div className="flex items-center gap-3 flex-1 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  placeholder="Filtrar estoque por cultura, fornecedor ou lote..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full text-xs text-slate-800 placeholder-slate-400 bg-transparent border-0 outline-none focus:ring-0"
                />
              </div>

              <div className="flex items-center gap-2.5 bg-slate-50 p-2 rounded-xl border border-slate-200 shrink-0">
                <Calendar className="w-4 h-4 text-emerald-600 shrink-0 ml-1" />
                <label className="text-xs font-bold text-slate-600 shrink-0 whitespace-nowrap">Filtrar por Data:</label>
                <input
                  type="date"
                  value={selectedDateFilter}
                  onChange={(e) => setSelectedDateFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-emerald-500"
                />
                {selectedDateFilter && (
                  <button
                    onClick={() => setSelectedDateFilter("")}
                    className="px-2.5 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-lg transition cursor-pointer"
                    title="Limpar filtro de data"
                  >
                    Ver Todas
                  </button>
                )}
              </div>
            </div>

            {/* Selected Date Summary Card if filtering by date */}
            {selectedDateFilter && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-emerald-950 text-white p-5 rounded-2xl border border-emerald-800/80 shadow-md space-y-3"
              >
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 border-b border-emerald-800/60 pb-3">
                  <div className="flex items-center gap-2.5">
                    <Calendar className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="font-bold text-sm text-emerald-100">
                        Compras do Dia: <span className="text-white text-base font-black">{formatToBrazDate(selectedDateFilter)}</span>
                      </h3>
                      <p className="text-xs text-emerald-300">
                        Exibindo todos os {dateFilteredAllItems.length} itens adquiridos nesta data.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedDateFilter("")}
                    className="text-xs font-bold bg-emerald-800/80 hover:bg-emerald-800 text-emerald-100 px-3 py-1.5 rounded-lg transition"
                  >
                    Limpar Filtro
                  </button>
                </div>

                {dateFilteredAllItems.length === 0 ? (
                  <p className="text-xs text-emerald-300 py-2">Nenhuma compra encontrada para a data selecionada ({formatToBrazDate(selectedDateFilter)}).</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
                    {dateFilteredAllItems.map(p => (
                      <div key={p.id} className="bg-emerald-900/60 border border-emerald-700/50 p-3.5 rounded-xl space-y-2">
                        <div className="flex justify-between items-start">
                          <div>
                            <span className="text-[10px] font-mono text-emerald-400 font-bold block">{p.id}</span>
                            <span className="font-bold text-sm text-white">{p.cultura}</span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${p.status === "Esgotado" ? "bg-rose-950 text-rose-300 border border-rose-800" : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"}`}>
                            {p.status || "Ativo"}
                          </span>
                        </div>
                        <div className="text-xs text-emerald-200 space-y-0.5">
                          <p><span className="text-emerald-400 font-semibold">Tipo:</span> {p.tipo}</p>
                          <p><span className="text-emerald-400 font-semibold">Fornecedor:</span> {p.fornecedor}</p>
                          <p><span className="text-emerald-400 font-semibold">NF:</span> {p.nf}</p>
                          <p><span className="text-emerald-400 font-semibold">Qtde / Saldo:</span> {p.quantidade} / <strong className="text-white font-mono">{p.saldo}</strong></p>
                        </div>
                        <div className="pt-2 flex items-center justify-end gap-2 border-t border-emerald-800/50">
                          <CanEdit><button
                            onClick={() => handleOpenEditPurchase(p)}
                            className="bg-emerald-700 hover:bg-emerald-600 text-white font-bold px-2.5 py-1 rounded-lg text-xs transition cursor-pointer flex items-center gap-1"
                          >
                            <Edit2 className="w-3 h-3" />
                            Editar
                          </button></CanEdit>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                <p className="text-sm text-slate-400 mt-2">Carregando dados de estoque...</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Seedlings Stock (Mudas) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-200 bg-emerald-50/10">
                    <h2 className="text-sm font-bold text-emerald-800 uppercase tracking-widest flex items-center gap-2">
                      🌱 Mudas em Estoque <span className="font-mono text-xs text-emerald-600 font-bold">({activeMudas.length})</span>
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <th className="p-4">Lote / Data</th>
                          <th className="p-4">Cultura</th>
                          <th className="p-4">Fornecedor</th>
                          <th className="p-4 text-center">Saldo</th>
                          <th className="p-4 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeMudas.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400 text-xs font-semibold">
                              Nenhuma muda ativa encontrada.
                            </td>
                          </tr>
                        ) : (
                          activeMudas.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-4">
                                <span className="text-[10px] font-mono block text-slate-400 font-bold">{p.id}</span>
                                <span className="text-xs text-slate-500 font-medium">{formatToBrazDate(p.data)}</span>
                              </td>
                              <td className="p-4 font-bold text-slate-800">{p.cultura}</td>
                              <td className="p-4 text-slate-500 text-xs font-medium">{p.fornecedor}</td>
                              <td className="p-4 text-center text-emerald-600 font-black font-mono text-sm">
                                {p.saldo.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">unid</span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <CanEdit><button
                                    onClick={() => handleOpenEditPurchase(p)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer border border-slate-200 flex items-center gap-1"
                                    title="Alterar dados e valores da compra"
                                  >
                                    <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                                    Editar
                                  </button></CanEdit>
                                  <CanEdit><button
                                    onClick={() => {
                                      setSelectedPurchaseToZero(p);
                                      setMotivoZerarOption("Mortalidade / Perda no viveiro");
                                      setDetalhesMotivo("");
                                    }}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer border border-rose-100"
                                  >
                                    Zerar
                                  </button></CanEdit>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Seeds Stock (Sementes) */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="p-5 border-b border-slate-200 bg-indigo-50/10">
                    <h2 className="text-sm font-bold text-indigo-800 uppercase tracking-widest flex items-center gap-2">
                      🌰 Sementes em Estoque <span className="font-mono text-xs text-indigo-600 font-bold">({activeSementes.length})</span>
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm border-collapse">
                      <thead>
                        <tr className="bg-slate-50/50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          <th className="p-4">Lote / Data</th>
                          <th className="p-4">Cultura</th>
                          <th className="p-4">Fornecedor</th>
                          <th className="p-4 text-center">Quantidade / Saldo</th>
                          <th className="p-4 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {activeSementes.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="p-8 text-center text-slate-400 text-xs font-semibold">
                              Nenhuma semente ativa encontrada.
                            </td>
                          </tr>
                        ) : (
                          activeSementes.map((p) => (
                            <tr key={p.id} className="hover:bg-slate-50/50 transition">
                              <td className="p-4">
                                <span className="text-[10px] font-mono block text-slate-400 font-bold">{p.id}</span>
                                <span className="text-xs text-slate-500 font-medium">{formatToBrazDate(p.data)}</span>
                              </td>
                              <td className="p-4 font-bold text-slate-800">{p.cultura}</td>
                              <td className="p-4 text-slate-500 text-xs font-medium">{p.fornecedor}</td>
                              <td className="p-4 text-center text-indigo-600 font-black font-mono text-sm">
                                {p.saldo.toLocaleString()} <span className="text-[10px] font-normal text-slate-400">em estoque</span>
                              </td>
                              <td className="p-4 text-right">
                                <div className="flex items-center justify-end gap-1.5">
                                  <CanEdit><button
                                    onClick={() => handleOpenEditPurchase(p)}
                                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer border border-slate-200 flex items-center gap-1"
                                    title="Alterar dados e valores da compra"
                                  >
                                    <Edit2 className="w-3.5 h-3.5 text-slate-600" />
                                    Editar
                                  </button></CanEdit>
                                  <CanEdit><button
                                    onClick={() => {
                                      setSelectedPurchaseToZero(p);
                                      setMotivoZerarOption("Estoque finalizado / Consumo total");
                                      setDetalhesMotivo("");
                                    }}
                                    className="bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition duration-150 cursor-pointer border border-rose-100"
                                  >
                                    Zerar
                                  </button></CanEdit>
                                </div>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Spent Lots / Planted History */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setIsHistoryOpen(!isHistoryOpen)}
                    className="w-full p-4 flex justify-between items-center text-left hover:bg-slate-100/50 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Info className="w-5 h-5 text-slate-500" />
                      <span className="font-bold text-slate-700 text-sm">📦 Histórico: Lotes Esgotados / Plantados ({inactivePurchases.length})</span>
                    </div>
                    {isHistoryOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
                  </button>

                  <AnimatePresence>
                    {isHistoryOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-slate-200 overflow-x-auto"
                      >
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="bg-slate-100 border-b border-slate-200 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                              <th className="p-3">Lote / Data</th>
                              <th className="p-3">Cultura</th>
                              <th className="p-3">Tipo / Fornecedor</th>
                              <th className="p-3">Motivo / Obs</th>
                              <th className="p-3 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-150">
                            {inactivePurchases.length === 0 ? (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-slate-400 font-semibold">
                                  Nenhum histórico disponível.
                                </td>
                              </tr>
                            ) : (
                              inactivePurchases.map((p) => (
                                <tr key={p.id} className="hover:bg-slate-100/30 transition text-slate-500">
                                  <td className="p-3 font-mono font-medium">{p.id}<br/>{formatToBrazDate(p.data)}</td>
                                  <td className="p-3 font-bold text-slate-700">{p.cultura}</td>
                                  <td className="p-3 font-medium">{p.tipo} - <span className="text-slate-500">{p.fornecedor}</span></td>
                                  <td className="p-3 text-xs">
                                    <span className="font-semibold text-slate-600 block">{p.motivoZerar || "Lote Plantado / Esgotado"}</span>
                                  </td>
                                  <td className="p-3 text-right">
                                    <div className="flex items-center justify-end gap-1.5">
                                      <CanEdit><button
                                        onClick={() => handleOpenEditPurchase(p)}
                                        className="bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-2 py-1 rounded text-[11px] transition cursor-pointer border border-slate-300/60 flex items-center gap-1"
                                        title="Alterar dados e valores"
                                      >
                                        <Edit2 className="w-3 h-3 text-slate-600" />
                                        Editar
                                      </button></CanEdit>
                                      <CanEdit><button
                                        onClick={() => handleRestaurarSaldo(p)}
                                        className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-2 py-1 rounded text-[11px] transition cursor-pointer border border-emerald-100/40"
                                        title="Reativar e restaurar saldo no estoque"
                                      >
                                        Restaurar
                                      </button></CanEdit>
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            )}

            {/* Edit Purchase Modal */}
            <AnimatePresence>
              {editingPurchase && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
                  <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-white w-full max-w-lg rounded-2xl border border-slate-200 shadow-xl overflow-hidden space-y-4 p-6"
                  >
                    <div className="flex justify-between items-start border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-bold text-slate-800">Alterar Compra / Atualizar Valores</h3>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Lote <span className="font-mono font-bold text-emerald-700">{editingPurchase.id}</span>
                        </p>
                      </div>
                      <button
                        onClick={() => setEditingPurchase(null)}
                        className="text-slate-400 hover:text-slate-600 p-1"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>

                    <form onSubmit={handleSaveEditPurchase} className="space-y-4 text-xs">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Data da Compra</label>
                          <input
                            type="date"
                            required
                            value={editData}
                            onChange={(e) => setEditData(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-emerald-500 font-medium"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Tipo de Entrada</label>
                          <select
                            value={editTipo}
                            onChange={(e) => setEditTipo(e.target.value as "Muda" | "Semente")}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-emerald-500 font-semibold"
                          >
                            <option value="Muda">Muda</option>
                            <option value="Semente">Semente</option>
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Fornecedor</label>
                          <input
                            type="text"
                            required
                            value={editFornecedor}
                            onChange={(e) => setEditFornecedor(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-emerald-500 font-medium"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Nota Fiscal (NF)</label>
                          <input
                            type="text"
                            value={editNf}
                            onChange={(e) => setEditNf(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-emerald-500 font-medium"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Cultura</label>
                        <select
                          required
                          value={editCultura}
                          onChange={(e) => setEditCultura(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-emerald-500 font-semibold"
                        >
                          <option value="" disabled>Selecione a cultura...</option>
                          {crops.map((c) => (
                            <option key={c.nome} value={c.nome}>
                              {c.nome}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="grid grid-cols-3 gap-3">
                        <div className="space-y-1">
                          <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Qtde Inicial</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={editQuantidade}
                            onChange={(e) => setEditQuantidade(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Saldo Atual</label>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            required
                            value={editSaldo}
                            onChange={(e) => setEditSaldo(parseFloat(e.target.value) || 0)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono font-bold text-slate-800 outline-none focus:border-emerald-500"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="block font-bold text-slate-600 uppercase tracking-wider text-[10px]">Status</label>
                          <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl font-semibold text-slate-800 outline-none focus:border-emerald-500"
                          >
                            <option value="Ativo">Ativo</option>
                            <option value="Esgotado">Esgotado</option>
                          </select>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-3 border-t border-slate-100">
                        <button
                          type="button"
                          onClick={() => setEditingPurchase(null)}
                          className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition cursor-pointer"
                        >
                          Cancelar
                        </button>
                        <button
                          type="submit"
                          disabled={savingEdit}
                          className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition cursor-pointer shadow-xs flex items-center justify-center gap-2"
                        >
                          {savingEdit && <Loader2 className="w-4 h-4 animate-spin" />}
                          {savingEdit ? "Salvando..." : "Salvar Alterações"}
                        </button>
                      </div>
                    </form>
                  </motion.div>
                </div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="form-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-3xl mx-auto"
          >
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Form header */}
              <div className="p-6 border-b border-slate-200 flex items-center gap-4 bg-slate-50/50">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">Registrar Nova Compra</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Informe as mudas ou sementes adquiridas para atualizar o estoque.</p>
                </div>
              </div>

              {/* Form body */}
              <form onSubmit={handleSavePurchase} className="p-6 space-y-6">
                
                {/* Note Details */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Data da Compra
                    </label>
                    <input
                      type="date"
                      required
                      value={compraData}
                      onChange={(e) => setCompraData(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none transition"
                    />
                  </div>

                  <div className="space-y-1.5 sm:col-span-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Fornecedor
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="Ex: Viveiro Flora Real"
                      value={compraFornecedor}
                      onChange={(e) => setCompraFornecedor(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none transition"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 max-w-sm">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Número da Nota Fiscal (NF) <span className="text-slate-400 font-normal font-sans">(Opcional)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: 004.281"
                    value={compraNf}
                    onChange={(e) => setCompraNf(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none transition"
                  />
                </div>

                <hr className="border-slate-100" />

                {/* Items Container */}
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Itens Adquiridos</h3>
                    <button
                      type="button"
                      onClick={addItemRow}
                      className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs px-3 py-2 rounded-lg transition cursor-pointer border border-emerald-100/30"
                    >
                      + Adicionar Item
                    </button>
                  </div>

                  <div className="space-y-4">
                    {itens.map((item, idx) => (
                      <div
                        key={idx}
                        className="bg-slate-50 p-4 rounded-xl border border-slate-200 relative space-y-4"
                      >
                        {/* Remove item button */}
                        {itens.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeItemRow(idx)}
                            className="absolute top-3 right-3 text-rose-500 hover:text-rose-700 text-xs font-bold transition cursor-pointer"
                          >
                            Excluir
                          </button>
                        )}

                        <div className="font-extrabold text-[10px] text-slate-400 uppercase tracking-widest">Item {idx + 1}</div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                          
                          {/* Item Type */}
                          <div className="space-y-2">
                            <span className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Tipo</span>
                            <div className="flex items-center gap-4 bg-white px-3 py-2 border border-slate-200 rounded-lg">
                              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-semibold">
                                <input
                                  type="radio"
                                  name={`item-tipo-${idx}`}
                                  checked={item.tipo === "Muda"}
                                  onChange={() => updateItemRow(idx, "tipo", "Muda")}
                                  className="text-emerald-600 focus:ring-emerald-500"
                                />
                                Muda
                              </label>
                              <label className="flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer font-semibold">
                                <input
                                  type="radio"
                                  name={`item-tipo-${idx}`}
                                  checked={item.tipo === "Semente"}
                                  onChange={() => updateItemRow(idx, "tipo", "Semente")}
                                  className="text-emerald-600 focus:ring-emerald-500"
                                />
                                Semente
                              </label>
                            </div>
                          </div>

                          {/* Item Crop selection */}
                          <div className="space-y-1.5 md:col-span-2">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                              Cultura
                            </label>
                            <select
                              required
                              value={item.cultura}
                              onChange={(e) => updateItemRow(idx, "cultura", e.target.value)}
                              className="w-full px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-semibold"
                            >
                              <option value="" disabled>Selecione a cultura...</option>
                              {crops.map((c) => (
                                <option key={c.nome} value={c.nome}>
                                  {c.nome}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Item Quantity */}
                          <div className="space-y-1.5">
                            <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                              {item.tipo === "Muda" ? "Qtde (unid)" : "Qtde / Gramas (g)"}
                            </label>
                            <input
                              type="number"
                              required
                              min="0.1"
                              step="0.01"
                              value={item.quantidade || ""}
                              onChange={(e) => updateItemRow(idx, "quantidade", Math.max(0, parseFloat(e.target.value) || 0))}
                              className="w-full px-3 py-2 bg-white border border-slate-200 text-xs font-mono font-bold text-slate-800 rounded-lg outline-none focus:border-emerald-500"
                            />
                          </div>

                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Form submit footer */}
                <div className="flex gap-4 pt-4 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-xs transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                    {saving ? "Salvando Nota..." : "Salvar Compra"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsFormOpen(false)}
                    className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-3 px-4 rounded-xl transition cursor-pointer border border-slate-200"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
