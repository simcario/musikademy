import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
import { claimsFor, loadRole } from "@/lib/auth/role-claims";
import { technicalRole } from "@/lib/auth/roles";
import { updateUserSchema } from "@/features/students/schemas";
import { buildKeywords } from "@/utils/keywords";

/**
 * Eliminazione definitiva di uno studente: account Auth, profilo e tutto lo storico
 * (lezioni, presenze, pagamenti, esercizi, note, inviti). I materiali restano, senza l'assegnazione.
 */
export async function DELETE(req: Request, ctx: RouteContext<"/api/admin/users/[uid]">) {
  try {
    const { uid } = await ctx.params;
    const db = adminDb();
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) throw new HttpError(404, "Utente non trovato.");
    if ((userSnap.data() as { role: string }).role !== "student") {
      throw new HttpError(400, "Solo gli studenti possono essere eliminati.");
    }
    await requireCaller(req, "students:manage");

    const writer = db.bulkWriter();
    for (const name of ["lessons", "attendance", "payments", "assignments"]) {
      const snap = await db.collection(name).where("studentId", "==", uid).get();
      snap.docs.forEach((d) => writer.delete(d.ref));
    }
    const invites = await db.collection("invites").where("uid", "==", uid).get();
    invites.docs.forEach((d) => writer.delete(d.ref));
    const materials = await db.collection("materials").where("studentIds", "array-contains", uid).get();
    materials.docs.forEach((d) =>
      writer.update(d.ref, { studentIds: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() }),
    );
    // Cartelle condivise con lo studente (ADR D26): via anche dall'`audience` dei materiali che contengono.
    // Per `audience`, così sono comprese le sottocartelle che ereditano la condivisione.
    const folders = await db.collection("materialFolders").where("audience", "array-contains", uid).get();
    folders.docs.forEach((d) =>
      writer.update(d.ref, {
        studentIds: FieldValue.arrayRemove(uid),
        audience: FieldValue.arrayRemove(uid),
        updatedAt: FieldValue.serverTimestamp(),
      }),
    );
    const shared = await db.collection("materials").where("audience", "array-contains", uid).get();
    shared.docs.forEach((d) =>
      writer.update(d.ref, { audience: FieldValue.arrayRemove(uid), updatedAt: FieldValue.serverTimestamp() }),
    );
    writer.delete(db.doc(`studentNotes/${uid}`));
    writer.delete(db.doc(`students/${uid}`));
    writer.delete(db.doc(`users/${uid}`));
    await writer.close();

    await adminAuth().deleteUser(uid).catch((e: { code?: string }) => {
      if (e.code !== "auth/user-not-found") throw e;
    });
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Attiva/disattiva (soft delete), cambia ruolo dell'organizzazione (ADR D31) o email di un utente. */
export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/users/[uid]">) {
  try {
    const { uid } = await ctx.params;
    const parsed = updateUserSchema.safeParse(await req.json());
    if (!parsed.success) throw new HttpError(400, "Dati non validi.");
    const input = parsed.data;

    const db = adminDb();
    const userSnap = await db.doc(`users/${uid}`).get();
    if (!userSnap.exists) throw new HttpError(404, "Utente non trovato.");
    const current = userSnap.data() as { role: string; name: string; surname: string };

    // Gestire gli utenti dell'area personale è dello staff abilitato; toccare lo staff o cambiare ruoli è da admin.
    const newRoleId = input.roleId ?? input.role;
    const needsAdmin = newRoleId !== undefined || current.role !== "student";
    const caller = await requireCaller(req, needsAdmin ? "roles:manage" : "students:manage");
    if (caller.uid === uid && (input.active === false || newRoleId)) {
      throw new HttpError(400, "Non puoi disattivare o cambiare ruolo al tuo account.");
    }

    const auth = adminAuth();
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    const userPatch: Record<string, unknown> = { updatedAt: now };

    if (input.active !== undefined) {
      await auth.updateUser(uid, { disabled: !input.active });
      if (!input.active) await auth.revokeRefreshTokens(uid);
      userPatch.active = input.active;
      if (current.role === "student") {
        batch.update(db.doc(`students/${uid}`), { status: input.active ? "active" : "inactive", updatedAt: now });
      }
    }
    if (newRoleId) {
      const def = await loadRole(newRoleId);
      if (!def) throw new HttpError(400, "Ruolo non trovato.");
      const role = technicalRole(newRoleId, def.kind);
      // Area personale ↔ staff richiederebbe migrare profili e storico: non supportato.
      if ((role === "student") !== (current.role === "student")) {
        throw new HttpError(400, "Il passaggio tra un ruolo dell'area personale e uno dello staff non è supportato.");
      }
      await auth.setCustomUserClaims(uid, claimsFor(newRoleId, def));
      await auth.revokeRefreshTokens(uid); // i permessi nuovi valgono subito: serve un nuovo accesso
      userPatch.role = role;
      userPatch.roleId = newRoleId;
      // `set` con merge: l'amministratore creato da bootstrap-admin può non avere il documento `teachers`.
      if (role === "student") batch.update(db.doc(`students/${uid}`), { roleId: newRoleId, updatedAt: now });
      else batch.set(db.doc(`teachers/${uid}`), { roleId: newRoleId, updatedAt: now }, { merge: true });
    }
    if (input.email) {
      await auth.updateUser(uid, { email: input.email, emailVerified: false });
      userPatch.email = input.email;
      if (current.role === "student") {
        batch.update(db.doc(`students/${uid}`), {
          email: input.email,
          keywords: buildKeywords(current.name, current.surname, input.email),
          updatedAt: now,
        });
      }
    }
    batch.update(db.doc(`users/${uid}`), userPatch);
    await batch.commit();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
