import React, { useState, useEffect } from "react";
import { 
  AuthorizedEmail, 
  getAuthorizedEmails, 
  addAuthorizedEmail, 
  removeAuthorizedEmail,
  PERMANENT_ADMIN_EMAILS,
  normalizeEmail,
  getAuthSettings,
  saveAuthSettings,
  AuthSettings,
  isEmailAuthorized,
  updateAuthorizedEmailRole
} from "../lib/authorizedEmails";
import { AccessRole, ROLE_LABELS, ROLE_DESCRIPTIONS } from "../lib/permissions";
import { 
  X, 
  UserPlus, 
  Trash2, 
  ShieldCheck, 
  Mail, 
  AlertTriangle, 
  CheckCircle2, 
  Shield, 
  User, 
  ToggleLeft, 
  ToggleRight, 
  Search, 
  Globe, 
  Plus, 
  Check
} from "lucide-react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  currentUserEmail: string | null;
  onNotify: (msg: string, type?: "success" | "error" | "info") => void;
}

export default function AuthorizedEmailsModal({ isOpen, onClose, currentUserEmail, onNotify }: Props) {
  const [emails, setEmails] = useState<AuthorizedEmail[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [newEmail, setNewEmail] = useState<string>("");
  const [newRole, setNewRole] = useState<AccessRole>("lancador");
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Global Auth Settings
  const [authSettings, setAuthSettings] = useState<AuthSettings>({
    isRestricted: true,
    allowedDomains: []
  });
  const [savingSettings, setSavingSettings] = useState<boolean>(false);
  const [newDomain, setNewDomain] = useState<string>("");

  // Email permission tester
  const [testEmailInput, setTestEmailInput] = useState<string>("");
  const [testResult, setTestResult] = useState<{ checked: boolean; allowed: boolean; reason: string } | null>(null);
  const [testingEmail, setTestingEmail] = useState<boolean>(false);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([
        getAuthorizedEmails(),
        getAuthSettings()
      ]);
      setEmails(list);
      setAuthSettings(settings);
    } catch (err) {
      console.error(err);
      onNotify("Erro ao carregar configurações de acesso.", "error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchAllData();
      setNewEmail("");
      setTestEmailInput("");
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleRestriction = async () => {
    try {
      setSavingSettings(true);
      const updated: AuthSettings = {
        ...authSettings,
        isRestricted: !authSettings.isRestricted
      };
      await saveAuthSettings(updated);
      setAuthSettings(updated);
      onNotify(
        updated.isRestricted
          ? "Modo Restrito ATIVADO: Somente e-mails cadastrados podem entrar."
          : "Modo Aberto ATIVADO: Qualquer conta Google pode acessar o sistema.",
        "success"
      );
    } catch (err: any) {
      onNotify("Erro ao atualizar modo de acesso.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleAddDomain = async (e: React.FormEvent) => {
    e.preventDefault();
    let dom = newDomain.trim().toLowerCase();
    if (!dom) return;
    if (!dom.startsWith("@")) dom = "@" + dom;

    if (authSettings.allowedDomains.includes(dom)) {
      onNotify("Este domínio já está cadastrado.", "info");
      return;
    }

    try {
      setSavingSettings(true);
      const updated = {
        ...authSettings,
        allowedDomains: [...authSettings.allowedDomains, dom]
      };
      await saveAuthSettings(updated);
      setAuthSettings(updated);
      setNewDomain("");
      onNotify(`Domínio ${dom} liberado com sucesso! Todos os usuários desse domínio terão acesso.`, "success");
    } catch (err) {
      onNotify("Erro ao salvar domínio.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleRemoveDomain = async (domainToRemove: string) => {
    try {
      setSavingSettings(true);
      const updated = {
        ...authSettings,
        allowedDomains: authSettings.allowedDomains.filter(d => d !== domainToRemove)
      };
      await saveAuthSettings(updated);
      setAuthSettings(updated);
      onNotify(`Domínio ${domainToRemove} removido.`, "info");
    } catch (err) {
      onNotify("Erro ao remover domínio.", "error");
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = normalizeEmail(testEmailInput);
    if (!clean) return;

    setTestingEmail(true);
    try {
      const isPerm = PERMANENT_ADMIN_EMAILS.some(a => normalizeEmail(a) === clean);
      if (isPerm) {
        setTestResult({
          checked: true,
          allowed: true,
          reason: "Administrador Permanente com Acesso Imediato e Total"
        });
        return;
      }

      if (!authSettings.isRestricted) {
        setTestResult({
          checked: true,
          allowed: true,
          reason: "Permitido (Modo Aberto ativo no sistema)"
        });
        return;
      }

      const domainMatch = authSettings.allowedDomains.find(d => clean.endsWith(normalizeEmail(d)));
      if (domainMatch) {
        setTestResult({
          checked: true,
          allowed: true,
          reason: `Permitido pelo domínio autorizado (${domainMatch})`
        });
        return;
      }

      const allowed = await isEmailAuthorized(clean);
      if (allowed) {
        setTestResult({
          checked: true,
          allowed: true,
          reason: "Cadastrado na lista de e-mails autorizados"
        });
      } else {
        setTestResult({
          checked: true,
          allowed: false,
          reason: "Não encontrado na lista de permissões"
        });
      }
    } catch (err) {
      setTestResult({
        checked: true,
        allowed: false,
        reason: "Erro ao consultar permissão"
      });
    } finally {
      setTestingEmail(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const rawInput = newEmail.trim();
    if (!rawInput) {
      onNotify("Informe ao menos um e-mail para autorizar.", "error");
      return;
    }

    // Split input in case user pasted multiple emails (comma, semicolon, newline or space)
    const emailList = rawInput
      .split(/[,;\s\n]+/)
      .map(e => normalizeEmail(e))
      .filter(e => e.length > 0);

    if (emailList.length === 0) {
      onNotify("Nenhum e-mail válido identificado.", "error");
      return;
    }

    const invalid = emailList.filter(e => !e.includes("@") || !e.includes("."));
    if (invalid.length > 0) {
      onNotify(`E-mail(s) com formato inválido: ${invalid.join(", ")}`, "error");
      return;
    }

    try {
      setIsSubmitting(true);
      let addedCount = 0;

      for (const email of emailList) {
        if (!emails.some(item => normalizeEmail(item.email) === email)) {
          await addAuthorizedEmail(email, currentUserEmail || "Administrador", newRole);
          addedCount++;
        }
      }

      if (addedCount > 0) {
        onNotify(
          addedCount === 1 
            ? `E-mail ${emailList[0]} liberado com sucesso!` 
            : `${addedCount} novos e-mails foram autorizados com sucesso!`, 
          "success"
        );
      } else {
        onNotify("O(s) e-mail(s) informado(s) já estavam autorizados no sistema.", "info");
      }

      setNewEmail("");
      await fetchAllData();
    } catch (err: any) {
      console.error(err);
      onNotify(err.message || "Erro ao autorizar e-mail(s).", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChangeRole = async (item: AuthorizedEmail, role: AccessRole) => {
    try {
      setChangingRoleId(item.id);
      await updateAuthorizedEmailRole(item.id, role);
      setEmails(prev => prev.map(e => (e.id === item.id ? { ...e, role } : e)));
      onNotify(`${item.email} agora é ${ROLE_LABELS[role]}.`, "success");
    } catch (err) {
      console.error(err);
      onNotify("Erro ao mudar o perfil de acesso.", "error");
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleRemove = async (item: AuthorizedEmail) => {
    const cleanItemEmail = normalizeEmail(item.email);
    const cleanUserEmail = normalizeEmail(currentUserEmail || "");

    if (PERMANENT_ADMIN_EMAILS.some(a => normalizeEmail(a) === cleanItemEmail)) {
      onNotify("Este e-mail é um Administrador Permanente e não pode ser removido.", "error");
      return;
    }

    if (cleanUserEmail && cleanItemEmail === cleanUserEmail) {
      onNotify("Você não pode remover seu próprio e-mail para evitar bloqueio de acesso.", "error");
      return;
    }

    if (!window.confirm(`Tem certeza que deseja remover a autorização de acesso para "${item.email}"?`)) {
      return;
    }

    try {
      setDeletingId(item.id);
      await removeAuthorizedEmail(item.id);
      onNotify(`Acesso removido para ${item.email}.`, "success");
      await fetchAllData();
    } catch (err) {
      console.error(err);
      onNotify("Erro ao remover e-mail.", "error");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-100 text-emerald-800 rounded-2xl border border-emerald-200">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 tracking-tight">Gerenciamento de Acesso & Usuários</h2>
              <p className="text-xs text-slate-500 font-medium">Controle total de permissões de login Google no sistema</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          
          {/* Access Mode Switch Box */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-800">
                  Modo de Acesso: {authSettings.isRestricted ? "Restrito (Seguro)" : "Aberto (Qualquer Conta)"}
                </span>
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                  authSettings.isRestricted ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"
                }`}>
                  {authSettings.isRestricted ? "Apenas Lista" : "Livre"}
                </span>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                {authSettings.isRestricted 
                  ? "Apenas administradores e e-mails autorizados abaixo podem fazer login."
                  : "Qualquer pessoa com conta Google pode acessar o sistema imediatamente."}
              </p>
            </div>

            <button
              onClick={handleToggleRestriction}
              disabled={savingSettings}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 cursor-pointer shrink-0 ${
                authSettings.isRestricted 
                  ? "bg-slate-200 hover:bg-slate-300 text-slate-700" 
                  : "bg-emerald-600 hover:bg-emerald-700 text-white"
              }`}
            >
              {authSettings.isRestricted ? (
                <>
                  <ToggleLeft className="w-4 h-4 text-slate-500" />
                  Mudar para Aberto
                </>
              ) : (
                <>
                  <ToggleRight className="w-4 h-4 text-white" />
                  Mudar para Restrito
                </>
              )}
            </button>
          </div>

          {/* Form to Add New Email */}
          <form onSubmit={handleAdd} className="bg-emerald-50/60 p-4 rounded-2xl border border-emerald-100 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-extrabold text-emerald-900 uppercase tracking-wider flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-emerald-700" />
                Liberar Novo E-mail / Usuário
              </label>
              <span className="text-[10px] text-emerald-700 font-medium">Separe múltiplos por vírgula</span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="ex: fulano@gmail.com, equipe@geranium.com.br"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  disabled={isSubmitting}
                  className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                />
              </div>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as AccessRole)}
                disabled={isSubmitting}
                title="Perfil de acesso"
                className="px-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:border-emerald-500 cursor-pointer"
              >
                {(["lancador", "user", "admin"] as AccessRole[]).map(r => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
              <button
                type="submit"
                disabled={isSubmitting || !newEmail.trim()}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-sm rounded-xl transition shadow-xs disabled:opacity-50 cursor-pointer flex items-center justify-center gap-2 whitespace-nowrap"
              >
                {isSubmitting ? "Liberando..." : "+ Liberar Acesso"}
              </button>
            </div>
            <p className="text-[11px] text-emerald-800 leading-relaxed">
              <strong>{ROLE_LABELS[newRole]}:</strong> {ROLE_DESCRIPTIONS[newRole]}
            </p>
          </form>

          {/* Permission Tester Tool */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-slate-500" />
                Testador de Acesso Rápido
              </span>
              <span className="text-[10px] text-slate-400">Verifique se um e-mail específico tem permissão</span>
            </div>

            <form onSubmit={handleTestEmail} className="flex gap-2">
              <input
                type="text"
                placeholder="Digite um e-mail para testar a permissão..."
                value={testEmailInput}
                onChange={(e) => {
                  setTestEmailInput(e.target.value);
                  setTestResult(null);
                }}
                className="flex-1 px-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                disabled={testingEmail || !testEmailInput.trim()}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition cursor-pointer disabled:opacity-50"
              >
                {testingEmail ? "Verificando..." : "Testar"}
              </button>
            </form>

            {testResult && (
              <div className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 ${
                testResult.allowed 
                  ? "bg-emerald-50 border-emerald-200 text-emerald-800" 
                  : "bg-rose-50 border-rose-200 text-rose-800"
              }`}>
                {testResult.allowed ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <div>
                  <strong className="font-extrabold">{testResult.allowed ? "ACESSO LIBERADO" : "ACESSO BLOQUEADO"}:</strong> {testResult.reason}
                </div>
              </div>
            )}
          </div>

          {/* List of Authorized Emails */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider">
                E-mails com Acesso Liberado ({emails.length})
              </h3>
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-400 text-sm font-medium">
                Carregando e-mails autorizados...
              </div>
            ) : emails.length === 0 ? (
              <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200 p-6">
                <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-700">Nenhum e-mail cadastrado</p>
                <p className="text-xs text-slate-500 mt-1">Adicione ao menos um e-mail para permitir login no painel.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white max-h-64 overflow-y-auto">
                {emails.map((item) => {
                  const cleanItemEmail = normalizeEmail(item.email);
                  const cleanUserEmail = normalizeEmail(currentUserEmail || "");
                  const isSelf = cleanUserEmail && cleanItemEmail === cleanUserEmail;
                  const isPermanentAdmin = PERMANENT_ADMIN_EMAILS.some(a => normalizeEmail(a) === cleanItemEmail);

                  return (
                    <div key={item.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50/50 transition">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`p-2 rounded-xl shrink-0 ${isPermanentAdmin ? "bg-indigo-50 text-indigo-700 border border-indigo-100" : "bg-slate-100 text-slate-600"}`}>
                          {isPermanentAdmin ? <Shield className="w-4 h-4 text-indigo-600" /> : <User className="w-4 h-4 text-slate-600" />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm truncate">{item.email}</span>
                            {isPermanentAdmin && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 bg-indigo-100 text-indigo-800 rounded-full border border-indigo-200">
                                Administrador Permanente
                              </span>
                            )}
                            {isSelf && (
                              <span className="text-[10px] font-extrabold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                                Sua Conta Atual
                              </span>
                            )}
                          </div>
                          {item.addedAt && (
                            <p className="text-[11px] text-slate-400 truncate mt-0.5">
                              Cadastrado em {new Date(item.addedAt).toLocaleDateString("pt-BR")}
                              {item.addedBy ? ` por ${item.addedBy}` : ""}
                            </p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isPermanentAdmin ? null : (
                        <select
                          value={item.role || "user"}
                          onChange={(e) => handleChangeRole(item, e.target.value as AccessRole)}
                          disabled={isSelf || changingRoleId === item.id}
                          title={isSelf ? "Não é possível mudar o seu próprio perfil" : "Perfil de acesso"}
                          className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                        >
                          {(["lancador", "user", "admin"] as AccessRole[]).map(r => (
                            <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                          ))}
                        </select>
                      )}
                      <button
                        onClick={() => handleRemove(item)}
                        disabled={isPermanentAdmin || isSelf || deletingId === item.id}
                        title={
                          isPermanentAdmin
                            ? "Administrador permanente não pode ser removido"
                            : isSelf
                            ? "Não é possível remover sua própria conta"
                            : "Remover autorização"
                        }
                        className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition cursor-pointer disabled:opacity-20 disabled:cursor-not-allowed shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-medium">
            Permissões são sincronizadas instantaneamente com o Firebase.
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl transition cursor-pointer shadow-xs"
          >
            Concluir
          </button>
        </div>
      </div>
    </div>
  );
}

