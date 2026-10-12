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
import { WA_DEFAULT_SETTINGS, WA_DOC, announcementMessage, announcementParams } from "@/lib/whatsapp/shared";
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
import { COLLECTIONS, chunk, clean, col, ref, timestamps, touched } from "./base";

const waDoc = (id: (typeof WA_DOC)[keyof typeof WA_DOC]) => doc(firestore(), COLLECTIONS.whatsapp, id);

export const DEFAULT_WHATSAPP_SETTINGS: WhatsAppSettings = WA_DEFAULT_SETTINGS;

const TEST_MESSAGE = { title: "Messaggio di prova", content: "Se leggi questo messaggio, WhatsApp funziona ✅" };

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
 * Messaggistica WhatsApp (ADR D24). L'app non parla con WhatsApp: scrive comandi e messaggi
 * in Firestore, il worker (`whatsapp-worker/`) li esegue e aggiorna lo stato.
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

  saveSettings: (s: Omit<WhatsAppSettings, "updatedAt">) => setDoc(waDoc(WA_DOC.settings), { ...s, ...touched() }),

  /** Ultimi messaggi in tempo reale (registro invii). */
  watchRecent(max: number, onChange: (m: WithId<WhatsAppMessage>[]) => void, onError: (e: Error) => void) {
    return onSnapshot(
      query(col(COLLECTIONS.whatsappMessages), orderBy("createdAt", "desc"), limit(max)),
      (snap) => onChange(snap.docs.map((d) => ({ id: d.id, ...(d.data() as WhatsAppMessage) }))),
      onError,
    );
  },

  /** Mette in coda una comunicazione per ogni studente destinatario. Restituisce i messaggi creati. */
  async queueAnnouncement(
    announcement: Pick<Announcement, "title" | "content" | "authorName">,
    announcementId: string,
    recipients: WithId<Student>[],
    uid: string,
  ) {
    const body = announcementMessage(announcement);
    const templateParams = announcementParams(announcement);
    // Batch da 400 scritture (limite Firestore: 500).
    for (const group of chunk(recipients, 400)) {
      const batch = writeBatch(firestore());
      for (const s of group) {
        batch.set(
          doc(col(COLLECTIONS.whatsappMessages)),
          clean({
            kind: "announcement",
            studentId: s.id,
            recipientName: `${s.name} ${s.surname}`.trim(),
            body,
            templateParams,
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

  /** Messaggio di prova verso un numero qualsiasi (già normalizzato). */
  queueTest: (to: string, uid: string) =>
    setDoc(doc(col(COLLECTIONS.whatsappMessages)), {
      kind: "test",
      to,
      recipientName: `+${to}`,
      body: announcementMessage(TEST_MESSAGE),
      templateParams: announcementParams(TEST_MESSAGE),
      status: "queued",
      attempts: 0,
      // Un test non inviato entro un'ora non ha più senso.
      expiresAt: Timestamp.fromMillis(Date.now() + 60 * 60_000),
      createdBy: uid,
      ...timestamps(),
    }),

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

  createZernioTemplates: () => adminApi<ZernioStatus>("whatsapp/zernio", { method: "POST" }),
};

/** Stato dell'integrazione Zernio (route /api/admin/whatsapp/zernio). */
export interface ZernioStatus {
  configured: boolean;
  cronConfigured: boolean;
  account: { id: string; name: string; phone?: string; needsReconnection?: boolean } | null;
  templates: { key: string; name: string; status: "APPROVED" | "PENDING" | "REJECTED" | "MISSING"; category?: string }[];
  error?: string;
}
