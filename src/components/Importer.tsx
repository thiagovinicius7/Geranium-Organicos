import React, { useState, useRef, useEffect } from "react";
import { collection, doc, writeBatch, setDoc, getDocs } from "firebase/firestore";
import { db, initAuth, googleSignIn, logout, writeDocumentRest, getAccessToken } from "../lib/firebase";
import { uploadJsonToDrive } from "../lib/googleDrive";
import { User } from "firebase/auth";
import { Crop, Purchase, Planting, Harvest } from "../types";
import { seedDatabaseIfEmpty } from "./SeedingData";
import { 
  Upload, 
  CheckCircle2, 
  AlertTriangle, 
  FileText, 
  ArrowRight, 
  Download, 
  Database, 
  RefreshCw, 
  Check, 
  FileSpreadsheet, 
  Clipboard,
  AlertCircle,
  LogOut,
  Info,
  Zap,
  Trash2,
  CloudUpload,
  ExternalLink,
  HardDrive
} from "lucide-react";

type ImportType = "crops" | "purchases" | "plantings" | "harvests";

interface ParsedRow {
  index: number;
  data: any;
  errors: string[];
  warnings: string[];
  status: "pending" | "success" | "error";
}

function promiseWithTimeout<T>(promise: Promise<T>, ms: number, errorMsg: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(errorMsg));
    }, ms);
    promise.then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

const normalizeCompare = (str1: string, str2: string): boolean => {
  if (!str1 || !str2) return false;
  const norm = (s: string) => s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
  return norm(str1) === norm(str2);
};

const findBestPlantingId = (
  harvestCultura: string,
  harvestTalhao: string,
  harvestDate: string,
  allPlantings: Planting[]
): Planting | null => {
  // Filter plantings that match the crop and talhao, and were planted on or before the harvest date
  const candidates = allPlantings.filter(p => 
    normalizeCompare(p.cultura, harvestCultura) &&
    normalizeCompare(p.talhao, harvestTalhao) &&
    p.data <= harvestDate
  );

  if (candidates.length === 0) return null;

  // Separate active and finalized
  const activeCandidates = candidates.filter(p => p.status !== "Finalizado");
  if (activeCandidates.length > 0) {
    // Return the oldest active planting (first planted)
    activeCandidates.sort((a, b) => a.data.localeCompare(b.data));
    return activeCandidates[0];
  }

  // If no active candidate, return the newest finalized candidate (the most recently completed one)
  candidates.sort((a, b) => b.data.localeCompare(a.data));
  return candidates[0];
};

export default function Importer({ onNotify }: { onNotify: (msg: string, type: "success" | "error" | "info") => void }) {
  const [importType, setImportType] = useState<ImportType>("crops");
  const [csvText, setCsvText] = useState<string>("");
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [step, setStep] = useState<number>(1); // 1: Select Type, 2: Upload/Paste, 3: Preview/Validate, 4: Finish
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [isExpressSyncing, setIsExpressSyncing] = useState<boolean>(false);
  const [expressStatus, setExpressStatus] = useState<string>("");
  const [expressResults, setExpressResults] = useState<{ crops?: number; purchases?: number; plantings?: number; harvests?: number } | null>(null);
  const [expressTabDetails, setExpressTabDetails] = useState<{ tabName: string; type: ImportType; count: number }[]>([]);
  const [expressProgress, setExpressProgress] = useState<{ current: number; total: number; currentType: string }>({ current: 0, total: 0, currentType: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const useRestFallback = useRef<boolean>(false);

  const [confirmResetCheckbox, setConfirmResetCheckbox] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [isDownloadingBackup, setIsDownloadingBackup] = useState<boolean>(false);
  const [isSavingToDrive, setIsSavingToDrive] = useState<boolean>(false);
  const [driveBackupLink, setDriveBackupLink] = useState<string | null>(null);

  const generateFullBackupPayload = async () => {
    const collectionsToBackup = [
      "crops",
      "purchases",
      "plantings",
      "harvests",
      "licenses",
      "authorized_emails",
      "metadata"
    ];

    const backupData: Record<string, any[]> = {};
    const summary: Record<string, number> = {};

    for (const colName of collectionsToBackup) {
      try {
        const snap = await getDocs(collection(db, colName));
        const list = snap.docs.map(docSnap => ({
          _firestoreDocId: docSnap.id,
          ...docSnap.data()
        }));
        backupData[colName] = list;
        summary[colName] = list.length;
      } catch (colErr) {
        console.error(`Erro ao buscar coleção ${colName} para backup:`, colErr);
        backupData[colName] = [];
        summary[colName] = 0;
      }
    }

    const fullBackup = {
      system: "Geranium Orgânicos",
      version: "2.2",
      exportedAt: new Date().toISOString(),
      summary,
      collections: backupData
    };

    return { fullBackup, summary };
  };

  const handleDownloadSystemBackup = async () => {
    try {
      setIsDownloadingBackup(true);
      onNotify("Iniciando geração do backup completo do sistema...", "info");

      const { fullBackup, summary } = await generateFullBackupPayload();

      const jsonString = JSON.stringify(fullBackup, null, 2);
      const blob = new Blob([jsonString], { type: "application/json;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
      link.setAttribute("href", url);
      link.setAttribute("download", `backup_sistema_geranium_${dateStr}_${timeStr}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      const totalRecords = Object.values(summary).reduce((a, b) => a + b, 0);
      onNotify(`Backup gerado com sucesso! ${totalRecords} registros exportados em formato JSON.`, "success");
    } catch (err) {
      console.error("Erro ao gerar backup do sistema:", err);
      onNotify("Erro ao gerar o backup do sistema.", "error");
    } finally {
      setIsDownloadingBackup(false);
    }
  };

  const handleSaveBackupToDrive = async () => {
    try {
      setIsSavingToDrive(true);
      onNotify("Iniciando verificação de autorização do Google Drive...", "info");

      let token = await getAccessToken();
      if (!token) {
        onNotify("Solicitando autorização do Google para acesso ao Google Drive...", "info");
        const authRes = await googleSignIn();
        if (authRes?.accessToken) {
          token = authRes.accessToken;
        }
      }

      if (!token) {
        onNotify("É necessário fazer login no Google para salvar arquivos no Google Drive.", "error");
        return;
      }

      const dateStr = new Date().toISOString().slice(0, 10);
      const timeStr = new Date().toTimeString().slice(0, 5).replace(":", "");
      const fileName = `backup_sistema_geranium_${dateStr}_${timeStr}.json`;

      const confirmed = window.confirm(
        `Deseja salvar o arquivo de backup do sistema ("${fileName}") diretamente no seu Google Drive?`
      );
      if (!confirmed) {
        onNotify("Envio do backup para o Google Drive cancelado.", "info");
        return;
      }

      onNotify("Exportando coleções do sistema e gerando arquivo...", "info");
      const { fullBackup, summary } = await generateFullBackupPayload();

      onNotify("Enviando arquivo diretamente para o Google Drive...", "info");
      const driveResult = await uploadJsonToDrive(fileName, fullBackup, token);

      const totalRecords = Object.values(summary).reduce((a, b) => a + b, 0);
      if (driveResult.webViewLink) {
        setDriveBackupLink(driveResult.webViewLink);
      }

      onNotify(
        `Backup salvo com sucesso no Google Drive! (${totalRecords} registros exportados em "${driveResult.name}").`,
        "success"
      );
    } catch (err: any) {
      console.error("Erro ao salvar no Google Drive:", err);
      onNotify(`Erro ao salvar no Google Drive: ${err?.message || String(err)}`, "error");
    } finally {
      setIsSavingToDrive(false);
    }
  };

  const handleResetDatabase = async () => {
    if (!confirmResetCheckbox) return;
    setIsResetting(true);
    onNotify("Iniciando a redefinição de dados no Firebase...", "info");

    const collectionsToClear = ["crops", "purchases", "plantings", "harvests"];

    try {
      for (const collName of collectionsToClear) {
        onNotify(`Excluindo registros da coleção '${collName}'...`, "info");
        const querySnapshot = await getDocs(collection(db, collName));
        
        if (!querySnapshot.empty) {
          const docs = querySnapshot.docs;
          let i = 0;
          while (i < docs.length) {
            const batch = writeBatch(db);
            const chunk = docs.slice(i, i + 200);
            for (const docSnapshot of chunk) {
              batch.delete(docSnapshot.ref);
            }
            await batch.commit();
            i += 200;
          }
        }
      }

      onNotify("Todos os dados foram excluídos! Recriando catálogo de culturas padrão...", "info");
      await seedDatabaseIfEmpty();

      onNotify("O banco de dados foi redefinido com sucesso! Você pode iniciar uma nova importação.", "success");
      setConfirmResetCheckbox(false);
      setStep(1); // Back to selection step
    } catch (err: any) {
      console.error("Erro ao resetar banco de dados:", err);
      onNotify(`Erro ao limpar dados: ${err.message || err}`, "error");
    } finally {
      setIsResetting(false);
    }
  };

  const saveDocumentWithRestFallback = async (
    collectionId: string,
    docId: string | undefined,
    data: any,
    timeoutMsg: string
  ): Promise<string> => {
    const colRef = collection(db, collectionId);
    const docRef = docId ? doc(colRef, docId) : doc(colRef);
    const actualDocId = docRef.id;

    const finalData = { ...data };
    if (collectionId !== "harvests" && collectionId !== "crops") {
      finalData.id = actualDocId;
    }

    if (useRestFallback.current) {
      console.log(`[REST] Saving doc ${actualDocId} in '${collectionId}' directly via REST`);
      try {
        await writeDocumentRest(collectionId, actualDocId, finalData);
        return actualDocId;
      } catch (restErr: any) {
        throw new Error(`${timeoutMsg} (REST: ${restErr.message})`);
      }
    }

    try {
      await promiseWithTimeout(
        setDoc(docRef, finalData),
        2000,
        "SDK_TIMEOUT"
      );
      return actualDocId;
    } catch (sdkErr: any) {
      console.warn("Standard Firestore SDK write timed out/failed. Activating REST API fallback mode...", sdkErr);
      useRestFallback.current = true;
      try {
        await writeDocumentRest(collectionId, actualDocId, finalData);
        return actualDocId;
      } catch (restErr: any) {
        throw new Error(`${timeoutMsg} (REST Fallback: ${restErr.message})`);
      }
    }
  };

  // Google Sheets state
  const [sourceType, setSourceType] = useState<"csv" | "google">("google"); // default to google per user request
  const [googleUser, setGoogleUser] = useState<User | null>(null);
  const [googleToken, setGoogleToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState<boolean>(true);
  
  const [spreadsheetId, setSpreadsheetId] = useState<string>("1Us5jOo-iQkvI32AFBcWzEUJwTvWr6m9A9_mARdJCyls");
  const [sheetTabs, setSheetTabs] = useState<string[]>([]);
  const [selectedTab, setSelectedTab] = useState<string>("");
  const [isLoadingSheets, setIsLoadingSheets] = useState<boolean>(false);
  
  const [sheetHeaders, setSheetHeaders] = useState<string[]>([]);
  const [sheetRawRows, setSheetRawRows] = useState<string[][]>([]);
  const [columnMappings, setColumnMappings] = useState<Record<string, string>>({});
  const [isMappingLoaded, setIsMappingLoaded] = useState<boolean>(false);

  // Initialize auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setGoogleUser(user);
        setGoogleToken(token);
        setIsAuthLoading(false);
      },
      () => {
        setGoogleUser(null);
        setGoogleToken(null);
        setIsAuthLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleGoogleLogin = async () => {
    try {
      const res = await googleSignIn();
      if (res) {
        setGoogleUser(res.user);
        setGoogleToken(res.accessToken);
        onNotify("Conectado ao Google com sucesso!", "success");
      }
    } catch (err: any) {
      console.error(err);
      onNotify(`Falha ao conectar com o Google: ${err.message}`, "error");
    }
  };

  const handleGoogleLogout = async () => {
    try {
      await logout();
      setGoogleUser(null);
      setGoogleToken(null);
      setSheetTabs([]);
      setSelectedTab("");
      setSheetHeaders([]);
      setSheetRawRows([]);
      setIsMappingLoaded(false);
      onNotify("Desconectado do Google.", "info");
    } catch (err: any) {
      console.error(err);
      onNotify("Erro ao desconectar.", "error");
    }
  };

  const autoMapHeaders = (fields: string[], headers: string[]): Record<string, string> => {
    const mapping: Record<string, string> = {};
    const usedHeaders = new Set<string>();
    
    const normalizeHeader = (str: string): string => {
      return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, "")
        .trim();
    };

    // First pass: look for exact or close matches (after accent removal)
    fields.forEach(field => {
      const lf = field.toLowerCase();
      const nLf = normalizeHeader(lf);
      
      const match = headers.find(h => {
        const lh = h.toLowerCase().trim();
        if (usedHeaders.has(lh)) return false;
        
        const nLh = normalizeHeader(lh);
        return nLh === nLf || lh === lf;
      });
      
      if (match) {
        mapping[field] = match;
        usedHeaders.add(match.toLowerCase().trim());
      }
    });

    // Second pass: fuzzy rules for unmatched fields
    fields.forEach(field => {
      if (mapping[field]) return; // already matched

      const lf = field.toLowerCase();
      const nLf = normalizeHeader(lf);

      const match = headers.find(h => {
        const lh = h.toLowerCase().trim();
        if (usedHeaders.has(lh)) return false;
        
        const nLh = normalizeHeader(lh);

        // Fuzzy rules on normalized strings
        if (nLf === "nome") {
          return nLh === "nome" || nLh === "cultura" || nLh === "planta" || nLh === "produto" || nLh.includes("nome") || nLh.includes("cultura");
        }
        if (nLf === "cultura") {
          return nLh === "cultura" || nLh === "planta" || nLh === "nome" || nLh.includes("cultura") || nLh.includes("planta") || nLh.includes("nome");
        }
        if (nLf === "cientifico") {
          return nLh.includes("cientifico") || nLh.includes("latim") || nLh.includes("botanico");
        }
        if (nLf === "dias") {
          return nLh === "dias" || nLh.includes("dias") || nLh.includes("ciclo") || nLh.includes("tempo") || nLh.includes("periodo");
        }
        if (nLf === "duracao") {
          return nLh.includes("duracao") || nLh.includes("colhendo") || nLh.includes("vida") || nLh.includes("colheita") || nLh.includes("periodo");
        }
        if (nLf === "data") {
          return nLh.includes("data") || nLh === "dia";
        }
        if (nLf === "tipo") {
          return nLh.includes("tipo") || nLh.includes("categoria") || nLh.includes("muda") || nLh.includes("semente");
        }
        if (nLf === "talhao") {
          return nLh.includes("talhao") || nLh.includes("canteiro") || nLh.includes("local") || nLh.includes("area");
        }
        if (nLf === "quantidade") {
          return nLh.includes("quantidade") || nLh.includes("quant") || nLh.includes("qtd") || nLh.includes("volume") || nLh.includes("unidade") || nLh.includes("und");
        }
        if (nLf === "unidade") {
          return nLh.includes("unidade") || nLh.includes("unid") || nLh.includes("und") || nLh.includes("medida");
        }
        if (nLf === "previsao") {
          return nLh.includes("previsao") || nLh.includes("estimativa") || nLh.includes("previst") || nLh.includes("previs");
        }
        if (nLf === "datafim") {
          return nLh.includes("fim") || nLh.includes("finaliz") || nLh.includes("conclus") || nLh.includes("termino") || nLh.includes("encerr") || nLh.includes("conclui");
        }
        if (nLf === "fornecedor") {
          return nLh.includes("fornecedor") || nLh.includes("empresa") || nLh.includes("origem");
        }
        if (nLf === "nf") {
          return nLh.includes("nf") || nLh.includes("nota") || nLh.includes("fatura") || nLh.includes("documento") || nLh.includes("fiscal");
        }
        if (nLf === "id") {
          const hasIdLote = fields.some(f => f.toLowerCase() === "idlote" || f.toLowerCase() === "idplantio");
          return nLh === "id" || 
                 nLh === "codigo" || 
                 nLh.includes("identificador") || 
                 (!hasIdLote && (nLh.includes("lote") || nLh.includes("entrada") || nLh.includes("compra"))) ||
                 (nLh.includes("id") && (hasIdLote ? (!nLh.includes("lote") && !nLh.includes("plantio") && !nLh.includes("canteiro")) : true)) || 
                 nLh.includes("canteiro") || 
                 nLh.includes("plantio");
        }
        if (nLf === "idplantio") {
          return nLh.includes("plantio") || nLh.includes("canteiro") || (nLh.includes("id") && (nLh.includes("canteiro") || nLh.includes("lote") || nLh.includes("plantio")));
        }
        if (nLf === "idlote") {
          return nLh === "idlote" || nLh === "lote" || nLh.includes("lote") || nLh.includes("compra") || nLh.includes("insumo") || nLh.includes("entrada");
        }
        if (nLf === "idsessao") {
          return nLh.includes("sessao") || nLh.includes("grupo");
        }
        if (nLf === "qtd") {
          return nLh === "qtd" || nLh.includes("qtd") || nLh.includes("quantidade") || nLh.includes("colhido") || nLh.includes("peso") || nLh.includes("volume");
        }

        return false;
      });

      if (match) {
        mapping[field] = match;
        usedHeaders.add(match.toLowerCase().trim());
      }
    });

    return mapping;
  };

  const handleLoadSpreadsheet = async () => {
    if (!spreadsheetId.trim()) {
      onNotify("Por favor, informe o ID da Planilha Google.", "error");
      return;
    }
    
    if (!googleToken) {
      onNotify("Você precisa se conectar ao Google primeiro.", "error");
      return;
    }
    
    setIsLoadingSheets(true);
    setSheetTabs([]);
    setSelectedTab("");
    setIsMappingLoaded(false);
    
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${googleToken}`
        }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Erro HTTP ${res.status}`);
      }
      
      const data = await res.json();
      const tabs = data.sheets?.map((s: any) => s.properties.title) || [];
      
      if (tabs.length === 0) {
        throw new Error("Nenhuma aba encontrada nesta planilha.");
      }
      
      setSheetTabs(tabs);
      setSelectedTab(tabs[0]);
      onNotify(`Planilha carregada! ${tabs.length} abas encontradas.`, "success");
      // Load details for first tab
      await handleLoadTabDetails(tabs[0]);
    } catch (err: any) {
      console.error("Erro ao carregar abas:", err);
      onNotify(`Erro ao carregar planilha: ${err.message}. Verifique se o ID está correto e se você tem acesso de leitura.`, "error");
    } finally {
      setIsLoadingSheets(false);
    }
  };

  const handleLoadTabDetails = async (tabName: string) => {
    if (!tabName || !googleToken) return;
    
    setIsLoadingSheets(true);
    setIsMappingLoaded(false);
    
    try {
      const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(tabName)}!A1:Z2000`;
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${googleToken}`
        }
      });
      
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Erro HTTP ${res.status}`);
      }
      
      const data = await res.json();
      const values: string[][] = data.values || [];
      
      if (values.length === 0) {
        throw new Error("A aba selecionada está vazia.");
      }
      
      const headers = values[0].map(h => h?.toString().trim() || "");
      const rows = values.slice(1);
      
      setSheetHeaders(headers);
      setSheetRawRows(rows);
      
      // Auto-map headers
      const fields = templates[importType].columns.map(c => c.name);
      const initialMappings = autoMapHeaders(fields, headers);
      setColumnMappings(initialMappings);
      setIsMappingLoaded(true);
      
      onNotify(`Aba carregada! Detectadas ${headers.length} colunas e ${rows.length} linhas de dados.`, "info");
    } catch (err: any) {
      console.error("Erro ao carregar dados da aba:", err);
      onNotify(`Erro ao carregar aba: ${err.message}`, "error");
    } finally {
      setIsLoadingSheets(false);
    }
  };

  useEffect(() => {
    if (isMappingLoaded && sheetHeaders.length > 0) {
      const fields = templates[importType].columns.map(c => c.name);
      const initialMappings = autoMapHeaders(fields, sheetHeaders);
      setColumnMappings(initialMappings);
    }
  }, [importType]);

  const handleValidateGoogleSheets = () => {
    if (sheetRawRows.length === 0) {
      onNotify("Nenhum dado carregado para validar.", "error");
      return;
    }
    
    // Check if required mappings are configured
    const missingMappings: string[] = [];
    templates[importType].columns.forEach(col => {
      if (col.req && (!columnMappings[col.name] || columnMappings[col.name] === "")) {
        missingMappings.push(col.name);
      }
    });
    
    if (missingMappings.length > 0) {
      onNotify(`Por favor, mapeie as colunas obrigatórias: ${missingMappings.join(", ")}`, "error");
      return;
    }
    
    const fields = templates[importType].columns.map(c => c.name);
    const translatedHeaders = fields.map(f => f.toLowerCase());
    
    const nonEmptyRows = sheetRawRows.filter(row => row.some(cell => cell !== undefined && cell.toString().trim() !== ""));
    
    if (nonEmptyRows.length === 0) {
      onNotify("Nenhuma linha com dados válidos encontrada nesta aba.", "error");
      return;
    }
    
    const parsed: ParsedRow[] = nonEmptyRows.map((row, idx) => {
      const translatedValues = fields.map(f => {
        const userColHeader = columnMappings[f];
        if (!userColHeader) return "";
        const colIdx = sheetHeaders.indexOf(userColHeader);
        return (colIdx !== -1 && row[colIdx] !== undefined) ? row[colIdx].toString().trim() : "";
      });
      
      return validateRow(translatedHeaders, translatedValues, idx + 1, undefined, selectedTab);
    });
    
    setParsedRows(parsed);
    setStep(3);
    onNotify(`Sucesso! ${parsed.length} linhas de dados importadas e validadas.`, "info");
  };

  // Template headers and examples
  const templates: Record<ImportType, { columns: { name: string; req: boolean; desc: string }[]; sample: string }> = {
    crops: {
      columns: [
        { name: "nome", req: true, desc: "Nome comum da cultura (ex: Alface Crespa Verde)" },
        { name: "cientifico", req: false, desc: "Nome científico (ex: Lactuca sativa)" },
        { name: "unidadeColheita", req: false, desc: "Unidade de colheita (ex: kg, UN, MÇ, BJ, PCT, CX)" },
        { name: "dias", req: false, desc: "Dias estimados do plantio à colheita (ex: 35)" },
        { name: "duracao", req: false, desc: "Período colhendo em dias (ex: 30)" },
      ],
      sample: "nome;cientifico;unidadeColheita;dias;duracao\nMorango Silvestre;Fragaria vesca;kg;90;60\nTomate Cereja;Solanum lycopersicum;kg;80;45\nEspanfre Orgânico;Spinacia oleracea;MÇ;45;20"
    },
    purchases: {
      columns: [
        { name: "data", req: true, desc: "Data da compra (Formato AAAA-MM-DD)" },
        { name: "fornecedor", req: false, desc: "Nome do fornecedor" },
        { name: "nf", req: false, desc: "Número da Nota Fiscal" },
        { name: "tipo", req: false, desc: "Muda ou Semente" },
        { name: "cultura", req: true, desc: "Nome da Cultura" },
        { name: "quantidade", req: false, desc: "Quantidade comprada (unidades)" },
        { name: "id", req: false, desc: "Opcional. Código personalizado (ex: COMP-2601-XYZ)" },
        { name: "saldo", req: false, desc: "Opcional. Saldo restante do lote (se omitido, usa a quantidade)" },
        { name: "status", req: false, desc: "Opcional. Status do lote (Ativo, Esgotado)" },
      ],
      sample: "data;fornecedor;nf;tipo;cultura;quantidade;id;saldo;status\n2026-06-15;Sementes Sol;NF-8921;Semente;Cenoura;1000;;;\n2026-06-18;Mudando DF;NF-5011;Muda;Alface Lisa;500;COMP-XYZ;250;Ativo"
    },
    plantings: {
      columns: [
        { name: "data", req: true, desc: "Data do plantio (Formato AAAA-MM-DD)" },
        { name: "cultura", req: true, desc: "Nome da Cultura" },
        { name: "tipo", req: false, desc: "Muda, Semente ou Perene" },
        { name: "talhao", req: false, desc: "Identificação do Talhão (ex: T1, T2)" },
        { name: "quantidade", req: false, desc: "Quantidade plantada" },
        { name: "unidade", req: false, desc: "Unidades ou m²" },
        { name: "previsao", req: false, desc: "Data prevista de colheita (Formato AAAA-MM-DD)" },
        { name: "idLote", req: false, desc: "Opcional. ID de estoque vinculado (Compras)" },
        { name: "aduboQt", req: false, desc: "Opcional. Qtd adubo em carrinhos" },
        { name: "aduboComp", req: false, desc: "Opcional. Tipo/composição do adubo" },
        { name: "id", req: false, desc: "Opcional. Código personalizado (ex: PLAN-2607-ABC)" },
        { name: "status", req: false, desc: "Opcional. Status (No campo, Esperando colheita, Colhendo, Finalizado)" },
        { name: "dataFim", req: false, desc: "Opcional. Data de finalização (AAAA-MM-DD)" },
        { name: "perdas", req: false, desc: "Opcional. Quantidade de perdas registradas" },
        { name: "obs", req: false, desc: "Opcional. Observações do plantio" },
        { name: "totalColhido", req: false, desc: "Opcional. Total colhido" },
      ],
      sample: "data;cultura;tipo;talhao;quantidade;unidade;previsao;idLote;aduboQt;aduboComp;id;status;dataFim;perdas;obs;totalColhido\n2026-07-01;Cenoura;Semente;Talhão 3;1000;Unidades;2026-10-01;;2;Esterco Bovino;PLAN-CEN01;No campo;;0;;0\n2026-07-02;Alface Lisa;Muda;Talhão 1;500;Unidades;2026-08-05;COMP-XYZ;1;Composto Orgânico;;Finalizado;2026-08-10;15;Colheita de inverno bem sucedida;485"
    },
    harvests: {
      columns: [
        { name: "data", req: true, desc: "Data da colheita (Formato AAAA-MM-DD)" },
        { name: "idPlantio", req: false, desc: "Código do canteiro/plantio (ex: PLAN-XYZ)" },
        { name: "cultura", req: true, desc: "Nome da cultura" },
        { name: "talhao", req: true, desc: "Identificação do talhão" },
        { name: "qtd", req: true, desc: "Quantidade colhida" },
        { name: "idSessao", req: false, desc: "Código da sessão agrupada (ex: SESS-2607-01)" },
      ],
      sample: "data;idPlantio;cultura;talhao;qtd;idSessao\n2026-07-08;PLAN-CEN01;Cenoura;Talhão 3;120;SESS-0807-01\n2026-07-08;PLAN-XYZ;Alface Lisa;Talhão 1;80;SESS-0807-01"
    }
  };

  const getLabel = (type: ImportType) => {
    switch(type) {
      case "crops": return "Culturas (Crops)";
      case "purchases": return "Compras & Estoque (Purchases)";
      case "plantings": return "Plantios / Canteiros (Plantings)";
      case "harvests": return "Colheitas Diárias (Harvests)";
    }
  };

  const getTermsLabel = (type: ImportType): string => {
    switch(type) {
      case "crops": return "culturas, cultura, plantas, crop, vegetal, sementeira";
      case "purchases": return "compras, compra, estoque, purchase, entrada, fornecedor";
      case "plantings": return "plantios, plantio, canteiros, canteiro, planting, cultivo, lote";
      case "harvests": return "colheitas, colheita, harvest, producao, produção";
    }
  };

  const handleCopyTemplate = () => {
    navigator.clipboard.writeText(templates[importType].sample);
    onNotify("Modelo copiado para a área de transferência!", "success");
  };

  const handleDownloadTemplate = () => {
    const blob = new Blob([templates[importType].sample], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `modelo_importacao_${importType}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Safe manual CSV Parsing supporting double quotes, comma and semicolon delimiters
  const parseCSV = (text: string): string[][] => {
    const lines: string[][] = [];
    let row: string[] = [];
    let insideQuote = false;
    let entry = "";
    
    // Auto detect separator by checking first line
    const firstLine = text.split("\n")[0] || "";
    const semicolons = (firstLine.match(/;/g) || []).length;
    const commas = (firstLine.match(/,/g) || []).length;
    const separator = semicolons >= commas ? ";" : ",";

    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const nextChar = text[i + 1];

      if (char === '"') {
        if (insideQuote && nextChar === '"') {
          entry += '"'; // Escaped quote
          i++;
        } else {
          insideQuote = !insideQuote; // Toggle quote state
        }
      } else if (char === separator && !insideQuote) {
        row.push(entry.trim());
        entry = "";
      } else if ((char === "\r" || char === "\n") && !insideQuote) {
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        row.push(entry.trim());
        if (row.length > 1 || (row.length === 1 && row[0] !== "")) {
          lines.push(row);
        }
        row = [];
        entry = "";
      } else {
        entry += char;
      }
    }
    
    // Add the remaining entry
    if (entry !== "" || row.length > 0) {
      row.push(entry.trim());
      lines.push(row);
    }
    
    return lines;
  };

  const parseDateToISO = (val: any): string | null => {
    if (val === undefined || val === null) return null;
    const str = val.toString().trim();
    if (!str) return null;

    // 1. Check if it's already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    // 2. Check if it matches DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
    const dmy4 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
    if (dmy4) {
      const day = dmy4[1].padStart(2, "0");
      const month = dmy4[2].padStart(2, "0");
      const year = dmy4[3];
      return `${year}-${month}-${day}`;
    }

    // 3. Check if it matches DD/MM/YY or DD-MM-YY or DD.MM.YY
    const dmy2 = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2})$/);
    if (dmy2) {
      const day = dmy2[1].padStart(2, "0");
      const month = dmy2[2].padStart(2, "0");
      const year = "20" + dmy2[3];
      return `${year}-${month}-${day}`;
    }

    // 4. Try parsing as a Google Sheets serial number
    const num = Number(str);
    if (!isNaN(num) && num > 30000 && num < 60000) {
      const baseDate = new Date(1899, 11, 30);
      const targetDate = new Date(baseDate.getTime() + num * 24 * 60 * 60 * 1000);
      if (!isNaN(targetDate.getTime())) {
        const y = targetDate.getFullYear();
        const m = String(targetDate.getMonth() + 1).padStart(2, "0");
        const d = String(targetDate.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      }
    }

    // 5. Try default JS Date parsing
    const parsed = new Date(str);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const m = String(parsed.getMonth() + 1).padStart(2, "0");
      const d = String(parsed.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    }

    return null;
  };

  const validateRow = (headers: string[], rowValues: string[], idx: number, typeOverride?: ImportType, tabName?: string): ParsedRow => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const record: any = {};
    const activeType = typeOverride || importType;

    // Map columns
    headers.forEach((header, index) => {
      const cleanHeader = header.toLowerCase().trim();
      const val = rowValues[index] !== undefined ? rowValues[index].trim() : "";
      record[cleanHeader] = val;
    });

    const expectedCols = templates[activeType].columns;

    // Validate fields according to activeType - absolute fallbacks, no warnings or errors!
    if (activeType === "crops") {
      // Nome
      record.nome = record.nome ? record.nome.trim() : "Cultura Sem Nome";
      // Cientifico
      record.cientifico = record.cientifico ? record.cientifico.trim() : "";
      // Unidade de Colheita
      const unidRaw = record.unidadecolheita || record.unidade_colheita || record.unidadeColheita || record.unidade;
      record.unidadeColheita = unidRaw ? unidRaw.trim() : "kg";
      // Dias
      const diasNum = parseInt(record.dias);
      record.dias = (isNaN(diasNum) || diasNum < 0) ? 0 : diasNum;
      // Duracao
      const duracaoNum = parseInt(record.duracao);
      record.duracao = (isNaN(duracaoNum) || duracaoNum < 0) ? 0 : duracaoNum;

    } else if (activeType === "purchases") {
      // Data
      const parsedDate = parseDateToISO(record.data);
      record.data = parsedDate || new Date().toISOString().split("T")[0];
      // Fornecedor
      record.fornecedor = record.fornecedor ? record.fornecedor.trim() : "Não informado";
      // NF
      record.nf = record.nf ? record.nf.trim() : "S/N";
      // Tipo
      const tipoLower = record.tipo?.toLowerCase() || "";
      if (tipoLower === "muda" || tipoLower.includes("muda")) {
        record.tipo = "Muda";
      } else if (tipoLower === "semente" || tipoLower.includes("semente")) {
        record.tipo = "Semente";
      } else {
        record.tipo = "Muda";
      }
      // Cultura
      record.cultura = record.cultura ? record.cultura.trim() : "Não informada";
      // Quantidade
      const qtdNum = parseFloat(record.quantidade);
      record.quantidade = (isNaN(qtdNum) || qtdNum <= 0) ? 0 : qtdNum;
      
      // Saldo (Opcional)
      const saldoVal = record.saldo;
      const saldoNum = parseFloat(saldoVal);
      record.saldo = (!isNaN(saldoNum) && saldoNum >= 0) ? saldoNum : record.quantidade;

      // ID
      if (!record.id) {
        const datePart = record.data ? record.data.replace(/-/g, "").substring(2, 8) : "260101";
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        record.id = `COMP-${datePart}-${rand}`;
      } else {
        record.id = record.id.trim().toUpperCase();
      }

      // Status (Opcional)
      const pStatusLower = record.status?.toLowerCase() || "";
      if (pStatusLower.includes("esgotado") || pStatusLower === "esgotado") {
        record.status = "Esgotado";
      } else if (record.saldo <= 0) {
        record.status = "Esgotado";
      } else {
        record.status = "Ativo";
      }

    } else if (activeType === "plantings") {
      // Data
      const parsedDate = parseDateToISO(record.data);
      record.data = parsedDate || new Date().toISOString().split("T")[0];
      // Cultura
      record.cultura = record.cultura ? record.cultura.trim() : "Não informada";
      // Tipo
      const tipoLower = record.tipo?.toLowerCase() || "";
      if (tipoLower === "muda" || tipoLower.includes("muda")) record.tipo = "Muda";
      else if (tipoLower === "semente" || tipoLower.includes("semente")) record.tipo = "Semente";
      else if (tipoLower === "perene" || tipoLower.includes("perene")) record.tipo = "Perene";
      else record.tipo = "Muda";
      // Talhao
      record.talhao = record.talhao ? record.talhao.trim() : "Talhão Geral";
      // Quantidade
      const qtdNum = parseFloat(record.quantidade);
      record.quantidade = (isNaN(qtdNum) || qtdNum <= 0) ? 0 : qtdNum;
      // Unidade
      const unidLower = record.unidade?.toLowerCase() || "";
      if (unidLower === "unidades" || unidLower === "unidade" || unidLower === "und" || unidLower === "un" || !unidLower) {
        record.unidade = "Unidades";
      } else if (unidLower === "m²" || unidLower === "m2" || unidLower === "metros quadrados") {
        record.unidade = "m²";
      } else {
        record.unidade = "Unidades";
      }
      // Previsao
      const parsedPrev = parseDateToISO(record.previsao);
      record.previsao = parsedPrev || record.data;
      // aduboQt
      if (record.aduboqt) {
        const adNum = parseFloat(record.aduboqt);
        record.aduboQt = isNaN(adNum) ? 0 : adNum;
      } else {
        record.aduboQt = 0;
      }
      // aduboComp
      record.aduboComp = record.adubocomp ? record.adubocomp.trim() : "";
      // idLote
      record.idLote = record.idlote ? record.idlote.trim().toUpperCase() : "";
      // ID
      if (!record.id) {
        const datePart = record.data ? record.data.replace(/-/g, "").substring(2, 8) : "260101";
        const rand = Math.random().toString(36).substring(2, 6).toUpperCase();
        record.id = `PLAN-${datePart}-${rand}`;
      } else {
        record.id = record.id.trim().toUpperCase();
      }

      // Status (Opcional - parse intelligently)
      const statusLower = record.status?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
      const tabNameLower = tabName?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "") || "";
      const isFinalizedTab = tabNameLower.includes("finalizado") || tabNameLower.includes("concluido") || tabNameLower.includes("terminado") || tabNameLower.includes("encerrado") || tabNameLower.includes("archiv");

      if (statusLower.includes("finalizado") || statusLower.includes("concluido") || statusLower.includes("terminado") || statusLower.includes("encerrado")) {
        record.status = "Finalizado";
      } else if (isFinalizedTab) {
        record.status = "Finalizado";
      } else if (statusLower.includes("colhendo")) {
        record.status = "Colhendo";
      } else if (statusLower.includes("esperando") || statusLower.includes("espera")) {
        record.status = "Esperando colheita";
      } else if (statusLower.includes("no campo") || statusLower.includes("nocampo")) {
        record.status = "No campo";
      } else {
        // Fallback status depending on dataFim
        if (record.datafim || record.dataFim) {
          record.status = "Finalizado";
        } else {
          record.status = "No campo";
        }
      }

      // dataFim (Opcional)
      const dataFimRaw = record.datafim || record.dataFim;
      if (dataFimRaw) {
        const parsedDataFim = parseDateToISO(dataFimRaw);
        record.dataFim = parsedDataFim || null;
      } else if (record.status === "Finalizado") {
        record.dataFim = record.previsao || record.data;
      } else {
        record.dataFim = null;
      }

      // perdas (Opcional)
      const perdasRaw = record.perdas;
      const perdasNum = parseFloat(perdasRaw);
      record.perdas = isNaN(perdasNum) ? 0 : perdasNum;

      // obs (Opcional)
      record.obs = record.obs ? record.obs.trim() : "";

      // totalColhido (Opcional)
      const tcRaw = record.totalcolhido || record.totalColhido;
      const tcNum = parseFloat(tcRaw);
      record.totalColhido = isNaN(tcNum) ? 0 : tcNum;

    } else if (activeType === "harvests") {
      // Data
      const parsedDate = parseDateToISO(record.data);
      record.data = parsedDate || new Date().toISOString().split("T")[0];
      // idPlantio
      record.idPlantio = record.idplantio ? record.idplantio.trim().toUpperCase() : "SEM-ID";
      // Cultura
      record.cultura = record.cultura ? record.cultura.trim() : "Não informada";
      // Talhao
      record.talhao = record.talhao ? record.talhao.trim() : "Talhão Geral";
      // Qtd
      const qtdNum = parseFloat(record.qtd);
      record.qtd = (isNaN(qtdNum) || qtdNum <= 0) ? 0 : qtdNum;
      // idSessao
      record.idSessao = record.idsessao ? record.idsessao.trim().toUpperCase() : "SESS-GERAL";
    }

    return {
      index: idx,
      data: record,
      errors,
      warnings,
      status: errors.length > 0 ? "error" : "pending"
    };
  };

  const handleParseAndValidate = () => {
    if (!csvText.trim()) {
      onNotify("Por favor, cole o CSV ou carregue um arquivo.", "error");
      return;
    }

    try {
      const lines = parseCSV(csvText);
      if (lines.length < 2) {
        onNotify("Formato CSV inválido. Certifique-se de incluir a linha de cabeçalho e pelo menos uma linha de dados.", "error");
        return;
      }

      const headers = lines[0];
      const rows = lines.slice(1);
      
      const expectedColumns = templates[importType].columns.map(c => c.name.toLowerCase());
      
      // Check header match
      const lowerHeaders = headers.map(h => h.toLowerCase().trim());
      const missingHeaders: string[] = [];
      
      templates[importType].columns.forEach(col => {
        if (col.req && !lowerHeaders.includes(col.name.toLowerCase())) {
          missingHeaders.push(col.name);
        }
      });

      if (missingHeaders.length > 0) {
        onNotify(`Cabeçalhos obrigatórios ausentes no seu CSV: ${missingHeaders.join(", ")}`, "error");
        return;
      }

      const parsed: ParsedRow[] = rows.map((row, idx) => validateRow(headers, row, idx + 1, undefined, fileName));
      setParsedRows(parsed);
      setStep(3);
      onNotify(`Parsed ${parsed.length} linhas de dados com sucesso!`, "info");
    } catch (e: any) {
      onNotify(`Erro ao processar CSV: ${e.message}`, "error");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
    };
    reader.readAsText(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type === "text/csv" || file.name.endsWith(".csv")) {
      setFileName(file.name);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target?.result as string;
        setCsvText(text);
      };
      reader.readAsText(file);
    } else {
      onNotify("Por favor, envie apenas arquivos CSV.", "error");
    }
  };

  const handleConfirmImport = async () => {
    const validRows = parsedRows.filter(r => r.status !== "error");
    if (validRows.length === 0) {
      onNotify("Nenhum dado válido para importar.", "error");
      return;
    }

    setIsImporting(true);
    setProgress({ current: 0, total: validRows.length });

    try {
      let totalSaved = 0;
      const collName = importType; // crops, purchases, plantings, harvests matches the types

      // Load all plantings from Firestore to link harvests if importing harvests
      let allPlantings: Planting[] = [];
      const plantingsToUpdate: Record<string, Planting> = {};

      if (importType === "harvests") {
        try {
          const pSnapshot = await getDocs(collection(db, "plantings"));
          allPlantings = pSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Planting));
        } catch (err) {
          console.error("Erro ao carregar plantios para vinculação:", err);
        }
      }

      for (const row of validRows) {
        const itemData = { ...row.data };
        
        // Remove lowercase temporary mapping keys that are not part of the standard fields
        if (importType === "plantings") {
          delete itemData.idlote;
          delete itemData.aduboqt;
          delete itemData.adubocomp;
          delete itemData.datafim;
          delete itemData.totalcolhido;
        } else if (importType === "purchases") {
          delete itemData.quantidade_muda_semente;
        } else if (importType === "harvests") {
          delete itemData.idplantio;
          delete itemData.idsessao;
        }

        // Link harvest to planting and accumulate totalColhido
        if (importType === "harvests") {
          const harvestCultura = itemData.cultura;
          const harvestTalhao = itemData.talhao;
          const harvestDate = itemData.data;
          const harvestQtd = Number(itemData.qtd) || 0;

          let matchedP: Planting | null = null;
          if (itemData.idPlantio && itemData.idPlantio !== "SEM-ID") {
            matchedP = allPlantings.find(p => p.id === itemData.idPlantio) || null;
          }

          if (!matchedP) {
            matchedP = findBestPlantingId(harvestCultura, harvestTalhao, harvestDate, allPlantings);
          }

          if (matchedP) {
            itemData.idPlantio = matchedP.id;
            
            const pId = matchedP.id;
            if (!plantingsToUpdate[pId]) {
              plantingsToUpdate[pId] = { ...matchedP };
            }
            plantingsToUpdate[pId].totalColhido = (plantingsToUpdate[pId].totalColhido || 0) + harvestQtd;
            
            if (plantingsToUpdate[pId].status === "No campo" || plantingsToUpdate[pId].status === "Esperando colheita") {
              plantingsToUpdate[pId].status = "Colhendo";
            }
          }
        }

        await saveDocumentWithRestFallback(
          collName,
          itemData.id,
          itemData,
          `Linha ${row.index} de '${getLabel(importType)}' falhou`
        );
        totalSaved++;
        setProgress(prev => ({ ...prev, current: totalSaved }));
      }

      // Save any updated plantings to Firestore
      const plantingsListToUpdate = Object.values(plantingsToUpdate);
      if (plantingsListToUpdate.length > 0) {
        onNotify(`Atualizando ${plantingsListToUpdate.length} plantios correspondentes com novos volumes colhidos...`, "info");
        for (const updatedP of plantingsListToUpdate) {
          try {
            await saveDocumentWithRestFallback(
              "plantings",
              updatedP.id,
              updatedP,
              `Atualização do plantio ${updatedP.id} falhou`
            );
          } catch (pUpdateErr) {
            console.error("Erro ao atualizar plantio pós-colheita:", pUpdateErr);
          }
        }
      }

      onNotify(`${totalSaved} registros importados para '${getLabel(importType)}' com sucesso!`, "success");
      setStep(4);
    } catch (err: any) {
      console.error("Erro na importação:", err);
      onNotify(`Erro ao gravar dados no Firebase: ${err.message || err.toString()}`, "error");
    } finally {
      setIsImporting(false);
    }
  };

  const resetImporter = () => {
    setCsvText("");
    setParsedRows([]);
    setFileName("");
    setStep(1);
  };

  const findMatchingTab = (tabs: string[], type: ImportType): string | null => {
    let terms: string[] = [];
    if (type === "crops") {
      terms = ["cultura", "planta", "crop", "vegetal", "sementeira"];
    } else if (type === "purchases") {
      terms = ["compra", "estoque", "purchase", "entrada", "fornecedor"];
    } else if (type === "plantings") {
      terms = ["plantio", "canteiro", "planting", "cultivo", "lote"];
    } else if (type === "harvests") {
      terms = ["colheita", "harvest", "producao", "produção"];
    }

    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i].toLowerCase();
      if (terms.some(term => tab.includes(term))) {
        return tabs[i];
      }
    }
    return null;
  };

  const handleExpressSync = async () => {
    if (!spreadsheetId.trim()) {
      onNotify("Por favor, informe o ID da Planilha Google.", "error");
      return;
    }
    
    if (!googleToken) {
      onNotify("Você precisa se conectar ao Google primeiro.", "error");
      return;
    }

    setIsExpressSyncing(true);
    setExpressStatus("Lendo a estrutura da planilha...");
    setExpressResults(null);
    setExpressTabDetails([]);
    setExpressProgress({ current: 0, total: 0, currentType: "" });

    const results: Record<ImportType, number> = {
      crops: 0,
      purchases: 0,
      plantings: 0,
      harvests: 0
    };

    try {
      // 1. Fetch available tabs
      const tabsUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`;
      const tabsRes = await fetch(tabsUrl, {
        headers: { Authorization: `Bearer ${googleToken}` }
      });

      if (!tabsRes.ok) {
        throw new Error(`Falha ao conectar à API do Sheets: ${tabsRes.statusText}`);
      }

      const tabsData = await tabsRes.json();
      const tabs = tabsData.sheets?.map((s: any) => s.properties.title) || [];

      if (tabs.length === 0) {
        throw new Error("Nenhuma aba (página) encontrada na sua planilha.");
      }

      onNotify(`Abas encontradas na planilha: ${tabs.join(", ")}`, "info");

      const matchedTabsList: { type: ImportType; tabName: string }[] = [];
      for (const tab of tabs) {
        const tabLower = tab.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        let detectedType: ImportType | null = null;
        if (["cultura", "planta", "crop", "vegetal", "sementeira"].some(term => tabLower.includes(term))) {
          detectedType = "crops";
        } else if (["compra", "estoque", "purchase", "entrada", "fornecedor"].some(term => tabLower.includes(term))) {
          detectedType = "purchases";
        } else if (["colheita", "harvest", "producao"].some(term => tabLower.includes(term))) {
          detectedType = "harvests";
        } else if (["plantio", "canteiro", "planting", "cultivo", "lote", "finalizado", "concluido", "terminado", "encerrado", "archiv"].some(term => {
          const cleanTerm = term.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return tabLower.includes(cleanTerm);
        })) {
          detectedType = "plantings";
        }

        if (detectedType) {
          matchedTabsList.push({ type: detectedType, tabName: tab });
        }
      }

      let matchedAny = false;

      // Temporary structure to collect all valid rows to be written, to compute overall progress first
      const tasks: { type: ImportType; matchedTab: string; rows: ParsedRow[] }[] = [];
      let totalRowsToSync = 0;

      // 2. Iterate each detected tab and collect valid, non-empty rows
      for (const matchedTabItem of matchedTabsList) {
        const { type, tabName: matchedTab } = matchedTabItem;

        matchedAny = true;
        setExpressStatus(`Carregando '${matchedTab}'...`);
        onNotify(`Mapeando a aba '${matchedTab}' para '${getLabel(type)}'...`, "info");

        // Fetch values for matched tab
        const valUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(matchedTab)}!A1:Z2000`;
        const valRes = await fetch(valUrl, {
          headers: { Authorization: `Bearer ${googleToken}` }
        });

        if (!valRes.ok) {
          const errMsg = `Erro ao carregar dados da aba '${matchedTab}' (${valRes.statusText})`;
          console.warn(errMsg);
          onNotify(errMsg, "error");
          continue;
        }

        const valData = await valRes.json();
        const values: string[][] = valData.values || [];
        if (values.length < 2) {
          const emptyMsg = `Aba '${matchedTab}' está vazia ou sem linhas de dados válidos.`;
          console.log(emptyMsg);
          onNotify(emptyMsg, "info");
          continue;
        }

        const headers = values[0].map(h => h?.toString().trim() || "");
        // Filter out completely empty/blank rows before mapping
        const rawRows = values.slice(1).filter(row => row.some(cell => cell !== undefined && cell.toString().trim() !== ""));

        if (rawRows.length === 0) {
          onNotify(`Aba '${matchedTab}' só contém linhas vazias.`, "info");
          continue;
        }

        // Map columns automatically
        const fields = templates[type].columns.map(c => c.name);
        const mappings = autoMapHeaders(fields, headers);

        // Check if required mappings are satisfied
        const missingReq = templates[type].columns.filter(col => col.req && !mappings[col.name]);
        if (missingReq.length > 0) {
          const missingMsg = `Aba '${matchedTab}' (${getLabel(type)}) ignorada por falta de colunas obrigatórias: ${missingReq.map(m => m.name).join(", ")}`;
          console.warn(missingMsg);
          onNotify(missingMsg, "error");
          continue;
        }

        // Translate and validate rows
        const translatedHeaders = fields.map(f => f.toLowerCase());
        const parsed: ParsedRow[] = rawRows.map((row, idx) => {
          const translatedValues = fields.map(f => {
            const userColHeader = mappings[f];
            if (!userColHeader) return "";
            const colIdx = headers.indexOf(userColHeader);
            return (colIdx !== -1 && row[colIdx] !== undefined) ? row[colIdx].toString().trim() : "";
          });
          return validateRow(translatedHeaders, translatedValues, idx + 1, type, matchedTab);
        });

        const validRows = parsed.filter(r => r.status !== "error");
        if (validRows.length > 0) {
          tasks.push({ type, matchedTab, rows: validRows });
          totalRowsToSync += validRows.length;
          onNotify(`Aba '${matchedTab}' mapeada com sucesso! ${validRows.length} linhas prontas para sincronização.`, "success");
        } else {
          onNotify(`Aba '${matchedTab}' mapeada, mas nenhuma linha válida foi encontrada para importar.`, "error");
        }
      }

      if (!matchedAny) {
        throw new Error("Não foi possível identificar nenhuma aba correspondente na planilha. Verifique se os nomes das abas incluem termos como 'Culturas', 'Compras', 'Plantios' ou 'Colheitas'.");
      }

      if (totalRowsToSync === 0) {
        throw new Error("Nenhum registro com dados válidos para importar foi encontrado nas abas mapeadas. Verifique se as abas contêm as colunas e dados corretos.");
      }

      // Fetch all pre-existing plantings for fuzzy matching and linkage
      let allPlantings: Planting[] = [];
      const plantingsToUpdate: Record<string, Planting> = {};
      try {
        const pSnapshot = await getDocs(collection(db, "plantings"));
        allPlantings = pSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as Planting));
      } catch (err) {
        console.error("Erro ao carregar plantios para vinculação express:", err);
      }

      // Sort tasks by processing priority: crops (1) -> purchases (2) -> plantings (3) -> harvests (4)
      const typePriority: Record<ImportType, number> = {
        crops: 1,
        purchases: 2,
        plantings: 3,
        harvests: 4
      };
      tasks.sort((a, b) => typePriority[a.type] - typePriority[b.type]);

      // Initialize the overall progress state
      setExpressProgress({ current: 0, total: totalRowsToSync, currentType: "" });
      let overallSavedCount = 0;

      // 3. Process task writes sequentially with live granular updates
      for (const task of tasks) {
        setExpressProgress(prev => ({ ...prev, currentType: task.type }));
        let savedCountForTab = 0;

        for (const row of task.rows) {
          const itemData = { ...row.data };
          
          if (task.type === "plantings") {
            delete itemData.idlote;
            delete itemData.aduboqt;
            delete itemData.adubocomp;
            delete itemData.datafim;
            delete itemData.totalcolhido;
          } else if (task.type === "purchases") {
            delete itemData.quantidade_muda_semente;
          } else if (task.type === "harvests") {
            delete itemData.idplantio;
            delete itemData.idsessao;
          }

          // Link harvest to planting and accumulate totalColhido
          if (task.type === "harvests") {
            const harvestCultura = itemData.cultura;
            const harvestTalhao = itemData.talhao;
            const harvestDate = itemData.data;
            const harvestQtd = Number(itemData.qtd) || 0;

            let matchedP: Planting | null = null;
            if (itemData.idPlantio && itemData.idPlantio !== "SEM-ID") {
              matchedP = allPlantings.find(p => p.id === itemData.idPlantio) || null;
            }

            if (!matchedP) {
              matchedP = findBestPlantingId(harvestCultura, harvestTalhao, harvestDate, allPlantings);
            }

            if (matchedP) {
              itemData.idPlantio = matchedP.id;
              
              const pId = matchedP.id;
              if (!plantingsToUpdate[pId]) {
                plantingsToUpdate[pId] = { ...matchedP };
              }
              plantingsToUpdate[pId].totalColhido = (plantingsToUpdate[pId].totalColhido || 0) + harvestQtd;
              
              if (plantingsToUpdate[pId].status === "No campo" || plantingsToUpdate[pId].status === "Esperando colheita") {
                plantingsToUpdate[pId].status = "Colhendo";
              }
            }
          }

          // Write with custom try-catch and REST fallback so one bad row doesn't break or stall the entire sync!
          try {
            const savedId = await saveDocumentWithRestFallback(
              task.type,
              itemData.id,
              itemData,
              `Linha ${row.index} da aba '${task.matchedTab}'`
            );

            // If we successfully saved a planting, add/update it in our local candidate list!
            if (task.type === "plantings") {
              const fullPlanting = { ...itemData, id: savedId } as Planting;
              const existingIdx = allPlantings.findIndex(p => p.id === savedId);
              if (existingIdx !== -1) {
                allPlantings[existingIdx] = fullPlanting;
              } else {
                allPlantings.push(fullPlanting);
              }
            }

            savedCountForTab++;
          } catch (writeErr: any) {
            console.error(`Erro ao salvar no Firestore (Aba ${task.matchedTab}, Linha ${row.index}):`, writeErr);
            onNotify(`Aviso: Linha ${row.index} da aba '${task.matchedTab}' falhou: ${writeErr.message || writeErr}`, "error");
          }

          overallSavedCount++;
          setExpressProgress(prev => ({ ...prev, current: overallSavedCount }));
          setExpressStatus(`Gravando '${task.matchedTab}': ${savedCountForTab}/${task.rows.length} concluídos (Geral: ${overallSavedCount}/${totalRowsToSync})...`);
        }

        results[task.type] = (results[task.type] || 0) + savedCountForTab;
        setExpressTabDetails(prev => [...prev, { tabName: task.matchedTab, type: task.type, count: savedCountForTab }]);
      }

      // Save any updated plantings to Firestore
      const plantingsListToUpdate = Object.values(plantingsToUpdate);
      if (plantingsListToUpdate.length > 0) {
        setExpressStatus("Atualizando volumes colhidos nos canteiros...");
        for (const updatedP of plantingsListToUpdate) {
          try {
            await saveDocumentWithRestFallback(
              "plantings",
              updatedP.id,
              updatedP,
              `Atualização do plantio ${updatedP.id} falhou`
            );
          } catch (pUpdateErr) {
            console.error("Erro ao atualizar plantio pós-colheita express:", pUpdateErr);
          }
        }
      }

      setExpressResults(results);
      onNotify("Super Sincronização Express realizada com sucesso!", "success");
    } catch (err: any) {
      console.error("Erro na sincronização express:", err);
      onNotify(`Erro na Super Sincronização: ${err.message}`, "error");
    } finally {
      setIsExpressSyncing(false);
      setExpressStatus("");
    }
  };

  const validCount = parsedRows.filter(r => r.status !== "error").length;
  const invalidCount = parsedRows.filter(r => r.status === "error").length;

  return (
    <div className="space-y-6">
      
      {/* System Backup Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-3xl p-6 shadow-xl border border-indigo-900/40 flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-indigo-600/30 text-indigo-300 rounded-2xl border border-indigo-500/30 shrink-0">
            <Database className="w-8 h-8" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black text-white tracking-tight">Cópia de Segurança do Sistema</h2>
              <span className="text-[10px] font-extrabold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                Completo (.JSON)
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 max-w-xl leading-relaxed">
              Baixe um arquivo de segurança contendo todos os dados do sistema ou salve-o diretamente na sua conta do Google Drive com 1 clique.
            </p>
            {driveBackupLink && (
              <div className="mt-3 flex items-center gap-2 text-xs font-bold text-emerald-300 bg-emerald-950/80 border border-emerald-500/40 px-3.5 py-2 rounded-xl">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Backup salvo no Google Drive!</span>
                <a
                  href={driveBackupLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-white flex items-center gap-1 ml-auto text-emerald-200"
                >
                  Abrir no Drive <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto shrink-0">
          <button
            onClick={handleDownloadSystemBackup}
            disabled={isDownloadingBackup || isSavingToDrive}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-5 py-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-lg disabled:opacity-50"
          >
            {isDownloadingBackup ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Gerando Backup...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Baixar Backup (.JSON)
              </>
            )}
          </button>

          <button
            onClick={handleSaveBackupToDrive}
            disabled={isDownloadingBackup || isSavingToDrive}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-5 py-3.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-extrabold text-xs rounded-xl transition cursor-pointer shadow-lg disabled:opacity-50 border border-indigo-400/30"
          >
            {isSavingToDrive ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Salvando no Drive...
              </>
            ) : (
              <>
                <CloudUpload className="w-4 h-4" />
                Salvar no Google Drive
              </>
            )}
          </button>
        </div>
      </div>

      {/* Importer Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Card Header */}
        <div className="bg-slate-50 border-b border-slate-200 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">Importador de Planilhas</h1>
            <p className="text-xs text-slate-500 mt-1">Sincronize arquivos do Excel ou Google Sheets (.csv) diretamente para o banco de dados do sistema.</p>
          </div>
          
          {/* Header step badges */}
          <div className="flex items-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div 
                key={s} 
                className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                  step === s 
                    ? "bg-indigo-600 text-white ring-4 ring-indigo-50" 
                    : step > s 
                    ? "bg-emerald-500 text-white" 
                    : "bg-slate-200 text-slate-400"
                }`}
              >
                {step > s ? <Check className="w-3.5 h-3.5" /> : s}
              </div>
            ))}
          </div>
        </div>

        {/* STEP 1: SELECT COLLECTION */}
        {step === 1 && (
          <div className="p-6 space-y-6">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Passo 1: Selecione o que deseja importar</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(["crops", "purchases", "plantings", "harvests"] as const).map((type) => {
                const isSelected = importType === type;
                return (
                  <button
                    key={type}
                    onClick={() => setImportType(type)}
                    className={`p-5 rounded-2xl text-left border-2 transition-all cursor-pointer flex items-start gap-4 ${
                      isSelected 
                        ? "border-indigo-600 bg-indigo-50/20 text-indigo-900 shadow-xs" 
                        : "border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50"
                    }`}
                  >
                    <div className={`p-3 rounded-xl ${isSelected ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-800 text-sm">{getLabel(type)}</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {type === "crops" && "Lista de culturas botânicas, ciclos de crescimento e períodos de colheita."}
                        {type === "purchases" && "Notas fiscais de entrada de sementes e mudas para o estoque."}
                        {type === "plantings" && "Histórico de canteiros plantados, talhões, quantidades e estimativas."}
                        {type === "harvests" && "Registros diários das colheitas coletadas de cada canteiro."}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3 rounded-xl transition text-sm cursor-pointer shadow-xs"
              >
                Prosseguir
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: UPLOAD OR PASTE CSV / GOOGLE SHEETS */}
        {step === 2 && (
          <div className="p-6 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div>
                <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Passo 2: Escolha a Origem dos Dados</h2>
                <p className="text-xs text-slate-500 mt-0.5">Destinado para a coleção: <span className="text-indigo-600 font-bold">{getLabel(importType)}</span></p>
              </div>
            </div>

            {/* SOURCE TYPE TOGGLES */}
            <div className="flex bg-slate-100 p-1 rounded-xl w-fit">
              <button
                type="button"
                onClick={() => setSourceType("google")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  sourceType === "google"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                Sincronizar Google Sheets
              </button>
              <button
                type="button"
                onClick={() => setSourceType("csv")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  sourceType === "csv"
                    ? "bg-white text-indigo-700 shadow-xs"
                    : "text-slate-600 hover:text-slate-800"
                }`}
              >
                <Upload className="w-4 h-4 text-slate-500" />
                Arquivo Local CSV
              </button>
            </div>

            {sourceType === "google" ? (
              <div className="space-y-6">
                
                {/* 1. Google Account Connection Callout */}
                {isAuthLoading ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex items-center justify-center gap-3">
                    <RefreshCw className="w-5 h-5 text-indigo-600 animate-spin" />
                    <span className="text-sm text-slate-600">Verificando conexão com o Google...</span>
                  </div>
                ) : !googleUser ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div className="space-y-1 text-center md:text-left">
                      <h3 className="text-sm font-bold text-slate-800 flex items-center justify-center md:justify-start gap-1.5">
                        <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                        Conecte sua conta do Google
                      </h3>
                      <p className="text-xs text-slate-500">
                        Isso nos permitirá ler a planilha diretamente para importar as suas culturas, compras, plantios ou colheitas com segurança.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleLogin}
                      className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold px-4 py-2.5 rounded-xl border border-slate-200 transition cursor-pointer shadow-xs text-xs"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 48 48">
                        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                      </svg>
                      Conectar com o Google
                    </button>
                  </div>
                ) : (
                  <div className="bg-emerald-50/30 border border-emerald-100 rounded-2xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-semibold text-slate-700">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse" />
                      <span>Conectado como <strong className="text-emerald-800">{googleUser.email}</strong></span>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoogleLogout}
                      className="flex items-center gap-1 bg-white hover:bg-red-50 text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 px-3 py-1.5 rounded-lg transition cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      Desconectar
                    </button>
                  </div>
                )}
                
                {/* 2. Spreadsheet Setup Form */}
                {googleUser && (
                  <div className="bg-white rounded-2xl border border-slate-200 p-6 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                      <div className="md:col-span-2 space-y-2">
                        <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Identificador (ID) da Planilha Google</label>
                        <input
                          type="text"
                          value={spreadsheetId}
                          onChange={(e) => setSpreadsheetId(e.target.value)}
                          placeholder="Cole o ID da planilha do navegador"
                          className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:bg-white focus:border-indigo-500 outline-none transition font-bold"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleLoadSpreadsheet}
                        disabled={isLoadingSheets || !spreadsheetId.trim()}
                        className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 px-6 rounded-xl transition text-sm cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isLoadingSheets && sheetTabs.length === 0 ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <Database className="w-4 h-4" />
                        )}
                        {isLoadingSheets && sheetTabs.length === 0 ? "Carregando..." : "Carregando Abas"}
                      </button>
                    </div>

                    {/* Super Express Sync Feature Box */}
                    <div className="bg-gradient-to-r from-emerald-500/10 to-indigo-500/10 border border-emerald-500/30 rounded-2xl p-5 space-y-4">
                      <div className="flex items-start gap-3">
                        <div className="p-2.5 bg-emerald-600 text-white rounded-xl shadow-md shrink-0">
                          <Zap className="w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                          <h3 className="font-extrabold text-slate-800 text-sm">Super Sincronização Express (Recomendado)</h3>
                          <p className="text-xs text-slate-500 mt-1">
                            Bypasse a burocracia! Sincronize **todas as abas de uma só vez** (Culturas, Estoque, Plantios e Colheitas) com apenas um clique. O sistema identifica as abas automaticamente pelos nomes.
                          </p>
                        </div>
                      </div>

                      {isExpressSyncing ? (
                        <div className="bg-white border border-emerald-100/50 rounded-xl p-5 shadow-sm space-y-4">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg animate-spin">
                              <RefreshCw className="w-5 h-5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">Sincronizando Banco de Dados</p>
                              <p className="text-xs text-slate-500 truncate mt-0.5">{expressStatus}</p>
                            </div>
                            {expressProgress.total > 0 && (
                              <span className="text-xs font-mono font-bold bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full border border-emerald-100">
                                {Math.round((expressProgress.current / expressProgress.total) * 100)}%
                              </span>
                            )}
                          </div>
                          
                          {expressProgress.total > 0 && (
                            <div className="space-y-1.5">
                              {/* Progress Track */}
                              <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                                <div 
                                  className="bg-emerald-600 h-full rounded-full transition-all duration-300"
                                  style={{ width: `${(expressProgress.current / expressProgress.total) * 100}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] text-slate-400 font-bold uppercase tracking-wide">
                                <span>Gravando: {getLabel(expressProgress.currentType as ImportType) || "Processando..."}</span>
                                <span>{expressProgress.current} de {expressProgress.total} registros</span>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-3">
                          <button
                            type="button"
                            onClick={handleExpressSync}
                            disabled={!spreadsheetId.trim() || isExpressSyncing}
                            className="w-full flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold py-3.5 px-6 rounded-xl transition text-sm cursor-pointer shadow-md disabled:opacity-50 hover:scale-[1.01] active:scale-[0.99]"
                          >
                            <Zap className="w-4 h-4" />
                            Sincronizar Planilha Inteira Agora!
                          </button>
                          
                          {expressResults && (
                            <div className="bg-white border border-emerald-100 rounded-xl p-4 space-y-2.5 text-xs">
                              <h4 className="font-bold text-slate-700 uppercase tracking-wider text-[10px] flex items-center gap-1 text-emerald-600">
                                <Check className="w-3.5 h-3.5" />
                                Resultados da Sincronização Express:
                              </h4>
                              <div className="grid grid-cols-2 gap-2 text-slate-600 font-bold">
                                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between">
                                  <span>🌱 Culturas:</span>
                                  <span className="text-indigo-600">{expressResults.crops || 0} gravados</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between">
                                  <span>📦 Compras/Estoque:</span>
                                  <span className="text-indigo-600">{expressResults.purchases || 0} gravados</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between">
                                  <span>🚜 Plantios/Lotes:</span>
                                  <span className="text-indigo-600">{expressResults.plantings || 0} gravados</span>
                                </div>
                                <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-100 flex justify-between">
                                  <span>🧺 Colheitas:</span>
                                  <span className="text-indigo-600">{expressResults.harvests || 0} gravados</span>
                                </div>
                              </div>

                              {expressTabDetails.length > 0 && (
                                <div className="mt-3 pt-3 border-t border-slate-100 space-y-1.5">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detalhes por Aba Processada:</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                                    {expressTabDetails.map((detail, idx) => (
                                      <div key={idx} className="bg-emerald-50/20 p-2 rounded-lg border border-emerald-100/30 flex justify-between items-center text-[11px]">
                                        <span className="text-slate-600 font-medium truncate max-w-[130px]">📋 {detail.tabName}</span>
                                        <span className="font-extrabold text-emerald-700 shrink-0">{detail.count} salvos</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3. Tab Selector if sheets are loaded */}
                    {sheetTabs.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-6">
                        <div className="space-y-2">
                          <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Selecione a Aba (Página) da Planilha</label>
                          <select
                            value={selectedTab}
                            onChange={(e) => {
                              setSelectedTab(e.target.value);
                              handleLoadTabDetails(e.target.value);
                            }}
                            className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:border-indigo-500 outline-none transition text-xs font-bold"
                          >
                            {sheetTabs.map(tab => (
                              <option key={tab} value={tab}>{tab}</option>
                            ))}
                          </select>
                        </div>
                        {isLoadingSheets && (
                          <div className="flex items-center gap-2 text-indigo-600 text-xs font-bold mt-8">
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            Lendo colunas e dados da aba...
                          </div>
                        )}
                      </div>
                    )}

                    {/* 4. Mapeamento de Colunas UI */}
                    {isMappingLoaded && sheetHeaders.length > 0 && (
                      <div className="border-t border-slate-100 pt-6 space-y-4">
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            Mapeamento das Colunas da Planilha
                          </h3>
                          <p className="text-xs text-slate-500 mt-1">
                            Correlacione as colunas da sua planilha com os campos do sistema. Nós já auto-mapeamos as colunas parecidas para você!
                          </p>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                          {templates[importType].columns.map((col) => {
                            const isReq = col.req;
                            const currentVal = columnMappings[col.name] || "";
                            return (
                              <div key={col.name} className="bg-white p-3.5 rounded-xl border border-slate-150 flex flex-col justify-between gap-2.5">
                                <div className="space-y-0.5">
                                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                                    {col.name}
                                    {isReq && <span className="text-red-500 font-sans">*</span>}
                                  </span>
                                  <p className="text-[10px] text-slate-400 font-medium">{col.desc}</p>
                                </div>
                                <select
                                  value={currentVal}
                                  onChange={(e) => setColumnMappings(prev => ({ ...prev, [col.name]: e.target.value }))}
                                  className={`p-2 rounded-lg border text-xs focus:border-indigo-500 outline-none font-bold transition ${
                                    isReq && !currentVal 
                                      ? "border-amber-300 bg-amber-50/10 text-amber-800" 
                                      : currentVal 
                                      ? "border-emerald-200 bg-emerald-50/10 text-emerald-800"
                                      : "border-slate-200 bg-slate-50 text-slate-500"
                                  }`}
                                >
                                  <option value="">-- Ignorar ou Não Mapeado --</option>
                                  {sheetHeaders.map((header) => (
                                    <option key={header} value={header}>{header}</option>
                                  ))}
                                </select>
                              </div>
                            );
                          })}
                        </div>

                        <div className="flex justify-end pt-4">
                          <button
                            type="button"
                            onClick={handleValidateGoogleSheets}
                            disabled={sheetRawRows.length === 0}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-6 py-3.5 rounded-xl transition text-sm cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            Processar e Validar Dados da Planilha
                            <ArrowRight className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                  </div>
                )}

                {/* Back Button for Google Source Type */}
                <div className="flex justify-between pt-4 border-t border-slate-100 font-bold">
                  <button
                    onClick={() => setStep(1)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl transition text-sm cursor-pointer border border-slate-200"
                  >
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Opção CSV: Prepare e envie o arquivo</h2>
                    <p className="text-xs text-slate-500 mt-0.5">Cole os dados brutos ou envie o arquivo .csv estruturado.</p>
                  </div>
                  
                  {/* Template Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={handleCopyTemplate}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      <Clipboard className="w-3.5 h-3.5" />
                      Copiar Modelo
                    </button>
                    <button
                      onClick={handleDownloadTemplate}
                      className="flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-3 py-2 rounded-lg border border-slate-200 transition cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar Modelo CSV
                    </button>
                  </div>
                </div>

                {/* Template Column Specifications Table */}
                <div className="bg-slate-50 rounded-xl border border-slate-200 overflow-hidden">
                  <div className="bg-slate-100/50 p-3.5 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-500" />
                    Especificação de Colunas Requeridas
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs divide-y divide-slate-200">
                      <thead className="bg-slate-50">
                        <tr className="text-[10px] uppercase text-slate-400 font-bold">
                          <th className="p-3.5">Coluna</th>
                          <th className="p-3.5 text-center">Tipo</th>
                          <th className="p-3.5">Descrição</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 text-slate-600">
                        {templates[importType].columns.map((col) => (
                          <tr key={col.name} className="hover:bg-slate-100/30">
                            <td className="p-3.5 font-mono font-bold text-slate-800">
                              {col.name} {col.req && <span className="text-red-500 font-sans" title="Obrigatório">*</span>}
                            </td>
                            <td className="p-3.5 text-center">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${col.req ? "bg-red-50 text-red-700 border border-red-100" : "bg-slate-100 text-slate-500"}`}>
                                {col.req ? "Obrigatório" : "Opcional"}
                              </span>
                            </td>
                            <td className="p-3.5 text-slate-500">{col.desc}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Upload Zone & Paste Option Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  
                  {/* Drag and Drop Zone */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Opção A: Enviar Arquivo CSV</label>
                    <div
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                      className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer min-h-[220px] transition ${
                        isDragging 
                          ? "border-indigo-500 bg-indigo-50/30" 
                          : fileName 
                          ? "border-emerald-500 bg-emerald-50/10" 
                          : "border-slate-200 hover:border-indigo-400 bg-white"
                      }`}
                    >
                      <input
                        type="file"
                        ref={fileInputRef}
                        accept=".csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-3 ${fileName ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                        <Upload className="w-6 h-6" />
                      </div>
                      {fileName ? (
                        <div>
                          <p className="text-sm font-bold text-slate-800">{fileName}</p>
                          <p className="text-xs text-emerald-600 mt-1 font-bold">Arquivo carregado com sucesso!</p>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setFileName("");
                              setCsvText("");
                            }}
                            className="text-xs text-red-500 underline font-bold mt-3 hover:text-red-700 block mx-auto"
                          >
                            Remover Arquivo
                          </button>
                        </div>
                      ) : (
                        <div>
                          <p className="text-sm font-bold text-slate-700">Arraste seu arquivo CSV ou clique para buscar</p>
                          <p className="text-xs text-slate-400 mt-1.5">Suporta delimitadores de vírgula (,) ou ponto-e-vírgula (;)</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Paste Box */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">Opção B: Copiar e colar dados em formato CSV</label>
                    <textarea
                      value={csvText}
                      onChange={(e) => setCsvText(e.target.value)}
                      placeholder={`Cole aqui suas linhas, por exemplo:\nnome;cientifico;dias;duracao\nMorango;Fragaria;90;60`}
                      className="w-full h-[220px] p-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-xs focus:bg-white focus:border-indigo-500 outline-none resize-none transition"
                    />
                  </div>

                </div>

                {/* Back & Parse Buttons */}
                <div className="flex justify-between pt-4 border-t border-slate-100 font-bold">
                  <button
                    onClick={() => setStep(1)}
                    className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl transition text-sm cursor-pointer border border-slate-200"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={handleParseAndValidate}
                    disabled={!csvText.trim()}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition text-sm cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Validar e Visualizar Dados
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* STEP 3: PREVIEW & VALIDATE */}
        {step === 3 && (
          <div className="p-6 space-y-6">
            <div>
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Passo 3: Pré-visualização e Validação dos Registros</h2>
              <p className="text-xs text-slate-500 mt-0.5">Analise o diagnóstico de integridade de cada linha antes de gravar no Firebase.</p>
            </div>

            {/* Diagnostics Card */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl flex flex-col justify-center text-center">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Detectado</span>
                <span className="text-2xl font-black text-slate-800 mt-1">{parsedRows.length} linhas</span>
              </div>
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl flex flex-col justify-center text-center">
                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">Registros Válidos</span>
                <span className="text-2xl font-black text-emerald-700 mt-1">{validCount} linhas</span>
              </div>
              <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex flex-col justify-center text-center">
                <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Linhas com Erro</span>
                <span className="text-2xl font-black text-red-700 mt-1">{invalidCount} linhas</span>
              </div>
            </div>

            {/* Table Grid of Rows */}
            <div className="border border-slate-200 rounded-2xl overflow-hidden bg-white">
              <div className="overflow-x-auto max-h-[300px]">
                <table className="w-full text-left text-xs divide-y divide-slate-200">
                  <thead className="bg-slate-50 sticky top-0">
                    <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      <th className="p-3 text-center w-12">Linha</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Conteúdo Detalhado</th>
                      <th className="p-3">Alertas / Diagnóstico</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedRows.map((row) => (
                      <tr key={row.index} className={row.status === "error" ? "bg-red-50/30 hover:bg-red-50/50" : "hover:bg-slate-50/40"}>
                        <td className="p-3 text-center text-slate-400 font-mono font-bold">{row.index}</td>
                        <td className="p-3">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            row.status === "error" 
                              ? "bg-red-100 text-red-800 border border-red-200" 
                              : "bg-emerald-100 text-emerald-800 border border-emerald-200"
                          }`}>
                            {row.status === "error" ? (
                              <>
                                <AlertTriangle className="w-3 h-3" />
                                Inválido
                              </>
                            ) : (
                              <>
                                <Check className="w-3 h-3" />
                                Pronto
                              </>
                            )}
                          </span>
                        </td>
                        <td className="p-3">
                          <div className="max-w-[350px] overflow-hidden truncate font-mono text-[11px] text-slate-600 font-bold" title={JSON.stringify(row.data)}>
                            {Object.entries(row.data).map(([k, v]) => `${k}: ${v}`).join(" | ")}
                          </div>
                        </td>
                        <td className="p-3 text-xs">
                          {row.errors.length > 0 && (
                            <div className="text-red-600 font-semibold space-y-1">
                              {row.errors.map((e, idx) => (
                                <p key={idx} className="flex items-center gap-1">❌ {e}</p>
                              ))}
                            </div>
                          )}
                          {row.warnings.length > 0 && (
                            <div className="text-amber-600 font-semibold space-y-1">
                              {row.warnings.map((w, idx) => (
                                <p key={idx} className="flex items-center gap-1">⚠️ {w}</p>
                              ))}
                            </div>
                          )}
                          {row.errors.length === 0 && row.warnings.length === 0 && (
                            <span className="text-emerald-600 font-semibold">Tudo correto! Pronto para importação.</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Back & Confirm Imports buttons */}
            <div className="flex justify-between pt-4 border-t border-slate-100 font-bold">
              <button
                onClick={() => setStep(2)}
                disabled={isImporting}
                className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-5 py-3 rounded-xl transition text-sm cursor-pointer border border-slate-200 disabled:opacity-50"
              >
                Voltar
              </button>
              
              <div className="flex items-center gap-3">
                {invalidCount > 0 && (
                  <span className="text-xs text-red-600 font-semibold flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {invalidCount} linhas serão ignoradas por conterem erros.
                  </span>
                )}
                
                <button
                  onClick={handleConfirmImport}
                  disabled={isImporting || validCount === 0}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl transition text-sm cursor-pointer shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Gravando no Firebase ({progress.current}/{progress.total})...
                    </>
                  ) : (
                    <>
                      <Database className="w-4 h-4" />
                      Gravar {validCount} Linhas no Banco
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: FINISHED SUMMARY */}
        {step === 4 && (
          <div className="p-8 text-center space-y-6 max-w-md mx-auto py-16">
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto border-4 border-emerald-50 shadow-sm animate-bounce">
              <CheckCircle2 className="w-10 h-10" />
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-extrabold text-slate-800">Importação Concluída!</h2>
              <p className="text-sm text-slate-500">Seus dados de planilhas foram sincronizados e gravados com sucesso diretamente no seu banco de dados Firebase.</p>
            </div>

            <div className="bg-slate-50 rounded-2xl border border-slate-150 p-4 font-bold text-xs text-slate-700 flex justify-between items-center">
              <span>Tipo de Lote:</span>
              <span className="text-indigo-600 font-extrabold bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-lg uppercase">{getLabel(importType)}</span>
            </div>

            <div className="flex justify-center gap-3 pt-4 font-bold">
              <button
                onClick={resetImporter}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl transition text-sm cursor-pointer shadow-xs"
              >
                Nova Importação
              </button>
            </div>
          </div>
        )}

      </div>

      {/* Danger Zone: Reset Database */}
      <div className="bg-white rounded-2xl border border-red-150 shadow-xs overflow-hidden">
        <div className="bg-red-50/50 border-b border-red-100 p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="w-5 h-5 text-red-600" />
              <h3 className="font-extrabold text-base tracking-tight">Zona de Perigo: Redefinir Banco de Dados</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Deseja limpar todos os registros existentes para recomeçar do zero? Isso apagará plantios, colheitas e compras.
            </p>
          </div>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-amber-50/70 border border-amber-200/60 rounded-xl p-4 flex gap-3 text-xs text-amber-800">
            <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">Como funciona a limpeza de dados:</p>
              <ul className="list-disc list-inside mt-1 space-y-1">
                <li>Todos os registros de <strong className="text-slate-900">Plantios</strong>, <strong className="text-slate-900">Colheitas Diárias</strong> e <strong className="text-slate-900">Compras / Notas Fiscais</strong> serão permanentemente excluídos.</li>
                <li>O catálogo de <strong className="text-slate-900">Culturas Botânicas</strong> será redefinido para a lista original de 30 culturas orgânicas padrão.</li>
                <li>Este processo é definitivo e ajudará você a reimportar planilhas inteiramente corrigidas sem gerar duplicidade.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2.5">
              <input
                type="checkbox"
                id="confirm-reset-checkbox"
                checked={confirmResetCheckbox}
                onChange={(e) => setConfirmResetCheckbox(e.target.checked)}
                className="w-4.5 h-4.5 text-red-600 border-slate-300 rounded focus:ring-red-500 cursor-pointer"
              />
              <label htmlFor="confirm-reset-checkbox" className="text-xs font-bold text-slate-700 select-none cursor-pointer leading-tight">
                Estou ciente de que esta ação é irreversível e apagará todos os dados de produção do Firebase.
              </label>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3 w-full md:w-auto">
              <button
                type="button"
                onClick={handleDownloadSystemBackup}
                disabled={isDownloadingBackup || isSavingToDrive}
                className="w-full sm:w-auto px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer border border-slate-200"
              >
                <Download className="w-4 h-4 text-emerald-600" />
                Baixar JSON
              </button>

              <button
                type="button"
                onClick={handleSaveBackupToDrive}
                disabled={isDownloadingBackup || isSavingToDrive}
                className="w-full sm:w-auto px-4 py-3 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 cursor-pointer border border-indigo-200"
              >
                <CloudUpload className="w-4 h-4 text-indigo-600" />
                Salvar no Drive
              </button>

              <button
                onClick={handleResetDatabase}
                disabled={!confirmResetCheckbox || isResetting}
                className={`w-full sm:w-auto px-5 py-3 rounded-xl font-bold text-xs text-white shadow-xs transition duration-150 flex items-center justify-center gap-2 cursor-pointer ${
                  confirmResetCheckbox && !isResetting
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-300"
                }`}
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Apagando Dados...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4" />
                    Apagar Tudo e Recomeçar
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

    </div>
  );
}
