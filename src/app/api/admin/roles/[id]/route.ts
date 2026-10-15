import { FieldValue } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
import { countUsersWithRole, loadRole, syncRoleClaims } from "@/lib/auth/role-claims";
import { isSystemRole, permissionsForKind, type Permission } from "@/lib/auth/roles";
import { roleFormSchema } from "@/features/roles/schemas";

/**
 * Modifica di un ruolo (ADR D31): nome, descrizione e permessi; il tipo (area personale / staff) non cambia.
 * I claim di tutti gli utenti con il ruolo vengono riallineati. L'Amministratore non si modifica.
 */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/roles/[id]">) {
  try {
    await requireCaller(req, "roles:manage");
    const { id } = await ctx.params;
    if (id === "admin") throw new HttpError(400, "Il ruolo Amministratore ha sempre accesso completo.");
    const current = await loadRole(id);
    if (!current) throw new HttpError(404, "Ruolo non trovato.");
    const parsed = roleFormSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "Dati non validi.");
    const input = parsed.data;
    if (input.kind !== current.kind) throw new HttpError(400, "Il tipo di ruolo non si può cambiare.");

    const allowed = permissionsForKind(current.kind);
    const next = {
      name: input.name,
      description: input.description ?? "",
      kind: current.kind,
      permissions: input.permissions.filter((p): p is Permission => allowed.includes(p as Permission)),
    };
    const now = FieldValue.serverTimestamp();
    // I ruoli di sistema (Docente, Studente) nascono come documento alla prima personalizzazione.
    await adminDb().doc(`roles/${id}`).set({ ...next, updatedAt: now }, { merge: true });
    const updated = await syncRoleClaims(id, next);
    return Response.json({ ok: true, updated });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Elimina un ruolo non di sistema e non assegnato a nessuno. */
export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/roles/[id]">) {
  try {
    await requireCaller(req, "roles:manage");
    const { id } = await ctx.params;
    if (isSystemRole(id)) throw new HttpError(400, "I ruoli di sistema non si possono eliminare.");
    if (!(await loadRole(id))) throw new HttpError(404, "Ruolo non trovato.");
    const users = await countUsersWithRole(id);
    if (users > 0) {
      throw new HttpError(409, `Il ruolo è assegnato a ${users} ${users === 1 ? "utente" : "utenti"}: cambia prima il loro ruolo.`);
    }
    await adminDb().doc(`roles/${id}`).delete();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
