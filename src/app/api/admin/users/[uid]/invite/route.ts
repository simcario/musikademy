import { adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";
import { createInvite } from "@/lib/auth/invites";

/** Genera un nuovo link d'invito (accesso con Google) e invalida quelli precedenti. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/users/[uid]/invite">) {
  try {
    const { uid } = await ctx.params;
    const snap = await adminDb().doc(`users/${uid}`).get();
    if (!snap.exists) throw new HttpError(404, "Utente non trovato.");
    const { role, active } = snap.data() as { role: string; active: boolean };
    const caller = await requireCaller(req, role === "student" ? "students:manage" : "roles:manage");
    if (!active) throw new HttpError(400, "Riattiva l'account prima di inviare un nuovo invito.");
    return Response.json(await createInvite(uid, caller.uid));
  } catch (error) {
    return errorResponse(error);
  }
}
