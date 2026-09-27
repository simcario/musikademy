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
  partial: { label: "Parziale", tone: "info" },
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

const cents = (n: number) => Math.round(n * 100) / 100;

/** Incassato su una quota. I documenti precedenti ai versamenti (ADR D21) non hanno `paidAmount`. */
export function paidAmountOf(p: Pick<Payment, "amount" | "paidAmount" | "status">): number {
  return p.paidAmount ?? (p.status === "paid" ? p.amount : 0);
}

/** Residuo da incassare (0 per le quote annullate o saldate). */
export function remainingOf(p: Pick<Payment, "amount" | "paidAmount" | "status">): number {
  if (p.status === "cancelled") return 0;
  return Math.max(0, cents(p.amount - paidAmountOf(p)));
}

/** Stato da salvare dopo un versamento: dipende solo dagli importi. */
export function storedPaymentStatus(amount: number, paid: number): Extract<PaymentStatus, "pending" | "partial" | "paid"> {
  if (paid <= 0) return "pending";
  return cents(paid) >= cents(amount) ? "paid" : "partial";
}

/**
 * Stato effettivo: una quota non saldata (anche parzialmente) con scadenza passata
 * è mostrata come `overdue` (ADR D6).
 */
export function effectivePaymentStatus(p: Pick<Payment, "status" | "dueDate">, now = new Date()): PaymentStatus {
  if (p.status !== "pending" && p.status !== "partial") return p.status;
  const due = toDate(p.dueDate);
  if (!due) return p.status;
  const endOfDue = new Date(due);
  endOfDue.setHours(23, 59, 59, 999);
  return endOfDue < now ? "overdue" : p.status;
}

/** Periodo `YYYY-MM` di una data (fuso locale). */
export function periodOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function periodLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("it-IT", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/** Scadenza della quota mensile: il giorno indicato del mese di competenza. */
export function monthlyDueDate(period: string, dueDay: number): Date {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m - 1, Math.min(Math.max(1, dueDay), 28), 0, 0, 0);
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
