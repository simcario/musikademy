import { applicationDefault, initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { WA_DEFAULT_SETTINGS, WA_DOC } from "../../src/lib/whatsapp/shared.ts";
import { config } from "./config.ts";

if (config.useEmulators) process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";

// Credenziali: GOOGLE_APPLICATION_CREDENTIALS (service account) o ADC su Google Cloud.
const app = initializeApp(
  config.useEmulators ? { projectId: config.projectId } : { credential: applicationDefault(), projectId: config.projectId },
);

export const db = getFirestore(app);
export { FieldValue };

export const waDoc = (id: (typeof WA_DOC)[keyof typeof WA_DOC]) => db.collection("whatsapp").doc(id);
export const messages = () => db.collection("whatsappMessages");

export type Settings = typeof WA_DEFAULT_SETTINGS;

/** Impostazioni sempre aggiornate (listener sul documento `whatsapp/settings`). */
let settings: Settings = { ...WA_DEFAULT_SETTINGS };
export const getSettings = () => settings;

export function watchSettings() {
  return waDoc(WA_DOC.settings).onSnapshot(
    (snap) => {
      settings = { ...WA_DEFAULT_SETTINGS, ...(snap.data() as Partial<Settings> | undefined) };
    },
    (e) => console.error("[whatsapp] lettura impostazioni non riuscita:", e.message),
  );
}

/** Aggiorna lo stato visibile nel pannello (sempre con heartbeat). */
export async function publishSession(patch: Record<string, unknown>) {
  try {
    await waDoc(WA_DOC.session).set(
      { ...patch, online: true, heartbeatAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
  } catch (e) {
    console.error("[whatsapp] aggiornamento stato non riuscito:", (e as Error).message);
  }
}
