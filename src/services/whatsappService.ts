import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import { WA_DEFAULT_SETTINGS, WA_DOC, announcementVars, renderMessage, type MessageKind } from "@/lib/whatsapp/shared";
import type {
  Announcement,
  Student,
  WhatsAppCommand,
  WhatsAppMessage,
  WhatsAppSession,
  WhatsAppSettings,
  WithId,
} from "@/types";
import { adminApi } from "./authService";
import { COLLECTIONS, chunk, clean, col, ownedBy, ref, timestamps, touched, type StaffScope } from "./base";

const waDoc = (id: (typeof WA_DOC)[keyof typeof WA_DOC]) => doc(firestore(), COLLECTIONS.whatsapp, id);

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = WA_DEFAULT_SETTINGS;

const TEST_MESSAGE = { title: "Messaggio di prova", content: "Se leggi questo messaggio, WhatsApp funziona ✅" };

/** Campi delle impostazioni modificabili dal client (gli altri li scrive solo il server). */
export type EditableWhatsAppSettings = Partial<
  Pick<
    WhatsAppSettings,
    "provider" | "remindersEnabled" | "reminderTime" | "daysBefore" | "reminderTemplate" | "announcementTemplate" | "countryCode"
  >
>;

/** Destinatari di una comunicazione tra gli studenti attivi (stessa logica delle rules di lettura). */
export function announcementRecipients(
  a: Pick<Announcement, "targetType" | "targetId">,
  students: WithId<Student>[],
): WithId<Student>[] {
  if (a.targetType === "student") return students.filter((s) => s.id === a.targetId);
  if (a.targetType === "course") return students.filter((s) => s.courseIds.includes(a.targetId ?? ""));
  return students;
}

/**
 * Messaggistica WhatsApp (ADR D24/D25). L'app non parla con WhatsApp: scrive comandi e messaggi
 * in Firestore, il worker (WhatsApp Web) o il server (Zernio) li inviano e aggiornano lo stato.
 */
export const whatsappService = {
  /** Stato del worker in tempo reale. */
  watchSession(onChange: (s: WhatsAppSession | null) => void, onError: (e: Error) => void) {
    return onSnapshot(
      waDoc(WA_DOC.session),
      (snap) => onChange(snap.exists() ? (snap.data() as WhatsAppSession) : null),
      onError,
    );
  },

  sendCommand: (command: WhatsAppCommand, uid: string) =>
    setDoc(waDoc(WA_DOC.control), { command, status: "pending", requestedBy: uid, requestedAt: serverTimestamp() }),

  async getSettings(): Promise<WhatsAppSettings> {
    const snap = await getDoc(waDoc(WA_DOC.settings));
    return { ...DEFAULT_WHATSAPP_SETTINGS, ...(snap.data() as Partial<WhatsAppSettings> | undefined) };
  },

  /** Aggiorna solo i campi indicati (i template Meta in uso li gestisce il server). */
  saveSettings: (s: EditableWhatsAppSettings) => setDoc(waDoc(WA_DOC.settings), { ...s, ...touched() }, { merge: true }),

  /** Ultimi messaggi in tempo reale (registro invii). */
  /** Registro invii: l'admin vede tutto, il docente i messaggi che ha messo in coda (ADR D34). */
  watchRecent(max: number, scope: StaffScope, onChange: (m: WithId<WhatsAppMessage>[]) => void, onError: (e: Error) => void) {
    return onSnapshot(
      query(col(COLLECTIONS.whatsappMessages), ...ownedBy(scope, "createdBy"), orderBy("createdAt", "desc"), limit(max)),
      (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as WhatsAppMessage) }))),
      onError,
    );
  },

  /**
   * Mette in coda una comunicazione per ogni studente destinatario, con i segnaposto personali
   * ({nome}, {cognome}…). `template` è il testo personalizzato delle comunicazioni.
   */
  async queueAnnouncement(
    announcement: Pick<Announcement, "title" | "content" | "authorName">,
    announcementId: string,
    recipients: WithId<Student>[],
    template: string,
    uid: string,
  ) {
    // Batch da 400 scritture (limite Firestore: 500).
    for (const group of chunk(recipients, 400)) {
      const batch = writeBatch(firestore());
      for (const s of group) {
        const templateVars = announcementVars(announcement, s);
        batch.set(
          doc(col(COLLECTIONS.whatsappMessages)),
          clean({
            kind: "announcement",
            studentId: s.id,
            recipientName: `${s.name} ${s.surname}`.trim(),
            body: renderMessage(template, templateVars),
            templateVars,
            refId: announcementId,
            status: "queued",
            attempts: 0,
            createdBy: uid,
            ...timestamps(),
          }),
        );
      }
      await batch.commit();
    }
    return recipients.length;
  },

  /** Messaggio di prova verso un numero qualsiasi (già normalizzato), con il testo delle comunicazioni. */
  queueTest(to: string, template: string, uid: string) {
    const templateVars = announcementVars({ ...TEST_MESSAGE, authorName: "Musikademy" }, { name: "Prova", surname: "" });
    return setDoc(doc(col(COLLECTIONS.whatsappMessages)), {
      kind: "test",
      to,
      recipientName: `+${to}`,
      body: renderMessage(template, templateVars),
      templateVars,
      status: "queued",
      attempts: 0,
      // Un test non inviato entro un'ora non ha più senso.
      expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60_000),
      createdBy: uid,
      ...timestamps(),
    });
  },

  /** Rimette in coda un messaggio non riuscito. */
  retry: (id: string) =>
    updateDoc(ref(COLLECTIONS.whatsappMessages, id), { status: "queued", error: "", ...touched() }),

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.whatsappMessages, id)),

  /**
   * Con Zernio l'invio avviene sul server: dopo aver messo in coda si chiede di elaborare la coda subito
   * (senza attendere il job pianificato). Con WhatsApp Web non fa nulla: ci pensa il worker.
   */
  dispatchNow: () => adminApi<{ sent: number; failed: number; skipped?: string }>("whatsapp/dispatch", { method: "POST" }),

  zernioStatus: () => adminApi<ZernioStatus>("whatsapp/zernio", { method: "GET" }),

  /** Crea su Meta i template predefiniti mancanti. */
  createDefaultTemplates: () =>
    adminApi<ZernioStatus>("whatsapp/zernio", { method: "POST", body: { action: "create-defaults" } }),

  /** Invia a Meta un testo personalizzato (resta in uso il precedente finché non è approvato). */
  submitTemplate: (kind: MessageKind, text: string) =>
    adminApi<ZernioStatus>("whatsapp/zernio", { method: "POST", body: { action: "submit", kind, text } }),
};

export interface ZernioTemplateState {
  name: string;
  text: string;
  status: "APPROVED" | "PENDING" | "REJECTED" | "MISSING";
  category?: string;
  reason?: string;
}

/** Stato dell'integrazione Zernio (route /api/admin/whatsapp/zernio). */
export interface ZernioStatus {
  configured: boolean;
  cronConfigured: boolean;
  account: { id: string; name: string; phone?: string; needsReconnection?: boolean } | null;
  templates: { kind: MessageKind; active: ZernioTemplateState; draft: ZernioTemplateState | null }[];
  error?: string;
}
