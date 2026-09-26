import { z } from "zod";
import { emailField } from "@/lib/validation";

export const loginSchema = z.object({
  email: emailField(),
  password: z.string().min(1, "Inserisci la password"),
});
export type LoginValues = z.infer<typeof loginSchema>;

export const forgotSchema = z.object({
  email: emailField(),
});
export type ForgotValues = z.infer<typeof forgotSchema>;

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Inserisci la password attuale"),
    next: z.string().min(8, "Almeno 8 caratteri"),
    confirm: z.string(),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Le password non coincidono" });
export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const changeEmailSchema = z.object({
  email: emailField(),
  password: z.string().min(1, "Inserisci la password attuale"),
});
export type ChangeEmailValues = z.infer<typeof changeEmailSchema>;

/** Accetta solo percorsi interni (evita open redirect via ?next=). */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
