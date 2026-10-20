import { SYSTEM_ROLES, isSystemRole, permissionsForKind, type Permission, type RoleDefinition } from "@/lib/auth/roles";
import type { RoleFormValues } from "@/features/roles/schemas";
import { adminApi } from "./authService";
import { COLLECTIONS, list } from "./base";

/** Ruolo dell'organizzazione come lo vede l'app (ADR D31). */
export interface OrgRole extends RoleDefinition {
  id: string;
  /** Amministratore, Docente, Studente: non si eliminano né cambiano tipo. */
  system: boolean;
}

/**
 * Ruoli dell'organizzazione. I documenti `roles/{id}` li scrive solo il server (che riallinea i claim
 * degli utenti); i ruoli di sistema esistono anche senza documento, con i permessi predefiniti.
 */
export const roleService = {
  async list(): Promise<OrgRole[]> {
    const docs = await list<RoleDefinition>(COLLECTIONS.roles);
    const byId = new Map(docs.map((d) => [d.id, d]));
    const system = (["admin", "teacher", "student"] as const).map<OrgRole>((id) => {
      const d = id === "admin" ? undefined : byId.get(id);
      const base = SYSTEM_ROLES[id];
      return d
        ? {
            ...base,
            name: d.name || base.name,
            description: d.description || base.description,
            permissions: (d.permissions ?? []).filter((p): p is Permission => permissionsForKind(base.kind).includes(p)),
            id,
            system: true,
          }
        : { ...base, id, system: true };
    });
    const custom = docs
      .filter((d) => !isSystemRole(d.id))
      .map<OrgRole>((d) => ({ ...d, permissions: d.permissions ?? [], system: false }))
      .sort((a, b) => a.name.localeCompare(b.name, "it"));
    return [...system, ...custom];
  },

  create: (values: RoleFormValues) => adminApi<{ id: string }>("roles", { method: "POST", body: values }),
  update: (id: string, values: RoleFormValues) =>
    adminApi<{ updated: number }>(`roles/${id}`, { method: "PATCH", body: values }),
  remove: (id: string) => adminApi(`roles/${id}`, { method: "DELETE" }),
};