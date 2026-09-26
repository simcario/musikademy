import { adminAuth, adminDb } from "@/lib/firebase/admin";
import { HttpError, errorResponse } from "@/lib/auth/server";
import { findValidInvite } from "@/lib/auth/invites";

/**
 * Passo 1 dell'invito (pubblico): il token è la credenziale. Restituisce un custom token
 * per l'account pre-creato dal docente, così il client può collegarvi l'account Google.
 * L'invito resta valido finché il collegamento non viene confermato (`/complete`).
 */
export async function POST(req: Request) {
  try {
    const { token } = (await req.json().catch(() => ({}))) as { token?: unknown };
    const { invite } = await findValidInvite(token);
    const user = await adminAuth().getUser(invite.uid);
    if (user.disabled) throw new HttpError(403, "Questo account è stato disattivato. Contatta la scuola.");
    const profile = (await adminDb().doc(`users/${invite.uid}`).get()).data() as { name?: string } | undefined;
    const customToken = await adminAuth().createCustomToken(invite.uid);
    return Response.json({ customToken, name: profile?.name ?? "" });
  } catch (error) {
    return errorResponse(error);
  }
}
