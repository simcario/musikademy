import "server-only";
import { FieldValue, Timestamp, type DocumentData } from "firebase-admin/firestore";
import { adminDb } from "@/lib/firebase/admin";
import { loadSettings, resolveTemplates, type KindTemplates, type Settings } from "./meta-templates";
import {
  WA_DOC,
  addDays,
  longItalianDate,
  messageText,
  metaParams,
  normalizePhone,
  relativeLessonDay,
  reminderMessageId,
  reminderRunDue,
  renderMessage,
  templateKindOf,
  zonedDayStart,
  zonedParts,
  type MessageKind,
} from "./shared";
import { ZernioError, sendTemplate, whatsappAccount } from "./zernio";

/**
 * Invio con Zernio (ADR D25): niente worker, la coda `whatsappMessages` viene elaborata sul server
 * - subito, quando lo staff mette in coda (POST /api/admin/whatsapp/dispatch)
 * - periodicamente, da Cloud Scheduler (POST /api/cron/whatsapp), che genera anche i promemoria.
 * Due esecuzioni sovrapposte non inviano due volte: ogni messaggio è preso in carico in transazione.
 * I messaggi il cui template non è (ancora) approvato restano in coda fino all'approvazione.
 */

const ALREADY_EXISTS = 6;
/** Messaggi per esecuzione: resta ben sotto il timeout della richiesta. */
const BATCH = 40;

/** Mette in coda i promemoria del giorno, una volta al giorno dall'orario impostato. */
async function queueRemindersIfDue(s: Settings) {
  const db = adminDb();
  const now = zonedParts(new Date());
  const state = db.collection("whatsapp").doc(WA_DOC.reminders);
  const last = (await state.get()).get("lastRunDate") as string | undefined;
  if (!reminderRunDue(now, s, last)) return 0;

  const target = addDays(now.date, s.daysBefore);
  const lessons = await db
    .collection("lessons")
    .where("date", ">=", Timestamp.fromDate(zonedDayStart(target)))
    .where("date", "<", Timestamp.fromDate(zonedDayStart(addDays(target, 1))))
    .get();

  let created = 0;
  for (const lesson of lessons.docs) {
    const l = lesson.data();
    const start = (l.date as Timestamp).toDate();
    if (l.status !== "scheduled" || start.getTime() <= Date.now()) continue;
    const student = await db.collection("students").doc(l.studentId as string).get();
    if (!student.exists || student.get("status") === "inactive") continue;

    const templateVars = {
      nome: (student.get("name") as string) ?? "",
      cognome: (student.get("surname") as string) ?? "",
      titolo: (l.title as string) ?? "",
      quando: relativeLessonDay(target, now.date),
      data: longItalianDate(target),
      ora: (l.startTime as string | undefined) || zonedParts(start).time,
      docente: (l.teacherName as string) ?? "",
    };
    try {
      await db
        .collection("whatsappMessages")
        .doc(reminderMessageId(lesson.id, target))
        .create({
          kind: "reminder",
          studentId: l.studentId,
          recipientName: l.studentName ?? `${templateVars.nome} ${templateVars.cognome}`,
          body: renderMessage(s.metaTemplates?.reminder?.text ?? messageText(s, "reminder"), templateVars),
          templateVars,
          refId: lesson.id,
          status: "queued",
          attempts: 0,
          expiresAt: Timestamp.fromDate(start),
          createdBy: "system",
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        });
      created++;
    } catch (e) {
      if ((e as { code?: number }).code !== ALREADY_EXISTS) throw e;
    }
  }
  await state.set({ lastRunDate: now.date, lastRunAt: FieldValue.serverTimestamp(), lastTarget: target, lastCreated: created });
  return created;
}

/** Numero dello studente: profilo personale o anagrafica del docente. */
async function studentPhone(studentId: string, countryCode: string) {
  const db = adminDb();
  const [user, student] = await Promise.all([
    db.collection("users").doc(studentId).get(),
    db.collection("students").doc(studentId).get(),
  ]);
  if (student.exists && student.get("status") === "inactive") return { phone: null, reason: "Studente non attivo." };
  const raw = (user.get("phone") as string | undefined) || (student.get("phone") as string | undefined);
  return {
    phone: normalizePhone(raw, countryCode),
    reason: raw ? "Numero di telefono non valido." : "Numero di telefono mancante.",
  };
}

async function claim(id: string): Promise<DocumentData | null> {
  const db = adminDb();
  const ref = db.collection("whatsappMessages").doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.get("status") !== "queued") return null;
    const expiresAt = snap.get("expiresAt") as Timestamp | undefined;
    if (expiresAt && expiresAt.toMillis() < Date.now()) {
      tx.update(ref, { status: "expired", updatedAt: FieldValue.serverTimestamp() });
      return null;
    }
    tx.update(ref, { status: "sending", attempts: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    return snap.data() ?? null;
  });
}

/** Errori che non dipendono dal messaggio: lo rimettiamo in coda invece di segnarlo fallito. */
const transient = (e: unknown) => (e instanceof ZernioError ? e.status === 429 || e.status >= 500 : true);

async function deliver(
  id: string,
  accountId: string,
  s: Settings,
  templates: Record<MessageKind, KindTemplates>,
): Promise<"sent" | "failed" | "skipped"> {
  const data = await claim(id);
  if (!data) return "skipped";
  const ref = adminDb().collection("whatsappMessages").doc(id);
  const fail = (error: string, status: "failed" | "queued" = "failed") =>
    ref.update({ status, error, updatedAt: FieldValue.serverTimestamp() });

  const vars = data.templateVars as Record<string, string> | undefined;
  if (!vars) {
    await fail("Messaggio senza dati per il template: rimettilo in coda dalla sua origine.");
    return "failed";
  }
  let to = (data.to as string | undefined) ?? null;
  if (!to && data.studentId) {
    const r = await studentPhone(data.studentId as string, s.countryCode);
    if (!r.phone) {
      await fail(r.reason);
      return "failed";
    }
    to = r.phone;
  }
  if (!to) {
    await fail("Destinatario mancante.");
    return "failed";
  }

  const kind = templateKindOf(data.kind);
  const tpl = templates[kind].active;
  try {
    const res = await sendTemplate(accountId, to, tpl.name, metaParams(tpl.text, kind, vars));
    await ref.update({
      status: "sent",
      to,
      // Il registro mostra il testo effettivamente inviato (template in uso in questo momento).
      body: renderMessage(tpl.text, vars),
      providerMessageId: res.data?.messageId ?? null,
      error: FieldValue.delete(),
      sentAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return "sent";
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const requeue = transient(e) && (data.attempts ?? 0) < 3;
    await fail(`Invio non riuscito: ${message}`, requeue ? "queued" : "failed");
    console.warn(`[whatsapp/zernio] ${data.recipientName}: ${message}`);
    return requeue ? "skipped" : "failed";
  }
}

export interface DispatchResult {
  sent: number;
  failed: number;
  waiting?: number;
  reminders?: number;
  skipped?: string;
}

export async function dispatchWhatsApp({ reminders }: { reminders: boolean }): Promise<DispatchResult> {
  const s = await loadSettings();
  if (s.provider !== "zernio") return { sent: 0, failed: 0, skipped: "Il servizio attivo è WhatsApp Web (worker)." };

  const created = reminders ? await queueRemindersIfDue(s) : undefined;

  const queued = await adminDb().collection("whatsappMessages").where("status", "==", "queued").limit(BATCH).get();
  if (queued.empty) return { sent: 0, failed: 0, reminders: created };

  const account = await whatsappAccount();
  if (!account) return { sent: 0, failed: 0, reminders: created, skipped: "Nessun numero WhatsApp collegato su Zernio." };
  const templates = await resolveTemplates(account._id, s);

  const docs = queued.docs.sort(
    (a, b) => (a.get("createdAt")?.toMillis?.() ?? 0) - (b.get("createdAt")?.toMillis?.() ?? 0),
  );
  const result: DispatchResult = { sent: 0, failed: 0, waiting: 0, reminders: created };
  for (const d of docs) {
    // Template non ancora approvato: il messaggio aspetta in coda (scade da solo se è un promemoria).
    if (templates[templateKindOf(d.get("kind"))].active.status !== "APPROVED") {
      result.waiting!++;
      continue;
    }
    const r = await deliver(d.id, account._id, s, templates);
    if (r === "sent") result.sent++;
    else if (r === "failed") result.failed++;
  }
  return result;
}
