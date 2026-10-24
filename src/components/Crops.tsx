import React, { useState, useEffect, useMemo } from "react";
import { CanEdit, usePermissions } from "../lib/permissions";
import { collection, getDocs, addDoc, updateDoc, doc, deleteDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Crop } from "../types";
import { normalizarUnidade } from "../lib/producao";
import { Plus, Edit2, Search, ArrowLeft, Loader2, Leaf, AlertCircle, Trash2, GitMerge, CheckCircle2, RefreshCw } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface CropsProps {
  onNotify: (msg: string, type: "success" | "error" | "info") => void;
}

export default function Crops({ onNotify }: CropsProps) {
  const { canEdit } = usePermissions();
  const [crops, setCrops] = useState<Crop[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [search, setSearch] = useState<string>("");
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false);
  const [selectedCrop, setSelectedCrop] = useState<Crop | null>(null);

  // Form states
  const [nome, setNome] = useState<string>("");
  const [cientifico, setCientifico] = useState<string>("");
  const [dias, setDias] = useState<number>(0);
  const [duracao, setDuracao] = useState<number>(0);
  const [unidadeColheita, setUnidadeColheita] = useState<string>("KG");
  const [saving, setSaving] = useState<boolean>(false);

  // Deduplication state
  const [isDeduplicating, setIsDeduplicating] = useState<boolean>(false);
  const [showDeduplicateModal, setShowDeduplicateModal] = useState<boolean>(false);
  const [duplicateGroups, setDuplicateGroups] = useState<{
    key: string;
    primary: Crop;
    duplicates: Crop[];
  }[]>([]);

  useEffect(() => {
    fetchCrops();
  }, []);

  const fetchCrops = async () => {
    try {
      setLoading(true);
      const cropsCol = collection(db, "crops");
      const snapshot = await getDocs(cropsCol);
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Crop));
      // Sort alphabetically
      list.sort((a, b) => a.nome.localeCompare(b.nome));
      setCrops(list);
    } catch (err) {
      console.error("Error fetching crops:", err);
      onNotify("Erro ao buscar culturas.", "error");
    } finally {
      setLoading(false);
    }
  };

  // Computed list of duplicate groups
  const duplicatesSummary = useMemo(() => {
    const map = new Map<string, Crop[]>();
    for (const c of crops) {
      const key = c.nome.trim().toLowerCase();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    const groups: { key: string; primary: Crop; duplicates: Crop[] }[] = [];
    map.forEach((list, key) => {
      if (list.length > 1) {
        // Sort by field completeness
        const sorted = [...list].sort((a, b) => {
          let scoreA = (a.cientifico ? 2 : 0) + (a.dias > 0 ? 1 : 0) + (a.duracao > 0 ? 1 : 0) + (a.unidadeColheita && normalizarUnidade(a.unidadeColheita) !== 'KG' ? 1 : 0);
          let scoreB = (b.cientifico ? 2 : 0) + (b.dias > 0 ? 1 : 0) + (b.duracao > 0 ? 1 : 0) + (b.unidadeColheita && normalizarUnidade(b.unidadeColheita) !== 'KG' ? 1 : 0);
          return scoreB - scoreA;
        });
        groups.push({ key, primary: sorted[0], duplicates: sorted.slice(1) });
      }
    });
    return groups;
  }, [crops]);

  const handleOpenDeduplicateModal = () => {
    setDuplicateGroups(duplicatesSummary);
    setShowDeduplicateModal(true);
  };

  const handleMergeDuplicates = async () => {
    if (duplicateGroups.length === 0) return;
    try {
      setIsDeduplicating(true);
      onNotify("Iniciando unificação inteligente das culturas...", "info");

      let deletedCount = 0;
      let updatedRefsCount = 0;

      // Fetch all dependent records to update references
      const [plantingsSnap, purchasesSnap, harvestsSnap] = await Promise.all([
        getDocs(collection(db, "plantings")),
        getDocs(collection(db, "purchases")),
        getDocs(collection(db, "harvests")),
      ]);

      for (const group of duplicateGroups) {
        const { primary, duplicates } = group;

        // Consolidate attributes
        let bestCientifico = primary.cientifico || "";
        let bestDias = primary.dias || 0;
        let bestDuracao = primary.duracao || 0;
        let bestUnidade = normalizarUnidade(primary.unidadeColheita) || "KG";

        for (const dup of duplicates) {
          if (!bestCientifico && dup.cientifico) bestCientifico = dup.cientifico;
          if (!bestDias && dup.dias) bestDias = dup.dias;
          if (!bestDuracao && dup.duracao) bestDuracao = dup.duracao;
          if ((!bestUnidade || bestUnidade === "KG") && dup.unidadeColheita && normalizarUnidade(dup.unidadeColheita) !== "KG") {
            bestUnidade = normalizarUnidade(dup.unidadeColheita);
          }
        }

        // 1. Update primary crop doc
        if (primary.id) {
          await updateDoc(doc(db, "crops", primary.id), {
            nome: primary.nome.trim(),
            cientifico: bestCientifico,
            dias: bestDias,
            duracao: bestDuracao,
            unidadeColheita: bestUnidade,
          });
        }

        // 2. Delete duplicate crop docs
        for (const dup of duplicates) {
          if (dup.id) {
            await deleteDoc(doc(db, "crops", dup.id));
            deletedCount++;
          }
        }

        // 3. Update references in plantings, purchases, harvests
        const canonicalName = primary.nome.trim();
        const allVariantNames = new Set([primary.nome, ...duplicates.map(d => d.nome)].map(n => n.trim().toLowerCase()));

        for (const pDoc of plantingsSnap.docs) {
          const pData = pDoc.data();
          if (pData.cultura && allVariantNames.has(pData.cultura.trim().toLowerCase())) {
            if (pData.cultura !== canonicalName) {
              await updateDoc(doc(db, "plantings", pDoc.id), { cultura: canonicalName });
              updatedRefsCount++;
            }
          }
        }

        for (const purDoc of purchasesSnap.docs) {
          const purData = purDoc.data();
          if (purData.cultura && allVariantNames.has(purData.cultura.trim().toLowerCase())) {
            if (purData.cultura !== canonicalName) {
              await updateDoc(doc(db, "purchases", purDoc.id), { cultura: canonicalName });
              updatedRefsCount++;
            }
          }
        }

        for (const hDoc of harvestsSnap.docs) {
          const hData = hDoc.data();
          if (hData.cultura && allVariantNames.has(hData.cultura.trim().toLowerCase())) {
            if (hData.cultura !== canonicalName) {
              await updateDoc(doc(db, "harvests", hDoc.id), { cultura: canonicalName });
              updatedRefsCount++;
            }
          }
        }
      }

      onNotify(`Unificação concluída com sucesso! ${deletedCount} duplicatas unificadas e ${updatedRefsCount} lançamentos vinculados padronizados sem perda de dados.`, "success");
      setShowDeduplicateModal(false);
      fetchCrops();
    } catch (err) {
      console.error("Erro ao unificar culturas:", err);
      onNotify("Erro ao unificar culturas.", "error");
    } finally {
      setIsDeduplicating(false);
    }
  };

  const handleDeleteSingleCrop = async (crop: Crop) => {
    if (!crop.id) return;
    if (!window.confirm(`Tem certeza que deseja excluir a cultura "${crop.nome}"?\n\nNota: Os dados das colheitas e plantios já realizados serão mantidos intactos.`)) {
      return;
    }
    try {
      await deleteDoc(doc(db, "crops", crop.id));
      onNotify(`Cultura "${crop.nome}" excluída com sucesso.`, "success");
      fetchCrops();
    } catch (err) {
      console.error("Erro ao excluir cultura:", err);
      onNotify("Erro ao excluir cultura.", "error");
    }
  };

  const PRESET_UNITS = ["KG", "UN", "MÇ", "BJ", "PCT", "CX", "g", "DZ"];

  const handleInlineUnitChange = async (crop: Crop, newUnit: string) => {
    if (!crop.id) return;
    const trimmed = normalizarUnidade(newUnit);
    if (!trimmed) return;

    // Optimistic update
    setCrops(prev => prev.map(c => c.id === crop.id ? { ...c, unidadeColheita: trimmed } : c));

    try {
      await updateDoc(doc(db, "crops", crop.id), { unidadeColheita: trimmed });
      onNotify(`Unidade de "${crop.nome}" alterada para "${trimmed}".`, "success");
    } catch (err) {
      console.error("Error updating unit inline:", err);
      onNotify("Erro ao atualizar unidade de colheita.", "error");
      fetchCrops();
    }
  };

  const openNewForm = () => {
    setSelectedCrop(null);
    setNome("");
    setCientifico("");
    setDias(0);
    setDuracao(0);
    setUnidadeColheita("KG");
    setIsFormOpen(true);
  };

  const openEditForm = (crop: Crop) => {
    setSelectedCrop(crop);
    setNome(crop.nome);
    setCientifico(crop.cientifico || "");
    setDias(crop.dias);
    setDuracao(crop.duracao);
    setUnidadeColheita(normalizarUnidade(crop.unidadeColheita) || "KG");
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) {
      onNotify("Informe o nome popular da cultura.", "error");
      return;
    }

    try {
      setSaving(true);
      const cropsCol = collection(db, "crops");

      const payload: Omit<Crop, "id"> = {
        nome: nome.trim(),
        cientifico: cientifico.trim(),
        dias: Number(dias) || 0,
        duracao: Number(duracao) || 0,
        unidadeColheita: normalizarUnidade(unidadeColheita) || "KG",
      };

      if (selectedCrop && selectedCrop.id) {
        // Edit existing crop
        const docRef = doc(db, "crops", selectedCrop.id);
        await updateDoc(docRef, payload);
        onNotify("Cultura atualizada com sucesso!", "success");
      } else {
        // Create new crop
        // Check if crop already exists
        const exists = crops.some(c => c.nome.toLowerCase() === nome.trim().toLowerCase());
        if (exists) {
          onNotify("Uma cultura com este nome já existe.", "error");
          setSaving(false);
          return;
        }
        await addDoc(cropsCol, payload);
        onNotify("Nova cultura cadastrada com sucesso!", "success");
      }

      setIsFormOpen(false);
      fetchCrops();
    } catch (err) {
      console.error("Error saving crop:", err);
      onNotify("Erro ao salvar cultura.", "error");
    } finally {
      setSaving(false);
    }
  };

  const filteredCrops = crops.filter(c => 
    c.nome.toLowerCase().includes(search.toLowerCase()) ||
    (c.cientifico && c.cientifico.toLowerCase().includes(search.toLowerCase()))
  );

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
                <h1 className="text-xl font-bold text-slate-800 tracking-tight">Culturas Cadastradas</h1>
                <p className="text-slate-500 text-sm mt-1">Gerencie a lista de plantas do seu banco de dados orgânicos.</p>
              </div>
              <div className="flex items-center gap-2.5 self-stretch sm:self-auto">
                <CanEdit><button
                  onClick={handleOpenDeduplicateModal}
                  className={`flex items-center justify-center gap-2 font-semibold px-4 py-2.5 rounded-xl shadow-xs transition duration-150 cursor-pointer border ${
                    duplicatesSummary.length > 0
                      ? "bg-amber-500 hover:bg-amber-600 text-white border-amber-500 animate-pulse"
                      : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200"
                  }`}
                  title="Verificar e unificar culturas com nomes duplicados"
                >
                  <GitMerge className="w-4 h-4" />
                  Unificar Duplicadas {duplicatesSummary.length > 0 && `(${duplicatesSummary.length})`}
                </button></CanEdit>
                <CanEdit><button
                  onClick={openNewForm}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold px-4 py-2.5 rounded-xl shadow-xs transition duration-150 justify-center cursor-pointer"
                >
                  <Plus className="w-5 h-5" />
                  Nova Cultura
                </button></CanEdit>
              </div>
            </div>

            {/* Duplicates Alert Banner */}
            {duplicatesSummary.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-6 h-6 text-amber-600 shrink-0" />
                  <div>
                    <h4 className="text-sm font-bold text-amber-900">
                      Cultura(s) duplicada(s) detectada(s) no banco de dados!
                    </h4>
                    <p className="text-xs text-amber-700 mt-0.5">
                      Foram encontrados {duplicatesSummary.length} grupos de nomes repetidos. Você pode unificá-los com 1 clique mantendo todos os históricos de plantios e colheitas intactos.
                    </p>
                  </div>
                </div>
                <CanEdit><button
                  onClick={handleOpenDeduplicateModal}
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition cursor-pointer shrink-0"
                >
                  Unificar Agora
                </button></CanEdit>
              </div>
            )}

            {/* Filter Search */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
              <Search className="w-5 h-5 text-slate-400 shrink-0" />
              <input
                type="text"
                placeholder="Buscar por nome popular ou científico..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-sm text-slate-800 placeholder-slate-400 bg-transparent border-0 outline-none focus:ring-0"
              />
            </div>

            {/* List Table/Grid */}
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm">
                <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                <p className="text-sm text-slate-400 mt-2">Carregando catálogo de culturas...</p>
              </div>
            ) : filteredCrops.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-slate-200 shadow-sm text-center p-6">
                <AlertCircle className="w-12 h-12 text-slate-300" />
                <p className="text-sm font-semibold text-slate-700 mt-3">Nenhuma cultura encontrada.</p>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">Tente reajustar sua busca ou cadastre uma nova cultura no botão superior.</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        <th className="p-4 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Nome Popular</th>
                        <th className="p-4 font-bold text-slate-500 uppercase text-[10px] tracking-widest">Nome Científico</th>
                        <th className="p-4 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-center">Unid. Colheita</th>
                        <th className="p-4 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-center">Dias para 1ª Colheita</th>
                        <th className="p-4 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-center">Duração da Colheita</th>
                        <th className="p-4 font-bold text-slate-500 uppercase text-[10px] tracking-widest text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150">
                      {filteredCrops.map((c) => (
                        <tr key={c.id} className="hover:bg-slate-50/55 transition">
                          <td className="p-4 font-bold text-slate-800">{c.nome}</td>
                          <td className="p-4 text-slate-500 italic font-serif">{c.cientifico || "—"}</td>
                          <td className="p-4 text-center">
                            <div className="inline-block relative">
                              <select
                                value={normalizarUnidade(c.unidadeColheita) || "KG"}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === "__CUSTOM__") {
                                    const customVal = window.prompt(`Digite a nova unidade de colheita para "${c.nome}":`, c.unidadeColheita || "");
                                    if (customVal && customVal.trim()) {
                                      handleInlineUnitChange(c, customVal.trim());
                                    }
                                  } else {
                                    handleInlineUnitChange(c, val);
                                  }
                                }}
                                disabled={!canEdit}
                                className="disabled:cursor-default disabled:opacity-80 appearance-none font-extrabold text-xs px-3 py-1.5 pr-7 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 rounded-xl border border-emerald-200/80 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-200/50 outline-none cursor-pointer transition-all shadow-2xs font-mono"
                                title="Clique para alterar a unidade de colheita desta cultura diretamente"
                              >
                                <option value="KG">KG (Quilograma)</option>
                                <option value="UN">UN (Unidade)</option>
                                <option value="MÇ">MÇ (Maço)</option>
                                <option value="BJ">BJ (Bandeja)</option>
                                <option value="PCT">PCT (Pacote)</option>
                                <option value="CX">CX (Caixa)</option>
                                <option value="g">g (Grama)</option>
                                <option value="DZ">DZ (Dúzia)</option>
                                {c.unidadeColheita && !PRESET_UNITS.includes(normalizarUnidade(c.unidadeColheita)) && (
                                  <option value={normalizarUnidade(c.unidadeColheita)}>{normalizarUnidade(c.unidadeColheita)} (Personalizada)</option>
                                )}
                                <option value="__CUSTOM__">✏️ Outra unidade...</option>
                              </select>
                              <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-emerald-600 text-[10px] font-bold">
                                ▾
                              </div>
                            </div>
                          </td>
                          <td className="p-4 text-slate-700 text-center font-mono font-medium">{c.dias} dias</td>
                          <td className="p-4 text-slate-700 text-center font-mono font-medium">{c.duracao} dias</td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <CanEdit><button
                                onClick={() => openEditForm(c)}
                                className="inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-1.5 rounded-lg text-xs transition duration-150 border border-slate-200/50 cursor-pointer"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                Editar
                              </button></CanEdit>
                              <CanEdit><button
                                onClick={() => handleDeleteSingleCrop(c)}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer"
                                title="Excluir cultura"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button></CanEdit>
                            </div>
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
            key="form-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="max-w-2xl mx-auto"
          >
            <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Form header */}
              <div className="p-6 border-b border-slate-200 flex items-center gap-4 bg-slate-50/50">
                <button
                  onClick={() => setIsFormOpen(false)}
                  className="p-2 hover:bg-slate-200 text-slate-500 hover:text-slate-700 rounded-lg transition cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                  <h2 className="text-lg font-bold text-slate-800">
                    {selectedCrop ? `Editar Cultura: ${selectedCrop.nome}` : "Cadastrar Nova Cultura"}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">Informe os detalhes para salvar na nuvem.</p>
                </div>
              </div>

              {/* Form body */}
              <form onSubmit={handleSubmit} className="p-6 space-y-5">
                <div className="space-y-1.5">
                  <label htmlFor="crop-nome" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Nome Popular
                  </label>
                  <input
                    id="crop-nome"
                    type="text"
                    required
                    placeholder="Ex: Alface Crespa Roxa"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none transition"
                  />
                </div>

                <div className="space-y-1.5">
                  <label htmlFor="crop-cientifico" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Nome Científico <span className="text-slate-400 font-normal font-sans">(Opcional)</span>
                  </label>
                  <input
                    id="crop-cientifico"
                    type="text"
                    placeholder="Ex: Lactuca sativa var. crispa"
                    value={cientifico}
                    onChange={(e) => setCientifico(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none transition font-serif italic"
                  />
                </div>

                <div className="space-y-2">
                  <label htmlFor="crop-unidade" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                    Unidade de Colheita Padronizada
                  </label>
                  <p className="text-xs text-slate-400">
                    Selecione a unidade na qual essa cultura é colhida (ex: kg, unidade, maço, caixa). Isso será refletido automaticamente nas colheitas registradas.
                  </p>
                  
                  {/* Preset unit pills */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      { label: "kg (Quilograma)", val: "kg" },
                      { label: "UN (Unidade)", val: "UN" },
                      { label: "MÇ (Maço)", val: "MÇ" },
                      { label: "BJ (Bandeja)", val: "BJ" },
                      { label: "PCT (Pacote)", val: "PCT" },
                      { label: "CX (Caixa)", val: "CX" },
                      { label: "g (Grama)", val: "g" },
                      { label: "dz (Dúzia)", val: "dz" },
                    ].map((u) => (
                      <button
                        key={u.val}
                        type="button"
                        onClick={() => setUnidadeColheita(u.val)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer border ${
                          unidadeColheita === u.val
                            ? "bg-emerald-600 text-white border-emerald-600 shadow-xs"
                            : "bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100"
                        }`}
                      >
                        {u.label}
                      </button>
                    ))}
                  </div>

                  <div className="pt-1">
                    <input
                      id="crop-unidade"
                      type="text"
                      required
                      placeholder="Ou digite outra unidade personalização (ex: Pote, Sacac, Atado)..."
                      value={unidadeColheita}
                      onChange={(e) => setUnidadeColheita(e.target.value)}
                      className="w-full px-4 py-2 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none font-medium transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label htmlFor="crop-dias" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Dias para 1ª Colheita
                    </label>
                    <input
                      id="crop-dias"
                      type="number"
                      required
                      min="0"
                      value={dias}
                      onChange={(e) => setDias(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none font-mono transition"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="crop-duracao" className="block text-xs font-bold text-slate-500 uppercase tracking-widest">
                      Duração da Colheita <span className="text-slate-400 font-normal font-sans">(Dias)</span>
                    </label>
                    <input
                      id="crop-duracao"
                      type="number"
                      required
                      min="0"
                      value={duracao}
                      onChange={(e) => setDuracao(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 focus:bg-white text-sm text-slate-800 rounded-xl outline-none font-mono transition"
                    />
                  </div>
                </div>

                {/* Submit row */}
                <div className="flex gap-4 pt-4 border-t border-slate-200">
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-xs transition duration-150 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {saving && <Loader2 className="w-5 h-5 animate-spin" />}
                    {saving ? "Salvando..." : "Salvar Cultura"}
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

      {/* Deduplication Modal */}
      <AnimatePresence>
        {showDeduplicateModal && (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-xl border border-slate-200 space-y-5 max-h-[90vh] flex flex-col"
            >
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-amber-50 text-amber-600 rounded-2xl border border-amber-200/60">
                    <GitMerge className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">Unificar Culturas Duplicadas</h3>
                    <p className="text-xs text-slate-500">Unificação inteligente e consolidação de dados sem perda de histórico.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowDeduplicateModal(false)}
                  disabled={isDeduplicating}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg transition cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto space-y-4 pr-1 flex-1 text-xs">
                {duplicateGroups.length === 0 ? (
                  <div className="py-8 text-center space-y-2">
                    <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
                    <p className="font-bold text-slate-800 text-sm">Nenhuma cultura duplicada encontrada!</p>
                    <p className="text-slate-500 max-w-xs mx-auto">
                      Todas as culturas no catálogo possuem nomes únicos e padronizados.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="bg-emerald-50 border border-emerald-200 p-3.5 rounded-2xl space-y-1 text-emerald-900">
                      <p className="font-bold flex items-center gap-1.5 text-emerald-800">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        Garantia de Preservação de Dados
                      </p>
                      <p className="text-[11px] text-emerald-700 leading-relaxed">
                        A unificação combina os melhores dados botânicos de cada duplicata e atualiza automaticamente todos os lançamentos históricos de <strong>Plantios, Colheitas e Compras</strong> para o nome oficial padronizado. Nenhum histórico será apagado.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <p className="font-bold text-slate-700 uppercase tracking-wider text-[10px]">
                        Grupos identificados ({duplicateGroups.length}):
                      </p>
                      <div className="space-y-2.5">
                        {duplicateGroups.map((group, idx) => (
                          <div key={idx} className="bg-slate-50 border border-slate-200 p-3 rounded-2xl space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-800 text-sm capitalize">{group.primary.nome}</span>
                              <span className="px-2 py-0.5 bg-amber-100 text-amber-800 font-extrabold rounded-md text-[10px]">
                                {group.duplicates.length + 1} registros
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-600 space-y-1 bg-white p-2.5 rounded-xl border border-slate-150 font-mono">
                              <div>
                                <span className="font-bold text-emerald-700 font-sans">Oficial:</span> {group.primary.nome} {group.primary.cientifico ? `(${group.primary.cientifico})` : ""} • {group.primary.dias || 0}d colheita • {group.primary.unidadeColheita || "kg"}
                              </div>
                              <div className="text-slate-400 text-[10px]">
                                <span className="font-bold text-amber-700 font-sans">Variantes a consolidar:</span> {group.duplicates.map(d => d.nome).join(", ")}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="border-t border-slate-100 pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowDeduplicateModal(false)}
                  disabled={isDeduplicating}
                  className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2.5 px-4 rounded-xl text-xs transition cursor-pointer border border-slate-200"
                >
                  Cancelar
                </button>
                {duplicateGroups.length > 0 && (
                  <button
                    type="button"
                    onClick={handleMergeDuplicates}
                    disabled={isDeduplicating}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2.5 px-4 rounded-xl text-xs shadow-xs transition cursor-pointer flex items-center justify-center gap-2"
                  >
                    {isDeduplicating ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Unificando...
                      </>
                    ) : (
                      <>
                        <GitMerge className="w-4 h-4" />
                        Unificar {duplicateGroups.length} Grupos Sem Perder Dados
                      </>
                    )}
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
