import { z } from "zod";
import { PAYMENT_METHODS } from "@/types";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida");

export const paymentFormSchema = z
  .object({
    studentId: z.string().min(1, "Seleziona uno studente"),
    description: z.string().trim().min(1, "Es. Quota ottobre").max(140),
    amount: z
      .string()
      .trim()
      .regex(/^\d+([.,]\d{1,2})?$/, "Importo non valido (es. 80 o 80,50)")
      .refine((v) => Number(v.replace(",", ".")) > 0, "L'importo deve essere maggiore di zero")
      .refine((v) => Number(v.replace(",", ".")) < 100000, "Importo troppo alto"),
    dueDate: date,
    paidDate: date.optional().or(z.literal("")),
    method: z.enum(PAYMENT_METHODS).optional().or(z.literal("")),
    status: z.enum(["pending", "paid", "overdue", "cancelled"]),
    notes: z.string().max(1000).optional(),
  })
  .refine((v) => v.status !== "paid" || !!v.paidDate, { path: ["paidDate"], message: "Indica la data di pagamento" })
  .refine((v) => v.status !== "paid" || !!v.method, { path: ["method"], message: "Indica il metodo" });
export type PaymentFormValues = z.infer<typeof paymentFormSchema>;

export function parseAmount(v: string) {
  return Math.round(Number(v.replace(",", ".")) * 100) / 100;
}
