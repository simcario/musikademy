import type { Role } from "@/types";

/**
 * Capacità applicative. Aggiungere un ruolo futuro (superadmin, assistant, secretary)
 * significa aggiungere una riga a ROLE_PERMISSIONS e la funzione corrispondente in firestore.rules.
 */
export type Permission =
  | "student:area"
  | "staff:area"
  | "students:manage"
  | "lessons:manage"
  | "attendance:manage"
  | "materials:manage"
  | "assignments:manage"
  | "announcements:manage"
  | "payments:manage"
  | "settings:manage"
  | "roles:manage";

const STAFF: Permission[] = [
  "staff:area",
  "students:manage",
  "lessons:manage",
  "attendance:manage",
  "materials:manage",
  "assignments:manage",
  "announcements:manage",
  "payments:manage",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  student: ["student:area"],
  teacher: STAFF,
  admin: [...STAFF, "settings:manage", "roles:manage"],
};

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Amministratore",
  teacher: "Docente",
  student: "Studente",
};

export const ROLES = Object.keys(ROLE_PERMISSIONS) as Role[];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && value in ROLE_PERMISSIONS;
}

export function can(role: Role | null | undefined, permission: Permission): boolean {
  return !!role && ROLE_PERMISSIONS[role].includes(permission);
}

export function isStaff(role: Role | null | undefined): boolean {
  return can(role, "staff:area");
}

/** Pagina iniziale dopo il login. */
export function homeFor(role: Role): string {
  return isStaff(role) ? "/admin" : "/dashboard";
}
