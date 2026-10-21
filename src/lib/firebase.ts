import { initializeApp } from "firebase/app";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from "firebase/auth";
import firebaseConfig from "../../firebase-config.json";

/**
 * True when firebase-config.json still holds the placeholder values
 * (the app's own Firebase project has not been configured yet).
 */
export const isFirebaseConfigured = Object.values(firebaseConfig).every(
  v => typeof v === "string" && v.trim() !== "" && v !== "COLE_AQUI"
);

const app = initializeApp(firebaseConfig);

// The app's own project uses the standard "(default)" Firestore database.
const dbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
  localCache: memoryLocalCache(),
}, dbId);

// Initialize Firebase Auth
export const auth = getAuth(app);

// Default standard Google provider for fast, frictionless login
const defaultGoogleProvider = new GoogleAuthProvider();
defaultGoogleProvider.setCustomParameters({
  prompt: "select_account"
});

// Provider with extra Google Drive and Spreadsheet scopes only for Importer
const driveGoogleProvider = new GoogleAuthProvider();
driveGoogleProvider.addScope("https://www.googleapis.com/auth/spreadsheets.readonly");
driveGoogleProvider.addScope("https://www.googleapis.com/auth/drive.file");
driveGoogleProvider.setCustomParameters({
  prompt: "consent"
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

// Initialize auth state listener
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

// Google Sign-In to get user (and optionally access token for Drive/Sheets)
export const googleSignIn = async (requestDriveScopes = false): Promise<{ user: User; accessToken?: string } | null> => {
  try {
    isSigningIn = true;
    const provider = requestDriveScopes ? driveGoogleProvider : defaultGoogleProvider;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    
    // Store access token if returned (optional for Drive/Sheets operations)
    cachedAccessToken = credential?.accessToken || null;
    return { user: result.user, accessToken: cachedAccessToken || "" };
  } catch (error: any) {
    console.error("Erro no login Google:", error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

export enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
    },
    operationType,
    path,
  };
  console.error("Firestore Error: ", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function toFirestoreValue(val: any): any {
  if (val === null || val === undefined) {
    return { nullValue: null };
  }
  if (typeof val === "boolean") {
    return { booleanValue: val };
  }
  if (typeof val === "number") {
    if (Number.isInteger(val)) {
      return { integerValue: val.toString() };
    }
    return { doubleValue: val };
  }
  if (typeof val === "string") {
    return { stringValue: val };
  }
  if (val instanceof Date) {
    return { timestampValue: val.toISOString() };
  }
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.map(toFirestoreValue)
      }
    };
  }
  if (typeof val === "object") {
    const fields: Record<string, any> = {};
    for (const key of Object.keys(val)) {
      fields[key] = toFirestoreValue(val[key]);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

/**
 * Headers for Firestore REST calls. Security rules only allow signed-in,
 * authorized users, so every REST request carries the user's Firebase ID token.
 */
async function restAuthHeaders(): Promise<Record<string, string>> {
  const current = auth.currentUser;
  if (!current) {
    throw new Error("Sessão expirada. Entre novamente com sua conta Google.");
  }
  const idToken = await current.getIdToken();
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${idToken}`,
  };
}

export async function writeDocumentRest(collectionId: string, documentId: string, data: any): Promise<any> {
  const projectId = firebaseConfig.projectId;
  const dbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";
  const apiKey = firebaseConfig.apiKey || "";
  const fields: Record<string, any> = {};
  
  for (const key of Object.keys(data)) {
    const val = data[key];
    if (val === undefined) continue;
    fields[key] = toFirestoreValue(val);
  }

  const queryParams = Object.keys(data)
    .filter(key => data[key] !== undefined)
    .map(key => `updateMask.fieldPaths=${encodeURIComponent(key)}`);
  
  if (apiKey) {
    queryParams.push(`key=${encodeURIComponent(apiKey)}`);
  }

  const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collectionId}/${documentId}${queryString}`;

  const response = await fetch(url, {
    method: "PATCH",
    headers: await restAuthHeaders(),
    body: JSON.stringify({ fields }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`REST API Error: ${response.status} ${response.statusText} - ${errText}`);
  }

  return await response.json();
}

export async function deleteDocumentRest(collectionId: string, documentId: string): Promise<any> {
  const projectId = firebaseConfig.projectId;
  const dbId = (firebaseConfig as any).firestoreDatabaseId || "(default)";
  const apiKey = firebaseConfig.apiKey || "";
  const queryParam = apiKey ? `?key=${encodeURIComponent(apiKey)}` : "";
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${dbId}/documents/${collectionId}/${documentId}${queryParam}`;

  const response = await fetch(url, {
    method: "DELETE",
    headers: await restAuthHeaders(),
  });

  if (!response.ok && response.status !== 404) {
    const errText = await response.text();
    throw new Error(`REST API Error: ${response.status} ${response.statusText} - ${errText}`);
  }
  return true;
}
