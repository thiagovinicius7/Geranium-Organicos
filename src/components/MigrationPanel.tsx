import React, { useRef, useState } from "react";
import { DatabaseZap, CloudDownload, FileJson, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import {
  readLegacyDatabase,
  parseBackupFile,
  writeToCurrentDatabase,
  summarize,
  MigrationData,
  ALL_COLLECTIONS,
  DATA_COLLECTIONS,
  DEFAULT_SELECTION
} from "../lib/migration";

interface Props {
  onNotify: (msg: string, type?: "success" | "error" | "info") => void;
}

const LABELS: Record<string, string> = {
  crops: "Culturas",
  purchases: "Compras & Estoque",
  plantings: "Plantios",
  harvests: "Colheitas",
  licenses: "Licenças & Selos",
  metadata: "Configurações",
  authorized_emails: "E-mails autorizados"
};

export default function MigrationPanel({ onNotify }: Props) {
  const [loaded, setLoaded] = useState<{ source: string; data: MigrationData } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string>("");
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [selected, setSelected] = useState<string[]>(DEFAULT_SELECTION);

  const toggle = (name: string) => {
    setConfirmed(false);
    setSelected(prev => (prev.includes(name) ? prev.filter(n => n !== name) : [...prev, name]));
  };

  const selectedData = (DATA_COLLECTIONS as readonly string[]).filter(n => selected.includes(n));
  const selectedSettings = selected.filter(n => !(DATA_COLLECTIONS as readonly string[]).includes(n));
  const fileRef = useRef<HTMLInputElement>(null);

  const run = async (task: () => Promise<void>) => {
    setBusy(true);
    try {
      await task();
    } catch (err: any) {
      console.error(err);
      const closed = err?.code === "auth/popup-closed-by-user";
      onNotify(closed ? "A janela de login foi fechada." : err?.message || String(err), closed ? "info" : "error");
    } finally {
      setBusy(false);
      setProgress("");
    }
  };

  const handleReadLegacy = () =>
    run(async () => {
      setResult(null);
      const data = await readLegacyDatabase(setProgress);
      setLoaded({ source: "banco antigo (AI Studio)", data });
      setSelected(DEFAULT_SELECTION);
      setConfirmed(false);
      onNotify("Dados do banco antigo carregados. Confira os totais antes de gravar.", "success");
    });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    run(async () => {
      setResult(null);
      const data = parseBackupFile(await file.text());
      setLoaded({ source: `arquivo ${file.name}`, data });
      setSelected(DEFAULT_SELECTION);
      setConfirmed(false);
      onNotify("Backup carregado. Confira os totais antes de gravar.", "success");
    });
  };

  const handleWrite = () =>
    run(async () => {
      if (!loaded) return;
      const written = await writeToCurrentDatabase(loaded.data, selected, setProgress);
      setResult(written);
      setLoaded(null);
      setConfirmed(false);
      const total = Object.values(written).reduce((a, b) => a + b, 0);
      onNotify(`Migração concluída: ${total} registros gravados no banco novo.`, "success");
    });

  const counts = loaded ? summarize(loaded.data) : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-emerald-50 text-emerald-700 rounded-2xl border border-emerald-100">
          <DatabaseZap className="w-6 h-6" />
        </div>
        <div>
          <h1 className="text-xl font-extrabold text-slate-900">Migrar Dados</h1>
          <p className="text-sm text-slate-500">
            Traga os dados do banco antigo para o banco próprio do Geranium Orgânicos.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <button
          onClick={handleReadLegacy}
          disabled={busy}
          className="text-left p-5 bg-white border border-slate-200 rounded-2xl hover:border-emerald-300 hover:shadow-md transition disabled:opacity-50 cursor-pointer"
        >
          <CloudDownload className="w-6 h-6 text-emerald-600 mb-2" />
          <div className="font-bold text-slate-900">Copiar do banco antigo</div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Abre o login Google do banco antigo (AI Studio) e lê todas as coleções, inclusive as licenças.
          </p>
        </button>

        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="text-left p-5 bg-white border border-slate-200 rounded-2xl hover:border-emerald-300 hover:shadow-md transition disabled:opacity-50 cursor-pointer"
        >
          <FileJson className="w-6 h-6 text-emerald-600 mb-2" />
          <div className="font-bold text-slate-900">Restaurar de um arquivo de backup</div>
          <p className="text-xs text-slate-500 mt-1 leading-relaxed">
            Use um arquivo .json gerado em "Importar Planilha → Baixar Backup".
          </p>
        </button>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={handleFile} />
      </div>

      {busy && progress && (
        <div className="flex items-center gap-2 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl text-sm text-indigo-800 font-semibold">
          <Loader2 className="w-4 h-4 animate-spin" />
          {progress}
        </div>
      )}

      {loaded && counts && (
        <div className="p-5 bg-white border border-slate-200 rounded-2xl space-y-4">
          <div className="text-sm font-bold text-slate-900">
            Encontrado no {loaded.source}. Marque o que deve ir para o banco novo:
          </div>
          <div className="divide-y divide-slate-100">
            {ALL_COLLECTIONS.map(name => (
              <label key={name} className="flex items-center gap-3 py-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(name)}
                  onChange={() => toggle(name)}
                  className="w-4 h-4 accent-emerald-600"
                />
                <span className={selected.includes(name) ? "text-slate-900 font-semibold" : "text-slate-400"}>
                  {LABELS[name] || name}
                </span>
                <span className="ml-auto font-mono font-bold text-slate-900">{counts[name]}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 leading-relaxed">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
            <span>
              {selectedData.length > 0 && (
                <>
                  {selectedData.map(n => LABELS[n]).join(", ")}: o que já estiver no banco novo será
                  <strong> apagado e substituído</strong> por esta cópia.{" "}
                </>
              )}
              {selectedSettings.length > 0 && (
                <>{selectedSettings.map(n => LABELS[n]).join(" e ")}: somados aos atuais. </>
              )}
              O que ficar desmarcado não é copiado e começa do zero no banco novo.
            </span>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            Entendi, pode gravar no banco novo.
          </label>

          <button
            onClick={handleWrite}
            disabled={!confirmed || busy || selected.length === 0}
            className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-sm font-bold transition disabled:opacity-40 cursor-pointer"
          >
            Gravar no banco novo
          </button>
        </div>
      )}

      {result && (
        <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2">
          <div className="flex items-center gap-2 font-bold text-emerald-900">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            Migração concluída
          </div>
          <ul className="text-sm text-emerald-900 space-y-0.5">
            {Object.entries(result).map(([name, n]) => (
              <li key={name}>
                {LABELS[name] || name}: <strong>{n}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
