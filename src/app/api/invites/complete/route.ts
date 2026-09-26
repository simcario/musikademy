import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse } from "@/lib/auth/server";
import { findValidInvite } from "@/lib/auth/invites";

/** Passo 2 dell'invito: chiamato dopo aver collegato Google all'account. Chiude l'invito. */
export async function POST(req: Request) {
  try {
    const { token } = (await req.json().catch(() => ({}))) as { token?: unknown };
    const idToken = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
    if (!idToken) throw new HttpError(401, "Sessione non valida. Riapri il link d'invito.");
    const decoded = await adminAuth()
      .verifyIdToken(idToken, true)
      .catch(() => {
        throw new HttpError(401, "Sessione scaduta. Riapri il link d'invito.");
      });

    const { ref, invite } = await findValidInvite(token);
    if (decoded.uid !== invite.uid) throw new HttpError(403, "Questo invito appartiene a un altro utente.");
    const user = await adminAuth().getUser(invite.uid);
    const google = user.providerData.find((p) => p.providerId === "google.com");
    if (!google) throw new HttpError(400, "Collega un account Google per completare l'invito.");

    const db = adminDb();
    const now = FieldValue.serverTimestamp();
    const batch = db.batch();
    batch.update(ref, { acceptedAt: now, googleEmail: google.email ?? null });
    const student = db.doc(`students/${invite.uid}`);
    if ((await student.get()).exists) batch.update(student, { inviteStatus: "accepted", updatedAt: now });
    await batch.commit();
    return Response.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
