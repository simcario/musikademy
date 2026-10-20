import { Timestamp, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, where, writeBatch, limit } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Assignment, AssignmentStatus, InteractiveExercise } from "@/types";
import { buildKeywords } from "@/utils/keywords";
import { COLLECTIONS, chunk, clean, col, list, ownedBy, paginate, ref, touched, type StaffScope } from "./base";

export interface AssignmentInput {
  title: string;
  description?: string;
  interactive?: InteractiveExercise;
  lessonId?: string;
  materialIds: string[];
  dueDate?: Date;
}

async function assignBatch(input: AssignmentInput, students: { id: string; name: string }[], createdBy: string) {
  const batch = writeBatch(firestore());
  for (const s of students) {
    batch.set(
      doc(col(COLLECTIONS.assignments)),
      clean({
        ...input,
        lessonId: input.lessonId || undefined,
        dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : undefined,
        studentId: s.id,
        studentName: s.name,
        status: "todo" as AssignmentStatus,
        createdBy,
        keywords: buildKeywords(input.title, s.name),
        assignedAt: serverTimestamp(),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    );
  }
  await batch.commit();
}

export const assignmentService = {
  // ── Studente ──
  /** `scope` dallo staff: il docente vede solo gli esercizi che ha assegnato (ADR D29). */
  listForStudent: (studentId: string, scope?: StaffScope) =>
    list<Assignment>(
      COLLECTIONS.assignments,
      where("studentId", "==", studentId),
      ...(scope ? ownedBy(scope, "createdBy") : []),
      orderBy("assignedAt", "desc"),
      limit(200),
    ),

  listForLesson: (lessonId: string, studentId?: string) =>
    list<Assignment>(
      COLLECTIONS.assignments,
      ...(studentId ? [where("studentId", "==", studentId)] : []),
      where("lessonId", "==", lessonId),
    ),

  /** L'unico campo che lo studente può modificare (vincolato da firestore.rules). */
  setStatus: (id: string, status: AssignmentStatus) =>
    updateDoc(ref(COLLECTIONS.assignments, id), { status, ...touched() }),

  // ── Docente ──
  page: (filters: { studentId?: string; status?: AssignmentStatus | "all" }, cursor: unknown | null, scope: StaffScope) =>
    paginate<Assignment>(
      COLLECTIONS.assignments,
      [
        ...ownedBy(scope, "createdBy"),
        ...(filters.studentId ? [where("studentId", "==", filters.studentId)] : []),
        ...(filters.status && filters.status !== "all" ? [where("status", "==", filters.status)] : []),
        orderBy("assignedAt", "desc"),
      ],
      cursor,
      20,
    ),

  /**
   * Assegnazione a uno o più studenti: un documento per studente (ADR D5). Per il docente le rules
   * leggono il documento di ogni studente, e una scrittura in batch ammette al massimo 20 letture:
   * blocchi da 15 studenti, atomici ciascuno.
   */
  async assign(input: AssignmentInput, students: { id: string; name: string }[], createdBy: string) {
    for (const part of chunk(students, 15)) await assignBatch(input, part, createdBy);
  },

  update: (id: string, input: AssignmentInput, studentName: string) =>
    updateDoc(ref(COLLECTIONS.assignments, id), {
      title: input.title,
      description: input.description ?? "",
      lessonId: input.lessonId ?? "",
      materialIds: input.materialIds,
      ...(input.interactive ? { interactive: input.interactive } : {}),
      dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
      keywords: buildKeywords(input.title, studentName),
      ...touched(),
    }),

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.assignments, id)),
};
