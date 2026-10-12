/**
 * Coda di invio: i documenti `whatsappMessages` con `status: "queued"` vengono inviati uno alla volta,
 * in ordine di creazione e con una pausa casuale tra un messaggio e l'altro.
 */
import type { DocumentData, Timestamp } from "firebase-admin/firestore";
import { normalizePhone } from "../../src/lib/whatsapp/shared.ts";
import { config } from "./config.ts";
import { FieldValue, db, getSettings, messages } from "./firebase.ts";
import { NotOnWhatsAppError, isReady, onReady, sendText } from "./whatsapp.ts";

const queued = new Map<string, DocumentData>();
let pumping = false;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const pause = () => sleep(config.minDelayMs + Math.random() * Math.max(0, config.maxDelayMs - config.minDelayMs));

/** Numero dello studente: profilo personale (aggiornato dallo studente) o anagrafica del docente. */
async function studentPhone(studentId: string) {
  const [user, student] = await Promise.all([
    db.collection("users").doc(studentId).get(),
    db.collection("students").doc(studentId).get(),
  ]);
  if (student.exists && student.get("status") === "inactive") return { phone: null, reason: "Studente non attivo." };
  const raw = (user.get("phone") as string | undefined) || (student.get("phone") as string | undefined);
  const phone = normalizePhone(raw, getSettings().countryCode);
  return { phone, reason: raw ? "Numero di telefono non valido." : "Numero di telefono mancante." };
}

/** Prende in carico il messaggio (queued → sending) in transazione: mai due invii dello stesso. */
async function claim(id: string) {
  const ref = messages().doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "queued") return null;
    const expiresAt = snap.get("expiresAt") as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      tx.update(ref, { status: "expired", updatedAt: FieldValue.serverTimestamp() });
      return null;
    }
    tx.update(ref, { status: "sending", attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    return snap.data()!;
  });
}

async function deliver(id: string) {
  const data = await claim(id);
  if (!data) return false;
  const ref = messages().doc(id);
  try {
    let to = (data.to as string | undefined) ?? null;
    if (!to && data.studentId) {
      const r = await studentPhone(data.studentId as string);
      if (!r.phone) {
        await ref.update({ status: "failed", error: r.reason, updatedAt: FieldValue.serverTimestamp() });
        return false;
      }
      to = r.phone;
    }
    if (!to) throw new Error("Destinatario mancante.");
    await sendText(to, data.body as string);
    await ref.update({ status: "sent", to, error: FieldValue.delete(), sentAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    console.log(`[whatsapp] Inviato a ${data.recipientName} (+${to}).`);
    return true;
  } catch (e) {
    const error = e instanceof NotOnWhatsAppError ? e.message : `Invio non riuscito: ${(e as Error).message}`;
    console.warn(`[whatsapp] ${data.recipientName}: ${error}`);
    // Se la connessione è caduta durante l'invio il messaggio torna in coda.
    const requeue = !isReady() && !(e instanceof NotOnWhatsAppError);
    await ref.update({ status: requeue ? "queued" : "failed", error, updatedAt: FieldValue.serverTimestamp() });
    return false;
  }
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    // Con Zernio la coda la elabora il server dell'app (ADR D25): il worker resta fermo.
    while (isReady() && queued.size && getSettings().provider !== "zernio") {
      const [id] = [...queued.entries()].sort(
        ([, a], [, b]) => ((a.createdAt as Timestamp | undefined)?.toMillis() ?? 0) - ((b.createdAt as Timestamp | undefined)?.toMillis() ?? 0),
      )[0];
      queued.delete(id);
      const sent = await deliver(id).catch((e) => {
        console.error("[whatsapp] Errore coda:", e);
        return false;
      });
      if (sent) await pause();
    }
  } finally {
    pumping = false;
  }
}

export async function startOutbox() {
  // Messaggi rimasti "in invio" per un arresto improvviso: non sappiamo se sono partiti.
  const stuck = await messages().where("status", "==", "sending").get();
  await Promise.all(
    stuck.docs.map((d) =>
      d.ref.update({ status: "failed", error: "Invio interrotto: verifica sul telefono prima di riprovare.", updatedAt: FieldValue.serverTimestamp() }),
    ),
  );

  onReady(() => void pump());
  return messages()
    .where("status", "==", "queued")
    .onSnapshot(
      (snap) => {
        queued.clear();
        snap.docs.forEach((d) => queued.set(d.id, d.data()));
        if (queued.size) void pump();
      },
      (e) => console.error("[whatsapp] Lettura coda non riuscita:", e.message),
    );
}
