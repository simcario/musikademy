import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse, requireCaller } from "@/lib/auth/server";

/** Genera un link di impostazione/reset password da condividere con lo studente. */
export async function POST(req: Request, ctx: RouteContext<"/api/admin/users/[uid]/reset">) {
  try {
    const { uid } = await ctx.params;
    const snap = await adminDb().doc(`users/${uid}`).get();
    if (!snap.exists) throw new HttpError(404, "Utente non trovato.");
    const { role, email } = snap.data() as { role: string; email: string };
    await requireCaller(req, role === "student" ? "students:manage" : "roles:manage");
    const resetLink = await adminAuth().generatePasswordResetLink(email);
    return Response.json({ resetLink });
  } catch (error) {
    return errorResponse(error);
  }
}
