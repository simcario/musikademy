import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { it } from "date-fns/locale";
import type { StudentFee } from "@/types";

/** Formato salvato dalla prima versione (quota mensile), ancora presente su alcuni studenti. */
export type LegacyFee = { monthlyAmount?: number; lessonsPerMonth?: number; dueDay?: number };

/**
 * Costo del corso utilizzabile per i cicli, oppure `null` se assente o salvato nel vecchio
 * formato mensile (senza data di inizio): in quel caso va reimpostato dalla scheda studente.
 */
export function cycleFee(fee: StudentFee | null | undefined): StudentFee | null {
  return fee && fee.cycleAmount > 0 && typeof fee.startDate?.toDate === "function" && !!fee.dueAt ? fee : null;
}

/**
 * Cicli di pagamento di 4 settimane che partono dalla prima lezione dello studente
 * (non dal mese di calendario): chi inizia il 15 ottobre paga 15 ott – 11 nov, 12 nov – 9 dic, …
 */
export const CYCLE_DAYS = 28;

/** Inizio del ciclo che contiene `at`. Prima dell'inizio del corso restituisce il primo ciclo. */
export function cycleStartAt(firstLesson: Date, at: Date): Date {
  const start = startOfDay(firstLesson);
  const diff = differenceInCalendarDays(at, start);
  return addDays(start, Math.max(0, Math.floor(diff / CYCLE_DAYS)) * CYCLE_DAYS);
}

/** Ultimo giorno del ciclo. */
export function cycleEnd(cycleStart: Date): Date {
  return addDays(startOfDay(cycleStart), CYCLE_DAYS - 1);
}

/** Inizio del ciclo spostato di `n` cicli (anche negativo). */
export function shiftCycle(cycleStart: Date, n: number): Date {
  return addDays(startOfDay(cycleStart), n * CYCLE_DAYS);
}

/** Chiave stabile del ciclo (`YYYY-MM-DD` del primo giorno), usata negli ID delle quote. */
export function cycleKey(cycleStart: Date): string {
  return format(cycleStart, "yyyy-MM-dd");
}

/** "15 ott – 11 nov 2026" */
export function cycleLabel(cycleStart: Date): string {
  const end = cycleEnd(cycleStart);
  const sameYear = cycleStart.getFullYear() === end.getFullYear();
  return `${format(cycleStart, sameYear ? "d MMM" : "d MMM yyyy", { locale: it })} – ${format(end, "d MMM yyyy", { locale: it })}`;
}

/** Scadenza della quota: il primo giorno del ciclo (pagamento anticipato) o l'ultimo (es. chi paga a lezione). */
export function cycleDueDate(cycleStart: Date, dueAt: "start" | "end"): Date {
  return dueAt === "end" ? cycleEnd(cycleStart) : startOfDay(cycleStart);
}
