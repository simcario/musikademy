/**
 * Musikademy — worker WhatsApp (ADR D24).
 *
 * Processo sempre acceso (PC della scuola, VPS…) che tiene aperta la sessione di WhatsApp Web.
 * Parla con l'app solo tramite Firestore:
 *   whatsapp/session      ← stato, QR, heartbeat (scritto qui)
 *   whatsapp/control      → comandi dal pannello admin (collega / scollega)
 *   whatsapp/settings     → orario e testo dei promemoria
 *   whatsappMessages      → coda dei messaggi da inviare
 *
 * Avvio: `npm run whatsapp` dalla radice del progetto.
 */
import { WA_DOC, WA_HEARTBEAT_MS } from "../../src/lib/whatsapp/shared.ts";
import { config } from "./config.ts";
import { FieldValue, publishSession, waDoc, watchSettings } from "./firebase.ts";
import { startOutbox } from "./outbox.ts";
import { startReminders } from "./reminders.ts";
import * as wa from "./whatsapp.ts";

/** Comandi più vecchi di così (es. inviati mentre il worker era spento) vengono ignorati. */
const COMMAND_TTL_MS = 10 * 60_000;

console.log(
  `[whatsapp] Worker avviato · progetto ${config.projectId}${config.useEmulators ? " (emulatori)" : ""} · sessione in ${config.dataDir}`,
);

watchSettings();
const heartbeat = setInterval(() => void publishSession({}), WA_HEARTBEAT_MS);

waDoc(WA_DOC.control).onSnapshot(
  async (snap) => {
    const c = snap.data();
    if (!c || c.status !== "pending") return;
    await snap.ref.update({ status: "done", handledAt: FieldValue.serverTimestamp() });
    const age = Date.now() - (c.requestedAt?.toMillis?.() ?? Date.now());
    if (age > COMMAND_TTL_MS) return;
    console.log(`[whatsapp] Comando dal pannello: ${c.command}`);
    if (c.command === "connect") await wa.start();
    else if (c.command === "logout") await wa.logout();
  },
  (e) => console.error("[whatsapp] Lettura comandi non riuscita:", e.message),
);

await startOutbox();
startReminders();

// Controllo della sessione all'avvio: con una sessione salvata ci si ricollega,
// altrimenti si apre WhatsApp Web e si pubblica il QR da scansionare.
await wa.start();

let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  console.log("[whatsapp] Arresto…");
  clearInterval(heartbeat);
  await wa.close();
  await waDoc(WA_DOC.session)
    .set({ online: false, state: "stopped", qr: null, updatedAt: FieldValue.serverTimestamp() }, { merge: true })
    .catch(() => undefined);
  process.exit(0);
}
process.on("SIGINT", () => void stop());
process.on("SIGTERM", () => void stop());
