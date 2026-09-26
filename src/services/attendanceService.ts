import {
  documentId,
  getCountFromServer,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  limit,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Attendance, AttendanceStatus, Lesson, WithId } from "@/types";
import { COLLECTIONS, chunk, col, list, ref } from "./base";

export const attendanceService = {
  /** Storico presenze dello studente (una scuola privata ha decine di lezioni/anno per studente). */
  listForStudent: (studentId: string) =>
    list<Attendance>(COLLECTIONS.attendance, where("studentId", "==", studentId), orderBy("lessonDate", "desc"), limit(500)),

  /** Presenze per un insieme di lezioni (docente). `attendance/{lessonId}` → ADR D4. */
  async mapForLessons(lessonIds: string[]): Promise<Map<string, WithId<Attendance>>> {
    const map = new Map<string, WithId<Attendance>>();
    for (const ids of chunk(lessonIds)) {
      if (!ids.length) continue;
      const rows = await list<Attendance>(COLLECTIONS.attendance, where(documentId(), "in", ids));
      rows.forEach((r) => map.set(r.id, r));
    }
    return map;
  },

  /** Studente: presenze delle proprie lezioni (query vincolata a studentId per le rules). */
  async mapForStudentLessons(studentId: string, lessonIds: string[]) {
    const map = new Map<string, WithId<Attendance>>();
    for (const ids of chunk(lessonIds)) {
      if (!ids.length) continue;
      const rows = await list<Attendance>(
        COLLECTIONS.attendance,
        where("studentId", "==", studentId),
        where("lessonId", "in", ids),
      );
      rows.forEach((r) => map.set(r.id, r));
    }
    return map;
  },

  /**
   * Registrazione rapida (upsert). Presente/assente/giustificato/recupero → lezione conclusa;
   * annullata → lezione annullata. Scrittura atomica.
   */
  async record(lesson: WithId<Lesson>, status: AttendanceStatus, notes?: string) {
    const batch = writeBatch(firestore());
    batch.set(
      ref(COLLECTIONS.attendance, lesson.id),
      {
        lessonId: lesson.id,
        studentId: lesson.studentId,
        lessonDate: lesson.date,
        status,
        ...(notes !== undefined ? { notes } : {}),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    batch.update(ref(COLLECTIONS.lessons, lesson.id), {
      status: status === "cancelled" ? "cancelled" : "completed",
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  },

  setNotes: (lessonId: string, notes: string) =>
    setDoc(ref(COLLECTIONS.attendance, lessonId), { notes, updatedAt: serverTimestamp() }, { merge: true }),

  /** Percentuale complessiva (docente) via aggregazioni server: nessun download dei documenti. */
  async overallRate() {
    const base = col(COLLECTIONS.attendance);
    const [effective, present] = await Promise.all([
      getCountFromServer(query(base, where("status", "in", ["present", "absent", "excused", "makeup"]))),
      getCountFromServer(query(base, where("status", "in", ["present", "makeup"]))),
    ]);
    const total = effective.data().count;
    return total ? Math.round((present.data().count / total) * 100) : null;
  },
};
