import { Timestamp, deleteDoc, doc, orderBy, serverTimestamp, updateDoc, where, writeBatch, limit } from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { Assignment, AssignmentStatus } from "@/types";
import { buildKeywords } from "@/utils/keywords";
import { COLLECTIONS, clean, col, list, paginate, ref, touched } from "./base";

export interface AssignmentInput {
  title: string;
  description?: string;
  lessonId?: string;
  materialIds: string[];
  dueDate?: Date;
}

export const assignmentService = {
  // ── Studente ──
  listForStudent: (studentId: string) =>
    list<Assignment>(COLLECTIONS.assignments, where("studentId", "==", studentId), orderBy("assignedAt", "desc"), limit(200)),

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
  page: (filters: { studentId?: string; status?: AssignmentStatus | "all" }, cursor: unknown | null) =>
    paginate<Assignment>(
      COLLECTIONS.assignments,
      [
        ...(filters.studentId ? [where("studentId", "==", filters.studentId)] : []),
        ...(filters.status && filters.status !== "all" ? [where("status", "==", filters.status)] : []),
        orderBy("assignedAt", "desc"),
      ],
      cursor,
      20,
    ),

  /** Assegnazione a uno o più studenti: un documento per studente, scrittura atomica (ADR D5). */
  async assign(input: AssignmentInput, students: { id: string; name: string }[], createdBy: string) {
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
  },

  update: (id: string, input: AssignmentInput, studentName: string) =>
    updateDoc(ref(COLLECTIONS.assignments, id), {
      title: input.title,
      description: input.description ?? "",
      lessonId: input.lessonId ?? "",
      materialIds: input.materialIds,
      dueDate: input.dueDate ? Timestamp.fromDate(input.dueDate) : null,
      keywords: buildKeywords(input.title, studentName),
      ...touched(),
    }),

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.assignments, id)),
};
