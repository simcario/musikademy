/**
 * Link d'invito Google per gli script CLI (ADR D20/D33): stessa forma di `src/lib/auth/invites.ts`,
 * che però dipende dall'Admin SDK del server Next.
 */
import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import { inviteExpiry, inviteUrl } from "../../src/lib/auth/invite-token";

/** Indirizzo dell'app per i link: `APP_URL` oppure lo sviluppo locale. */
export const appUrl = () => process.env.APP_URL || "http://localhost:3000";

/** Crea un invito per `uid` (invalidando quelli aperti) e restituisce il link da aprire. */
export async function createInviteLink(db: Firestore, uid: string, createdBy = uid) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = inviteExpiry();
  const open = await db.collection("invites").where("uid", "==", uid).where("acceptedAt", "==", null).get();
  const batch = db.batch();
  open.docs.forEach((d) => batch.delete(d.ref));
  batch.set(db.doc(`invites/${createHash("sha256").update(token).digest("hex")}`), {
    uid,
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Timestamp.fromDate(expiresAt),
    acceptedAt: null,
  });
  await batch.commit();
  return inviteUrl(appUrl(), token);
}
