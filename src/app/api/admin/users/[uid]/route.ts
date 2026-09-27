import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
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

/** Attiva/disattiva (soft delete), cambia ruolo o email di un utente. */
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

    // Gestire studenti è da docente; toccare docenti/admin o cambiare ruoli è da admin.
    const needsAdmin = input.role !== undefined || current.role !== "student";
    const caller = await requireCaller(req, needsAdmin ? "roles:manage" : "students:manage");
    if (caller.uid === uid && (input.active === false || input.role)) {
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
    if (input.role) {
      // Studente ↔ staff richiederebbe migrare profili e storico: non supportato nella V1.
      if ((input.role === "student") !== (current.role === "student")) {
        throw new HttpError(400, "Il passaggio tra ruolo studente e staff non è supportato.");
      }
      await auth.setCustomUserClaims(uid, { role: input.role });
      await auth.revokeRefreshTokens(uid); // forza il refresh del token con il nuovo claim
      userPatch.role = input.role;
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
