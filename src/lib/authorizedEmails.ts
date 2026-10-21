import { collection, getDocs, getDoc, setDoc, deleteDoc, doc } from "firebase/firestore";
import { db } from "./firebase";

export interface AuthorizedEmail {
  id: string;
  email: string;
  addedBy?: string;
  addedAt?: string;
  role?: "admin" | "user";
}

export interface AuthSettings {
  isRestricted: boolean;
  allowedDomains: string[];
}

/**
 * Administrators who always have access. Keep this list identical to
 * isPermanentAdmin() in firestore.rules — the rules are what actually
 * protect the data; this list only drives the interface.
 */
export const PERMANENT_ADMIN_EMAILS = [
  "thiagovinicius7@gmail.com",
  "rafaelmorenocampos@gmail.com"
];

export type AccessRole = "admin" | "user";

/**
 * Normalizes email to lowercase and trimmed string
 */
export function normalizeEmail(email: string): string {
  return email ? email.trim().toLowerCase() : "";
}

/**
 * Creates a safe Firestore document ID from an email address
 */
export function getEmailDocId(email: string): string {
  return normalizeEmail(email).replace(/[^a-zA-Z0-9_.]/g, "_");
}

/**
 * Fetches global access control settings from Firestore
 */
export async function getAuthSettings(): Promise<AuthSettings> {
  try {
    const snap = await getDoc(doc(db, "metadata", "auth_settings"));
    if (snap.exists()) {
      const data = snap.data();
      return {
        isRestricted: data.isRestricted !== false, // default true
        allowedDomains: Array.isArray(data.allowedDomains) ? data.allowedDomains : []
      };
    }
  } catch (err) {
    console.warn("Erro ao buscar configurações de acesso:", err);
  }
  return {
    isRestricted: true,
    allowedDomains: []
  };
}

/**
 * Updates global access control settings in Firestore
 */
export async function saveAuthSettings(settings: AuthSettings): Promise<void> {
  await setDoc(doc(db, "metadata", "auth_settings"), {
    isRestricted: settings.isRestricted,
    allowedDomains: settings.allowedDomains || [],
    updatedAt: new Date().toISOString()
  });
}

function isPermanentAdmin(cleanEmail: string): boolean {
  return PERMANENT_ADMIN_EMAILS.some(admin => normalizeEmail(admin) === cleanEmail);
}

/**
 * Returns the bare domain of an allowed-domain entry ("@exemplo.com" -> "exemplo.com").
 */
function bareDomain(entry: string): string {
  return normalizeEmail(entry).replace(/^@/, "");
}

/**
 * Works out what access the given e-mail has. Mirrors isMember()/isAdmin()
 * in firestore.rules: permanent admins, e-mails in authorized_emails,
 * allowed domains, or open mode. Returns null when there is no access.
 */
export async function getAccessRole(email: string): Promise<AccessRole | null> {
  if (!email) return null;
  const cleanEmail = normalizeEmail(email);

  if (isPermanentAdmin(cleanEmail)) {
    syncAdminEmailToFirestore(cleanEmail).catch(console.error);
    return "admin";
  }

  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao verificar autorização no banco")), 8000)
    );

    const docSnap = (await Promise.race([
      getDoc(doc(db, "authorized_emails", getEmailDocId(cleanEmail))),
      timeoutPromise
    ])) as any;
    if (docSnap && docSnap.exists()) {
      return docSnap.data()?.role === "admin" ? "admin" : "user";
    }

    const settings = await getAuthSettings();
    if (!settings.isRestricted) {
      return "user";
    }
    const domain = cleanEmail.split("@")[1] || "";
    if (domain && settings.allowedDomains.some(d => bareDomain(d) === domain)) {
      return "user";
    }
  } catch (err) {
    console.error("Erro ao verificar e-mail autorizado:", err);
  }
  return null;
}

/**
 * Checks if the given email is authorized to access the system.
 */
export async function isEmailAuthorized(email: string): Promise<boolean> {
  return (await getAccessRole(email)) !== null;
}

/**
 * Ensures permanent admin emails exist in Firestore
 */
async function syncAdminEmailToFirestore(email: string) {
  try {
    const docId = getEmailDocId(email);
    const docRef = doc(db, "authorized_emails", docId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) {
      await setDoc(docRef, {
        email: normalizeEmail(email),
        addedBy: "Sistema (Administrador Padrão)",
        addedAt: new Date().toISOString(),
        role: "admin"
      });
    }
  } catch (err) {
    // Non-critical background sync
    console.warn("Async sync admin email error:", err);
  }
}

/**
 * Fetches all authorized emails from Firestore.
 */
export async function getAuthorizedEmails(): Promise<AuthorizedEmail[]> {
  try {
    const colRef = collection(db, "authorized_emails");
    const snapshot = await getDocs(colRef);
    const map = new Map<string, AuthorizedEmail>();

    // Add entries from Firestore
    snapshot.docs.forEach(d => {
      const data = d.data();
      const mail = normalizeEmail(data.email || "");
      if (mail) {
        map.set(mail, {
          id: d.id,
          email: mail,
          addedBy: data.addedBy,
          addedAt: data.addedAt,
          role: PERMANENT_ADMIN_EMAILS.some(a => normalizeEmail(a) === mail) ? "admin" : (data.role || "user")
        });
      }
    });

    // Ensure permanent admins are always included in the list
    for (const adminEmail of PERMANENT_ADMIN_EMAILS) {
      const norm = normalizeEmail(adminEmail);
      if (!map.has(norm)) {
        const id = getEmailDocId(norm);
        const item: AuthorizedEmail = {
          id,
          email: norm,
          addedBy: "Sistema (Administrador)",
          addedAt: new Date().toISOString(),
          role: "admin"
        };
        map.set(norm, item);
        setDoc(doc(db, "authorized_emails", id), item).catch(console.error);
      }
    }

    return Array.from(map.values()).sort((a, b) => a.email.localeCompare(b.email));
  } catch (err) {
    console.error("Erro ao buscar e-mails autorizados:", err);
    return PERMANENT_ADMIN_EMAILS.map(email => ({
      id: getEmailDocId(email),
      email: normalizeEmail(email),
      addedBy: "Sistema (Fallback)",
      addedAt: new Date().toISOString(),
      role: "admin"
    }));
  }
}

/**
 * Adds a new email to the authorized_emails collection.
 */
export async function addAuthorizedEmail(newEmail: string, addedByEmail: string): Promise<void> {
  const cleanEmail = normalizeEmail(newEmail);
  if (!cleanEmail || !cleanEmail.includes("@")) {
    throw new Error("Por favor, informe um endereço de e-mail válido.");
  }

  const docId = getEmailDocId(cleanEmail);
  await setDoc(doc(db, "authorized_emails", docId), {
    email: cleanEmail,
    addedBy: addedByEmail || "Administrador",
    addedAt: new Date().toISOString(),
    role: PERMANENT_ADMIN_EMAILS.some(a => normalizeEmail(a) === cleanEmail) ? "admin" : "user"
  });
}

/**
 * Removes an email from the authorized_emails collection.
 */
export async function removeAuthorizedEmail(docId: string): Promise<void> {
  await deleteDoc(doc(db, "authorized_emails", docId));
}

