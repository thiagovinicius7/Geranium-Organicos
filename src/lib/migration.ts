import { initializeApp, getApps, deleteApp, FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  memoryLocalCache,
  collection,
  getDocs,
  doc,
  writeBatch,
  Firestore
} from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, signOut } from "firebase/auth";
import legacyConfig from "../../firebase-legacy-config.json";
import { db } from "./firebase";
import { getEmailDocId, normalizeEmail } from "./authorizedEmails";

/** Production data: replaced entirely by the migrated copy. */
export const DATA_COLLECTIONS = ["crops", "purchases", "plantings", "harvests", "licenses"] as const;

/** Settings: merged (upserted) so current admins are never locked out mid-migration. */
export const SETTINGS_COLLECTIONS = ["metadata", "authorized_emails"] as const;

export const ALL_COLLECTIONS = [...DATA_COLLECTIONS, ...SETTINGS_COLLECTIONS];

export interface MigrationDoc {
  id: string;
  data: Record<string, any>;
}

export type MigrationData = Record<string, MigrationDoc[]>;

/** Accounts from the removed username/password login, never carried over. */
const DROPPED_EMAILS = ["certificadora@geranium.com.br"];

const BATCH_SIZE = 400;

/**
 * Signs in to the old AI Studio Firebase project with a Google popup and
 * reads every collection from it. Signs out of the old project afterwards.
 */
export async function readLegacyDatabase(
  onProgress: (msg: string) => void
): Promise<MigrationData> {
  const appName = "legacy-ai-studio";
  const existing = getApps().find(a => a.name === appName);
  const legacyApp: FirebaseApp = existing || initializeApp(legacyConfig, appName);

  try {
    const legacyAuth = getAuth(legacyApp);
    onProgress("Entre com sua conta Google no banco antigo…");
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    await signInWithPopup(legacyAuth, provider);

    const legacyDb: Firestore = initializeFirestore(
      legacyApp,
      { experimentalForceLongPolling: true, localCache: memoryLocalCache() },
      (legacyConfig as any).firestoreDatabaseId
    );

    const result: MigrationData = {};
    for (const name of ALL_COLLECTIONS) {
      onProgress(`Lendo "${name}" do banco antigo…`);
      const snap = await getDocs(collection(legacyDb, name));
      result[name] = snap.docs.map(d => ({ id: d.id, data: d.data() }));
    }

    await signOut(legacyAuth).catch(() => {});
    return result;
  } finally {
    await deleteApp(legacyApp).catch(() => {});
  }
}

/**
 * Parses a backup file produced by "Baixar Backup" (Importar Planilha).
 */
export function parseBackupFile(text: string): MigrationData {
  const parsed = JSON.parse(text);
  const cols = parsed?.collections;
  if (!cols || typeof cols !== "object") {
    throw new Error("Arquivo inválido: não é um backup do Geranium Orgânicos.");
  }
  const result: MigrationData = {};
  for (const name of ALL_COLLECTIONS) {
    const list = Array.isArray(cols[name]) ? cols[name] : [];
    result[name] = list.map((item: any, i: number) => {
      const { _firestoreDocId, ...data } = item || {};
      const id = String(_firestoreDocId || data.id || `${name}_restaurado_${i}`);
      return { id, data };
    });
  }
  return result;
}

/**
 * Normalizes authorized e-mails to the document IDs the security rules expect,
 * and drops the removed Certificadora account.
 */
function cleanAuthorizedEmails(docs: MigrationDoc[]): MigrationDoc[] {
  const byId = new Map<string, MigrationDoc>();
  for (const d of docs) {
    const email = normalizeEmail(d.data.email || "");
    if (!email || DROPPED_EMAILS.includes(email)) continue;
    const id = getEmailDocId(email);
    byId.set(id, {
      id,
      data: { ...d.data, email, role: d.data.role === "admin" ? "admin" : "user" }
    });
  }
  return Array.from(byId.values());
}

export function summarize(data: MigrationData): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of ALL_COLLECTIONS) out[name] = (data[name] || []).length;
  return out;
}

/** What the migration panel selects by default: crops and settings only. */
export const DEFAULT_SELECTION: string[] = ["crops", "metadata", "authorized_emails"];

/**
 * Writes the selected collections into this app's database. A selected
 * production collection is cleared first so the copy is exact (and the
 * default crops created on first login don't get duplicated). Settings are
 * upserted. Collections that are not selected are left untouched.
 */
export async function writeToCurrentDatabase(
  data: MigrationData,
  selected: string[],
  onProgress: (msg: string) => void
): Promise<Record<string, number>> {
  const chosen = ALL_COLLECTIONS.filter(name => selected.includes(name));

  for (const name of DATA_COLLECTIONS) {
    if (!chosen.includes(name)) continue;
    onProgress(`Limpando "${name}" no banco novo…`);
    const snap = await getDocs(collection(db, name));
    await commitInBatches(snap.docs.map(d => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)));
  }

  const written: Record<string, number> = {};
  for (const name of chosen) {
    let docs = data[name] || [];
    if (name === "authorized_emails") docs = cleanAuthorizedEmails(docs);
    onProgress(`Gravando ${docs.length} registro(s) em "${name}"…`);
    await commitInBatches(
      docs.map(d => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, name, d.id), d.data))
    );
    written[name] = docs.length;
  }
  return written;
}

async function commitInBatches(ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < ops.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    ops.slice(i, i + BATCH_SIZE).forEach(op => op(batch));
    await batch.commit();
  }
}
