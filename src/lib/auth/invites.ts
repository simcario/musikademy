import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { HttpError } from "@/lib/auth/server";
import { inviteExpiry, inviteState, isInviteToken } from "./invite-token";

/** Collezione accessibile solo dall'Admin SDK (le rules negano ogni accesso client). */
const INVITES = "invites";

export interface InviteDoc {
  uid: string;
  createdBy: string;
  createdAt: Timestamp;
  expiresAt: Timestamp;
  acceptedAt: Timestamp | null;
}

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

/** Crea un nuovo invito per `uid` e invalida quelli ancora aperti. Il token in chiaro non viene salvato. */
export async function createInvite(uid: string, createdBy: string) {
  const db = adminDb();
  const token = randomBytes(32).toString("base64url");
  const expiresAt = inviteExpiry();
  const open = await db.collection(INVITES).where("uid", "==", uid).where("acceptedAt", "==", null).get();
  const batch = db.batch();
  open.docs.forEach((d) => batch.delete(d.ref));
  batch.set(db.doc(`${INVITES}/${hashToken(token)}`), {
    uid,
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    acceptedAt: null,
  });
  await batch.commit();
  return { token, expiresAt: expiresAt.toISOString() };
}

/** Restituisce l'invito se utilizzabile, altrimenti un errore con messaggio per l'utente. */
export async function findValidInvite(token: unknown) {
  if (!isInviteToken(token)) throw new HttpError(404, "Link d'invito non valido.");
  const ref = adminDb().doc(`${INVITES}/${hashToken(token)}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpError(404, "Link d'invito non valido o sostituito da uno più recente.");
  const invite = snap.data() as InviteDoc;
  const state = inviteState({ expiresAt: invite.expiresAt.toDate(), acceptedAt: invite.acceptedAt?.toDate() });
  if (state === "accepted") throw new HttpError(410, "Invito già utilizzato: accedi con Google dalla pagina di accesso.");
  if (state === "expired") throw new HttpError(410, "Invito scaduto: chiedi alla scuola di inviartene uno nuovo.");
  return { ref, invite };
}
