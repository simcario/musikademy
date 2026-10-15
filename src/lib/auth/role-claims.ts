import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import {
  SYSTEM_ROLES,
  isSystemRole,
  permissionsForKind,
  technicalRole,
  type Permission,
  type RoleDefinition,
} from "@/lib/auth/roles";

/** Ruolo dell'organizzazione (ADR D31): il documento `roles/{id}` o, per quelli di sistema, il predefinito. */
export async function loadRole(id: string): Promise<RoleDefinition | null> {
  if (id === "admin") return SYSTEM_ROLES.admin;
  const snap = await adminDb().doc(`roles/${id}`).get();
  if (snap.exists) {
    const d = snap.data() as Partial<RoleDefinition>;
    const kind = isSystemRole(id) ? SYSTEM_ROLES[id].kind : d.kind;
    if (kind !== "member" && kind !== "staff") return null;
    return {
      name: d.name ?? "",
      description: d.description,
      kind,
      permissions: (d.permissions ?? []).filter((p): p is Permission => permissionsForKind(kind).includes(p as Permission)),
    };
  }
  return isSystemRole(id) ? SYSTEM_ROLES[id] : null;
}

/** Custom claim dell'utente con questo ruolo: le Security Rules leggono `role` e `perms`. */
export function claimsFor(roleId: string, def: RoleDefinition) {
  const role = technicalRole(roleId, def.kind);
  return role === "admin" ? { role, roleId } : { role, roleId, perms: def.permissions };
}

/** Utenti con il ruolo `roleId`, compresi quelli creati prima dei ruoli configurabili (senza `roleId`). */
async function usersWithRole(roleId: string) {
  const db = adminDb();
  const snaps = [await db.collection("users").where("roleId", "==", roleId).get()];
  if (isSystemRole(roleId)) snaps.push(await db.collection("users").where("role", "==", roleId).get());
  const ids = new Set<string>();
  for (const s of snaps) {
    for (const d of s.docs) {
      const u = d.data() as { roleId?: string };
      if ((u.roleId ?? roleId) === roleId) ids.add(d.id);
    }
  }
  return [...ids];
}

/**
 * Riallinea i claim di tutti gli utenti con il ruolo: valgono dal prossimo rinnovo del token
 * (al più un'ora; l'app lo rinnova a ogni avvio). Restituisce quanti utenti sono stati aggiornati.
 */
export async function syncRoleClaims(roleId: string, def: RoleDefinition): Promise<number> {
  const auth = adminAuth();
  const db = adminDb();
  const claims = claimsFor(roleId, def);
  const uids = await usersWithRole(roleId);
  for (let i = 0; i < uids.length; i += 10) {
    await Promise.all(
      uids.slice(i, i + 10).map(async (uid) => {
        await auth.setCustomUserClaims(uid, claims).catch((e: { code?: string }) => {
          if (e.code !== "auth/user-not-found") throw e;
        });
        await db.doc(`users/${uid}`).update({ roleId, updatedAt: FieldValue.serverTimestamp() });
      }),
    );
  }
  return uids.length;
}

/** Quanti utenti hanno il ruolo (per impedire di eliminarne uno in uso). */
export async function countUsersWithRole(roleId: string) {
  return (await usersWithRole(roleId)).length;
}
