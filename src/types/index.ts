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

/** Costo del corso a cicli di 4 settimane dalla prima lezione (ADR D21, utils/cycles). */
export interface StudentFee {
  /** Quota dovuta per ogni ciclo di 4 settimane (es. 4 lezioni × 30 € = 120 €). */
  cycleAmount: number;
  /** Facoltativi: costo a lezione e lezioni per ciclo, usati per proporre versamenti "a lezione". */
  lessonPrice?: number;
  lessonsPerCycle?: number;
  /** Prima lezione: da qui partono i cicli. */
  startDate: Timestamp;
  /** Scadenza della quota: primo o ultimo giorno del ciclo. */
  dueAt: "start" | "end";
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

export const MATERIAL_TYPES = ["pdf", "audio", "video", "image", "markdown", "document", "other"] as const;
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

/**
 * I materiali di categoria `esercizio` sono il catalogo degli esercizi (sezione Esercizi):
 * non compaiono nella libreria dei materiali, né del docente né dello studente.
 */
export const EXERCISE_CATEGORY = "esercizio" satisfies MaterialCategory;
export const LIBRARY_CATEGORIES = MATERIAL_CATEGORIES.filter((c) => c !== EXERCISE_CATEGORY);

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
  /** Solo per i Markdown: testo del file, letto direttamente da Firestore per la visualizzazione. */
  content?: string;
  courseId?: string;
  createdBy: string;
  visibility: Visibility;
  studentIds: string[];
  keywords: string[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

export type AssignmentStatus = "todo" | "in_progress" | "completed";

/** Riconoscimento della tastiera: compare una nota, lo studente la suona e il microfono la riconosce. */
export interface PianoKeysExercise {
  kind: "piano-keys";
  /** Note da riconoscere in una sessione. */
  rounds: number;
  /** Include i tasti neri (diesis e bemolle). */
  accidentals: boolean;
}

export const SCALE_TYPES = ["major", "natural_minor", "harmonic_minor", "melodic_minor"] as const;
export type ScaleType = (typeof SCALE_TYPES)[number];

/** Scale musicali: compare il nome di una scala, lo studente la suona nota per nota. */
export interface ScalesExercise {
  kind: "scales";
  /** Tipo di scala richiesto; `mixed` = ogni volta un tipo a caso. */
  scale: ScaleType | "mixed";
  /** Scale da suonare in una sessione. */
  rounds: number;
  /** Include le tonalità con la tonica su un tasto nero. */
  accidentals: boolean;
  /** Secondi a disposizione per l'intera scala; `null` = senza limite. */
  timeLimit: number | null;
}

/** Chiave di violino o di basso. */
export type Clef = "treble" | "bass";

/** Nota sul pentagramma: compare una nota scritta, lo studente la suona. */
export interface StaffNotesExercise {
  kind: "staff-notes";
  /** `mixed` = ogni volta una chiave a caso. */
  clef: Clef | "mixed";
  /** `staff` = solo note dentro il pentagramma; `ledger` = anche con tagli addizionali. */
  range: "staff" | "ledger";
  /** Include diesis e bemolle. */
  accidentals: boolean;
  /** La nota vale solo nell'ottava scritta (altrimenti in qualunque ottava). */
  strictOctave: boolean;
  rounds: number;
  /** Secondi a disposizione per ogni nota; `null` = senza limite. */
  timeLimit: number | null;
}

export const MEASURE_DIFFICULTIES = ["easy", "medium", "hard"] as const;
export type MeasureDifficulty = (typeof MEASURE_DIFFICULTIES)[number];

/** Battuta sul pentagramma: lo studente suona le note di una battuta in 4/4 a tempo di metronomo. */
export interface StaffMeasureExercise {
  kind: "staff-measure";
  clef: Clef;
  difficulty: MeasureDifficulty;
  /** Velocità del metronomo incorporato. */
  bpm: number;
  /** Battute da suonare in una sessione. */
  rounds: number;
}

/** Intervalli: data una nota di partenza e un intervallo, lo studente suona la nota di arrivo. */
export interface IntervalsExercise {
  kind: "intervals";
  /** Quali intervalli vengono chiesti. */
  level: "seconds_thirds" | "up_to_fifth" | "all";
  /** Intervalli ascendenti, discendenti o entrambi. */
  direction: "up" | "down" | "mixed";
  /** Include le note di partenza alterate. */
  accidentals: boolean;
  rounds: number;
  /** Secondi a disposizione per ogni intervallo; `null` = senza limite. */
  timeLimit: number | null;
}

/** Esercizi interattivi disponibili (catalogo in features/exercises/interactive). */
export type InteractiveExercise =
  | PianoKeysExercise
  | ScalesExercise
  | StaffNotesExercise
  | StaffMeasureExercise
  | IntervalsExercise;
export type InteractiveKind = InteractiveExercise["kind"];

export interface Assignment {
  studentId: string;
  studentName: string;
  lessonId?: string;
  title: string;
  description?: string;
  /** Presente se l'esercizio è interattivo: tipo e impostazioni del gioco. */
  interactive?: InteractiveExercise;
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
  /** Primo giorno (`YYYY-MM-DD`) del ciclo di 4 settimane delle quote generate. */
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
