import type {
  AssignmentStatus,
  AttendanceStatus,
  LessonStatus,
  MaterialCategory,
  Payment,
  PaymentMethod,
  PaymentStatus,
} from "@/types";
import { toDate } from "./format";

export type Tone = "success" | "danger" | "warning" | "info" | "neutral" | "primary" | "secondary";

export const ATTENDANCE_META: Record<AttendanceStatus, { label: string; short: string; glyph: string; tone: Tone }> = {
  present: { label: "Presente", short: "Presente", glyph: "✓", tone: "success" },
  absent: { label: "Assente", short: "Assente", glyph: "✕", tone: "danger" },
  excused: { label: "Giustificato", short: "Giustif.", glyph: "G", tone: "warning" },
  makeup: { label: "Recupero", short: "Recupero", glyph: "R", tone: "info" },
  cancelled: { label: "Annullata", short: "Annullata", glyph: "—", tone: "neutral" },
};

export const ASSIGNMENT_META: Record<AssignmentStatus, { label: string; tone: Tone }> = {
  todo: { label: "Da fare", tone: "neutral" },
  in_progress: { label: "In corso", tone: "info" },
  completed: { label: "Completato", tone: "success" },
};

export const LESSON_META: Record<LessonStatus, { label: string; tone: Tone }> = {
  scheduled: { label: "In programma", tone: "primary" },
  completed: { label: "Conclusa", tone: "success" },
  cancelled: { label: "Annullata", tone: "neutral" },
};

export const PAYMENT_META: Record<PaymentStatus, { label: string; tone: Tone }> = {
  pending: { label: "Da pagare", tone: "warning" },
  paid: { label: "Pagato", tone: "success" },
  overdue: { label: "Scaduto", tone: "danger" },
  cancelled: { label: "Annullato", tone: "neutral" },
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Contanti",
  bank_transfer: "Bonifico",
  card: "Carta",
  other: "Altro",
};

export const CATEGORY_META: Record<MaterialCategory, { label: string; plural: string }> = {
  dispensa: { label: "Dispensa", plural: "Dispense" },
  ascolto: { label: "Ascolto", plural: "Ascolti" },
  base: { label: "Base", plural: "Basi" },
  video: { label: "Video", plural: "Video" },
  spartito: { label: "Spartito", plural: "Spartiti" },
  immagine: { label: "Immagine", plural: "Immagini" },
  esercizio: { label: "Esercizio", plural: "Esercizi" },
  altro: { label: "Altro", plural: "Altro" },
};

/** Stato effettivo: un pagamento `pending` con scadenza passata è mostrato come `overdue` (ADR D6). */
export function effectivePaymentStatus(p: Pick<Payment, "status" | "dueDate">, now = new Date()): PaymentStatus {
  if (p.status !== "pending") return p.status;
  const due = toDate(p.dueDate);
  if (!due) return p.status;
  const endOfDue = new Date(due);
  endOfDue.setHours(23, 59, 59, 999);
  return endOfDue < now ? "overdue" : "pending";
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  excused: number;
  makeup: number;
  /** Percentuale su lezioni effettive (esclude annullate). */
  rate: number;
}

export function summarizeAttendance(statuses: AttendanceStatus[]): AttendanceSummary {
  const s = { total: 0, present: 0, absent: 0, excused: 0, makeup: 0, rate: 0 };
  for (const st of statuses) {
    if (st === "cancelled") continue;
    s.total++;
    if (st === "present" || st === "makeup") s.present++;
    if (st === "makeup") s.makeup++;
    if (st === "absent") s.absent++;
    if (st === "excused") s.excused++;
  }
  s.rate = s.total ? Math.round((s.present / s.total) * 100) : 0;
  return s;
}
