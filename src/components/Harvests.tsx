import React, { useState, useEffect, useRef, useMemo } from "react";
import { CanEdit, CanFixHarvest, launchStamp } from "../lib/permissions";
import { calcularHistorico,
  statusCalculado, grupoColheita, GRUPOS_COLHEITA, hojeLocal, novoIdSessao, encontrarPlantio,
  colheitasDoPlantio, verificarLimite, lancarColheitas, ajustarColheita, excluirColheitas,
  iniciarColheita, mudarIdColheita, ItemColheita, formatarData
} from "../lib/producao";
import ProgressoColheita from "./ProgressoColheita";
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc, writeBatch, query, where } from "firebase/firestore";
import { db, deleteDocumentRest, writeDocumentRest } from "../lib/firebase";
import { Planting, Harvest, Crop } from "../types";
import { Calendar, AlertCircle, Play, Save, ChevronRight, ChevronDown, Check, Loader2, ArrowLeftRight, Trash2, Edit2, Clock, X, Smartphone, QrCode } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface HarvestsProps {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

export default function Harvests({ onNotify }: HarvestsProps) {
  const [plantings, setPlantings] = useState<Planting[]>([]);
  // Rendimento médio dos plantios finalizados, para estimar kg/maço sem digitar nada.
  const historico = useMemo(() => calcularHistorico(plantings), [plantings]);
  const [harvests, setHarvests] = useState<Harvest[]>([]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<"daily" | "history">("daily");

  // Daily Harvest panel states
  const [activeDate, setActiveDate] = useState<string>(hojeLocal());
  const [modoColheitaAtivo, setModoColheitaAtivo] = useState<boolean>(false);
  const [sessaoColheitaAtual, setSessaoColheitaAtual] = useState<string>("");
  
  // Local inputs map for active session: { plantingId: qty_string }
  const [valoresSessao, setValoresSessao] = useState<{ [key: string]: string }>({});
  // Status feedback map: { plantingId: "idle" | "saving" | "saved" }
  const [inputFeedback, setInputFeedback] = useState<{ [key: string]: "idle" | "saving" | "saved" }>({});
  
  // History nav states
  const [mesAtual, setMesAtual] = useState<Date>(new Date());
  const [openSessoes, setOpenSessoes] = useState<{ [key: string]: boolean }>({});

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

  const [isDeleteSessionConfirmOpen, setIsDeleteSessionConfirmOpen] = useState<boolean>(false);
  const [sessionToDelete, setSessionToDelete] = useState<{ idSessao: string; logs: Harvest[] } | null>(null);
  const [deletingSession, setDeletingSession] = useState<boolean>(false);

  const [isMudarIDOpen, setIsMudarIDOpen] = useState<boolean>(false);
  const [mudarIDTargetPlanting, setMudarIDTargetPlanting] = useState<string>("");

  const [searchTerm, setSearchTerm] = useState<string>("");
  const [filterTalhao, setFilterTalhao] = useState<string>("Todos");

  const debounceTimers = useRef<{ [key: string]: NodeJS.Timeout }>({});

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async (showSpinner = true) => {
    try {
      if (showSpinner) {
        setLoading(true);
      }
      // Fetch canteiros
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

      // Fetch harvests
      const harvestsSnapshot = await getDocs(collection(db, "harvests"));
      const harvestsList = harvestsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Harvest));
      setHarvests(harvestsList);

      // Fetch crops for unit lookup
      const cropsSnapshot = await getDocs(collection(db, "crops"));
      const cropsList = cropsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Crop));
      setCrops(cropsList);
    } catch (err) {
      console.error("Error fetching harvests data:", err);
      onNotify("Erro ao buscar dados de colheita.", "error");
    } finally {
      if (showSpinner) {
        setLoading(false);
      }
    }
  };

  const getCropHarvestUnit = (culturaName: string, fallback?: string): string => {
    if (!culturaName) return fallback || "kg";
    const found = crops.find(c => c.nome.toLowerCase().trim() === culturaName.toLowerCase().trim());
    return found?.unidadeColheita || fallback || "kg";
  };

  const getCalculatedStatus = (p: Planting) => statusCalculado(p);

  const [showNoCampo, setShowNoCampo] = useState<boolean>(false);
  const [atrasadosAbertos, setAtrasadosAbertos] = useState<boolean>(false);

  // Groupings for daily list:
  // 0: Talhões Numéricos (Colhendo)
  // 1: Sítio (Colhendo)
  // 2: Colheita atrasada
  // 3: Esperando colheita
  // 4: No campo (se ativado)
  const getGroupCategory = (p: Planting): number => grupoColheita(p);

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

  const categories = GRUPOS_COLHEITA;

  const handleIniciarColheitaManual = async (pId: string) => {
    const p = encontrarPlantio(plantings, pId);
    if (!p) return;
    try {
      await iniciarColheita(p);
      onNotify("Colheita iniciada para o canteiro!", "success");
      fetchData(false);
    } catch (err) {
      console.error("Error starting harvest:", err);
      onNotify("Erro ao iniciar colheita.", "error");
    }
  };

  const handleToggleHistoryLogs = (pId: string, cult: string) => {
    setSelectedPlantingId(pId);
    setSelectedPlantingCultura(cult);
    const p = encontrarPlantio(plantings, pId);
    setHistoricLogs(p ? colheitasDoPlantio(harvests, p) : harvests.filter(h => h.idPlantio === pId));
    setIsHistoryLogsOpen(true);
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
    const atual = encontrarPlantio(plantings, selectedPlantingId);
    if (!atual) return;
    const proximo = mudarIDTargetPlanting ? encontrarPlantio(plantings, mudarIDTargetPlanting) || null : null;
    try {
      await mudarIdColheita(atual, proximo, hojeLocal());
      onNotify(
        proximo
          ? `Colheita de ${atual.id} encerrada. ${proximo.id} agora está em colheita.`
          : `Colheita de ${atual.id} encerrada.`,
        "success"
      );
      setIsMudarIDOpen(false);
      fetchData(false);
    } catch (err) {
      console.error("Error swapping planting IDs:", err);
      onNotify("Erro ao trocar o ID da colheita.", "error");
    }
  };

  const startNewHarvestSession = (): string => {
    const newSessaoId = novoIdSessao(activeDate);
    setSessaoColheitaAtual(newSessaoId);
    setModoColheitaAtivo(true);
    setValoresSessao({});
    return newSessaoId;
  };

  // Mudas/unidades: bloqueia se passar do plantado. Kg, maço etc.: avisa.
  const confirmarLimites = (itens: ItemColheita[]): boolean => {
    const avisos: string[] = [];
    for (const { plantio, qtd } of itens) {
      const r = verificarLimite(plantio, crops, qtd, historico);
      if (r.tipo === "bloqueado") {
        onNotify(r.mensagem, "error");
        return false;
      }
      if (r.tipo === "aviso") avisos.push(r.mensagem);
    }
    if (avisos.length > 0) {
      return window.confirm(`${avisos.join("\n")}\n\nGravar mesmo assim?`);
    }
    return true;
  };



  const handleSaveBulkMassa = async () => {
    const itens = Object.entries(valoresSessao)
      .map(([pId, v]) => ({ plantio: encontrarPlantio(plantings, pId), qtd: parseFloat(v as string) }))
      .filter((i): i is ItemColheita => !!i.plantio && i.qtd > 0);
    if (itens.length === 0) {
      onNotify("Nenhuma quantidade preenchida para gravar.", "info");
      return;
    }
    if (!confirmarLimites(itens)) return;
    const sessao = sessaoColheitaAtual || startNewHarvestSession();
    try {
      const n = await lancarColheitas(itens, crops, sessao, activeDate);
      onNotify(`Colheita gravada com sucesso! (${n} lançamentos)`, "success");
      setValoresSessao({});
      fetchData(false);
    } catch (err) {
      console.error("Error bulk saving harvests:", err);
      onNotify("Erro ao gravar colheita. Nada foi gravado.", "error");
    }
  };

  const handleEncerrarSessao = () => {
    setSessaoColheitaAtual("");
    setModoColheitaAtivo(false);
    setValoresSessao({});
    onNotify("Sessão encerrada com sucesso.", "info");
  };

  // Nav month utilities
  const handleNavMonth = (direction: number) => {
    const nextDate = new Date(mesAtual);
    nextDate.setMonth(nextDate.getMonth() + direction);
    setMesAtual(nextDate);
  };

  const formatMonthLabel = (): string => {
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
    ];
    return `${months[mesAtual.getMonth()]} ${mesAtual.getFullYear()}`;
  };

  const toggleSessaoAccordion = (sId: string) => {
    setOpenSessoes(prev => ({ ...prev, [sId]: !prev[sId] }));
  };

  // Log Adjustments
  const handleOpenEditLog = (log: Harvest) => {
    setLogToEdit(log);
    setEditLogQtd(log.qtd);
    setIsEditLogOpen(true);
  };

  const handleSaveEditLog = async () => {
    if (!logToEdit || !logToEdit.id) return;
    const novaQtd = Number(editLogQtd) || 0;
    if (novaQtd <= 0) {
      onNotify("Informe uma quantidade maior que zero. Para remover, use excluir.", "error");
      return;
    }
    const plantio = encontrarPlantio(plantings, logToEdit.idPlantio);
    if (plantio && !confirmarLimites([{ plantio, qtd: novaQtd - (Number(logToEdit.qtd) || 0) }])) return;
    try {
      setSavingEditLog(true);
      await ajustarColheita(logToEdit, novaQtd, plantings);
      setHistoricLogs(prev => prev.map(h => h.id === logToEdit.id ? { ...h, qtd: novaQtd } : h));
      onNotify("Lançamento ajustado com sucesso!", "success");
      setIsEditLogOpen(false);
      setLogToEdit(null);
      fetchData(false);
    } catch (err) {
      console.error("Error saving edit log:", err);
      onNotify("Erro ao salvar o ajuste. Nada foi alterado.", "error");
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
    const deletedId = logToDelete.id;
    try {
      setDeletingLog(true);
      await excluirColheitas([logToDelete], plantings);
      setHistoricLogs(prev => prev.filter(h => h.id !== deletedId));
      onNotify("Lançamento excluído com sucesso!", "success");
      setIsDeleteConfirmOpen(false);
      setLogToDelete(null);
      fetchData(false);
    } catch (err) {
      console.error("Error deleting log:", err);
      onNotify("Erro ao excluir o lançamento. Nada foi alterado.", "error");
    } finally {
      setDeletingLog(false);
    }
  };

  const handleOpenDeleteSession = (idSessao: string, logs: Harvest[]) => {
    setSessionToDelete({ idSessao, logs });
    setIsDeleteSessionConfirmOpen(true);
  };

  const handleConfirmDeleteSession = async () => {
    if (!sessionToDelete || sessionToDelete.logs.length === 0) return;
    const { idSessao, logs } = sessionToDelete;
    try {
      setDeletingSession(true);
      await excluirColheitas(logs, plantings);
      onNotify(`Sessão ${idSessao} excluída com sucesso!`, "success");
      setIsDeleteSessionConfirmOpen(false);
      setSessionToDelete(null);
      fetchData(false);
    } catch (err) {
      console.error("Error deleting session:", err);
      onNotify("Erro ao excluir a sessão. Nada foi alterado.", "error");
    } finally {
      setDeletingSession(false);
    }
  };

  // Filter canteiros that are actively on list
  // Plantings that are Finalizado are strictly ignored
  const uniqueTalhoes = Array.from(new Set(plantings.map(p => p.talhao).filter(Boolean))).sort();

  const visibleCanteiros = plantings.filter(p => {
    if (p.status === "Finalizado") return false;
    
    // If it is 'No campo' (not delayed, not waiting), only show if showNoCampo is enabled or user searched
    const calcStatus = getCalculatedStatus(p);
    if ((calcStatus === "No campo" || calcStatus === "Pronto para colher") && !showNoCampo && !searchTerm.trim()) {
      return false;
    }
    
    const matchesSearch = p.cultura.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          p.id.toLowerCase().includes(searchTerm.toLowerCase());
                          
    const matchesTalhao = filterTalhao === "Todos" || p.talhao === filterTalhao;
    
    return matchesSearch && matchesTalhao;
  });

  // Nav Month history calculations
  const targetYear = mesAtual.getFullYear();
  const targetMonth = mesAtual.getMonth() + 1; // 1-indexed

  const monthlyHarvests = harvests.filter(h => {
    const parts = h.data.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]);
      return year === targetYear && month === targetMonth;
    }
    return false;
  });

  // Group monthly logs by day and then by session ID
  const logsByDay: { [date: string]: { [sessao: string]: Harvest[] } } = {};
  monthlyHarvests.forEach(h => {
    if (!logsByDay[h.data]) {
      logsByDay[h.data] = {};
    }
    if (!logsByDay[h.data][h.idSessao]) {
      logsByDay[h.data][h.idSessao] = [];
    }
    logsByDay[h.data][h.idSessao].push(h);
  });

  const sortedDays = Object.keys(logsByDay).sort().reverse();

  return (
    <div className="space-y-6">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">Painel de Colheita Diária</h1>
          <p className="text-slate-500 text-sm mt-1">Lançamento de colheitas, sessões acumuladas e ajustes de histórico.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto font-bold">
          {viewMode === "daily" && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-xl text-sm text-slate-700">
              <Calendar className="w-4 h-4 text-slate-500" />
              <span>Data:</span>
              <input
                type="date"
                disabled={modoColheitaAtivo}
                value={activeDate}
                onChange={(e) => setActiveDate(e.target.value)}
                className="bg-transparent border-0 outline-none text-slate-800 p-0 text-sm cursor-pointer disabled:opacity-50 font-bold"
              />
            </div>
          )}

          <button
            onClick={() => {
              // Build link with current pathname to support subpaths like GitHub Pages (https://user.github.io/repo-name/)
              const url = new URL(window.location.href);
              url.searchParams.set("mode", "mobile_harvest");
              navigator.clipboard?.writeText(url.toString());
              onNotify("Link do App Mobile copiado! Abra no celular para instalar.", "success");
            }}
            className="flex items-center justify-center gap-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-2.5 rounded-xl transition text-xs border border-emerald-200 cursor-pointer"
            title="Copiar link para abrir no celular"
          >
            <Smartphone className="w-4 h-4" />
            <span>Link p/ Celular</span>
          </button>

          <button
            onClick={() => {
              setViewMode(viewMode === "daily" ? "history" : "daily");
              setModoColheitaAtivo(false);
              setSessaoColheitaAtual("");
            }}
            className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-4 py-2.5 rounded-xl transition text-sm cursor-pointer border border-slate-200"
          >
            <Clock className="w-4 h-4" />
            {viewMode === "daily" ? "Histórico / Ajustes" : "Voltar ao Painel"}
          </button>

          {viewMode === "daily" && !modoColheitaAtivo && (
            <button
              onClick={() => setModoColheitaAtivo(true)}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-700 text-white font-bold px-4 py-2.5 rounded-xl transition text-sm cursor-pointer shadow-xs"
            >
              🧺 Nova Colheita
            </button>
          )}

          {viewMode === "daily" && modoColheitaAtivo && (
            <button
              onClick={handleSaveBulkMassa}
              className="flex-1 md:flex-none flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-xl transition text-sm shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              Gravar Colheita
            </button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        
        {viewMode === "daily" ? (
          <motion.div
            key="daily-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Filters Bar */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-4">
              <div className="flex-1 w-full relative">
                <input
                  type="text"
                  placeholder="🔍 Buscar por cultura ou ID do canteiro..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:bg-white focus:border-rose-500 outline-none transition font-semibold text-slate-800"
                />
              </div>
              <div className="w-full md:w-[180px]">
                <select
                  value={filterTalhao}
                  onChange={(e) => setFilterTalhao(e.target.value)}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:border-rose-500 outline-none transition font-bold text-slate-700 cursor-pointer"
                >
                  <option value="Todos">Todos os Talões</option>
                  {uniqueTalhoes.map(t => (
                    <option key={t} value={t}>Talhão {t}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setShowNoCampo(prev => !prev)}
                className={`w-full md:w-auto px-3.5 py-2.5 rounded-xl font-bold text-xs transition border cursor-pointer flex items-center justify-center gap-2 ${
                  showNoCampo
                    ? "bg-sky-50 text-sky-700 border-sky-300"
                    : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <span>🌱</span>
                <span>{showNoCampo ? "Ocultar prontos e no campo" : "Ver prontos para colher e no campo"}</span>
              </button>
            </div>

            {/* Active session banner */}
            {sessaoColheitaAtual && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex justify-between items-center text-sm text-amber-900 font-bold shadow-3xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-ping" />
                  <span>Sessão Ativa: <span className="font-mono font-bold text-amber-700 bg-amber-100/50 px-2 py-0.5 rounded">{sessaoColheitaAtual}</span></span>
                </div>
                <button
                  onClick={handleEncerrarSessao}
                  className="bg-amber-600 hover:bg-amber-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  Encerrar Sessão
                </button>
              </div>
            )}

            {/* List Table Grouped by Category */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <Loader2 className="w-10 h-10 text-rose-600 animate-spin" />
                <p className="text-sm text-slate-400 mt-2">Buscando canteiros ativos...</p>
              </div>
            ) : plantings.filter(p => p.status !== "Finalizado" && p.status !== "No campo").length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 text-center p-6 shadow-sm">
                <AlertCircle className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum plantio pronto para colheita.</p>
                <p className="text-xs text-slate-400 mt-1">Aqui aparecem os canteiros em colheita e, minimizados, os atrasados. Use "Ver prontos para colher e no campo" para iniciar outros.</p>
              </div>
            ) : visibleCanteiros.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 text-center p-6 shadow-sm">
                <AlertCircle className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum plantio encontrado.</p>
                <p className="text-xs text-slate-400 mt-1">Tente ajustar seus termos de busca ou filtros.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {categories.map((cat) => {
                  const catItems = visibleCanteiros
                    .filter(p => getGroupCategory(p) === cat.id)
                    .sort((a, b) => a.cultura.localeCompare(b.cultura, "pt-BR"));
                  if (catItems.length === 0) return null;

                  return (
                    <div key={cat.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                      <div
                        onClick={() => cat.minimizado && setAtrasadosAbertos(v => !v)}
                        className={`p-4 border-b border-slate-200 flex justify-between items-center ${cat.color} ${cat.minimizado ? "cursor-pointer select-none" : ""}`}
                      >
                        <h2 className="text-xs font-black uppercase tracking-widest">{cat.label}</h2>
                        <span className="text-xs font-mono font-bold">
                          ({catItems.length}){cat.minimizado ? (atrasadosAbertos ? " ▲" : " ▼") : ""}
                        </span>
                      </div>
                      <div className={`overflow-x-auto ${cat.minimizado && !atrasadosAbertos ? "hidden" : ""}`}>
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <th className="p-4">Canteiro ID / Cultura</th>
                              <th className="p-4 text-center">Talhão</th>
                              <th className="p-4 text-center">Previsão</th>
                              <th className="p-4 text-center">Colhido / falta</th>
                              <th className="p-4 text-right w-[200px]">Lançar Qtd</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {catItems.map((p) => {
                              const calcStatus = getCalculatedStatus(p);
                              const isColhendo = calcStatus === "Colhendo";
                              
                              const qtyVal = valoresSessao[p.id!] || "";
                              const inputState = inputFeedback[p.id!] || "idle";

                              return (
                                <tr key={p.id} className="hover:bg-slate-50/30 transition">
                                  <td className="p-4">
                                    <span className="font-mono text-[10px] text-slate-400 font-bold block">{p.id}</span>
                                    <span className="font-bold text-slate-800 text-sm block">{p.cultura}</span>
                                    <span className="text-[10px] text-slate-400 font-medium">Tipo: {p.tipo}</span>
                                  </td>
                                  <td className="p-4 text-center">
                                    <span className="font-bold text-slate-700 block">{p.talhao}</span>
                                    {(!isNaN(Number(p.talhao)) && p.talhao.trim() !== "") && (
                                      <CanEdit><button
                                        onClick={() => handleToggleDisplayInSitio(p)}
                                        title={p.displayInSitio ? "Voltar para grupo de Talhões Numéricos" : "Exibir no grupo Sítio sem alterar o número do talhão"}
                                        className={`mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded transition cursor-pointer border inline-flex items-center gap-1 ${
                                          p.displayInSitio
                                            ? "bg-teal-50 text-teal-700 border-teal-200 hover:bg-teal-100"
                                            : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-800"
                                        }`}
                                      >
                                        {p.displayInSitio ? "🌿 No Sítio (Restaurar)" : "➡️ Mover p/ Sítio"}
                                      </button></CanEdit>
                                    )}
                                  </td>
                                  <td className="p-4 text-center">
                                    <button
                                      onClick={() => handleToggleHistoryLogs(p.id!, p.cultura)}
                                      className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-100 px-2.5 py-1 rounded-full hover:bg-rose-100 transition cursor-pointer"
                                    >
                                      {calcStatus}
                                    </button>
                                    <span className="text-[10px] text-slate-400 font-medium block mt-1">Prev: {p.previsao ? p.previsao.split("-").reverse().slice(0, 2).join("/") : "—"}</span>
                                  </td>
                                  <td className="p-4 text-center text-xs">
                                    <ProgressoColheita plantio={p} crops={crops} historico={historico} />
                                    <div className="text-[10px] text-slate-400 font-sans mt-1">
                                      Plantado: {p.quantidade} {p.unidade === "m²" ? "m²" : "mudas"}
                                    </div>
                                  </td>
                                  <td className="p-4 text-right">
                                    {modoColheitaAtivo ? (
                                      <div className="flex items-center gap-2 justify-end">
                                        <div className="relative flex items-center">
                                          <input
                                            type="number"
                                            placeholder="Qtd"
                                            value={qtyVal}
                                            onChange={(e) => setValoresSessao(prev => ({ ...prev, [p.id!]: e.target.value }))}
                                            className={`w-24 px-2 py-1.5 pl-2 pr-8 text-center font-bold border rounded-lg text-xs outline-none transition font-mono text-slate-800 ${
                                              !isColhendo 
                                                ? "border-emerald-300 bg-emerald-50/40 focus:border-emerald-500 focus:bg-white" 
                                                : "border-slate-200 bg-white focus:border-rose-500"
                                            }`}
                                          />
                                          <span className="absolute right-2 text-[10px] font-extrabold text-slate-400 pointer-events-none">
                                            {getCropHarvestUnit(p.cultura)}
                                          </span>
                                        </div>
                                        {isColhendo ? (
                                          <CanEdit><button
                                            onClick={() => handleOpenMudarID(p.id!, p.cultura, p.talhao)}
                                            className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer border border-slate-200"
                                            title="Trocar ID do canteiro"
                                          >
                                            <ArrowLeftRight className="w-3 h-3" />
                                            Troca ID
                                          </button></CanEdit>
                                        ) : (
                                          <button
                                            onClick={() => handleIniciarColheitaManual(p.id!)}
                                            className="inline-flex items-center gap-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 font-bold px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer border border-emerald-300"
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
                                          className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-2.5 py-1.5 rounded-lg text-xs transition cursor-pointer border border-slate-200"
                                        >
                                          <ArrowLeftRight className="w-3 h-3" />
                                          Troca ID
                                        </button></CanEdit>
                                      ) : (
                                        <button
                                          onClick={() => handleIniciarColheitaManual(p.id!)}
                                          className="inline-flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs transition cursor-pointer shadow-xs"
                                        >
                                          <Play className="w-3 h-3 fill-white" />
                                          Iniciar Colheita
                                        </button>
                                      )
                                    )}
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
        ) : (
          <motion.div
            key="history-panel"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Nav Month controller */}
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200 shadow-sm max-w-sm mx-auto font-bold">
              <button onClick={() => handleNavMonth(-1)} className="p-2 hover:bg-slate-150 rounded-lg transition text-slate-500 hover:text-slate-700 cursor-pointer">◀</button>
              <span className="font-bold text-slate-800 text-sm">{formatMonthLabel()}</span>
              <button onClick={() => handleNavMonth(1)} className="p-2 hover:bg-slate-150 rounded-lg transition text-slate-500 hover:text-slate-700 cursor-pointer">▶</button>
            </div>

            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <Loader2 className="w-10 h-10 text-rose-600 animate-spin" />
                <p className="text-sm text-slate-400 mt-2">Buscando histórico...</p>
              </div>
            ) : sortedDays.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-6">
                <AlertCircle className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhum registro encontrado para este mês.</p>
                <p className="text-xs text-slate-400 mt-1">Sessões de colheitas gravadas aparecerão agrupadas aqui.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedDays.map((day) => {
                  const sessoesMap = logsByDay[day];
                  const [year, month, dNum] = day.split("-");
                  const dayDisplay = `${dNum}/${month}/${year}`;
                  const totalDayQty = Object.values(sessoesMap).flat().reduce((s, h) => s + h.qtd, 0);

                  return (
                    <div key={day} className="space-y-3">
                      <div className="flex justify-between items-center border-b border-slate-200 pb-2">
                        <span className="font-bold text-indigo-900 text-sm">📅 {dayDisplay}</span>
                        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">Total: {totalDayQty}</span>
                      </div>

                      <div className="grid grid-cols-1 gap-3">
                        {Object.entries(sessoesMap).map(([sId, logs]) => {
                          const isAccordionOpen = openSessoes[sId] ?? false;
                          const totalSessaoQty = logs.reduce((s, h) => s + h.qtd, 0);

                          return (
                            <div key={sId} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-3xs">
                              {/* Accordion Trigger */}
                              <div className="w-full p-4 flex justify-between items-center hover:bg-slate-50/50 transition text-left">
                                <button
                                  onClick={() => toggleSessaoAccordion(sId)}
                                  className="flex-1 flex justify-between items-center text-left cursor-pointer pr-4"
                                >
                                  <div className="space-y-0.5">
                                    <span className="text-[10px] font-mono text-slate-400 block font-bold">{sId}</span>
                                    <span className="text-xs font-bold text-slate-700">{logs.length} canteiro{logs.length > 1 ? "s" : ""} colhido{logs.length > 1 ? "s" : ""}</span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="font-extrabold text-emerald-600 text-sm">{totalSessaoQty} total</span>
                                    {isAccordionOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                                  </div>
                                </button>
                                <CanEdit><button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenDeleteSession(sId, logs);
                                  }}
                                  className="p-1.5 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded-lg transition cursor-pointer"
                                  title="Excluir sessão inteira"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button></CanEdit>
                              </div>

                              {/* Accordion Content */}
                              <AnimatePresence>
                                {isAccordionOpen && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-slate-100 divide-y divide-slate-150 bg-slate-50/35"
                                  >
                                    {logs.map((log) => (
                                      <div key={log.id} className="p-3.5 flex justify-between items-center text-xs">
                                        <div>
                                          <span className="font-bold text-slate-800 text-sm block">{log.cultura}</span>
                                          <span className="text-[10px] text-slate-400 font-bold">Talhão: {log.talhao} • Plantio: {log.idPlantio}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          <span className="font-bold text-slate-900 font-mono text-sm mr-1">{log.qtd} {getCropHarvestUnit(log.cultura)}</span>
                                          <CanFixHarvest record={log}><button
                                            onClick={() => handleOpenEditLog(log)}
                                            className="p-1.5 hover:bg-indigo-50 text-indigo-600 rounded-lg transition cursor-pointer"
                                            title="Editar quantidade da colheita"
                                          >
                                            <Edit2 className="w-3.5 h-3.5" />
                                          </button></CanFixHarvest>
                                          <CanFixHarvest record={log}><button
                                            onClick={() => handleOpenDeleteLog(log)}
                                            className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg transition cursor-pointer"
                                            title="Excluir este lançamento"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button></CanFixHarvest>
                                        </div>
                                      </div>
                                    ))}
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

      </AnimatePresence>

      {/* Modal: Past Harvest Logs */}
      {isHistoryLogsOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsHistoryLogsOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-md w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <div>
                <span className="text-[10px] font-mono text-slate-400 block font-bold">{selectedPlantingId}</span>
                <h3 className="font-bold text-slate-800">{selectedPlantingCultura} (Colheitas Registradas)</h3>
              </div>
              <button onClick={() => setIsHistoryLogsOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 max-h-[320px] overflow-y-auto">
              {historicLogs.length === 0 ? (
                <p className="text-xs text-slate-400 italic text-center py-6 font-medium">Nenhuma colheita registrada para este canteiro.</p>
              ) : (
                <table className="w-full text-left text-xs divide-y divide-slate-150">
                  <thead>
                    <tr className="text-slate-400 font-extrabold uppercase tracking-widest text-[10px]">
                      <th className="pb-2">Data</th>
                      <th className="pb-2 text-right">Qtd Colhida</th>
                      <th className="pb-2 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono font-bold">
                    {historicLogs.map((log) => (
                      <tr key={log.id || `${log.data}-${log.qtd}`}>
                        <td className="py-2.5 text-slate-600">
                          <div>{log.data.split("-").reverse().join("/")}</div>
                          <span className="text-[9px] text-slate-400 font-normal font-sans block">{log.idSessao}</span>
                        </td>
                        <td className="py-2.5 text-right text-emerald-600">{log.qtd} {getCropHarvestUnit(selectedPlantingCultura)}</td>
                        <td className="py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5 font-sans">
                            <CanFixHarvest record={log}><button
                              onClick={() => handleOpenEditLog(log)}
                              className="p-1 hover:bg-indigo-50 text-indigo-600 rounded transition cursor-pointer"
                              title="Editar quantidade"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button></CanFixHarvest>
                            <CanFixHarvest record={log}><button
                              onClick={() => handleOpenDeleteLog(log)}
                              className="p-1 hover:bg-rose-50 text-rose-600 rounded transition cursor-pointer"
                              title="Excluir este lançamento"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button></CanFixHarvest>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="p-5 border-t border-slate-200 bg-slate-50/50">
              <button
                onClick={() => setIsHistoryLogsOpen(false)}
                className="w-full bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-xl text-xs transition cursor-pointer border border-slate-200"
              >
                Fechar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: Edit log quantity */}
      {isEditLogOpen && logToEdit && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsEditLogOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-indigo-900">Ajustar Quantidade Colhida</h3>
              <button onClick={() => setIsEditLogOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 font-semibold">
                Cultura: <span className="font-bold text-slate-800">{logToEdit.cultura}</span> • Talhão: <span className="font-bold text-slate-800">{logToEdit.talhao}</span>
              </p>
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                  Nova Quantidade ({getCropHarvestUnit(logToEdit.cultura)})
                </label>
                <input
                  type="number"
                  required
                  min="0.1"
                  step="0.01"
                  value={editLogQtd}
                  onChange={(e) => setEditLogQtd(Math.max(0, parseFloat(e.target.value) || 0))}
                  className="w-full px-4 py-2 bg-white border border-slate-200 rounded-lg font-mono font-bold text-slate-800 text-sm focus:bg-white focus:border-indigo-500 outline-none"
                />
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 bg-slate-50/50">
              <button
                onClick={handleSaveEditLog}
                disabled={savingEditLog}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-xs transition flex items-center justify-center gap-1 cursor-pointer"
              >
                {savingEditLog && <Loader2 className="w-4 h-4 animate-spin" />}
                Atualizar
              </button>
              <button
                onClick={() => setIsEditLogOpen(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-xs transition cursor-pointer border border-slate-200"
              >
                Sair
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: Confirm Delete Single Log */}
      {isDeleteConfirmOpen && logToDelete && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => !deletingLog && setIsDeleteConfirmOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-5 border-b border-rose-100 bg-rose-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700 font-bold">
                <Trash2 className="w-5 h-5 text-rose-600" />
                <h3>Excluir Colheita</h3>
              </div>
              <button
                onClick={() => !deletingLog && setIsDeleteConfirmOpen(false)}
                disabled={deletingLog}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tem certeza que deseja excluir o seguinte lançamento de colheita?
              </p>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Cultura:</span>
                  <span className="font-bold text-slate-800">{logToDelete.cultura}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Talhão:</span>
                  <span className="font-bold text-slate-800">{logToDelete.talhao}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Data:</span>
                  <span className="font-mono font-bold text-slate-800">{logToDelete.data.split("-").reverse().join("/")}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Quantidade:</span>
                  <span className="font-mono font-bold text-rose-600">{logToDelete.qtd} {getCropHarvestUnit(logToDelete.cultura)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-slate-200 text-[10px]">
                  <span className="text-slate-400 font-semibold">ID Plantio:</span>
                  <span className="font-mono text-slate-500">{logToDelete.idPlantio}</span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800">
                ⚠️ A quantidade colhida será subtraída automaticamente do acumulado do canteiro.
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 bg-slate-50/50">
              <button
                onClick={handleConfirmDeleteLog}
                disabled={deletingLog}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {deletingLog && <Loader2 className="w-4 h-4 animate-spin" />}
                Sim, Excluir
              </button>
              <button
                onClick={() => setIsDeleteConfirmOpen(false)}
                disabled={deletingLog}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer border border-slate-200"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: Confirm Delete Session */}
      {isDeleteSessionConfirmOpen && sessionToDelete && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => !deletingSession && setIsDeleteSessionConfirmOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-5 border-b border-rose-100 bg-rose-50/50 flex items-center justify-between">
              <div className="flex items-center gap-2 text-rose-700 font-bold">
                <Trash2 className="w-5 h-5 text-rose-600" />
                <h3>Excluir Sessão Inteira</h3>
              </div>
              <button
                onClick={() => !deletingSession && setIsDeleteSessionConfirmOpen(false)}
                disabled={deletingSession}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3.5">
              <p className="text-xs text-slate-600 leading-relaxed">
                Tem certeza que deseja excluir todos os lançamentos da sessão <span className="font-mono font-bold text-slate-800">{sessionToDelete.idSessao}</span>?
              </p>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Total de Itens:</span>
                  <span className="font-bold text-slate-800">{sessionToDelete.logs.length} canteiro(s)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Quantidade Total:</span>
                  <span className="font-mono font-bold text-rose-600">
                    {sessionToDelete.logs.reduce((s, h) => s + h.qtd, 0)}
                  </span>
                </div>
              </div>

              <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-[11px] text-amber-800">
                ⚠️ Todos os itens desta sessão serão removidos e as quantidades serão subtraídas dos seus respectivos canteiros.
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 bg-slate-50/50">
              <button
                onClick={handleConfirmDeleteSession}
                disabled={deletingSession}
                className="flex-1 bg-rose-600 hover:bg-rose-700 text-white font-bold py-2.5 rounded-xl text-xs transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
              >
                {deletingSession && <Loader2 className="w-4 h-4 animate-spin" />}
                Sim, Excluir Sessão
              </button>
              <button
                onClick={() => setIsDeleteSessionConfirmOpen(false)}
                disabled={deletingSession}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 rounded-xl text-xs transition cursor-pointer border border-slate-200"
              >
                Cancelar
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal: Swap Planting ID (Mudar ID) */}
      {isMudarIDOpen && (
        <div className="fixed inset-0 z-50 overflow-hidden flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={() => setIsMudarIDOpen(false)} />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-3xl max-w-sm w-full overflow-hidden shadow-2xl relative z-10 border border-slate-200"
          >
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50/50">
              <h3 className="font-bold text-indigo-900">Mudar ID da colheita</h3>
              <button onClick={() => setIsMudarIDOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer"><X className="w-5 h-5" /></button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-slate-500 font-semibold">
                Encerra a colheita de <span className="font-mono font-bold text-slate-800">{selectedPlantingId}</span>: ele vai para Finalizados com a data de hoje, e as colheitas dele ficam no histórico do plantio e do lote de compra. O canteiro escolhido abaixo passa a ficar em colheita.
              </p>
              
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest">Próximo canteiro de colheita</label>
                <select
                  value={mudarIDTargetPlanting}
                  onChange={(e) => setMudarIDTargetPlanting(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 text-xs text-slate-800 rounded-lg outline-none focus:border-emerald-500 font-semibold"
                >
                  <option value="">Só encerrar, sem começar outro canteiro</option>
                  {plantings
                    .filter(p => p.cultura === selectedPlantingCultura && p.id !== selectedPlantingId && p.status !== "Finalizado")
                    .map(p => (
                      <option key={p.id} value={p.id}>
                        Talhão: {p.talhao} - Prev: {p.previsao ? p.previsao.split("-").reverse().slice(0, 2).join("/") : "N/A"}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 flex gap-3 bg-slate-50/50 font-bold">
              <button
                onClick={handleConfirmMudarID}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-xs transition cursor-pointer"
              >
                Confirmar Troca
              </button>
              <button
                onClick={() => setIsMudarIDOpen(false)}
                className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 rounded-lg text-xs transition cursor-pointer border border-slate-200"
              >
                Sair
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
