import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
import { updateUserSchema } from "@/features/students/schemas";
import { buildKeywords } from "@/utils/keywords";

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
