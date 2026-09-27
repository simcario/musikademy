import { z } from "zod";
import { PAYMENT_METHODS } from "@/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida");

const amountField = z
  .string()
  .trim()
  .regex(/^\d+([.,]\d{1,2})?$/, "Importo non valido (es. 80 o 80,50)")
  .refine((v) => Number(v.replace(",", ".")) > 0, "L'importo deve essere maggiore di zero")
  .refine((v) => Number(v.replace(",", ".")) < 100000, "Importo troppo alto");

const optionalAmount = amountField.optional().or(z.literal(""));

/** Quota (il dovuto). Alla creazione si può registrare subito un versamento. */
export const paymentFormSchema = z
  .object({
    studentId: z.string().min(1, "Seleziona uno studente"),
    description: z.string().trim().min(1, "Es. Quota ottobre").max(140),
    amount: amountField,
    dueDate: date,
    cancelled: z.boolean().optional(),
    notes: z.string().max(1000).optional(),
    payNowAmount: optionalAmount,
    payNowDate: date.optional().or(z.literal("")),
    payNowMethod: z.enum(PAYMENT_METHODS).optional().or(z.literal("")),
  })
  .refine((v) => !v.payNowAmount || parseAmount(v.payNowAmount) <= parseAmount(v.amount), {
    path: ["payNowAmount"],
    message: "Non può superare l'importo della quota",
  })
  .refine((v) => !v.payNowAmount || !!v.payNowDate, { path: ["payNowDate"], message: "Indica la data" })
  .refine((v) => !v.payNowAmount || !!v.payNowMethod, { path: ["payNowMethod"], message: "Indica il metodo" });
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

/** Versamento su una quota: `max` è il residuo da pagare. */
export const installmentSchema = (max: number) =>
  z.object({
    amount: amountField.refine((v) => parseAmount(v) <= max + 0.001, "Supera il residuo da pagare"),
    date,
    method: z.enum(PAYMENT_METHODS, "Indica il metodo"),
    notes: z.string().max(200).optional(),
  });
export type InstallmentFormValues = z.infer<ReturnType<typeof installmentSchema>>;

/** Costo del corso: con costo a lezione e lezioni per ciclo la quota si calcola da sola. */
export const feeFormSchema = z.object({
  lessonPrice: optionalAmount,
  lessonsPerCycle: z
    .string()
    .trim()
    .regex(/^([1-9]|1\d|2[0-8])?$/, "Da 1 a 28")
    .optional(),
  cycleAmount: amountField,
  startDate: date,
  dueAt: z.enum(["start", "end"]),
});
export type FeeFormValues = z.infer<typeof feeFormSchema>;

export function parseAmount(v: string) {
  return Math.round(Number(v.replace(",", ".")) * 100) / 100;
}

/** 120 → "120", 80.5 → "80,50" per i campi importo. */
export function amountToInput(n: number | undefined) {
  if (n === undefined) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", ",");
}
