import type { Role } from "@/types";

/**
 * Capacità applicative (ADR D31). Il ruolo "tecnico" (`Role`, custom claim `role`) dice in quale area si
 * entra: `student` = area personale, `teacher` = area di gestione, `admin` = tutto. I ruoli dell'organizzazione
 * (Studente, Musicista, Docente, Segreteria…) sono definiti in `roles/{id}` e portano nel claim `perms`
 * le sezioni dell'area personale o le capacità di gestione concesse. Le Security Rules leggono lo stesso claim.
 */
export type Permission =
  | "student:area"
  | "staff:area"
  // Area personale: sezioni visibili
  | "area:lessons"
  | "area:exercises"
  | "area:materials"
  | "area:playlists"
  | "area:tools"
  | "area:attendance"
  | "area:payments"
  | "area:announcements"
  // Gestione
  | "students:manage"
  | "lessons:manage"
  | "attendance:manage"
  | "materials:manage"
  | "assignments:manage"
  | "announcements:manage"
  | "payments:manage"
  // Solo amministratore
  | "settings:manage"
  | "roles:manage";

/** Tipo di ruolo: in quale area entra chi lo riceve. */
export type RoleKind = "member" | "staff";

interface PermissionMeta {
  id: Permission;
  label: string;
  hint?: string;
}

/** Sezioni dell'area personale che un ruolo può vedere. Dashboard, profilo e info app sono sempre visibili. */
export const AREA_PERMISSIONS: readonly PermissionMeta[] = [
  { id: "area:lessons", label: "Lezioni", hint: "Le proprie lezioni e i loro dettagli" },
  { id: "area:exercises", label: "Esercizi", hint: "Esercizi assegnati e interattivi" },
  { id: "area:materials", label: "Materiali e Ascolti", hint: "Libreria dei materiali condivisi" },
  { id: "area:playlists", label: "Playlist" },
  { id: "area:tools", label: "Strumenti", hint: "Metronomo e altri strumenti" },
  { id: "area:attendance", label: "Presenze" },
  { id: "area:payments", label: "Pagamenti", hint: "Quote e versamenti personali" },
  { id: "area:announcements", label: "Comunicazioni" },
];

/** Capacità di gestione assegnabili ai ruoli dello staff. */
export const MANAGE_PERMISSIONS: readonly PermissionMeta[] = [
  { id: "students:manage", label: "Utenti e gruppi", hint: "Creare e modificare utenti dell'area personale, gruppi, note private" },
  { id: "lessons:manage", label: "Lezioni" },
  { id: "attendance:manage", label: "Registro presenze" },
  { id: "materials:manage", label: "Materiali e playlist", hint: "Caricare, condividere e assegnare materiali, cartelle e playlist" },
  { id: "assignments:manage", label: "Esercizi", hint: "Assegnare esercizi agli studenti" },
  { id: "announcements:manage", label: "Comunicazioni", hint: "Pubblicare comunicazioni e inviarle su WhatsApp" },
  { id: "payments:manage", label: "Pagamenti", hint: "Quote, versamenti e incassi" },
];

const AREA = AREA_PERMISSIONS.map((p) => p.id);
const MANAGE = MANAGE_PERMISSIONS.map((p) => p.id);

/** Permessi assegnabili a un ruolo del tipo dato. */
export const permissionsForKind = (kind: RoleKind): Permission[] => (kind === "member" ? AREA : MANAGE);

export interface RoleDefinition {
  name: string;
  description?: string;
  kind: RoleKind;
  permissions: Permission[];
}

/**
 * Ruoli di sistema. Docente e Studente si possono personalizzare (il documento `roles/{id}` prevale);
 * l'Amministratore ha sempre accesso completo. Gli account creati prima dei ruoli configurabili non hanno
 * `roleId` né `perms`: valgono i permessi predefiniti del loro ruolo tecnico.
 */
export const SYSTEM_ROLES: Record<Role, RoleDefinition> = {
  admin: { name: "Amministratore", description: "Accesso completo, compresi ruoli e impostazioni.", kind: "staff", permissions: MANAGE },
  teacher: { name: "Docente", kind: "staff", permissions: MANAGE },
  student: { name: "Studente", kind: "member", permissions: AREA },
};

export const isSystemRole = (id: string): id is Role => id in SYSTEM_ROLES;

/** Ruolo tecnico (claim `role`) dato il ruolo dell'organizzazione. */
export const technicalRole = (roleId: string, kind: RoleKind): Role =>
  roleId === "admin" ? "admin" : kind === "member" ? "student" : "teacher";

/** Identità di accesso della sessione: ruolo tecnico + ruolo dell'organizzazione e permessi (dai claim). */
export interface Access {
  role: Role;
  roleId?: string;
  /** Assente sugli account precedenti ai ruoli configurabili: valgono i predefiniti del ruolo tecnico. */
  perms?: readonly string[] | null;
}

/** Tutti i permessi effettivi dell'accesso. */
export function permissionsOf(access: Access): Permission[] {
  const { role } = access;
  if (role === "admin") return ["staff:area", ...MANAGE, "settings:manage", "roles:manage"];
  const kind: RoleKind = role === "student" ? "member" : "staff";
  const allowed = permissionsForKind(kind);
  const granted = access.perms ? allowed.filter((p) => access.perms!.includes(p)) : SYSTEM_ROLES[role].permissions;
  return [kind === "member" ? "student:area" : "staff:area", ...granted];
}

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in SYSTEM_ROLES;
}

export function can(access: Access | null | undefined, permission: Permission): boolean {
  return !!access && permissionsOf(access).includes(permission);
}

export function isStaff(access: Access | null | undefined): boolean {
  return can(access, "staff:area");
}

/** Pagina iniziale dopo il login. */
export function homeFor(role: Role): string {
  return role === "student" ? "/dashboard" : "/admin";
}