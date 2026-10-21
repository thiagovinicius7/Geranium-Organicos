import React, { useState, useEffect } from "react";
import { CanEdit } from "../lib/permissions";
import { 
  collection, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  setDoc 
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { LicenseRecord, LicenseType } from "../types";
import { 
  X, 
  Award, 
  Droplets, 
  Leaf, 
  FileText, 
  Calendar, 
  Plus, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  Clock, 
  Building2, 
  Hash, 
  Search, 
  Filter, 
  ShieldCheck,
  Check,
  Sparkles
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface LicensesModalProps {
  isOpen: boolean;
  onClose: () => void;
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
  onLicensesUpdated?: () => void;
}

const PRESET_TEMPLATES = [
  {
    label: "Selo Orgânico (IBD/MAPA)",
    titulo: "Selo Orgânico Certificado",
    orgaoEmissor: "IBD Certificações",
    tipo: "Selo Orgânico" as LicenseType,
    numeroRegistro: "IBD-ORG-0842",
    observacoes: "Certificação de produção orgânica vegetal conforme normas do MAPA."
  },
  {
    label: "Outorga de Água (ADASA/ANA)",
    titulo: "Outorga de Direito de Uso da Água",
    orgaoEmissor: "ADASA / ANA",
    tipo: "Outorga de Água" as LicenseType,
    numeroRegistro: "ADASA-OUT-2024/09",
    observacoes: "Captação de água para irrigação de canteiros e manejo orgânico."
  },
  {
    label: "CAR - Cadastro Ambiental Rural",
    titulo: "Cadastro Ambiental Rural (CAR)",
    orgaoEmissor: "SICAR / IBRAM-DF",
    tipo: "CAR" as LicenseType,
    numeroRegistro: "DF-5300108-CAR",
    observacoes: "Regularização ambiental do imóvel rural e áreas de reserva legal."
  },
  {
    label: "Licença Ambiental (IBRAM)",
    titulo: "Licença Ambiental Simplificada",
    orgaoEmissor: "IBRAM-DF",
    tipo: "Licença Ambiental" as LicenseType,
    numeroRegistro: "IBRAM-LAS-2023/45",
    observacoes: "Licença de operação para atividade agropecuária sustentável."
  },
  {
    label: "Alvará Sanitário / Funcionamento",
    titulo: "Alvará Sanitário de Funcionamento",
    orgaoEmissor: "Vigilância Sanitária DF",
    tipo: "Alvará" as LicenseType,
    numeroRegistro: "ALV-SAN-2024/77",
    observacoes: "Autorização para manipulação e embalagem de hortaliças frescas."
  },
  {
    label: "Laudo de Análise de Água / Solo",
    titulo: "Laudo de Potabilidade e Qualidade da Água",
    orgaoEmissor: "Laboratório de Análises Ambientais",
    tipo: "Laudo Técnico" as LicenseType,
    numeroRegistro: "LAUDO-AGUA-2025/11",
    observacoes: "Análise microbiológica e físico-química da água de irrigação."
  }
];

export default function LicensesModal({ isOpen, onClose, onNotify, onLicensesUpdated }: LicensesModalProps) {
  const [licenses, setLicenses] = useState<LicenseRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [activeTab, setActiveTab] = useState<"list" | "form">("list");
  
  // Form state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [titulo, setTitulo] = useState<string>("");
  const [orgaoEmissor, setOrgaoEmissor] = useState<string>("");
  const [tipo, setTipo] = useState<LicenseType>("Selo Orgânico");
  const [numeroRegistro, setNumeroRegistro] = useState<string>("");
  const [dataEmissao, setDataEmissao] = useState<string>("");
  const [dataValidade, setDataValidade] = useState<string>("");
  const [responsavel, setResponsavel] = useState<string>("");
  const [observacoes, setObservacoes] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  // Search and filter
  const [search, setSearch] = useState<string>("");
  const [filterType, setFilterType] = useState<string>("todos");
  
  // Delete confirm state
  const [licenseToDelete, setLicenseToDelete] = useState<LicenseRecord | null>(null);
  const [deleting, setDeleting] = useState<boolean>(false);

  useEffect(() => {
    if (isOpen) {
      fetchLicenses();
    }
  }, [isOpen]);

  const fetchLicenses = async () => {
    try {
      setLoading(true);
      const snapshot = await getDocs(collection(db, "licenses"));
      const list: LicenseRecord[] = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        docId: docSnap.id,
        ...docSnap.data()
      } as LicenseRecord));

      // Sort: Expired first, then closest expiration
      list.sort((a, b) => {
        return (a.dataValidade || "").localeCompare(b.dataValidade || "");
      });

      setLicenses(list);
    } catch (err) {
      console.error("Error fetching licenses:", err);
      onNotify("Erro ao carregar documentos e licenças.", "error");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingId(null);
    setTitulo("");
    setOrgaoEmissor("");
    setTipo("Selo Orgânico");
    setNumeroRegistro("");
    setDataEmissao("");
    setDataValidade("");
    setResponsavel("");
    setObservacoes("");
  };

  const handleOpenNew = () => {
    resetForm();
    setActiveTab("form");
  };

  const handleEdit = (lic: LicenseRecord) => {
    setEditingId(lic.id || lic.docId || null);
    setTitulo(lic.titulo || "");
    setOrgaoEmissor(lic.orgaoEmissor || "");
    setTipo(lic.tipo || "Outro");
    setNumeroRegistro(lic.numeroRegistro || "");
    setDataEmissao(lic.dataEmissao || "");
    setDataValidade(lic.dataValidade || "");
    setResponsavel(lic.responsavel || "");
    setObservacoes(lic.observacoes || "");
    setActiveTab("form");
  };

  const handleApplyPreset = (preset: typeof PRESET_TEMPLATES[0]) => {
    setTitulo(preset.titulo);
    setOrgaoEmissor(preset.orgaoEmissor);
    setTipo(preset.tipo);
    setNumeroRegistro(preset.numeroRegistro);
    setObservacoes(preset.observacoes);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!titulo.trim()) {
      onNotify("Informe o título do documento ou licença.", "error");
      return;
    }
    if (!orgaoEmissor.trim()) {
      onNotify("Informe o órgão emissor ou certificadora.", "error");
      return;
    }
    if (!dataValidade.trim()) {
      onNotify("Informe a data de validade / renovação.", "error");
      return;
    }

    try {
      setSaving(true);

      const licenseData: Partial<LicenseRecord> = {
        titulo: titulo.trim(),
        orgaoEmissor: orgaoEmissor.trim(),
        tipo,
        numeroRegistro: numeroRegistro.trim(),
        dataEmissao: dataEmissao.trim() || undefined,
        dataValidade: dataValidade.trim(),
        responsavel: responsavel.trim() || undefined,
        observacoes: observacoes.trim() || undefined,
        ativo: true
      };

      if (editingId) {
        // Update existing license
        await updateDoc(doc(db, "licenses", editingId), licenseData);
        onNotify("Licença / Documento atualizado com sucesso!", "success");
      } else {
        // Create new license
        const newDocRef = await addDoc(collection(db, "licenses"), licenseData);
        licenseData.id = newDocRef.id;
        licenseData.docId = newDocRef.id;
        onNotify("Nova data de licença cadastrada com sucesso!", "success");
      }

      // If this is a Selo Orgânico, also sync with global metadata/geranium
      if (tipo === "Selo Orgânico" || titulo.toLowerCase().includes("selo org")) {
        try {
          await setDoc(doc(db, "metadata", "geranium"), {
            seloValidade: dataValidade.trim(),
            seloVisita: dataEmissao.trim() || "",
            seloCertificadora: orgaoEmissor.trim(),
            seloNumero: numeroRegistro.trim()
          }, { merge: true });
        } catch (metaErr) {
          console.warn("Metadata sync warning:", metaErr);
        }
      }

      await fetchLicenses();
      resetForm();
      setActiveTab("list");
      onLicensesUpdated?.();
    } catch (err) {
      console.error("Error saving license:", err);
      onNotify("Erro ao salvar dados no banco de dados.", "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!licenseToDelete || !licenseToDelete.id) return;
    const targetId = licenseToDelete.id;

    try {
      setDeleting(true);
      await deleteDoc(doc(db, "licenses", targetId));
      onNotify("Licença removida com sucesso.", "success");
      setLicenseToDelete(null);
      await fetchLicenses();
      onLicensesUpdated?.();
    } catch (err) {
      console.error("Error deleting license:", err);
      onNotify("Erro ao excluir licença.", "error");
    } finally {
      setDeleting(false);
    }
  };

  const formatToBrazDate = (dateStr?: string) => {
    if (!dateStr) return "---";
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }
    return dateStr;
  };

  const calculateStatus = (dataValidadeStr: string) => {
    if (!dataValidadeStr) {
      return {
        label: "Sem Data",
        statusType: "expired",
        badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
        daysText: "Não informada",
        isExpired: false,
        isWarning: false
      };
    }

    const parts = dataValidadeStr.split("-").map(Number);
    if (parts.length !== 3) {
      return {
        label: "Data Inválida",
        statusType: "expired",
        badgeClass: "bg-rose-100 text-rose-700 border-rose-200",
        daysText: "Inválida",
        isExpired: true,
        isWarning: false
      };
    }

    const [year, month, day] = parts;
    const validade = new Date(year, month - 1, day);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    validade.setHours(0, 0, 0, 0);

    const diffMs = validade.getTime() - today.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: "VENCIDO",
        statusType: "expired",
        badgeClass: "bg-rose-100 text-rose-700 border-rose-300 font-extrabold",
        daysText: `Venceu há ${Math.abs(diffDays)} dia(s)`,
        isExpired: true,
        isWarning: false
      };
    }

    if (diffDays <= 60) {
      return {
        label: "EXPIRA EM BREVE",
        statusType: "warning",
        badgeClass: "bg-amber-100 text-amber-800 border-amber-300 font-bold",
        daysText: `Renovar em ${diffDays} dia(s)`,
        isExpired: false,
        isWarning: true
      };
    }

    return {
      label: "ATIVO / EM DIA",
      statusType: "active",
      badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200 font-semibold",
      daysText: `Válido por mais ${diffDays} dia(s)`,
      isExpired: false,
      isWarning: false
    };
  };

  const getIconForType = (licType: LicenseType) => {
    switch (licType) {
      case "Selo Orgânico":
        return <Award className="w-5 h-5 text-emerald-600" />;
      case "Outorga de Água":
        return <Droplets className="w-5 h-5 text-sky-600" />;
      case "Licença Ambiental":
      case "CAR":
        return <Leaf className="w-5 h-5 text-teal-600" />;
      case "Alvará":
        return <Building2 className="w-5 h-5 text-indigo-600" />;
      case "Laudo Técnico":
        return <ShieldCheck className="w-5 h-5 text-purple-600" />;
      default:
        return <FileText className="w-5 h-5 text-slate-600" />;
    }
  };

  const filteredLicenses = licenses.filter(lic => {
    const matchesSearch = 
      (lic.titulo || "").toLowerCase().includes(search.toLowerCase()) ||
      (lic.orgaoEmissor || "").toLowerCase().includes(search.toLowerCase()) ||
      (lic.numeroRegistro || "").toLowerCase().includes(search.toLowerCase()) ||
      (lic.tipo || "").toLowerCase().includes(search.toLowerCase());

    if (filterType === "todos") return matchesSearch;
    if (filterType === "vencidos") {
      const s = calculateStatus(lic.dataValidade);
      return matchesSearch && s.isExpired;
    }
    if (filterType === "alerta") {
      const s = calculateStatus(lic.dataValidade);
      return matchesSearch && s.isWarning;
    }
    if (filterType === "ativos") {
      const s = calculateStatus(lic.dataValidade);
      return matchesSearch && !s.isExpired;
    }
    return matchesSearch && lic.tipo === filterType;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800 tracking-tight">
                Certificações, Licenças & Validades
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Gerencie as datas de renovação do Selo Orgânico, Outorgas de Água, CAR, Alvarás e Laudos
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition cursor-pointer"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-6 pt-4 pb-2 bg-white border-b border-slate-100">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setActiveTab("list");
                resetForm();
              }}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer ${
                activeTab === "list"
                  ? "bg-slate-900 text-white shadow-xs"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <FileText className="w-4 h-4" />
              Documentos Registrados ({licenses.length})
            </button>

            <CanEdit><button
              onClick={handleOpenNew}
              className={`px-4 py-2 text-xs font-bold rounded-xl transition flex items-center gap-2 cursor-pointer ${
                activeTab === "form" && !editingId
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
              }`}
            >
              <Plus className="w-4 h-4" />
              Cadastrar Nova Data / Licença
            </button></CanEdit>
          </div>

          {activeTab === "list" && (
            <div className="hidden sm:flex items-center gap-2 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Em Dia
              </span>
              <span className="inline-flex items-center gap-1 text-amber-600 font-bold ml-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                Expira em Breve
              </span>
              <span className="inline-flex items-center gap-1 text-rose-600 font-bold ml-2">
                <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                Vencido
              </span>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {activeTab === "list" ? (
            <div className="space-y-5">
              
              {/* Search and Filters Bar */}
              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Pesquisar por nome, órgão, registro ou tipo..."
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-slate-400 hidden sm:block" />
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
                  >
                    <option value="todos">Todos os Tipos e Status</option>
                    <option value="ativos">Status: Em Dia (Ativos)</option>
                    <option value="alerta">Status: Expira em Breve (≤ 60 dias)</option>
                    <option value="vencidos">Status: Vencidos</option>
                    <option value="Selo Orgânico">Tipo: Selo Orgânico</option>
                    <option value="Outorga de Água">Tipo: Outorga de Água</option>
                    <option value="Licença Ambiental">Tipo: Licença Ambiental</option>
                    <option value="CAR">Tipo: CAR</option>
                    <option value="Alvará">Tipo: Alvará</option>
                    <option value="Laudo Técnico">Tipo: Laudo Técnico</option>
                  </select>
                </div>
              </div>

              {/* Licenses Cards Grid */}
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                  <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-xs font-semibold mt-3">Carregando certificações e licenças...</p>
                </div>
              ) : filteredLicenses.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200 text-center">
                  <Award className="w-12 h-12 text-slate-300 mb-2" />
                  <h3 className="text-sm font-bold text-slate-700">Nenhuma licença encontrada</h3>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {search || filterType !== "todos" 
                      ? "Nenhum documento corresponde aos filtros selecionados." 
                      : "Cadastre as datas de validade do seu Selo Orgânico, Outorga de Água e outros documentos."}
                  </p>
                  <CanEdit><button
                    onClick={handleOpenNew}
                    className="mt-4 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition flex items-center gap-2 shadow-xs cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Cadastrar Primeiro Documento
                  </button></CanEdit>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredLicenses.map((lic) => {
                    const status = calculateStatus(lic.dataValidade);
                    
                    return (
                      <div 
                        key={lic.id || lic.docId}
                        className={`rounded-2xl border p-4.5 bg-white shadow-xs transition-all hover:shadow-md flex flex-col justify-between relative overflow-hidden ${
                          status.isExpired 
                            ? "border-rose-200 bg-rose-50/15" 
                            : status.isWarning 
                            ? "border-amber-200 bg-amber-50/15" 
                            : "border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        {/* Top info and status badge */}
                        <div>
                          <div className="flex items-start justify-between gap-3 mb-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0">
                                {getIconForType(lic.tipo)}
                              </div>
                              <div>
                                <span className="text-[10px] font-black tracking-wider text-slate-400 uppercase block">
                                  {lic.tipo}
                                </span>
                                <h4 className="font-extrabold text-slate-800 text-sm leading-tight">
                                  {lic.titulo}
                                </h4>
                              </div>
                            </div>

                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border shrink-0 ${status.badgeClass}`}>
                              {status.label}
                            </span>
                          </div>

                          {/* Details Grid */}
                          <div className="grid grid-cols-2 gap-2 my-3 p-2.5 bg-slate-50/80 rounded-xl border border-slate-100 text-xs">
                            <div>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block">Órgão Emissor</span>
                              <span className="font-bold text-slate-700 truncate block">{lic.orgaoEmissor}</span>
                            </div>
                            
                            <div>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block">Nº Registro</span>
                              <span className="font-mono font-bold text-slate-600 truncate block">{lic.numeroRegistro || "---"}</span>
                            </div>

                            <div>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block">Data Renovação / Validade</span>
                              <span className={`font-bold ${status.isExpired ? "text-rose-600 font-extrabold" : status.isWarning ? "text-amber-700" : "text-emerald-700"}`}>
                                {formatToBrazDate(lic.dataValidade)}
                              </span>
                            </div>

                            <div>
                              <span className="text-[9px] text-slate-400 font-bold uppercase block">Última Auditoria / Emissão</span>
                              <span className="font-bold text-slate-600">{formatToBrazDate(lic.dataEmissao)}</span>
                            </div>
                          </div>

                          {lic.observacoes && (
                            <p className="text-[11px] text-slate-500 italic line-clamp-2 mt-1 px-1">
                              "{lic.observacoes}"
                            </p>
                          )}
                        </div>

                        {/* Footer with Days countdown & Action Buttons */}
                        <div className="flex items-center justify-between pt-3 mt-2 border-t border-slate-100">
                          <div className="flex items-center gap-1.5 text-xs">
                            <Clock className={`w-3.5 h-3.5 ${status.isExpired ? "text-rose-500" : status.isWarning ? "text-amber-500" : "text-emerald-500"}`} />
                            <span className={`text-[11px] font-bold ${status.isExpired ? "text-rose-600" : status.isWarning ? "text-amber-700" : "text-slate-600"}`}>
                              {status.daysText}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <CanEdit><button
                              onClick={() => handleEdit(lic)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition font-bold text-xs flex items-center gap-1 cursor-pointer"
                              title="Editar esta data / licença"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span className="text-[11px]">Editar</span>
                            </button></CanEdit>

                            <button
                              onClick={() => setLicenseToDelete(lic)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
                              title="Excluir licença"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          ) : (
            /* Form View: Add or Edit License */
            <form onSubmit={handleSave} className="space-y-6 max-w-2xl mx-auto">
              
              {/* Preset Quick Fill Bar (when creating new) */}
              {!editingId && (
                <div className="p-4 bg-emerald-50/60 border border-emerald-200/80 rounded-2xl space-y-2.5">
                  <div className="flex items-center gap-2 text-emerald-900 font-extrabold text-xs">
                    <Sparkles className="w-4 h-4 text-emerald-600" />
                    Modelos Rápidos (Clique para preencher os campos automaticamente):
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_TEMPLATES.map((tmpl, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleApplyPreset(tmpl)}
                        className="px-2.5 py-1.5 bg-white hover:bg-emerald-600 hover:text-white text-slate-700 text-[11px] font-bold rounded-lg border border-emerald-200 shadow-2xs transition cursor-pointer"
                      >
                        + {tmpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                
                {/* Título */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    Nome / Título do Documento ou Licença <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={titulo}
                    onChange={(e) => setTitulo(e.target.value)}
                    placeholder="Ex: Selo Orgânico Certificado, Outorga de Água Poço 01..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                {/* Tipo */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Tipo / Categoria
                  </label>
                  <select
                    value={tipo}
                    onChange={(e) => setTipo(e.target.value as LicenseType)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none cursor-pointer"
                  >
                    <option value="Selo Orgânico">Selo Orgânico</option>
                    <option value="Outorga de Água">Outorga de Água</option>
                    <option value="Licença Ambiental">Licença Ambiental</option>
                    <option value="CAR">CAR (Cadastro Ambiental Rural)</option>
                    <option value="Alvará">Alvará Sanitário / Funcionamento</option>
                    <option value="Laudo Técnico">Laudo Técnico / Análise</option>
                    <option value="Outro">Outro Documento</option>
                  </select>
                </div>

                {/* Órgão Emissor */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    Órgão Emissor / Certificadora <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={orgaoEmissor}
                    onChange={(e) => setOrgaoEmissor(e.target.value)}
                    placeholder="Ex: IBD, ADASA, IBRAM, MAPA, Vigilância..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
                  />
                </div>

                {/* Data de Validade / Renovação */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-emerald-600" />
                    Data de Renovação / Validade <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={dataValidade}
                    onChange={(e) => setDataValidade(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
                  />
                  <span className="text-[10px] text-slate-400 block">Data limite para renovar o documento</span>
                </div>

                {/* Data da Última Auditoria / Emissão */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    Data da Última Auditoria / Emissão
                  </label>
                  <input
                    type="date"
                    value={dataEmissao}
                    onChange={(e) => setDataEmissao(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 outline-none transition"
                  />
                  <span className="text-[10px] text-slate-400 block">Data em que foi realizada a visita/emissão</span>
                </div>

                {/* Número do Registro */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    <Hash className="w-3.5 h-3.5 text-slate-400" />
                    Nº do Certificado / Registro / Processo
                  </label>
                  <input
                    type="text"
                    value={numeroRegistro}
                    onChange={(e) => setNumeroRegistro(e.target.value)}
                    placeholder="Ex: IBD-ORG-0842, ADASA-OUT-2024/09..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition"
                  />
                </div>

                {/* Responsável */}
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Responsável Técnico / Contato
                  </label>
                  <input
                    type="text"
                    value={responsavel}
                    onChange={(e) => setResponsavel(e.target.value)}
                    placeholder="Ex: Engenharia Agronômica, Auditor IBD..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition"
                  />
                </div>

                {/* Observações */}
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-xs font-bold text-slate-700">
                    Observações / Anotações
                  </label>
                  <textarea
                    rows={3}
                    value={observacoes}
                    onChange={(e) => setObservacoes(e.target.value)}
                    placeholder="Ex: Detalhes sobre a vazão outorgada, escopo da certificação orgânica, pendências..."
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition resize-none"
                  />
                </div>
              </div>

              {/* Actions buttons */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("list");
                    resetForm();
                  }}
                  className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white rounded-xl text-xs font-extrabold transition flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Salvando no Banco...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      {editingId ? "Salvar Alterações" : "Cadastrar Licença"}
                    </>
                  )}
                </button>
              </div>

            </form>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
          <span className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            Sincronizado com o Firestore em tempo real
          </span>

          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Fechar
          </button>
        </div>

      </div>

      {/* Delete Confirmation Sub-Modal */}
      {licenseToDelete && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-200 shadow-2xl space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1">
              <h3 className="font-extrabold text-slate-800 text-base">
                Excluir Licença / Data?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tem certeza que deseja remover o registro de <strong className="text-slate-800">"{licenseToDelete.titulo}"</strong>?
              </p>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                disabled={deleting}
                onClick={() => setLicenseToDelete(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition cursor-pointer"
              >
                Cancelar
              </button>
              <CanEdit><button
                disabled={deleting}
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-extrabold transition flex items-center justify-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
              >
                {deleting ? "Excluindo..." : "Sim, Excluir"}
              </button></CanEdit>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
