import {
  Timestamp,
  doc,
  getDoc,
  orderBy,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
  type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "@/lib/firebase/client";
import type { InviteInfo } from "@/lib/auth/invite-token";
import type { Page, Student, StudentStatus } from "@/types";
import { searchToken } from "@/utils/keywords";
import { adminApi } from "./authService";
import { COLLECTIONS, clean, getById, list, paginate, ref, scopeCourses, touched, type StaffScope } from "./base";
import { studentKeywords } from "./userService";

/** Note private del docente: collezione separata, mai leggibile dallo studente (ADR D16). */
const notesRef = (uid: string) => doc(firestore(), "studentNotes", uid);

export interface StudentInput {
  name: string;
  surname: string;
  email: string;
  phone?: string;
  /** Ruolo dell'organizzazione (ADR D31); usato solo alla creazione. */
  roleId?: string;
  courseIds: string[];
  enrollmentDate: Date;
  notes?: string;
}

export interface StudentFilters {
  status?: StudentStatus | "all";
  courseId?: string;
  search?: string;
}

function filterConstraints(f: StudentFilters): QueryConstraint[] {
  const c: QueryConstraint[] = [];
  if (f.status && f.status !== "all") c.push(where("status", "==", f.status));
  const token = f.search ? searchToken(f.search) : null;
  // Firestore consente un solo array-contains per query: la ricerca ha priorità sul filtro corso.
  if (token) c.push(where("keywords", "array-contains", token));
  else if (f.courseId) c.push(where("courseIds", "array-contains", f.courseId));
  c.push(orderBy("surname"), orderBy("name"));
  return c;
}

/**
 * Studenti dei corsi del docente (ADR D34): `array-contains-any` sui suoi corsi, il vincolo che
 * le rules richiedono. Non si combina con la ricerca per keyword, che qui si fa sul risultato
 * (un docente segue al massimo qualche decina di studenti).
 */
async function teacherStudents(scope: StaffScope, f: StudentFilters) {
  const courses = scopeCourses(scope).filter((c) => !f.courseId || c === f.courseId);
  if (!courses.length) return [];
  const rows = await list<Student>(
    COLLECTIONS.students,
    ...(f.status && f.status !== "all" ? [where("status", "==", f.status)] : []),
    where("courseIds", "array-contains-any", courses),
    orderBy("surname"),
    orderBy("name"),
  );
  const token = f.search ? searchToken(f.search) : null;
  return token ? rows.filter((s) => s.keywords?.includes(token)) : rows;
}

export const studentService = {
  get: (uid: string) => getById<Student>(COLLECTIONS.students, uid),

  async page(filters: StudentFilters, cursor: unknown | null, scope: StaffScope): Promise<Page<Student>> {
    if (!scope.admin) return { items: await teacherStudents(scope, filters), cursor: null };
    return paginate<Student>(COLLECTIONS.students, filterConstraints(filters), cursor, 25);
  },

  listActive: (scope: StaffScope) =>
    scope.admin
      ? list<Student>(COLLECTIONS.students, where("status", "==", "active"), orderBy("surname"), orderBy("name"))
      : teacherStudents(scope, { status: "active" }),

  /** Creazione account: richiede Admin SDK → route handler (ADR D3). */
  create: (input: StudentInput) =>
    adminApi<{ uid: string; invite: InviteInfo }>("users", {
      method: "POST",
      body: { ...input, enrollmentDate: input.enrollmentDate.toISOString(), roleId: input.roleId || "student" },
    }),

  /** Cambia il ruolo dell'organizzazione (solo admin, ADR D31): l'utente dovrà accedere di nuovo. */
  setRole: (uid: string, roleId: string) =>
    adminApi<{ ok: true }>(`users/${uid}`, { method: "PATCH", body: { roleId } }),

  /** Aggiorna anagrafica; l'email si cambia solo via API (deve restare allineata con Auth). */
  async update(uid: string, input: Omit<StudentInput, "email"> & { email: string }) {
    const batch = writeBatch(firestore());
    const common = { name: input.name, surname: input.surname, phone: input.phone || "" };
    batch.update(
      ref(COLLECTIONS.students, uid),
      clean({
        ...common,
        courseIds: input.courseIds,
        enrollmentDate: Timestamp.fromDate(input.enrollmentDate),
        keywords: studentKeywords(input),
        ...touched(),
      }),
    );
    batch.update(ref(COLLECTIONS.users, uid), { ...common, ...touched() });
    await batch.commit();
  },

  async getNotes(uid: string): Promise<string> {
    const snap = await getDoc(notesRef(uid));
    return (snap.data()?.notes as string | undefined) ?? "";
  },

  setNotes: (uid: string, notes: string) => setDoc(notesRef(uid), { notes, updatedAt: serverTimestamp() }),

  /** Soft delete (§20): disattiva account Auth e profilo, lo storico resta. */
  setStatus: (uid: string, status: StudentStatus) =>
    adminApi<{ ok: true }>(`users/${uid}`, { method: "PATCH", body: { active: status === "active" } }),

  /** Hard delete: account e tutto lo storico dello studente, irreversibile → Admin SDK. */
  remove: (uid: string) => adminApi<{ ok: true }>(`users/${uid}`, { method: "DELETE" }),

  /** Email di accesso: va cambiata in Auth e nei profili insieme → Admin SDK. */
  changeEmail: (uid: string, email: string) =>
    adminApi<{ ok: true }>(`users/${uid}`, { method: "PATCH", body: { email } }),

  /** Nuovo link d'invito (accesso con Google): invalida quelli precedenti. */
  createInvite: (uid: string) => adminApi<InviteInfo>(`users/${uid}/invite`, { method: "POST" }),
};
