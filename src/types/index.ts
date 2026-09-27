import type { Timestamp } from "firebase/firestore";

/** Ruoli attivi nella V1. `superadmin | assistant | secretary` sono previsti (vedi lib/auth/roles). */
export type Role = "admin" | "teacher" | "student";

export type WithId<T> = T & { id: string };

export interface AppUser {
  uid: string;
  name: string;
  surname: string;
  email: string;
  role: Role;
  photoURL?: string;
  phone?: string;
  active: boolean;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type StudentStatus = "active" | "inactive";

export interface Student {
  userId: string;
  name: string;
  surname: string;
  email: string;
  courseIds: string[];
  enrollmentDate: Timestamp;
  status: StudentStatus;
  /** Accesso con Google tramite invito (ADR D20). Assente sugli account precedenti (email/password). */
  inviteStatus?: "pending" | "accepted";
  phone?: string;
  /** Costo del corso: base per generare le quote mensili. */
  fee?: StudentFee;
  keywords: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface StudentFee {
  /** Quota dovuta ogni mese (es. 4 lezioni × 30 € = 120 €). */
  monthlyAmount: number;
  /** Facoltativi: costo a lezione e lezioni al mese, usati per proporre versamenti "a lezione". */
  lessonPrice?: number;
  lessonsPerMonth?: number;
  /** Giorno del mese in cui scade la quota (1–28). */
  dueDay: number;
}

export interface Teacher {
  userId: string;
  name: string;
  surname: string;
  email: string;
  courseIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Course {
  name: string;
  description?: string;
  active: boolean;
  teacherIds: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type LessonStatus = "scheduled" | "completed" | "cancelled";

export interface Lesson {
  studentId: string;
  studentName: string;
  teacherId: string;
  teacherName: string;
  courseId?: string;
  date: Timestamp;
  startTime?: string;
  endTime?: string;
  title: string;
  subject?: string;
  /** Argomenti trattati, mostrati come elenco puntato nel dettaglio lezione. */
  topics?: string[];
  notes?: string;
  materialIds: string[];
  status: LessonStatus;
  keywords: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const MATERIAL_TYPES = ["pdf", "audio", "video", "image", "document", "other"] as const;
export type MaterialType = (typeof MATERIAL_TYPES)[number];

export const MATERIAL_CATEGORIES = [
  "dispensa",
  "ascolto",
  "base",
  "video",
  "spartito",
  "immagine",
  "esercizio",
  "altro",
] as const;
export type MaterialCategory = (typeof MATERIAL_CATEGORIES)[number];

export type Visibility = "all" | "course" | "student";

export interface Material {
  title: string;
  description?: string;
  type: MaterialType;
  category: MaterialCategory;
  storagePath: string;
  downloadURL?: string;
  fileName: string;
  contentType: string;
  size: number;
  courseId?: string;
  createdBy: string;
  visibility: Visibility;
  studentIds: string[];
  keywords: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AssignmentStatus = "todo" | "in_progress" | "completed";

export interface Assignment {
  studentId: string;
  studentName: string;
  lessonId?: string;
  title: string;
  description?: string;
  materialIds: string[];
  assignedAt: Timestamp;
  dueDate?: Timestamp;
  status: AssignmentStatus;
  createdBy: string;
  keywords: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export const ATTENDANCE_STATUSES = ["present", "absent", "excused", "makeup", "cancelled"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface Attendance {
  lessonId: string;
  studentId: string;
  lessonDate: Timestamp;
  status: AttendanceStatus;
  notes?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/** `partial` = versamenti inferiori al dovuto; `overdue` è derivato a runtime (ADR D6). */
export type PaymentStatus = "pending" | "partial" | "paid" | "overdue" | "cancelled";
export const PAYMENT_METHODS = ["cash", "bank_transfer", "card", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Singolo versamento su una quota (es. una lezione pagata a mano). */
export interface Installment {
  id: string;
  amount: number;
  date: Timestamp;
  method: PaymentMethod;
  notes?: string;
}

/** Quota dovuta dallo studente, saldabile con uno o più versamenti (ADR D21). */
export interface Payment {
  studentId: string;
  studentName: string;
  description: string;
  /** Importo dovuto. */
  amount: number;
  /** Somma dei versamenti, denormalizzata per le aggregazioni. Assente sui documenti precedenti. */
  paidAmount?: number;
  installments?: Installment[];
  /** Mese di competenza `YYYY-MM` delle quote mensili generate. */
  period?: string;
  dueDate: Timestamp;
  /** Data dell'ultimo versamento. */
  paidDate?: Timestamp;
  status: PaymentStatus;
  /** Metodo dell'ultimo versamento. */
  method?: PaymentMethod;
  notes?: string;
  createdBy: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AnnouncementTarget = "all" | "course" | "student";

export interface Attachment {
  name: string;
  url: string;
  storagePath: string;
}

export interface Announcement {
  title: string;
  content: string;
  targetType: AnnouncementTarget;
  targetId?: string;
  createdBy: string;
  authorName: string;
  attachments: Attachment[];
  publishedAt: Timestamp;
  keywords: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export interface Page<T> {
  items: WithId<T>[];
  /** Cursore opaco per la pagina successiva, `null` se finita. */
  cursor: unknown | null;
}
