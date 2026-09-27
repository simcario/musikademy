import {
  Timestamp,
  addDoc,
  deleteDoc,
  getCountFromServer,
  orderBy,
  query,
  updateDoc,
  where,
  limit,
  type QueryConstraint,
} from "firebase/firestore";
import type { Lesson, LessonStatus } from "@/types";
import { buildKeywords } from "@/utils/keywords";
import { COLLECTIONS, clean, col, getById, list, paginate, ref, timestamps, touched } from "./base";

export interface LessonInput {
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  courseId?: string;
  date: Date;
  startTime?: string;
  endTime?: string;
  title: string;
  subject?: string;
  topics?: string[];
  notes?: string;
  materialIds?: string[];
  status: LessonStatus;
}

function toDoc(input: LessonInput) {
  return clean({
    ...input,
    courseId: input.courseId || undefined,
    date: Timestamp.fromDate(input.date),
    topics: input.topics ?? [],
    materialIds: input.materialIds ?? [],
    keywords: buildKeywords(input.title, input.subject, input.studentName),
  });
}

function dayRange(from: Date, days: number) {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + days);
  return [Timestamp.fromDate(start), Timestamp.fromDate(end)] as const;
}

export const lessonService = {
  get: (id: string) => getById<Lesson>(COLLECTIONS.lessons, id),

  // ── Studente (ogni query filtra per studentId: requisito delle rules) ──
  pageForStudent: (studentId: string, cursor: unknown | null, status?: LessonStatus) => {
    const c: QueryConstraint[] = [where("studentId", "==", studentId)];
    if (status) c.push(where("status", "==", status));
    c.push(orderBy("date", status === "scheduled" ? "asc" : "desc"));
    return paginate<Lesson>(COLLECTIONS.lessons, c, cursor, 15);
  },

  async nextForStudent(studentId: string) {
    const [r] = await list<Lesson>(
      COLLECTIONS.lessons,
      where("studentId", "==", studentId),
      where("status", "==", "scheduled"),
      where("date", ">=", dayRange(new Date(), 0)[0]),
      orderBy("date", "asc"),
      limit(1),
    );
    return r ?? null;
  },

  /** Prima lezione non annullata: inizio dei cicli di pagamento (ADR D21). */
  async firstForStudent(studentId: string) {
    const rows = await list<Lesson>(
      COLLECTIONS.lessons,
      where("studentId", "==", studentId),
      orderBy("date", "asc"),
      limit(5),
    );
    return rows.find((l) => l.status !== "cancelled") ?? null;
  },

  // ── Docente ──
  listInRange: (from: Date, days: number) => {
    const [start, end] = dayRange(from, days);
    return list<Lesson>(COLLECTIONS.lessons, where("date", ">=", start), where("date", "<", end), orderBy("date", "asc"));
  },

  page: (filters: { studentId?: string; status?: LessonStatus | "all" }, cursor: unknown | null) => {
    const c: QueryConstraint[] = [];
    if (filters.studentId) c.push(where("studentId", "==", filters.studentId));
    if (filters.status && filters.status !== "all") c.push(where("status", "==", filters.status));
    c.push(orderBy("date", "desc"));
    return paginate<Lesson>(COLLECTIONS.lessons, c, cursor, 20);
  },

  async countInRange(from: Date, days: number) {
    const [start, end] = dayRange(from, days);
    const snap = await getCountFromServer(
      query(col(COLLECTIONS.lessons), where("date", ">=", start), where("date", "<", end)),
    );
    return snap.data().count;
  },

  async create(input: LessonInput) {
    const r = await addDoc(col(COLLECTIONS.lessons), { ...toDoc(input), ...timestamps() });
    return r.id;
  },

  update: (id: string, input: LessonInput) => updateDoc(ref(COLLECTIONS.lessons, id), { ...toDoc(input), ...touched() }),

  setStatus: (id: string, status: LessonStatus) => updateDoc(ref(COLLECTIONS.lessons, id), { status, ...touched() }),

  setMaterials: (id: string, materialIds: string[]) =>
    updateDoc(ref(COLLECTIONS.lessons, id), { materialIds, ...touched() }),

  remove: (id: string) => deleteDoc(ref(COLLECTIONS.lessons, id)),
};
