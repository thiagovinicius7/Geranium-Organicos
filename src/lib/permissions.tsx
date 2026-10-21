import React, { createContext, useContext } from "react";
import { serverTimestamp } from "firebase/firestore";
import { auth } from "./firebase";

/**
 * Access profiles. Must match firestore.rules, which is what actually
 * enforces them; this module only shapes the interface.
 *
 *  admin     Administrador: everything, including who has access.
 *  user      Editor: reads and changes all production data.
 *  lancador  Lançamentos: records plantings, harvests and purchases, and fixes
 *            or deletes only their own harvests within the first 12 hours.
 */
export type AccessRole = "admin" | "user" | "lancador";

export const ROLE_LABELS: Record<AccessRole, string> = {
  admin: "Administrador",
  user: "Editor",
  lancador: "Lançamentos"
};

export const ROLE_DESCRIPTIONS: Record<AccessRole, string> = {
  admin: "Tudo, inclusive liberar e remover acessos.",
  user: "Lança, edita e apaga todos os dados da produção.",
  lancador: "Só registra plantios, colheitas e compras. Corrige as próprias colheitas por 12 horas."
};

/** Window in which a "lancador" can still fix or delete their own harvest. */
export const LAUNCH_FIX_WINDOW_MS = 12 * 60 * 60 * 1000;

export function normalizeRole(role: unknown): AccessRole {
  return role === "admin" || role === "lancador" ? role : "user";
}

export interface Permissions {
  role: AccessRole;
  uid: string | null;
  /** Admin or Editor: may change and delete any production data. */
  canEdit: boolean;
  /** Admin: may manage who has access. */
  canManageAccess: boolean;
  isLauncher: boolean;
}

const NO_ACCESS: Permissions = {
  role: "lancador",
  uid: null,
  canEdit: false,
  canManageAccess: false,
  isLauncher: true
};

const PermissionsContext = createContext<Permissions>(NO_ACCESS);

export function buildPermissions(role: AccessRole, uid: string | null): Permissions {
  return {
    role,
    uid,
    canEdit: role !== "lancador",
    canManageAccess: role === "admin",
    isLauncher: role === "lancador"
  };
}

export function PermissionsProvider({ value, children }: { value: Permissions; children: React.ReactNode }) {
  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions(): Permissions {
  return useContext(PermissionsContext);
}

function toMillis(value: any): number | null {
  if (!value) return null;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000;
  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/** Whether the current user may fix or delete this harvest record. */
export function canFixHarvest(perms: Permissions, record: { criadoPor?: string; criadoEm?: any } | null | undefined): boolean {
  if (perms.canEdit) return true;
  if (!record || !perms.uid || record.criadoPor !== perms.uid) return false;
  const created = toMillis(record.criadoEm);
  return created !== null && Date.now() - created < LAUNCH_FIX_WINDOW_MS;
}

/** Renders its children only for Admin and Editor. */
export function CanEdit({ children }: { children: React.ReactNode }) {
  return usePermissions().canEdit ? <>{children}</> : null;
}

/** Renders its children only if the current user may fix this harvest. */
export function CanFixHarvest({ record, children }: { record: any; children: React.ReactNode }) {
  return canFixHarvest(usePermissions(), record) ? <>{children}</> : null;
}

/**
 * Who recorded a new entry and when (server time). Required by the security
 * rules for the "Lançamentos" profile, and kept for everyone as an audit trail.
 */
export function launchStamp() {
  const user = auth.currentUser;
  return {
    criadoPor: user?.uid || "",
    criadoPorEmail: user?.email || "",
    criadoEm: serverTimestamp()
  };
}

/** Message for an action the current profile cannot do. */
export const NO_PERMISSION_MSG = "Seu perfil (Lançamentos) não permite essa alteração. Peça a um editor ou administrador.";
