import React, { useState, useEffect, useRef } from "react";
import { CanEdit, CanFixHarvest, launchStamp } from "../lib/permissions";
import { collection, getDocs, updateDoc, doc, deleteDoc, writeBatch } from "firebase/firestore";
import { db, deleteDocumentRest, writeDocumentRest } from "../lib/firebase";
import { Planting, Harvest, Crop } from "../types";
import { 
  Calendar, 
  AlertCircle, 
  Play, 
  Save, 
  Check, 
  Loader2, 
  ArrowLeftRight, 
  X, 
  Search, 
  Sprout,
  Trash2,
  Edit2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MobileHarvestAppProps {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
  onExitMobile?: () => void;
}

export default function MobileHarvestApp({ onNotify, onExitMobile }: MobileHarvestAppProps) {
  const [plantings, setPlantings] = useState<Planting[]>([]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [initialLoading, setInitialLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Daily Harvest panel states
  const [activeDate, setActiveDate] = useState<string>(new Date().toISOString().split("T")[0]);
  const [modoColheitaAtivo, setModoColheitaAtivo] = useState<boolean>(false);
  const [sessaoColheitaAtual, setSessaoColheitaAtual] = useState<string>("");
  
  // Local inputs map: { plantingId: qty_string }
  const [valoresSessao, setValoresSessao] = useState<{ [key: string]: string }>({});

  // Modals state
  const [selectedPlantingId, setSelectedPlantingId] = useState<string>("");
  const [selectedPlantingCultura, setSelectedPlantingCultura] = useState<string>("");
  const [selectedPlantingTalhao, setSelectedPlantingTalhao] = useState<string>("");
  
  const [isHistoryLogsOpen, setIsHistoryLogsOpen] = useState<boolean>(false);
  const [historicLogs, setHistoricLogs] = useState<Harvest[]>([]);

  const [isEditLogOpen, setIsEditLogOpen] = useState<boolean>(false);
  const [logToEdit, setLogToEdit] = useState<Harvest | null>(null);
  const [editLogQtd, setEditLogQtd] = useState<number>(0);
  const [savingEditLog, setSavingEditLog] = useState<boolean>(false);

  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState<boolean>(false);
  const [logToDelete, setLogToDelete] = useState<Harvest | null>(null);
  const [deletingLog, setDeletingLog] = useState<boolean>(false);

  const [isMudarIDOpen, setIsMudarIDOpen] = useState<boolean>(false);
  const [mudarIDTargetPlanting, setMudarIDTargetPlanting] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterTalhao, setFilterTalhao] = useState<string>("Todos");

  // Keep an ordered list of input refs to allow pressing Enter or Next to advance
  const inputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});

  useEffect(() => {
    fetchData(true);
  }, []);

  const fetchData = async (showInitialSpinner = false) => {
    try {
      if (showInitialSpinner) {
        setInitialLoading(true);
      }
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

      const harvestsSnapshot = await getDocs(collection(db, "harvests"));
      const harvestsList = harvestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Harvest));
      setHarvests(harvestsList);

      const cropsSnapshot = await getDocs(collection(db, "crops"));
      const cropsList = cropsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Crop));
      setCrops(cropsList);
    } catch (err) {
      console.error("Error fetching harvests data:", err);
      onNotify("Erro ao buscar dados de colheita.", "error");
    } finally {
      if (showInitialSpinner) {
        setInitialLoading(false);
      }
    }
  };

  const getCropHarvestUnit = (culturaName: string, fallback?: string): string => {
    if (!culturaName) return fallback || "kg";
    const found = crops.find(c => c.nome.toLowerCase().trim() === culturaName.toLowerCase().trim());
    return found?.unidadeColheita || fallback || "kg";
  };

  const [showNoCampo, setShowNoCampo] = useState<boolean>(false);

  const getCalculatedStatus = (p: Planting) => {
    if (p.status === "Finalizado") return "Finalizado";
    if (p.status === "Colhendo") return "Colhendo";
    if (!p.previsao) return p.status;
    
    const todayStr = new Date().toISOString().split("T")[0];
    const daysDiff = Math.floor((new Date(todayStr).getTime() - new Date(p.previsao).getTime()) / (1000 * 3600 * 24));
    
    if (p.status === "No campo") {
      if (daysDiff >= 15) return "Colheita atrasada";
      if (daysDiff >= 0) return "Esperando colheita";
    }
    return p.status;
  };

  const getGroupCategory = (p: Planting): number => {
    const calcStatus = getCalculatedStatus(p);
    if (calcStatus === "Colheita atrasada") return 2;
    if (calcStatus === "Esperando colheita") return 3;
    if (calcStatus === "No campo") return 4;
    
    if (p.displayInSitio) return 1;

    const isNumeric = !isNaN(Number(p.talhao)) && p.talhao.trim() !== "";
    return isNumeric ? 0 : 1;
  };

  const handleToggleDisplayInSitio = async (planting: Planting) => {
    const targetDocId = planting.docId || planting.id;
    if (!targetDocId) return;
    const newValue = !planting.displayInSitio;
    try {
      const pRef = doc(db, "plantings", targetDocId);
      await updateDoc(pRef, { displayInSitio: newValue });
      
      setPlantings(prev => prev.map(p => (p.id === planting.id || p.docId === targetDocId) ? { ...p, displayInSitio: newValue } : p));
      
      onNotify(
        newValue 
          ? `Canteiro ${planting.id} movido para exibição no Sítio!` 
          : `Canteiro ${planting.id} retornado para Talhões Numéricos.`, 
        "success"
      );
    } catch (err) {
      console.error("Error toggling displayInSitio:", err);
      onNotify("Erro ao alterar exibição no Sítio.", "error");
    }
  };

  const categories = [
    { id: 0, label: "🔢 Talhões Numéricos — Em Colheita", color: "text-emerald-700 bg-emerald-100/60 border-emerald-100" },
    { id: 1, label: "🌿 Sítio — Em Colheita", color: "text-teal-700 bg-teal-100/60 border-teal-100" },
    { id: 2, label: "⚠️ Colheita Atrasada", color: "text-rose-700 bg-rose-100/60 border-rose-100" },
    { id: 3, label: "🕐 Esperando Colheita", color: "text-amber-700 bg-amber-100/60 border-amber-100" },
    { id: 4, label: "🌱 No Campo — Plantios em Desenvolvimento", color: "text-sky-700 bg-sky-100/60 border-sky-100" }
  ];

  const handleIniciarColheitaManual = async (pId: string) => {
    try {
      const pDoc = plantings.find(p => p.id === pId || p.docId === pId);
      const targetDocId = pDoc?.docId || pDoc?.id || pId;
      const docRef = doc(db, "plantings", targetDocId);
      await updateDoc(docRef, { status: "Colhendo" });
      onNotify("Colheita iniciada para o canteiro!", "success");
      fetchData(false);
    } catch (err) {
      console.error("Error setting canteiro to colhendo:", err);
      onNotify("Erro ao iniciar colheita.", "error");
    }
  };

  const handleToggleHistoryLogs = (pId: string, cult: string) => {
    setSelectedPlantingId(pId);
    setSelectedPlantingCultura(cult);
    
    const logs = harvests
      .filter(h => h.idPlantio === pId)
      .sort((a, b) => b.data.localeCompare(a.data));
    
    setHistoricLogs(logs);
    setIsHistoryLogsOpen(true);
  };

  const handleOpenEditLog = (log: Harvest) => {
    setLogToEdit(log);
    setEditLogQtd(log.qtd);
    setIsEditLogOpen(true);
  };

  const handleSaveEditLog = async () => {
    if (!logToEdit || !logToEdit.id) return;

    const diff = editLogQtd - logToEdit.qtd;
    const targetLogId = logToEdit.id;
    const plantingDoc = plantings.find(p => p.id === logToEdit.idPlantio || p.docId === logToEdit.idPlantio);
    const targetDocId = plantingDoc ? (plantingDoc.docId || plantingDoc.id) : null;
    const newQty = editLogQtd;

    try {
      setSavingEditLog(true);

      const batch = writeBatch(db);
      batch.update(doc(db, "harvests", targetLogId), { qtd: newQty });

      if (targetDocId && plantingDoc) {
        const currentTotal = plantingDoc.totalColhido || 0;
        const newTotal = Math.max(0, currentTotal + diff);
        batch.update(doc(db, "plantings", targetDocId), { totalColhido: newTotal });
      }

      await batch.commit();

      setHarvests(prev => prev.map(h => h.id === targetLogId ? { ...h, qtd: newQty } : h));
      setHistoricLogs(prev => prev.map(h => h.id === targetLogId ? { ...h, qtd: newQty } : h));
      if (targetDocId && plantingDoc) {
        setPlantings(prev => prev.map(p => {
          if (p.docId === targetDocId || p.id === targetDocId) {
            return { ...p, totalColhido: Math.max(0, (p.totalColhido || 0) + diff) };
          }
          return p;
        }));
      }

      onNotify("Lançamento ajustado com sucesso!", "success");
      setIsEditLogOpen(false);
      setLogToEdit(null);
    } catch (err) {
      console.error("Error saving edit log:", err);
      try {
        await updateDoc(doc(db, "harvests", targetLogId), { qtd: newQty });
        if (targetDocId && plantingDoc) {
          const currentTotal = plantingDoc.totalColhido || 0;
          const newTotal = Math.max(0, currentTotal + diff);
          await updateDoc(doc(db, "plantings", targetDocId), { totalColhido: newTotal });
        }
        setHarvests(prev => prev.map(h => h.id === targetLogId ? { ...h, qtd: newQty } : h));
        setHistoricLogs(prev => prev.map(h => h.id === targetLogId ? { ...h, qtd: newQty } : h));
        onNotify("Lançamento ajustado com sucesso!", "success");
        setIsEditLogOpen(false);
        setLogToEdit(null);
      } catch (fallbackErr) {
        console.error("Fallback update failed:", fallbackErr);
        onNotify("Erro ao salvar ajuste no banco de dados.", "error");
      }
    } finally {
      setSavingEditLog(false);
    }
  };

  const handleOpenDeleteLog = (log: Harvest) => {
    setLogToDelete(log);
    setIsDeleteConfirmOpen(true);
  };

  const handleConfirmDeleteLog = async () => {
    if (!logToDelete || !logToDelete.id) return;

    const log = logToDelete;
    const deletedId = log.id!;
    const plantingDoc = plantings.find(p => p.id === log.idPlantio || p.docId === log.idPlantio);
    const targetDocId = plantingDoc ? (plantingDoc.docId || plantingDoc.id) : null;

    try {
      setDeletingLog(true);

      const batch = writeBatch(db);
      batch.delete(doc(db, "harvests", deletedId));

      if (targetDocId && plantingDoc) {
        const currentTotal = plantingDoc.totalColhido || 0;
        const newTotal = Math.max(0, currentTotal - log.qtd);
        batch.update(doc(db, "plantings", targetDocId), { totalColhido: newTotal });
      }

      await batch.commit();

      setHarvests(prev => prev.filter(h => h.id !== deletedId));
      setHistoricLogs(prev => prev.filter(h => h.id !== deletedId));
      if (targetDocId && plantingDoc) {
        setPlantings(prev => prev.map(p => {
          if (p.docId === targetDocId || p.id === targetDocId) {
            return { ...p, totalColhido: Math.max(0, (p.totalColhido || 0) - log.qtd) };
          }
          return p;
        }));
      }

      onNotify("Lançamento excluído com sucesso!", "success");
      setIsDeleteConfirmOpen(false);
      setLogToDelete(null);
    } catch (err) {
      console.error("Error deleting log:", err);
      try {
        await deleteDoc(doc(db, "harvests", deletedId));
        if (targetDocId && plantingDoc) {
          const currentTotal = plantingDoc.totalColhido || 0;
          const newTotal = Math.max(0, currentTotal - log.qtd);
          await updateDoc(doc(db, "plantings", targetDocId), { totalColhido: newTotal });
        }
        setHarvests(prev => prev.filter(h => h.id !== deletedId));
        setHistoricLogs(prev => prev.filter(h => h.id !== deletedId));
        onNotify("Lançamento excluído com sucesso!", "success");
        setIsDeleteConfirmOpen(false);
        setLogToDelete(null);
      } catch (fallbackErr) {
        console.error("Fallback delete failed:", fallbackErr);
        onNotify("Erro ao excluir lançamento no banco de dados.", "error");
      }
    } finally {
      setDeletingLog(false);
    }
  };

  const handleOpenMudarID = (pId: string, cult: string, th: string) => {
    setSelectedPlantingId(pId);
    setSelectedPlantingCultura(cult);
    setSelectedPlantingTalhao(th);
    setMudarIDTargetPlanting("");
    setIsMudarIDOpen(true);
  };

  const handleConfirmMudarID = async () => {
    if (!selectedPlantingId) return;
    try {
      const batch = writeBatch(db);
      
      const currentDoc = plantings.find(p => p.id === selectedPlantingId || p.docId === selectedPlantingId);
      const currentDocId = currentDoc?.docId || currentDoc?.id || selectedPlantingId;
      const currentRef = doc(db, "plantings", currentDocId);
      batch.update(currentRef, {
        status: "Finalizado",
        dataFim: activeDate,
        perdas: 0,
        obs: "Finalizado via troca de ID"
      });

      if (mudarIDTargetPlanting) {
        const nextDoc = plantings.find(p => p.id === mudarIDTargetPlanting || p.docId === mudarIDTargetPlanting);
        const nextDocId = nextDoc?.docId || nextDoc?.id || mudarIDTargetPlanting;
        const nextRef = doc(db, "plantings", nextDocId);
        batch.update(nextRef, {
          status: "Colhendo"
        });
      }

      await batch.commit();
      onNotify("ID transferido com sucesso!", "success");
      setIsMudarIDOpen(false);
      fetchData(false);
    } catch (err) {
      console.error("Error swapping planting IDs:", err);
      onNotify("Erro ao transferir ID.", "error");
    }
  };

  const startNewHarvestSession = (): string => {
    const dateForId = activeDate.replace(/-/g, "").substring(2);
    const randomHex = Math.random().toString(36).substring(2, 6).toUpperCase();
    const newSessaoId = `COL-${dateForId}-${randomHex}`;
    setSessaoColheitaAtual(newSessaoId);
    setModoColheitaAtivo(true);
    return newSessaoId;
  };

  // Bulk Save all filled items cleanly at once without disrupting the user's focus
  const handleSaveBulkMassa = async () => {
    let currentSession = sessaoColheitaAtual;
    if (!currentSession) {
      currentSession = startNewHarvestSession();
    }

    const entriesToSave = Object.entries(valoresSessao).filter(([_, valStr]) => {
      const n = parseFloat(valStr as string);
      return !isNaN(n) && n > 0;
    });

    if (entriesToSave.length === 0) {
      onNotify("Nenhuma quantidade preenchida para gravar.", "info");
      return;
    }

    try {
      setIsSaving(true);
      const batch = writeBatch(db);
      let itemsAdded = 0;

      for (const [pId, valStr] of entriesToSave) {
        const numericVal = parseFloat(valStr as string);
        const p = plantings.find(pl => pl.id === pId || pl.docId === pId);
        if (!p) continue;

        // Create log document
        const newLogRef = doc(collection(db, "harvests"));
        const payload: Harvest = {
          idSessao: currentSession,
          idPlantio: pId,
          data: activeDate,
          cultura: p.cultura,
          talhao: p.talhao,
          qtd: numericVal,
          ...launchStamp()
        };
        batch.set(newLogRef, payload);

        // Update planting total
        const targetDocId = p.docId || p.id;
        if (targetDocId) {
          const plantingRef = doc(db, "plantings", targetDocId);
          const currentTotal = p.totalColhido || 0;
          batch.update(plantingRef, {
            totalColhido: currentTotal + numericVal,
            status: "Colhendo"
          });
        }
        itemsAdded++;
      }

      await batch.commit();
      onNotify(`Colheita gravada com sucesso! (${itemsAdded} itens)`, "success");
      setValoresSessao({});
      fetchData(false);
    } catch (err) {
      console.error("Error bulk saving harvests:", err);
      onNotify("Erro ao gravar colheita.", "error");
    } finally {
      setIsSaving(false);
    }
  };

  const handleEncerrarSessao = () => {
    setSessaoColheitaAtual("");
    setModoColheitaAtivo(false);
    setValoresSessao({});
    onNotify("Sessão encerrada com sucesso.", "info");
  };

  const uniqueTalhoes = Array.from(new Set(plantings.map(p => p.talhao).filter(Boolean))).sort();

  const visibleCanteiros = plantings.filter(p => {
    if (p.status === "Finalizado") return false;
    
    // If it is 'No campo' (not delayed, not waiting), only show if showNoCampo is enabled or user searched
    const calcStatus = getCalculatedStatus(p);
    if (calcStatus === "No campo" && !showNoCampo && !searchTerm.trim()) {
      return false;
    }
    
    const matchesSearch = p.cultura.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.id.toLowerCase().includes(searchTerm.toLowerCase());
                          
    const matchesTalhao = filterTalhao === "Todos" || p.talhao === filterTalhao;
    
    return matchesSearch && matchesTalhao;
  });

  // Calculate flatten list of visible inputs for keyboard navigation across all displayed items
  const allOrderedVisibleItems: Planting[] = [];
  categories.forEach(cat => {
    const catItems = visibleCanteiros
      .filter(p => getGroupCategory(p) === cat.id)
      .sort((a, b) => a.cultura.localeCompare(b.cultura, "pt-BR"));
    catItems.forEach(item => {
      allOrderedVisibleItems.push(item);
    });
  });

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, currentPlantingId: string) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      const currentIndex = allOrderedVisibleItems.findIndex(p => p.id === currentPlantingId);
      if (currentIndex !== -1 && currentIndex < allOrderedVisibleItems.length - 1) {
        const nextPlanting = allOrderedVisibleItems[currentIndex + 1];
        const nextInput = inputRefs.current[nextPlanting.id!];
        if (nextInput) {
          nextInput.focus();
          nextInput.select();
        }
      } else if (e.key === "Enter") {
        // If it's the last input, trigger bulk save or blur
        handleSaveBulkMassa();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const currentIndex = allOrderedVisibleItems.findIndex(p => p.id === currentPlantingId);
      if (currentIndex > 0) {
        const prevPlanting = allOrderedVisibleItems[currentIndex - 1];
        const prevInput = inputRefs.current[prevPlanting.id!];
        if (prevInput) {
          prevInput.focus();
          prevInput.select();
        }
      }
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans pb-28">
      
      {/* Mobile Top App Bar */}
      <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 shadow-xs flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-rose-600 flex items-center justify-center text-white shadow-xs">
            <Sprout className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight text-slate-800 leading-tight">Colheita Geranium</h1>
            <p className="text-[10px] text-slate-400 font-medium">Modo Campo / Celular</p>
          </div>
        </div>

        {onExitMobile && (
          <button
            onClick={onExitMobile}
            className="text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 active:scale-95 transition cursor-pointer border border-slate-200"
          >
            Painel Completo
          </button>
        )}
      </header>

      {/* Main Container */}
      <main className="p-3 sm:p-4 max-w-3xl mx-auto space-y-4">
        
        {/* Header Controls (Date + Nova Colheita / Gravar) */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl text-xs text-slate-700 flex-1">
              <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="font-bold">Data:</span>
              <input
                type="date"
                disabled={modoColheitaAtivo}
                value={activeDate}
                onChange={(e) => setActiveDate(e.target.value)}
                className="bg-transparent border-0 outline-none text-slate-800 p-0 text-xs cursor-pointer disabled:opacity-50 font-bold w-full"
              />
            </div>

            {!modoColheitaAtivo ? (
              <button
                onClick={() => {
                  setModoColheitaAtivo(true);
                  if (!sessaoColheitaAtual) startNewHarvestSession();
                }}
                className="flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-700 active:scale-95 text-white font-bold px-4 py-2.5 rounded-xl transition text-xs shadow-xs cursor-pointer whitespace-nowrap"
              >
                🧺 Nova Colheita
              </button>
            ) : (
              <button
                onClick={handleSaveBulkMassa}
                disabled={isSaving}
                className="flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold px-4 py-2.5 rounded-xl transition text-xs shadow-xs cursor-pointer whitespace-nowrap"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gravando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Gravar Colheita
                  </>
                )}
              </button>
            )}
          </div>

          {/* Search & Talhão Filter & No Campo Toggle */}
          <div className="flex flex-col gap-2">
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar por cultura ou ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:border-rose-500 outline-none transition font-semibold text-slate-800"
                />
              </div>
              <div className="w-[130px]">
                <select
                  value={filterTalhao}
                  onChange={(e) => setFilterTalhao(e.target.value)}
                  className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:border-rose-500 outline-none transition font-bold text-slate-700 cursor-pointer"
                >
                  <option value="Todos">Todos Talhões</option>
                  {uniqueTalhoes.map(t => (
                    <option key={t} value={t}>Talhão {t}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNoCampo(prev => !prev)}
              className={`w-full py-1.5 px-3 rounded-xl font-bold text-xs transition border cursor-pointer flex items-center justify-center gap-1.5 ${
                showNoCampo
                  ? "bg-sky-50 text-sky-700 border-sky-300 shadow-3xs"
                  : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
              }`}
            >
              <span>🌱</span>
              <span>{showNoCampo ? "Ocultar plantios 'No Campo'" : "Exibir todos os plantios 'No Campo'"}</span>
            </button>
          </div>

          {/* Active Session Notice Banner */}
          {sessaoColheitaAtual && (
            <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex justify-between items-center text-xs text-amber-900 font-bold">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping shrink-0" />
                <span>Sessão: <span className="font-mono text-amber-700 bg-amber-100/60 px-1.5 py-0.5 rounded">{sessaoColheitaAtual}</span></span>
              </div>
              <button
                onClick={handleEncerrarSessao}
                className="bg-amber-600 hover:bg-amber-700 text-white px-2.5 py-1 rounded-lg text-[11px] font-bold transition cursor-pointer"
              >
                Encerrar
              </button>
            </div>
          )}
        </div>

        {/* Categories and Canteiros List */}
        {initialLoading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
            <Loader2 className="w-8 h-8 text-rose-600 animate-spin" />
            <p className="text-xs text-slate-400 mt-2 font-medium">Carregando canteiros ativos...</p>
          </div>
        ) : visibleCanteiros.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white rounded-2xl border border-slate-200 text-center p-6 shadow-sm">
            <AlertCircle className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum plantio pronto para colheita.</p>
            <p className="text-xs text-slate-400 mt-1">Apenas canteiros com status "Colhendo", "Esperando" ou "Atrasada" aparecem aqui.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {categories.map((cat) => {
              const catItems = visibleCanteiros
                .filter(p => getGroupCategory(p) === cat.id)
                .sort((a, b) => a.cultura.localeCompare(b.cultura, "pt-BR"));
              
              if (catItems.length === 0) return null;

              return (
                <div key={cat.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className={`px-4 py-3 border-b border-slate-200 flex justify-between items-center ${cat.color}`}>
                    <h2 className="text-xs font-black uppercase tracking-wider">{cat.label}</h2>
                    <span className="text-xs font-mono font-bold">({catItems.length})</span>
                  </div>

                  <div className="divide-y divide-slate-100">
                    {catItems.map((p) => {
                      const calcStatus = getCalculatedStatus(p);
                      const isColhendo = calcStatus === "Colhendo";
                      const qtyVal = valoresSessao[p.id!] || "";

                      return (
                        <div key={p.id} className="p-3 sm:p-4 hover:bg-slate-50/50 transition space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono text-[10px] text-slate-500 font-bold bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                  {p.id}
                                </span>
                                <span className="text-xs font-bold px-1.5 py-0.5 rounded bg-slate-50 text-slate-700 border border-slate-200">
                                  Talhão {p.talhao}
                                </span>
                                {(!isNaN(Number(p.talhao)) && p.talhao.trim() !== "") && (
                                  <CanEdit><button
                                    onClick={() => handleToggleDisplayInSitio(p)}
                                    className={`text-[9px] font-bold px-1 py-0.5 rounded border ${
                                      p.displayInSitio
                                        ? "bg-teal-50 text-teal-700 border-teal-200"
                                        : "bg-slate-100 text-slate-500 border-slate-200"
                                    }`}
                                  >
                                    {p.displayInSitio ? "🌿 No Sítio" : "➡️ Mover Sítio"}
                                  </button></CanEdit>
                                )}
                              </div>
                              <h3 className="font-extrabold text-slate-800 text-sm mt-1">
                                {p.cultura}
                              </h3>
                            </div>

                            <div className="text-right">
                              <button
                                onClick={() => handleToggleHistoryLogs(p.id!, p.cultura)}
                                className="text-[11px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2 py-0.5 rounded-full"
                              >
                                {calcStatus}
                              </button>
                              <div className="text-xs font-mono font-bold text-emerald-700 mt-0.5">
                                {p.totalColhido || 0} {getCropHarvestUnit(p.cultura)}
                              </div>
                            </div>
                          </div>

                          {/* Action Row */}
                          <div className="flex items-center justify-between pt-1 gap-2 border-t border-slate-100/60">
                            <span className="text-[10px] text-slate-400">
                              Plantado: {p.quantidade} {p.unidade}
                            </span>

                            <div className="flex items-center gap-2">
                              {modoColheitaAtivo ? (
                                <div className="flex items-center gap-2">
                                  <div className="relative flex items-center">
                                    <input
                                      ref={(el) => (inputRefs.current[p.id!] = el)}
                                      type="number"
                                      inputMode="decimal"
                                      enterKeyHint="next"
                                      placeholder="Qtd"
                                      value={qtyVal}
                                      onChange={(e) => {
                                        const v = e.target.value;
                                        setValoresSessao(prev => ({ ...prev, [p.id!]: v }));
                                      }}
                                      onKeyDown={(e) => handleInputKeyDown(e, p.id!)}
                                      className={`w-24 px-2 py-1.5 pr-8 text-center font-bold border rounded-lg text-xs outline-none transition font-mono text-slate-800 ${
                                        !isColhendo 
                                          ? "border-emerald-300 bg-emerald-50/40 focus:border-emerald-500 focus:bg-white" 
                                          : "border-slate-200 bg-white focus:border-rose-500 focus:ring-1 focus:ring-rose-500"
                                      }`}
                                    />
                                    <span className="absolute right-2 text-[10px] font-extrabold text-slate-400 pointer-events-none">
                                      {getCropHarvestUnit(p.cultura)}
                                    </span>
                                  </div>
                                  {isColhendo ? (
                                    <CanEdit><button
                                      onClick={() => handleOpenMudarID(p.id!, p.cultura, p.talhao)}
                                      className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2 py-1.5 rounded-lg text-xs transition border border-slate-200"
                                      title="Transferir ID"
                                    >
                                      <ArrowLeftRight className="w-3.5 h-3.5" />
                                    </button></CanEdit>
                                  ) : (
                                    <button
                                      onClick={() => handleIniciarColheitaManual(p.id!)}
                                      className="inline-flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2 py-1.5 rounded-lg text-xs transition border border-emerald-300"
                                      title="Iniciar colheita agora"
                                    >
                                      <Play className="w-3 h-3 fill-emerald-800" />
                                      Iniciar
                                    </button>
                                  )}
                                </div>
                              ) : (
                                isColhendo ? (
                                  <CanEdit><button
                                    onClick={() => handleOpenMudarID(p.id!, p.cultura, p.talhao)}
                                    className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition border border-slate-200"
                                  >
                                    <ArrowLeftRight className="w-3.5 h-3.5" />
                                    Mudar ID
                                  </button></CanEdit>
                                ) : (
                                  <button
                                    onClick={() => handleIniciarColheitaManual(p.id!)}
                                    className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition shadow-xs cursor-pointer"
                                  >
                                    <Play className="w-3 h-3 fill-current" />
                                    Iniciar Colheita
                                  </button>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Floating Bottom Bar when Modo Colheita is active */}
      {modoColheitaAtivo && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 backdrop-blur-md border-t border-slate-200 z-40 shadow-lg">
          <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
            <div className="text-xs">
              <span className="text-slate-500 font-medium">Itens preenchidos: </span>
              <span className="font-bold font-mono text-emerald-700">
                {Object.values(valoresSessao).filter(v => parseFloat(v as string) > 0).length}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleEncerrarSessao}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveBulkMassa}
                disabled={isSaving}
                className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl transition shadow-xs flex items-center gap-1.5 active:scale-95"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Gravando...
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    Gravar Colheita
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* History Logs Modal */}
      <AnimatePresence>
        {isHistoryLogsOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl overflow-hidden"
            >
              <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Histórico de Colheitas</h3>
                  <p className="text-xs text-slate-500">{selectedPlantingCultura} (Lote: {selectedPlantingId})</p>
                </div>
                <button
                  onClick={() => setIsHistoryLogsOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-4 max-h-72 overflow-y-auto divide-y divide-slate-100">
                {historicLogs.length === 0 ? (
                  <p className="text-xs text-slate-400 text-center py-4">Nenhuma colheita registrada para este canteiro.</p>
                ) : (
                  historicLogs.map((log) => (
                    <div key={log.id || `${log.data}-${log.qtd}`} className="py-2.5 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-medium text-slate-700 block">{log.data.split("-").reverse().join("/")}</span>
                        <span className="text-[10px] text-slate-400 font-mono">{log.idSessao}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-emerald-700 text-xs mr-1">{log.qtd} {getCropHarvestUnit(selectedPlantingCultura)}</span>
                        <CanFixHarvest record={log}><button
                          onClick={() => handleOpenEditLog(log)}
                          className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition"
                          title="Ajustar quantidade"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button></CanFixHarvest>
                        <CanFixHarvest record={log}><button
                          onClick={() => handleOpenDeleteLog(log)}
                          className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition"
                          title="Excluir este lançamento"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button></CanFixHarvest>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="p-3 bg-slate-50 border-t border-slate-200 text-right">
                <button
                  onClick={() => setIsHistoryLogsOpen(false)}
                  className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Log Modal (Mobile) */}
      <AnimatePresence>
        {isEditLogOpen && logToEdit && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl overflow-hidden space-y-4 p-5"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Ajustar Quantidade Colhida</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {logToEdit.cultura} (Talhão: {logToEdit.talhao})
                  </p>
                </div>
                <button
                  onClick={() => setIsEditLogOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Nova Quantidade ({getCropHarvestUnit(logToEdit.cultura)}):
                </label>
                <input
                  type="number"
                  required
                  min="0.1"
                  step="0.01"
                  value={editLogQtd}
                  onChange={(e) => setEditLogQtd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-800 outline-none focus:border-indigo-500"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditLogOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSaveEditLog}
                  disabled={savingEditLog}
                  className="flex-1 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1"
                >
                  {savingEditLog && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Atualizar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Confirm Delete Single Log Modal (Mobile) */}
      <AnimatePresence>
        {isDeleteConfirmOpen && logToDelete && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl overflow-hidden space-y-4 p-5"
            >
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2 text-rose-600 font-bold">
                  <Trash2 className="w-5 h-5" />
                  <h3 className="text-sm">Excluir Lançamento</h3>
                </div>
                <button
                  onClick={() => !deletingLog && setIsDeleteConfirmOpen(false)}
                  disabled={deletingLog}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <p className="text-slate-600">Deseja realmente remover esta colheita?</p>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Cultura:</span>
                    <span className="font-bold text-slate-800">{logToDelete.cultura}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Talhão:</span>
                    <span className="font-bold text-slate-800">{logToDelete.talhao}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Data:</span>
                    <span className="font-mono font-bold text-slate-800">{logToDelete.data.split("-").reverse().join("/")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Quantidade:</span>
                    <span className="font-mono font-bold text-rose-600">{logToDelete.qtd} {getCropHarvestUnit(logToDelete.cultura)}</span>
                  </div>
                </div>
                <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded-lg border border-amber-200">
                  ⚠️ O acumulado colhido deste canteiro será recalculado automaticamente.
                </p>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsDeleteConfirmOpen(false)}
                  disabled={deletingLog}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteLog}
                  disabled={deletingLog}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs flex items-center justify-center gap-1"
                >
                  {deletingLog && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Sim, Excluir
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Mudar ID Modal */}
      <AnimatePresence>
        {isMudarIDOpen && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white w-full max-w-sm rounded-2xl border border-slate-200 shadow-xl overflow-hidden space-y-4 p-5"
            >
              <div className="flex justify-between items-start">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Mudar ID / Próximo Canteiro</h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Finaliza o canteiro <span className="font-mono font-bold text-rose-600">{selectedPlantingId}</span> e inicia no próximo.
                  </p>
                </div>
                <button
                  onClick={() => setIsMudarIDOpen(false)}
                  className="text-slate-400 hover:text-slate-600 p-1"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider">
                  Selecione o novo canteiro ({selectedPlantingCultura}):
                </label>
                <select
                  value={mudarIDTargetPlanting}
                  onChange={(e) => setMudarIDTargetPlanting(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-rose-500"
                >
                  <option value="">Apenas finalizar sem novo canteiro</option>
                  {plantings
                    .filter(p => p.cultura === selectedPlantingCultura && p.id !== selectedPlantingId && p.status !== "Finalizado")
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        {p.id} (Talhão {p.talhao}) - Status: {p.status}
                      </option>
                    ))}
                </select>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMudarIDOpen(false)}
                  className="flex-1 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmMudarID}
                  className="flex-1 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition shadow-xs"
                >
                  Confirmar Troca
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
