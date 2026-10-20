/**
 * Migrazione a materie, isolamento dei docenti ed economia personale (ADR D34).
 *
 *   npm run migrate-teachers            → simulazione: mostra cosa cambierebbe
 *   npm run migrate-teachers -- --apply → scrive le modifiche
 *
 * Idempotente: si può rilanciare. Richiede credenziali Admin (GOOGLE_APPLICATION_CREDENTIALS)
 * oppure gli emulatori attivi. Da eseguire subito dopo il deploy delle nuove rules: finché non
 * gira, i docenti non vedono le presenze e le quote precedenti.
 *
 * 1. `teachers/{uid}.courseIds` = corsi in cui il docente è in `courses.teacherIds`.
 * 2. `attendance.teacherId` dalla lezione.
 * 3. `payments.teacherId` = chi ha creato la quota.
 * 4. Il vecchio costo unico `students.fee` diventa un costo in `fees` del docente che ne genera
 *    le quote (o dell'unico docente dello studente); le quote dei cicli vi vengono collegate.
 */
import { FieldValue, type DocumentData } from "firebase-admin/firestore";
import { initAdmin, usingEmulators } from "./lib/admin-env";

const APPLY = process.argv.includes("--apply");

type Course = { name: string; teacherIds?: string[]; subjects?: { id: string; name: string; teacherIds: string[] }[] };

async function main() {
  const { db, projectId } = initAdmin();
  console.log(`Progetto: ${projectId}${usingEmulators() ? " (EMULATORI)" : ""} · ${APPLY ? "APPLICO" : "SIMULAZIONE (usa --apply)"}\n`);
  const writer = db.bulkWriter();
  let writes = 0;
  const update = (ref: FirebaseFirestore.DocumentReference, data: DocumentData) => {
    writes++;
    if (APPLY) void writer.update(ref, data);
  };
  const set = (ref: FirebaseFirestore.DocumentReference, data: DocumentData) => {
    writes++;
    if (APPLY) void writer.set(ref, data);
  };
  const now = FieldValue.serverTimestamp();

  const [coursesSnap, teachersSnap, usersSnap] = await Promise.all([
    db.collection("courses").get(),
    db.collection("teachers").get(),
    db.collection("users").where("role", "in", ["admin", "teacher"]).get(),
  ]);
  const courses = new Map(coursesSnap.docs.map((d) => [d.id, d.data() as Course]));
  const names = new Map(usersSnap.docs.map((d) => [d.id, `${d.data().name ?? ""} ${d.data().surname ?? ""}`.trim()]));

  // 1. Corsi dei docenti.
  let n = 0;
  for (const t of teachersSnap.docs) {
    const mine = [...courses].filter(([, c]) => (c.teacherIds ?? []).includes(t.id)).map(([id]) => id).sort();
    const current = [...((t.data().courseIds as string[] | undefined) ?? [])].sort();
    if (mine.join() !== current.join()) {
      update(t.ref, { courseIds: mine, updatedAt: now });
      n++;
    }
  }
  console.log(`1. Docenti con corsi da riallineare: ${n}`);

  // 2. Presenze senza docente.
  n = 0;
  let orphan = 0;
  const attendance = await db.collection("attendance").get();
  for (const a of attendance.docs) {
    if (a.data().teacherId) continue;
    const lesson = await db.doc(`lessons/${a.id}`).get();
    const teacherId = lesson.data()?.teacherId as string | undefined;
    if (!teacherId) {
      orphan++;
      continue;
    }
    update(a.ref, { teacherId });
    n++;
  }
  console.log(`2. Presenze collegate al docente: ${n}${orphan ? ` (${orphan} senza lezione: visibili solo all'admin)` : ""}`);

  // 3. Quote senza docente.
  n = 0;
  const payments = await db.collection("payments").get();
  for (const p of payments.docs) {
    const d = p.data();
    if (d.teacherId || !d.createdBy) continue;
    update(p.ref, { teacherId: d.createdBy, teacherName: names.get(d.createdBy) ?? "" });
    n++;
  }
  console.log(`3. Quote assegnate a chi le ha create: ${n}`);

  // 4. Costo unico dello studente → costo del docente.
  n = 0;
  const skipped: string[] = [];
  const students = await db.collection("students").where("fee", "!=", null).get();
  for (const s of students.docs) {
    const st = s.data();
    const fee = st.fee as DocumentData;
    const label = `${st.name} ${st.surname}`;
    if (!fee?.cycleAmount || !fee.startDate || !fee.dueAt) {
      skipped.push(`${label}: costo nel vecchio formato mensile, da reimpostare a mano`);
      continue;
    }
    // Docente: chi ha generato le quote dei cicli, altrimenti l'unico docente delle sue lezioni o dei suoi corsi.
    const cyclePayments = payments.docs.filter((p) => p.id.startsWith(`cycle_${s.id}_`));
    const fromPayments = cyclePayments.map((p) => p.data().createdBy as string).filter(Boolean);
    const lessons = await db.collection("lessons").where("studentId", "==", s.id).get();
    const fromLessons = [...new Set(lessons.docs.map((l) => l.data().teacherId as string))];
    const fromCourses = [...new Set(((st.courseIds ?? []) as string[]).flatMap((c) => courses.get(c)?.teacherIds ?? []))];
    const teacherId = fromPayments.at(-1) ?? (fromLessons.length === 1 ? fromLessons[0] : fromCourses.length === 1 ? fromCourses[0] : null);
    if (!teacherId) {
      skipped.push(`${label}: docente non determinabile (${fromLessons.length || fromCourses.length} possibili)`);
      continue;
    }
    const courseIds = (st.courseIds ?? []) as string[];
    const courseId = courseIds.find((c) => courses.get(c)?.teacherIds?.includes(teacherId)) ?? courseIds[0];
    if (!courseId || !courses.has(courseId)) {
      skipped.push(`${label}: non frequenta nessun corso`);
      continue;
    }
    const course = courses.get(courseId)!;
    const taught = (course.subjects ?? []).filter((x) => x.teacherIds.includes(teacherId));
    const subject = taught.length === 1 ? taught[0] : undefined;
    const feeId = `${teacherId}_${s.id}_${courseId}_${subject?.id ?? "corso"}`;
    set(db.doc(`fees/${feeId}`), {
      teacherId,
      teacherName: names.get(teacherId) ?? "",
      studentId: s.id,
      studentName: label,
      courseId,
      courseName: course.name,
      ...(subject ? { subjectId: subject.id, subjectName: subject.name } : {}),
      cycleAmount: fee.cycleAmount,
      ...(fee.lessonPrice ? { lessonPrice: fee.lessonPrice } : {}),
      ...(fee.lessonsPerCycle ? { lessonsPerCycle: fee.lessonsPerCycle } : {}),
      startDate: fee.startDate,
      dueAt: fee.dueAt,
      createdAt: now,
      updatedAt: now,
    });
    for (const p of cyclePayments) {
      if (p.data().feeId) continue;
      update(p.ref, { feeId, courseId, subjectName: subject?.name ?? course.name });
    }
    update(s.ref, { fee: FieldValue.delete() });
    n++;
  }
  console.log(`4. Costi convertiti: ${n}`);
  skipped.forEach((m) => console.log(`   ! ${m}`));

  if (APPLY) await writer.close();
  else await writer.close().catch(() => undefined);
  console.log(`\n${APPLY ? "Scritture eseguite" : "Scritture previste"}: ${writes}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
