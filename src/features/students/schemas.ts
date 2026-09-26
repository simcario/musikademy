import { z } from "zod";
import { emailField } from "@/lib/validation";

const phone = z
  .string()
  .trim()
  .max(30)
  .regex(/^[+0-9 ()./-]*$/, "Numero di telefono non valido")
  .optional()
  .or(z.literal(""));

export const studentFormSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(60),
  surname: z.string().trim().min(1, "Inserisci il cognome").max(60),
  email: emailField("Email non valida"),
  phone,
  courseIds: z.array(z.string()).max(30),
  enrollmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data non valida"),
  notes: z.string().max(2000).optional().or(z.literal("")),
});
export type StudentFormValues = z.infer<typeof studentFormSchema>;

/** Payload della POST /api/admin/users (validato anche lato server). */
export const createUserSchema = z.object({
  name: z.string().trim().min(1).max(60),
  surname: z.string().trim().min(1).max(60),
  email: emailField(),
  phone,
  role: z.enum(["student", "teacher", "admin"]),
  courseIds: z.array(z.string()).max(30).default([]),
  enrollmentDate: z.iso.datetime().optional(),
  notes: z.string().max(2000).optional(),
});
export type CreateUserPayload = z.infer<typeof createUserSchema>;

export const updateUserSchema = z
  .object({
    active: z.boolean().optional(),
    role: z.enum(["student", "teacher", "admin"]).optional(),
    email: emailField().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Nessuna modifica");

export const profileSchema = z.object({
  name: z.string().trim().min(1, "Inserisci il nome").max(60),
  surname: z.string().trim().min(1, "Inserisci il cognome").max(60),
  phone,
});
export type ProfileValues = z.infer<typeof profileSchema>;
