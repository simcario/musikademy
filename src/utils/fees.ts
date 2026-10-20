import type { Course, Fee } from "@/types";

/** ID del costo (ADR D34): uno per docente, studente, corso e materia ("corso" se senza materie). */
export const feeId = (teacherId: string, studentId: string, courseId: string, subjectId?: string) =>
  `${teacherId}_${studentId}_${courseId}_${subjectId || "corso"}`;

/** "Pianoforte · Classica" oppure solo il corso, se senza materie. */
export const feeLabel = (fee: Pick<Fee, "courseName" | "subjectName">) =>
  fee.subjectName ? `${fee.subjectName} · ${fee.courseName}` : fee.courseName;

/** Materie del corso insegnate da `teacherId` (tutte, se omesso). */
export function subjectsFor(course: Pick<Course, "subjects"> | undefined, teacherId?: string) {
  return (course?.subjects ?? []).filter((s) => !teacherId || s.teacherIds.includes(teacherId));
}
