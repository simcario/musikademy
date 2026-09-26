import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";
import { it } from "date-fns/locale";
import type { Timestamp } from "firebase/firestore";

type DateLike = Timestamp | Date | null | undefined;

export function toDate(value: DateLike): Date | null {
  if (!value) return null;
  return value instanceof Date ? value : value.toDate();
}

export function formatDate(value: DateLike, pattern = "d MMMM yyyy"): string {
  const d = toDate(value);
  return d ? format(d, pattern, { locale: it }) : "—";
}

export function formatShortDate(value: DateLike): string {
  return formatDate(value, "d MMM yyyy");
}

export function formatWeekday(value: DateLike): string {
  const d = toDate(value);
  if (!d) return "—";
  const s = format(d, "EEEE d MMMM", { locale: it });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function relativeDay(value: DateLike): string {
  const d = toDate(value);
  if (!d) return "";
  if (isToday(d)) return "Oggi";
  if (isTomorrow(d)) return "Domani";
  const dist = formatDistanceToNowStrict(d, { locale: it, addSuffix: true });
  return dist.charAt(0).toUpperCase() + dist.slice(1);
}

const currency = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
export function formatCurrency(amount: number): string {
  return currency.format(amount);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function fullName(p: { name?: string; surname?: string } | null | undefined): string {
  return [p?.name, p?.surname].filter(Boolean).join(" ") || "—";
}

export function initials(p: { name?: string; surname?: string } | null | undefined): string {
  return ((p?.name?.[0] ?? "") + (p?.surname?.[0] ?? "")).toUpperCase() || "?";
}

/** "2026-09-26" per <input type="date"> */
export function toInputDate(value: DateLike): string {
  const d = toDate(value);
  return d ? format(d, "yyyy-MM-dd") : "";
}

/** Interpreta "yyyy-MM-dd" (+ "HH:mm" opzionale) in ora locale. */
export function fromInputDate(date: string, time?: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = (time || "00:00").split(":").map(Number);
  return new Date(y, m - 1, d, hh || 0, mm || 0);
}
