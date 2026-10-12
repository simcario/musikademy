/**
 * Promemoria delle lezioni: una volta al giorno, all'orario impostato dall'admin, mette in coda
 * un messaggio per ogni lezione in programma nel giorno di destinazione (oggi, domani, …).
 */
import { Timestamp } from "firebase-admin/firestore";
import {
  WA_DOC,
  addDays,
  longItalianDate,
  relativeLessonDay,
  reminderMessageId,
  reminderParams,
  reminderRunDue,
  renderTemplate,
  zonedDayStart,
  zonedParts,
} from "../../src/lib/whatsapp/shared.ts";
import { FieldValue, db, getSettings, messages, waDoc } from "./firebase.ts";

const ALREADY_EXISTS = 6;
let running = false;
/** Ultimo giorno già elaborato (letto da Firestore una volta sola, poi tenuto in memoria). */
let lastRunDate: string | undefined | null = null;

export async function queueReminders(today: string) {
  const s = getSettings();
  const target = addDays(today, s.daysBefore);
  const lessons = await db
    .collection("lessons")
    .where("date", ">=", Timestamp.fromDate(zonedDayStart(target)))
    .where("date", "<", Timestamp.fromDate(zonedDayStart(addDays(target, 1))))
    .get();

  let created = 0;
  for (const lesson of lessons.docs) {
    const l = lesson.data();
    if (l.status !== "scheduled") continue;
    const start = (l.date as Timestamp).toDate();
    if (start.getTime() <= Date.now()) continue;

    const student = await db.collection("students").doc(l.studentId as string).get();
    if (!student.exists || student.get("status") === "inactive") continue;

    const vars = {
      nome: (student.get("name") as string) ?? "",
      cognome: (student.get("surname") as string) ?? "",
      titolo: (l.title as string) ?? "",
      quando: relativeLessonDay(target, today),
      data: longItalianDate(target),
      ora: (l.startTime as string | undefined) || zonedParts(start).time,
      docente: (l.teacherName as string) ?? "",
    };
    const body = renderTemplate(s.reminderTemplate, vars);
    try {
      await messages()
        .doc(reminderMessageId(lesson.id, target))
        .create({
          kind: "reminder",
          studentId: l.studentId,
          recipientName: l.studentName ?? `${student.get("name")} ${student.get("surname")}`,
          body,
          // Variabili per il template ufficiale: il messaggio resta inviabile anche passando a Zernio.
          templateParams: reminderParams(vars),
          refId: lesson.id,
          status: "queued",
          attempts: 0,
          // Dopo l'inizio della lezione il promemoria non ha più senso.
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
  return { target, created };
}

async function tick() {
  if (running) return;
  running = true;
  try {
    if (getSettings().provider === "zernio") return; // promemoria generati dal server (ADR D25)
    const now = zonedParts(new Date());
    const state = waDoc(WA_DOC.reminders);
    if (lastRunDate === null) lastRunDate = (await state.get()).get("lastRunDate") as string | undefined;
    if (!reminderRunDue(now, getSettings(), lastRunDate)) return;
    const { target, created } = await queueReminders(now.date);
    lastRunDate = now.date;
    await state.set({ lastRunDate: now.date, lastRunAt: FieldValue.serverTimestamp(), lastTarget: target, lastCreated: created });
    console.log(`[whatsapp] Promemoria per il ${target}: ${created} in coda.`);
  } catch (e) {
    console.error("[whatsapp] Promemoria non riusciti:", e);
  } finally {
    running = false;
  }
}

/** Controllo ogni minuto: se il worker era spento all'orario, recupera appena riparte (stesso giorno). */
export function startReminders() {
  void tick();
  return setInterval(() => void tick(), 60_000);
}
